import { EventSeverity, EventType } from './superman-logger.types';
import { FullLog, ILogSink } from './log-sink';
import { formatEventBody, formatEventHeader, formatEventSummary } from './pretty-formatter';

export interface ConsoleSinkOptions {
  isProduction: () => boolean;
  /**
   * When true, typed events emit their pretty JSON body (plus summary for
   * SYSTEM/AUDIT/SECURITY) on the dev console. When false, the sink stays
   * silent for all typed events â€” summary lines from the request interceptor
   * and exception middleware remain. Default: false.
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
    if (this.options.eventDebug !== true) return;
    stream.write(this.toPrettyOutput(log) + '\n');
  }

  private isErrorLevel(severity?: EventSeverity): boolean {
    return severity === EventSeverity.ERROR || severity === EventSeverity.FATAL;
  }

  private toJsonLine(log: FullLog): string {
    return JSON.stringify(log);
  }

  private toPrettyOutput(log: FullLog): string {
    const body = formatEventBody(log);
    // REQUEST/RESPONSE: the request interceptor already emits the summary line.
    // Emit body only to avoid duplication.
    if (BODY_ONLY_EVENTS.has(log.eventType)) return body;

    const severity = log.eventSeverity ?? EventSeverity.INFO;
    const header = formatEventHeader(severity, log.context, log.eventType);
    const summary = formatEventSummary(log);
    return `${header} ${summary}\n${body}`;
  }
}
