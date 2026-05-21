import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileSink } from './file-sink';
import {
  EventSeverity,
  EventType,
  SystemEvent,
  SystemStatus,
} from './superman-logger.types';
import { FullLog } from './log-sink';

const makeLog = (overrides: Partial<FullLog> = {}): FullLog => ({
  '@timestamp': '2026-04-17T00:00:00.000Z',
  eventType: EventType.SYSTEM,
  eventSeverity: EventSeverity.INFO,
  context: 'Ctx',
  appName: 'app',
  appVersion: '0.0.1',
  environment: 'test',
  serverInstanceUid: 'uid',
  hostname: 'host',
  uptimeMs: 0,
  memoryUsage: 0,
  cpuUsage: 0,
  systemStatus: SystemStatus.ONLINE,
  systemEvent: SystemEvent.SERVICE_STARTED,
  systemMessage: 'ok',
  ...overrides,
} as FullLog);

const readLines = (filePath: string): string[] =>
  fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);

describe('FileSink', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superman-filesink-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create the target directory on first write', () => {
    // Arrange
    const targetDir = path.join(tmpDir, 'nested', 'logs');
    const sink = new FileSink({ directory: targetDir, now: () => new Date('2026-04-17') });

    // Act
    sink.write(makeLog());

    // Assert
    expect(fs.existsSync(targetDir)).toBe(true);
  });

  it('should write one NDJSON line per event to the correct per-type file', async () => {
    // Arrange
    const sink = new FileSink({ directory: tmpDir, now: () => new Date('2026-04-17') });

    // Act
    sink.write(makeLog({ eventType: EventType.SYSTEM }));
    sink.write(makeLog({ eventType: EventType.SECURITY }));
    sink.write(makeLog({ eventType: EventType.SYSTEM }));
    await sink.close();

    // Assert
    const systemLines = readLines(path.join(tmpDir, 'system-logs-2026-04-17.log'));
    const securityLines = readLines(path.join(tmpDir, 'security-logs-2026-04-17.log'));
    expect(systemLines).toHaveLength(2);
    expect(securityLines).toHaveLength(1);
    expect(() => JSON.parse(systemLines[0])).not.toThrow();
  });

  it('should rotate to a new file when the date changes', async () => {
    // Arrange
    let day = new Date('2026-04-17T12:00:00Z');
    const sink = new FileSink({ directory: tmpDir, now: () => day });

    // Act
    sink.write(makeLog({ eventType: EventType.REQUEST }));
    day = new Date('2026-04-18T12:00:00Z');
    sink.write(makeLog({ eventType: EventType.REQUEST }));
    await sink.close();

    // Assert
    expect(fs.existsSync(path.join(tmpDir, 'request-logs-2026-04-17.log'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'request-logs-2026-04-18.log'))).toBe(true);
  });

  it('should resolve a relative directory against process.cwd', async () => {
    // Arrange
    const subdir = path.basename(tmpDir);
    const parent = path.dirname(tmpDir);
    const originalCwd = process.cwd();
    process.chdir(parent);
    const sink = new FileSink({ directory: `./${subdir}`, now: () => new Date('2026-04-17') });

    // Act
    sink.write(makeLog({ eventType: EventType.ERROR }));
    await sink.close();

    // Assert
    process.chdir(originalCwd);
    expect(fs.existsSync(path.join(tmpDir, 'error-logs-2026-04-17.log'))).toBe(true);
  });

  it('should silently disable itself and not throw when directory creation fails', () => {
    // Arrange
    const onError = jest.fn();
    const forbidden = '/root/nope-cannot-mkdir-here-probably';
    const sink = new FileSink({ directory: forbidden, onError });

    // Act & Assert
    expect(() => sink.write(makeLog())).not.toThrow();
    expect(onError).toHaveBeenCalled();
  });
});

