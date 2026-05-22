import { LogEventEmitter } from './log-event-emitter';
import { FullLog, ILogSink, SinkKind } from './log-sink';
import {
  EventType,
  EventSeverity,
  SystemEvent,
  SystemStatus,
  SecurityEvents,
  AuthOutcome,
  AuditEvents,
} from './superman-logger.types';
import type { ResolvedEventConfig } from '../config/superman-config';

const makeSink = (kind: SinkKind = 'console'): ILogSink & { writes: FullLog[]; close: jest.Mock } => {
  const writes: FullLog[] = [];
  return {
    kind,
    writes,
    write: (log) => { writes.push(log); },
    close: jest.fn().mockResolvedValue(undefined),
  };
};

const makeConfig = (
  type: EventType,
  overrides: Partial<ResolvedEventConfig> = {},
): ResolvedEventConfig => ({
  type,
  savePayload: true,
  payloadMaxLength: 5000,
  console: true,
  file: true,
  minSeverity: EventSeverity.INFO,
  captureFields: [],
  redactFields: [],
  sampleRate: 1,
  ...overrides,
});

const makeConfigs = (...cfgs: ResolvedEventConfig[]): ReadonlyMap<EventType, ResolvedEventConfig> => {
  const map = new Map<EventType, ResolvedEventConfig>();
  for (const c of cfgs) map.set(c.type, c);
  return map;
};

describe('LogEventEmitter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fan out to every registered sink', () => {
    // Arrange
    const a = makeSink('console');
    const b = makeSink('file');
    const emitter = new LogEventEmitter({
      sinks: [a, b],
      enabled: true,
      configs: makeConfigs(makeConfig(EventType.SYSTEM)),
      context: 'Test',
    });

    // Act
    emitter.system({
      systemEvent: SystemEvent.SERVICE_STARTED,
      systemStatus: SystemStatus.ONLINE,
      systemMessage: 'ok',
    });

    // Assert
    expect(a.writes).toHaveLength(1);
    expect(b.writes).toHaveLength(1);
    expect(a.writes[0].eventType).toBe(EventType.SYSTEM);
  });

  it('should skip events whose type is not in configs', () => {
    // Arrange
    const sink = makeSink();
    const emitter = new LogEventEmitter({
      sinks: [sink],
      enabled: true,
      configs: makeConfigs(makeConfig(EventType.SECURITY)),
      context: 'Test',
    });

    // Act
    emitter.system({
      systemEvent: SystemEvent.SERVICE_STARTED,
      systemStatus: SystemStatus.ONLINE,
      systemMessage: 'ok',
    });
    emitter.request({
      ip: '1.1.1.1',
      requestId: 'r1',
      method: 'GET',
      url: '/',
      route: '/',
      bytesReceived: 0,
      eventSeverity: EventSeverity.INFO,
    });

    // Assert
    expect(sink.writes).toHaveLength(0);
  });

  it('should skip every event when master enabled is false', () => {
    // Arrange
    const sink = makeSink();
    const emitter = new LogEventEmitter({
      sinks: [sink],
      enabled: false,
      configs: makeConfigs(makeConfig(EventType.SYSTEM)),
      context: 'Test',
    });

    // Act
    emitter.system({
      systemEvent: SystemEvent.SERVICE_STARTED,
      systemStatus: SystemStatus.ONLINE,
      systemMessage: 'ok',
    });

    // Assert
    expect(sink.writes).toHaveLength(0);
  });

  it('should emit security events when SECURITY is configured', () => {
    // Arrange
    const sink = makeSink();
    const emitter = new LogEventEmitter({
      sinks: [sink],
      enabled: true,
      configs: makeConfigs(makeConfig(EventType.SECURITY)),
      context: 'Test',
    });

    // Act
    emitter.security({
      ip: '1.1.1.1',
      traceId: 't1',
      requestId: 'r1',
      securityEvent: SecurityEvents.RATE_LIMIT_EXCEEDED,
      authOutcome: AuthOutcome.BLOCKED_TEMPORARILY,
      securityMessage: 'Rate limit tripped',
      eventSeverity: EventSeverity.SECURITY,
    });

    // Assert
    expect(sink.writes).toHaveLength(1);
    expect(sink.writes[0].eventType).toBe(EventType.SECURITY);
  });

  it('should emit audit events', () => {
    // Arrange
    const sink = makeSink();
    const emitter = new LogEventEmitter({
      sinks: [sink],
      enabled: true,
      configs: makeConfigs(makeConfig(EventType.AUDIT)),
      context: 'Test',
    });

    // Act
    emitter.audit({
      auditEvent: AuditEvents.RESOURCE_CREATED,
      userRoles: [],
      auditMessage: 'created',
      resource: 'users',
    });

    // Assert
    expect(sink.writes).toHaveLength(1);
    expect(sink.writes[0].eventType).toBe(EventType.AUDIT);
  });

  it('should derive a child emitter with a new context', () => {
    // Arrange
    const sink = makeSink();
    const root = new LogEventEmitter({
      sinks: [sink],
      enabled: true,
      configs: makeConfigs(makeConfig(EventType.SYSTEM)),
      context: 'Root',
    });
    const child = root.child('Child');

    // Act
    child.system({
      systemEvent: SystemEvent.SERVICE_STARTED,
      systemStatus: SystemStatus.ONLINE,
      systemMessage: 'ok',
    });

    // Assert
    expect(sink.writes[0].context).toBe('Child');
  });

  it('should close all sinks on close()', async () => {
    // Arrange
    const a = makeSink('console');
    const b = makeSink('file');
    const emitter = new LogEventEmitter({
      sinks: [a, b],
      enabled: true,
      configs: makeConfigs(),
      context: 'Test',
    });

    // Act
    await emitter.close();

    // Assert
    expect(a.close).toHaveBeenCalled();
    expect(b.close).toHaveBeenCalled();
  });

  it('should respect per-event console=false (skips console sink, keeps file sink)', () => {
    // Arrange
    const consoleSink = makeSink('console');
    const fileSink = makeSink('file');
    const emitter = new LogEventEmitter({
      sinks: [consoleSink, fileSink],
      enabled: true,
      configs: makeConfigs(makeConfig(EventType.REQUEST, { console: false })),
      context: 'Test',
    });

    // Act
    emitter.request({
      ip: '1.1.1.1',
      requestId: 'r1',
      method: 'GET',
      url: '/',
      route: '/',
      bytesReceived: 0,
      eventSeverity: EventSeverity.INFO,
    });

    // Assert
    expect(consoleSink.writes).toHaveLength(0);
    expect(fileSink.writes).toHaveLength(1);
  });

  it('should drop events below minSeverity', () => {
    // Arrange
    const sink = makeSink();
    const emitter = new LogEventEmitter({
      sinks: [sink],
      enabled: true,
      configs: makeConfigs(makeConfig(EventType.REQUEST, { minSeverity: EventSeverity.WARN })),
      context: 'Test',
    });

    // Act - INFO request below WARN threshold
    emitter.request({
      ip: '1.1.1.1',
      requestId: 'r1',
      method: 'GET',
      url: '/',
      route: '/',
      bytesReceived: 0,
      eventSeverity: EventSeverity.INFO,
    });

    // Assert
    expect(sink.writes).toHaveLength(0);
  });

  it('should sample by sampleRate using the supplied rng', () => {
    // Arrange - rng returns 0.9, sampleRate 0.5 â†’ drop (0.9 >= 0.5)
    const sink = makeSink();
    const emitter = new LogEventEmitter({
      sinks: [sink],
      enabled: true,
      configs: makeConfigs(makeConfig(EventType.REQUEST, { sampleRate: 0.5 })),
      context: 'Test',
      rng: () => 0.9,
    });

    // Act
    emitter.request({
      ip: '1.1.1.1',
      requestId: 'r1',
      method: 'GET',
      url: '/',
      route: '/',
      bytesReceived: 0,
      eventSeverity: EventSeverity.INFO,
    });

    // Assert
    expect(sink.writes).toHaveLength(0);
  });

  it('should strip payload fields when savePayload=false', () => {
    // Arrange
    const sink = makeSink();
    const emitter = new LogEventEmitter({
      sinks: [sink],
      enabled: true,
      configs: makeConfigs(makeConfig(EventType.ERROR, { savePayload: false })),
      context: 'Test',
    });

    // Act
    emitter.error({
      eventSeverity: EventSeverity.ERROR,
      causeUrl: 'GET /x',
      requestId: 'r1',
      errorType: 'RUNTIME_ERROR' as never,
      errorMessage: 'boom',
      stackTrace: 'Error: boom\n  at line 1',
    });

    // Assert
    const log = sink.writes[0] as unknown as Record<string, unknown>;
    expect(log.stackTrace).toBeUndefined();
    expect(log.errorMessage).toBe('boom');
  });

  it('should truncate payload fields exceeding payloadMaxLength', () => {
    // Arrange
    const sink = makeSink();
    const emitter = new LogEventEmitter({
      sinks: [sink],
      enabled: true,
      configs: makeConfigs(makeConfig(EventType.ERROR, { payloadMaxLength: 10 })),
      context: 'Test',
    });

    // Act
    emitter.error({
      eventSeverity: EventSeverity.ERROR,
      causeUrl: 'GET /x',
      requestId: 'r1',
      errorType: 'RUNTIME_ERROR' as never,
      errorMessage: 'boom',
      stackTrace: 'A'.repeat(500),
    });

    // Assert
    const log = sink.writes[0] as unknown as Record<string, unknown>;
    expect(typeof log.stackTrace).toBe('string');
    expect(String(log.stackTrace).endsWith('â€¦[truncated]')).toBe(true);
    expect(String(log.stackTrace).length).toBe(10 + 'â€¦[truncated]'.length);
  });

  it('should keep only whitelisted keys in payload objects when captureFields is set', () => {
    // Arrange
    const sink = makeSink();
    const emitter = new LogEventEmitter({
      sinks: [sink],
      enabled: true,
      configs: makeConfigs(makeConfig(EventType.AUDIT, { captureFields: ['kept'] })),
      context: 'Test',
    });

    // Act
    emitter.audit({
      auditEvent: AuditEvents.RESOURCE_CREATED,
      userRoles: [],
      auditMessage: 'created',
      resource: 'users',
      metadata: { kept: 1, dropped: 2 },
    });

    // Assert
    const log = sink.writes[0] as unknown as { metadata: Record<string, unknown> };
    expect(log.metadata).toEqual({ kept: 1 });
  });

  it('should apply captureFields recursively at every depth (strict whitelist model)', () => {
    // Arrange - user must whitelist every container key in the path they want to keep
    const sink = makeSink();
    const emitter = new LogEventEmitter({
      sinks: [sink],
      enabled: true,
      configs: makeConfigs(makeConfig(EventType.AUDIT, { captureFields: ['user', 'id'] })),
      context: 'Test',
    });

    // Act
    emitter.audit({
      auditEvent: AuditEvents.RESOURCE_CREATED,
      userRoles: [],
      auditMessage: 'created',
      resource: 'users',
      metadata: {
        user: { id: 'u1', email: 'e@x', password: 'secret' },
        sessionToken: 'abc',
      },
    });

    // Assert - `user` is whitelisted, so we recurse; inside, only `id` survives.
    // `sessionToken` and `email` and `password` are dropped.
    const log = sink.writes[0] as unknown as { metadata: Record<string, unknown> };
    expect(log.metadata).toEqual({ user: { id: 'u1' } });
  });

  it('should leave string payloads (stackTrace) untouched when captureFields is set', () => {
    // Arrange
    const sink = makeSink();
    const emitter = new LogEventEmitter({
      sinks: [sink],
      enabled: true,
      configs: makeConfigs(makeConfig(EventType.ERROR, { captureFields: ['anything'] })),
      context: 'Test',
    });

    // Act
    emitter.error({
      eventSeverity: EventSeverity.ERROR,
      causeUrl: 'GET /x',
      requestId: 'r1',
      errorType: 'RUNTIME_ERROR' as never,
      errorMessage: 'boom',
      stackTrace: 'A'.repeat(20),
    });

    // Assert
    const log = sink.writes[0] as unknown as Record<string, unknown>;
    expect(log.stackTrace).toBe('A'.repeat(20));
  });

  it('should not strip top-level infra fields when captureFields is set', () => {
    // Arrange
    const sink = makeSink();
    const emitter = new LogEventEmitter({
      sinks: [sink],
      enabled: true,
      configs: makeConfigs(makeConfig(EventType.SYSTEM, { captureFields: ['nonexistent'] })),
      context: 'Test',
    });

    // Act
    emitter.system({
      systemEvent: SystemEvent.SERVICE_STARTED,
      systemStatus: SystemStatus.ONLINE,
      systemMessage: 'ok',
    });

    // Assert
    const log = sink.writes[0] as unknown as Record<string, unknown>;
    expect(log.eventType).toBe(EventType.SYSTEM);
    expect(log['@timestamp']).toBeDefined();
    expect(log.context).toBe('Test');
    expect(log.appName).toBeDefined();
  });

  it('should narrow first via captureFields then mask via redactFields', () => {
    // Arrange
    const sink = makeSink();
    const emitter = new LogEventEmitter({
      sinks: [sink],
      enabled: true,
      configs: makeConfigs(makeConfig(EventType.AUDIT, {
        captureFields: ['token', 'other'],
        redactFields: ['token'],
      })),
      context: 'Test',
    });

    // Act
    emitter.audit({
      auditEvent: AuditEvents.RESOURCE_CREATED,
      userRoles: [],
      auditMessage: 'ok',
      resource: 'users',
      metadata: { token: 'abc', other: 'kept', dropped: 'gone' },
    });

    // Assert
    const log = sink.writes[0] as unknown as { metadata: Record<string, unknown> };
    expect(log.metadata.token).toBe('***');
    expect(log.metadata.other).toBe('kept');
    expect(log.metadata.dropped).toBeUndefined();
  });

  it('should redact configured fields recursively', () => {
    // Arrange
    const sink = makeSink();
    const emitter = new LogEventEmitter({
      sinks: [sink],
      enabled: true,
      configs: makeConfigs(makeConfig(EventType.AUDIT, { redactFields: ['authorization'] })),
      context: 'Test',
    });

    // Act
    emitter.audit({
      auditEvent: AuditEvents.RESOURCE_CREATED,
      userRoles: [],
      auditMessage: 'created',
      resource: 'users',
      metadata: { authorization: 'Bearer abc.def.ghi', other: 'kept' },
    });

    // Assert
    const log = sink.writes[0] as unknown as { metadata: Record<string, string> };
    expect(log.metadata.authorization).toBe('***');
    expect(log.metadata.other).toBe('kept');
  });
});
