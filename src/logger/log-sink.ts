import { BaseLog, EventType } from './superman-logger.types';

export interface FullLog extends BaseLog {
  eventType: EventType;
}

export type SinkKind = 'console' | 'file';

export interface ILogSink {
  /** Identifies the sink so per-event `console` / `file` flags can target it. */
  readonly kind: SinkKind;
  write(log: FullLog): void;
  close?(): Promise<void>;
}

