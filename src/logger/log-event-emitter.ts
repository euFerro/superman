import type { ResolvedEventConfig } from '../config/superman-config';
import { EventType, EventSeverity } from './superman-logger.types';
import { FullLog, ILogSink } from './log-sink';
import { buildFullLog } from './infra-fields';
import {
  AuditLogInput,
  ErrorLogInput,
  RequestLogInput,
  ResponseLogInput,
  SecurityLogInput,
  SystemLogInput,
} from './log-builders';

export interface LogEventEmitterOptions {
  sinks: ILogSink[];
  /** Master switch from `events.enabled`. When false the emitter is a no-op. */
  enabled: boolean;
  /** Resolved per-type config. Types absent from the map are dropped. */
  configs: ReadonlyMap<EventType, ResolvedEventConfig>;
  context: string;
  /** Random source - overridable for deterministic sampling tests. */
  rng?: () => number;
}

/** Heavy fields that `savePayload`/`payloadMaxLength` apply to, per event type. */
const PAYLOAD_FIELDS: Record<EventType, readonly string[]> = {
  [EventType.SYSTEM]:   ['metadata'],
  [EventType.ERROR]:    ['stackTrace', 'metadata'],
  [EventType.REQUEST]:  ['requestBody', 'query', 'metadata'],
  [EventType.RESPONSE]: ['responseBody'],
  [EventType.AUDIT]:    ['changes', 'metadata'],
  [EventType.SECURITY]: ['metadata'],
};

const SEVERITY_RANK: Record<EventSeverity, number> = {
  [EventSeverity.INFO]: 0,
  [EventSeverity.WARN]: 1,
  [EventSeverity.ERROR]: 2,
  [EventSeverity.SECURITY]: 3,
  [EventSeverity.FATAL]: 4,
};

const TRUNCATED_SUFFIX = 'â€¦[truncated]';

export class LogEventEmitter {
  private readonly rng: () => number;

  constructor(private readonly options: LogEventEmitterOptions) {
    this.rng = options.rng ?? Math.random;
  }

  system(input: SystemLogInput): void {
    this.emit(EventType.SYSTEM, input, EventSeverity.INFO);
  }

  request(input: RequestLogInput): void {
    this.emit(EventType.REQUEST, input, EventSeverity.INFO);
  }

  response(input: ResponseLogInput): void {
    this.emit(EventType.RESPONSE, input, EventSeverity.INFO);
  }

  error(input: ErrorLogInput): void {
    this.emit(EventType.ERROR, input, EventSeverity.ERROR);
  }

  audit(input: AuditLogInput): void {
    this.emit(EventType.AUDIT, input, EventSeverity.INFO);
  }

  security(input: SecurityLogInput): void {
    this.emit(EventType.SECURITY, input, EventSeverity.SECURITY);
  }

  child(context: string): LogEventEmitter {
    return new LogEventEmitter({ ...this.options, context });
  }

  async close(): Promise<void> {
    await Promise.all(
      this.options.sinks.map((sink) => (sink.close ? sink.close() : Promise.resolve())),
    );
  }

  private emit(
    eventType: EventType,
    partial: Record<string, unknown>,
    defaultSeverity: EventSeverity,
  ): void {
    if (!this.options.enabled) return;

    const cfg = this.options.configs.get(eventType);
    if (!cfg) return;

    const severity = (partial.eventSeverity as EventSeverity | undefined) ?? defaultSeverity;
    if (SEVERITY_RANK[severity] < SEVERITY_RANK[cfg.minSeverity]) return;

    if (cfg.sampleRate < 1 && this.rng() >= cfg.sampleRate) return;

    const full: FullLog = buildFullLog(this.options.context, eventType, partial, defaultSeverity);

    applyPayloadRules(full, eventType, cfg);
    if (cfg.redactFields.length > 0) applyRedaction(full, cfg.redactFields);

    for (const sink of this.options.sinks) {
      if (sink.kind === 'console' && !cfg.console) continue;
      if (sink.kind === 'file' && !cfg.file) continue;
      sink.write(full);
    }
  }
}

const applyPayloadRules = (
  log: FullLog,
  eventType: EventType,
  cfg: ResolvedEventConfig,
): void => {
  const fields = PAYLOAD_FIELDS[eventType];
  const target = log as unknown as Record<string, unknown>;

  for (const field of fields) {
    const value = target[field];
    if (value === undefined) continue;

    if (!cfg.savePayload) {
      delete target[field];
      continue;
    }

    if (cfg.payloadMaxLength <= 0) {
      delete target[field];
      continue;
    }

    // Detach payload fields from caller-owned references before any later
    // mutation (redaction, etc.) - the framework must never mutate values
    // owned by the consumer (e.g. req.body, response payloads).
    let resolved: unknown = value;
    if (typeof resolved === 'object' && resolved !== null) {
      resolved = deepClone(resolved);
      target[field] = resolved as Record<string, unknown>;
    }

    if (cfg.captureFields.length > 0 && typeof resolved === 'object' && resolved !== null) {
      resolved = applyCaptureWhitelist(resolved, new Set(cfg.captureFields));
      target[field] = resolved as Record<string, unknown>;
    }

    const serialized = typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
    if (serialized.length > cfg.payloadMaxLength) {
      target[field] = serialized.slice(0, cfg.payloadMaxLength) + TRUNCATED_SUFFIX;
    }
  }
};

const deepClone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch { /* fall through to JSON clone */ }
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const applyCaptureWhitelist = (value: unknown, keys: Set<string>): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => applyCaptureWhitelist(item, keys));
  }
  if (value === null || typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const k of Object.keys(source)) {
    if (!keys.has(k)) continue;
    const child = source[k];
    if (child !== null && typeof child === 'object') {
      result[k] = applyCaptureWhitelist(child, keys);
    } else {
      result[k] = child;
    }
  }
  return result;
};

const applyRedaction = (log: FullLog, redactFields: readonly string[]): void => {
  const keys = new Set(redactFields);
  redactDeep(log as unknown as Record<string, unknown>, keys);
};

const redactDeep = (obj: unknown, keys: Set<string>): void => {
  if (obj === null || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (const item of obj) redactDeep(item, keys);
    return;
  }

  const record = obj as Record<string, unknown>;
  for (const k of Object.keys(record)) {
    if (keys.has(k)) {
      record[k] = '***';
    } else {
      redactDeep(record[k], keys);
    }
  }
};
