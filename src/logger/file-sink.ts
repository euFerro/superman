import * as fs from 'fs';
import * as path from 'path';
import { EventType, LogIndexSuffix } from './superman-logger.types';
import { FullLog, ILogSink } from './log-sink';

const SUFFIX_FOR: Record<EventType, LogIndexSuffix> = {
  [EventType.SYSTEM]: LogIndexSuffix.SYSTEM,
  [EventType.ERROR]: LogIndexSuffix.ERROR,
  [EventType.REQUEST]: LogIndexSuffix.REQUEST,
  [EventType.RESPONSE]: LogIndexSuffix.RESPONSE,
  [EventType.AUDIT]: LogIndexSuffix.AUDIT,
  [EventType.SECURITY]: LogIndexSuffix.SECURITY,
};

const toDateTag = (date: Date): string => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export interface FileSinkOptions {
  directory: string;
  now?: () => Date;
  onError?: (err: Error) => void;
}

interface CachedStream {
  filename: string;
  stream: fs.WriteStream;
}

export class FileSink implements ILogSink {
  readonly kind = 'file' as const;
  private readonly directory: string;
  private readonly now: () => Date;
  private readonly onError: (err: Error) => void;
  private readonly streams: Map<EventType, CachedStream> = new Map();
  private disabled = false;
  private directoryReady = false;

  constructor(options: FileSinkOptions) {
    this.directory = path.isAbsolute(options.directory)
      ? options.directory
      : path.resolve(process.cwd(), options.directory);
    this.now = options.now ?? (() => new Date());
    this.onError = options.onError ?? ((err) => {
      // eslint-disable-next-line no-console
      console.error(`[FileSink] disabled after error: ${err.message}`);
    });
  }

  write(log: FullLog): void {
    if (this.disabled) return;
    try {
      this.ensureDirectory();
      const stream = this.streamFor(log.eventType);
      stream.write(JSON.stringify(log) + '\n');
    } catch (err) {
      this.disable(err as Error);
    }
  }

  async close(): Promise<void> {
    const streams = [...this.streams.values()];
    this.streams.clear();
    await Promise.all(streams.map(({ stream }) => new Promise<void>((resolve) => {
      stream.end(() => resolve());
    })));
  }

  private ensureDirectory(): void {
    if (this.directoryReady) return;
    fs.mkdirSync(this.directory, { recursive: true });
    this.directoryReady = true;
  }

  private streamFor(eventType: EventType): fs.WriteStream {
    const dateTag = toDateTag(this.now());
    const suffix = SUFFIX_FOR[eventType];
    const filename = path.join(this.directory, `${suffix}-${dateTag}.log`);
    const cached = this.streams.get(eventType);

    if (cached && cached.filename === filename) return cached.stream;

    if (cached) cached.stream.end();

    const stream = fs.createWriteStream(filename, { flags: 'a' });
    stream.on('error', (err) => this.disable(err));
    this.streams.set(eventType, { filename, stream });
    return stream;
  }

  private disable(err: Error): void {
    if (this.disabled) return;
    this.disabled = true;
    for (const { stream } of this.streams.values()) {
      stream.end();
    }
    this.streams.clear();
    this.onError(err);
  }
}

