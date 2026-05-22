import { EventSeverity, EventType } from './superman-logger.types';
import { FullLog, ILogSink } from './log-sink';
import { formatEventBody, formatEventHeader, formatEventSummary } from './pretty-formatter';

export interface ConsoleSinkOptions {
  isProduction: () => boolean;
  /**
   * Controls only the structured JSON **body** of typed events on the dev
   * console.
   *   - true  -> events that own their summary (SYSTEM, AUDIT) print
   *             `header + summary + body`; events whose summary already came
   *             from the request interceptor (REQUEST/RESPONSE/ERROR/SECURITY)
   *             print body only.
   *   - false -> SYSTEM/AUDIT still print their `header + summary` line (the
   *             only place that prints them); REQUEST/RESPONSE/ERROR/SECURITY
   *             stay silent in the sink (their summary line is still emitted
   *             by the request interceptor / exception middleware).
   * Default: false. Production output ignores this flag — full JSON-per-line.
   */
  eventDebug?: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

// Events whose summary line is already emitted elsewhere (request interceptor,
// exception middleware). The sink emits only the JSON body to avoid duplication.
const BODY_ONLY_EVENTS = new Set<EventType>([
  EventType.REQUEST,
  EventType.RESPONSE,
  EventType.ERROR,
  EventType.SECURITY,
]);

export class ConsoleSink implements ILogSink {
  readonly kind = 'console' as const;
  private readonly stdout: NodeJS.WritableStream;
  private readonly stderr: NodeJS.WritableStream;

  constructor(private readonly options: ConsoleSinkOptions) {
    this.stdout = options.stdout ?? process.stdout;
    this.stderr = options.stderr ?? process.stderr;
  }

  write(log: FullLog): void {
    const stream = this.isErrorLevel(log.eventSeverity) ? this.stderr : this.stdout;
    if (this.options.isProduction()) {
      stream.write(this.toJsonLine(log) + '\n');
      return;
    }
    const eventDebug = this.options.eventDebug === true;

    if (BODY_ONLY_EVENTS.has(log.eventType)) {
      if (!eventDebug) return;
      stream.write(formatEventBody(log) + '\n');
      return;
    }

    const severity = log.eventSeverity ?? EventSeverity.INFO;
    const header = formatEventHeader(severity, log.context, log.eventType);
    const summary = formatEventSummary(log);
    if (eventDebug) {
      stream.write(`${header} ${summary}\n${formatEventBody(log)}\n`);
    } else {
      stream.write(`${header} ${summary}\n`);
    }
  }

  private isErrorLevel(severity?: EventSeverity): boolean {
    return severity === EventSeverity.ERROR || severity === EventSeverity.FATAL;
  }

  private toJsonLine(log: FullLog): string {
    return JSON.stringify(log);
  }

}
