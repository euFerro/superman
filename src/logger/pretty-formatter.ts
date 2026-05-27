import { config } from '../config/superman-config';
import { EventSeverity, EventType } from './superman-logger.types';
import { FullLog } from './log-sink';
import { formatShortTimestamp } from './timestamp';

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

const SEVERITY_COLOR: Record<EventSeverity, string> = {
  [EventSeverity.INFO]: COLORS.green,
  [EventSeverity.WARN]: COLORS.yellow,
  [EventSeverity.ERROR]: COLORS.red,
  [EventSeverity.SECURITY]: COLORS.magenta,
  [EventSeverity.FATAL]: COLORS.red,
};

const EVENT_TYPE_COLOR: Record<EventType, string> = {
  [EventType.SYSTEM]: COLORS.cyan,
  [EventType.REQUEST]: COLORS.gray,
  [EventType.RESPONSE]: COLORS.gray,
  [EventType.ERROR]: COLORS.red,
  [EventType.AUDIT]: COLORS.magenta,
  [EventType.SECURITY]: COLORS.magenta,
};

const INFRA_FIELDS = new Set([
  '@timestamp', 'eventType', 'eventSeverity', 'context',
  'appName', 'appVersion', 'environment', 'serverInstanceUid',
  'hostname', 'uptimeMs', 'memoryUsage', 'cpuUsage',
]);

const isErrorSeverity = (s: EventSeverity): boolean =>
  s === EventSeverity.ERROR || s === EventSeverity.FATAL;

export const formatEventHeader = (
  severity: EventSeverity,
  context: string,
  eventType: EventType,
): string => {
  const ts = `${COLORS.dim}${formatShortTimestamp()}${COLORS.reset}`;
  const sev = `${SEVERITY_COLOR[severity]}${COLORS.bold}${severity.padEnd(5)}${COLORS.reset}`;
  const tag = `${COLORS.cyan}[${context}${COLORS.dim}|${COLORS.reset}${EVENT_TYPE_COLOR[eventType]}${eventType}${COLORS.reset}${COLORS.cyan}]${COLORS.reset}`;
  return `${ts} ${sev} ${tag}`;
};

export const formatEventSummary = (log: FullLog): string => {
  const l = log as FullLog & Record<string, unknown>;
  switch (log.eventType) {
    case EventType.SYSTEM:
      return `${l.systemEvent ?? ''} - ${l.systemMessage ?? ''}`.trim();
    case EventType.REQUEST:
      return `${l.method ?? ''} ${l.url ?? ''}`.trim();
    case EventType.RESPONSE: {
      const rt = l.responseTimeMs != null ? ` (${l.responseTimeMs}ms)` : '';
      return `${l.statusCode ?? ''} ${l.route ?? ''}${rt}`.trim();
    }
    case EventType.ERROR:
      return `${l.errorType ?? ''}: ${l.errorMessage ?? ''}`.trim();
    case EventType.AUDIT:
      return `${l.auditEvent ?? ''} ${l.resource ?? ''}`.trim();
    case EventType.SECURITY:
      return `${l.securityEvent ?? ''} (${l.authOutcome ?? ''})`.trim();
    default:
      return String(log.eventType ?? '');
  }
};

export const formatEventBody = (log: FullLog): string => {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(log)) {
    if (!INFRA_FIELDS.has(k) && v !== undefined && v !== null) clean[k] = v;
  }
  return JSON.stringify(clean, null, 2);
};

export interface WriteSummaryLineOptions {
  severity: EventSeverity;
  context: string;
  eventType: EventType;
  summary: string;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

export const writeEventSummaryLine = (opts: WriteSummaryLineOptions): void => {
  if (!config.logger.consoleOutput.enabled) return;
  const header = formatEventHeader(opts.severity, opts.context, opts.eventType);
  const stream = isErrorSeverity(opts.severity)
    ? (opts.stderr ?? process.stderr)
    : (opts.stdout ?? process.stdout);
  stream.write(`${header} ${opts.summary}\n`);
};

