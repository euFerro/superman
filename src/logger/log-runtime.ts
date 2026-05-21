import { config, ResolvedEventConfig, ResolvedLoggerOptions } from '../config/superman-config';
import { resolveEnvironment } from '../config/resolve-environment';
import { EventType, EventSeverity } from './superman-logger.types';
import { ConsoleSink } from './console-sink';
import { FileSink } from './file-sink';
import { ILogSink } from './log-sink';
import { LogEventEmitter } from './log-event-emitter';

const ALL_EVENT_TYPES: EventType[] = [
  EventType.SYSTEM, EventType.ERROR, EventType.REQUEST,
  EventType.RESPONSE, EventType.AUDIT, EventType.SECURITY,
];

const fallbackEventConfig = (type: EventType): ResolvedEventConfig => ({
  type,
  savePayload: true,
  payloadMaxLength: 5000,
  console: true,
  file: true,
  minSeverity: EventSeverity.INFO,
  captureFields: [],
  redactFields: [],
  sampleRate: 1,
});

const fallbackLoggerOptions = (): ResolvedLoggerOptions => {
  const byType = new Map<EventType, ResolvedEventConfig>();
  for (const t of ALL_EVENT_TYPES) byType.set(t, fallbackEventConfig(t));
  return {
    fileOutput: { enabled: false, directory: '/var/log/superman' },
    consoleOutput: { enabled: true, eventDebug: false },
    events: { enabled: true, byType },
  };
};

interface RuntimeState {
  sinks: ILogSink[];
  enabled: boolean;
  configs: ReadonlyMap<EventType, ResolvedEventConfig>;
}

let state: RuntimeState | null = null;

const buildState = (): RuntimeState => {
  const opts = config.isInitialized() ? config.logger : fallbackLoggerOptions();
  const isTest = resolveEnvironment() === 'test';

  const sinks: ILogSink[] = [];
  if (opts.consoleOutput.enabled && !isTest) {
    sinks.push(new ConsoleSink({
      isProduction: () => config.isProduction(),
      eventDebug: opts.consoleOutput.eventDebug,
    }));
  }
  if (opts.fileOutput.enabled && !isTest) {
    sinks.push(new FileSink({ directory: opts.fileOutput.directory }));
  }

  return { sinks, enabled: opts.events.enabled, configs: opts.events.byType };
};

const ensureState = (): RuntimeState => {
  if (!state) state = buildState();
  return state;
};

export const getSharedEmitter = (context: string): LogEventEmitter => {
  const { sinks, enabled, configs } = ensureState();
  return new LogEventEmitter({ sinks, enabled, configs, context });
};

export const closeLogRuntime = async (): Promise<void> => {
  if (!state) return;
  const sinks = state.sinks;
  state = null;
  await Promise.all(sinks.map((sink) => (sink.close ? sink.close() : Promise.resolve())));
};

export const resetLogRuntime = (): void => {
  state = null;
};
