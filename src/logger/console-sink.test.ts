import { PassThrough } from 'stream';
import { ConsoleSink } from './console-sink';
import { EventSeverity, EventType, SystemEvent, SystemStatus } from './superman-logger.types';
import { FullLog } from './log-sink';

const readAll = (stream: PassThrough): string => stream.read()?.toString() ?? '';

const makeLog = (overrides: Partial<FullLog> = {}): FullLog => ({
  '@timestamp': '2026-04-17T00:00:00.000Z',
  eventType: EventType.SYSTEM,
  eventSeverity: EventSeverity.INFO,
  context: 'App',
  appName: 'superman-back',
  appVersion: '0.0.1',
  environment: 'test',
  serverInstanceUid: 'uid-1',
  hostname: 'host-1',
  uptimeMs: 0,
  memoryUsage: 0,
  cpuUsage: 0,
  systemStatus: SystemStatus.ONLINE,
  systemEvent: SystemEvent.SERVICE_STARTED,
  systemMessage: 'started',
  ...overrides,
} as FullLog);

describe('ConsoleSink', () => {
  let stdout: PassThrough;
  let stderr: PassThrough;

  beforeEach(() => {
    jest.clearAllMocks();
    stdout = new PassThrough();
    stderr = new PassThrough();
  });

  it('should write pretty output in development', () => {
    // Arrange
    const sink = new ConsoleSink({ isProduction: () => false, eventDebug: true, stdout, stderr });

    // Act
    sink.write(makeLog());

    // Assert
    const out = readAll(stdout);
    const stripped = out.replace(/\x1B\[\d+m/g, '');
    const [summaryLine, ...bodyLines] = stripped.split('\n');
    const body = bodyLines.join('\n');
    expect(summaryLine).toContain('[App|SYSTEM]');
    expect(summaryLine).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} /);
    expect(summaryLine).toContain('SERVICE_STARTED â€” started');
    expect(body.startsWith('{\n')).toBe(true);
    expect(body).toContain('"systemEvent": "SERVICE_STARTED"');
    expect(body).toContain('"systemStatus": "ONLINE"');
  });

  it('should emit body only (no summary line) for REQUEST events in development', () => {
    // Arrange
    const sink = new ConsoleSink({ isProduction: () => false, eventDebug: true, stdout, stderr });
    const log = makeLog({
      eventType: EventType.REQUEST,
      method: 'GET',
      url: '/api/test',
    } as Partial<FullLog>);

    // Act
    sink.write(log);

    // Assert â€” summary line is emitted by the request interceptor, not the sink
    const stripped = readAll(stdout).replace(/\x1B\[\d+m/g, '');
    expect(stripped).not.toContain('[App|REQUEST]');
    expect(stripped.startsWith('{\n')).toBe(true);
    expect(stripped).toContain('"method": "GET"');
    expect(stripped).toContain('"url": "/api/test"');
  });

  it('should emit body only (no summary line) for ERROR events in development', () => {
    // Arrange
    const sink = new ConsoleSink({ isProduction: () => false, eventDebug: true, stdout, stderr });
    const log = makeLog({
      eventType: EventType.ERROR,
      eventSeverity: EventSeverity.ERROR,
      errorType: 'HTTP_EXCEPTION',
      errorMessage: 'Nome Ã© obrigatÃ³rio',
    } as Partial<FullLog>);

    // Act
    sink.write(log);

    // Assert â€” summary line is emitted by global-exception middleware (log.error), not by the sink
    const stripped = readAll(stderr).replace(/\x1B\[\d+m/g, '');
    expect(stripped).not.toContain('[App|ERROR]');
    expect(stripped.startsWith('{\n')).toBe(true);
    expect(stripped).toContain('"errorType": "HTTP_EXCEPTION"');
  });

  it('should emit body only (no summary line) for RESPONSE events in development', () => {
    // Arrange
    const sink = new ConsoleSink({ isProduction: () => false, eventDebug: true, stdout, stderr });
    const log = makeLog({
      eventType: EventType.RESPONSE,
      statusCode: 200,
      route: '/api/test',
      responseTimeMs: 5,
    } as Partial<FullLog>);

    // Act
    sink.write(log);

    // Assert
    const stripped = readAll(stdout).replace(/\x1B\[\d+m/g, '');
    expect(stripped).not.toContain('[App|RESPONSE]');
    expect(stripped.startsWith('{\n')).toBe(true);
    expect(stripped).toContain('"statusCode": 200');
  });

  it('should emit body only (no summary line) for SECURITY events in development', () => {
    // Arrange
    const sink = new ConsoleSink({ isProduction: () => false, eventDebug: true, stdout, stderr });
    const log = makeLog({
      eventType: EventType.SECURITY,
      eventSeverity: EventSeverity.WARN,
      securityEvent: 'UNAUTHORIZED_ACCESS',
      authOutcome: 'DENIED',
    } as Partial<FullLog>);

    // Act
    sink.write(log);

    // Assert â€” summary line is emitted by the request interceptor, not the sink
    const stripped = readAll(stdout).replace(/\x1B\[\d+m/g, '');
    expect(stripped).not.toContain('[App|SECURITY]');
    expect(stripped.startsWith('{\n')).toBe(true);
    expect(stripped).toContain('"securityEvent": "UNAUTHORIZED_ACCESS"');
  });

  it('should stay silent for body-only events in dev when eventDebug is false (default)', () => {
    // Arrange
    const sink = new ConsoleSink({ isProduction: () => false, stdout, stderr });

    // Act — REQUEST/RESPONSE/ERROR/SECURITY rely on the request interceptor
    // for the summary line, so the sink stays silent without eventDebug.
    sink.write(makeLog({ eventType: EventType.REQUEST }));
    sink.write(makeLog({ eventType: EventType.RESPONSE }));
    sink.write(makeLog({ eventType: EventType.ERROR }));
    sink.write(makeLog({ eventType: EventType.SECURITY }));

    // Assert
    expect(readAll(stdout)).toBe('');
    expect(readAll(stderr)).toBe('');
  });

  it('should print summary-only (no body) for SYSTEM/AUDIT when eventDebug is false', () => {
    // Arrange
    const sink = new ConsoleSink({ isProduction: () => false, stdout, stderr });

    // Act
    sink.write(makeLog({ eventType: EventType.SYSTEM }));
    sink.write(makeLog({ eventType: EventType.AUDIT }));

    // Assert — header + summary line present, JSON body absent
    const stripped = readAll(stdout).replace(/\x1B\[\d+m/g, '');
    expect(stripped).toContain('[App|SYSTEM]');
    expect(stripped).toContain('[App|AUDIT]');
    expect(stripped).not.toContain('{\n');
    expect(stripped).not.toContain('"eventType":');
  });

  it('should print summary + body for SYSTEM/AUDIT when eventDebug is true', () => {
    // Arrange
    const sink = new ConsoleSink({ isProduction: () => false, eventDebug: true, stdout, stderr });

    // Act
    sink.write(makeLog({ eventType: EventType.AUDIT }));

    // Assert — header+summary line AND a JSON body block must be present
    const stripped = readAll(stdout).replace(/\x1B\[\d+m/g, '');
    expect(stripped).toContain('[App|AUDIT]');
    expect(stripped).toContain('{\n');
    expect(stripped).toContain('}\n');
  });

  it('should write a single JSON line in production', () => {
    // Arrange
    const sink = new ConsoleSink({ isProduction: () => true, stdout, stderr });

    // Act
    sink.write(makeLog({ eventType: EventType.REQUEST }));

    // Assert
    const out = readAll(stdout);
    expect(out.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(out.trim());
    expect(parsed.eventType).toBe('REQUEST');
  });

  it('should route ERROR severity to stderr', () => {
    // Arrange
    const sink = new ConsoleSink({ isProduction: () => true, stdout, stderr });

    // Act
    sink.write(makeLog({ eventSeverity: EventSeverity.ERROR }));

    // Assert
    expect(readAll(stderr).length).toBeGreaterThan(0);
    expect(readAll(stdout)).toBe('');
  });

  it('should route FATAL severity to stderr', () => {
    // Arrange
    const sink = new ConsoleSink({ isProduction: () => true, stdout, stderr });

    // Act
    sink.write(makeLog({ eventSeverity: EventSeverity.FATAL }));

    // Assert
    expect(readAll(stderr).length).toBeGreaterThan(0);
  });

  it('should route WARN severity to stdout', () => {
    // Arrange
    const sink = new ConsoleSink({ isProduction: () => true, stdout, stderr });

    // Act
    sink.write(makeLog({ eventSeverity: EventSeverity.WARN }));

    // Assert
    expect(readAll(stdout).length).toBeGreaterThan(0);
    expect(readAll(stderr)).toBe('');
  });
});

