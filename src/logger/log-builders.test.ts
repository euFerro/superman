import type { Request, Response } from 'express';
import {
  buildAuditLog,
  buildErrorLog,
  buildRequestLog,
  buildResponseLog,
  buildSecurityLog,
  buildSystemLog,
  extractResource,
  mapMethodToAuditEvent,
  mapStatusToSecurityEvent,
  responseSeverityOf,
  statusClassOf,
} from './log-builders';
import {
  AuditEvents,
  AuthOutcome,
  ErrorType,
  EventSeverity,
  SecurityEvents,
  SystemEvent,
  SystemStatus,
} from './superman-logger.types';
import {
  HttpException,
  UnauthorizedException,
} from '../exceptions/http.exception';

interface ReqOverrides {
  method?: string;
  originalUrl?: string;
  ip?: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  route?: { path: string };
  body?: unknown;
}

const makeReq = (overrides: ReqOverrides = {}): Request => ({
  method: overrides.method ?? 'GET',
  originalUrl: overrides.originalUrl ?? '/api/users',
  ip: overrides.ip ?? '127.0.0.1',
  headers: overrides.headers ?? {},
  params: overrides.params ?? {},
  query: overrides.query ?? {},
  route: overrides.route,
  body: overrides.body,
  socket: { remoteAddress: '127.0.0.1' },
  get: (name: string) => overrides.headers?.[name.toLowerCase()],
} as unknown as Request);

interface ResOverrides {
  statusCode?: number;
  locals?: Record<string, unknown>;
  contentLength?: number;
}

const makeRes = (overrides: ResOverrides = {}): Response => ({
  statusCode: overrides.statusCode ?? 200,
  locals: overrides.locals ?? {},
  getHeader: (name: string) => (name.toLowerCase() === 'content-length' ? overrides.contentLength : undefined),
} as unknown as Response);

describe('statusClassOf', () => {
  test.each([
    [200, '2xx'],
    [201, '2xx'],
    [299, '2xx'],
    [300, '3xx'],
    [399, '3xx'],
    [400, '4xx'],
    [499, '4xx'],
    [500, '5xx'],
    [599, '5xx'],
  ])('should classify %i as %s', (code, expected) => {
    // Arrange & Act
    const actual = statusClassOf(code);

    // Assert
    expect(actual).toBe(expected);
  });
});

describe('responseSeverityOf', () => {
  test.each([
    [200, EventSeverity.INFO],
    [301, EventSeverity.INFO],
    [400, EventSeverity.ERROR],
    [401, EventSeverity.WARN],
    [403, EventSeverity.WARN],
    [404, EventSeverity.WARN],
    [409, EventSeverity.WARN],
    [413, EventSeverity.WARN],
    [422, EventSeverity.ERROR],
    [429, EventSeverity.WARN],
    [499, EventSeverity.WARN],
    [500, EventSeverity.ERROR],
    [503, EventSeverity.ERROR],
  ])('should map status %i to severity %s', (code, expected) => {
    // Arrange & Act
    const actual = responseSeverityOf(code);

    // Assert
    expect(actual).toBe(expected);
  });
});

describe('extractResource', () => {
  test.each([
    ['/api/users/123', '/api', 'users'],
    ['/api/users', '/api', 'users'],
    ['/api/', '/api', 'root'],
    ['/api', '/api', 'root'],
    ['/api/orders/42?foo=bar', '/api', 'orders'],
    ['/users/123', '', 'users'],
    ['/', '', 'root'],
  ])('should extract from url=%s prefix=%s as %s', (url, prefix, expected) => {
    // Arrange & Act
    const actual = extractResource(url, prefix);

    // Assert
    expect(actual).toBe(expected);
  });
});

describe('mapStatusToSecurityEvent', () => {
  test.each([
    [401, SecurityEvents.UNAUTHORIZED_ACCESS, AuthOutcome.DENIED, EventSeverity.WARN],
    [403, SecurityEvents.FORBIDDEN_ACTION, AuthOutcome.DENIED, EventSeverity.WARN],
    [413, SecurityEvents.PAYLOAD_TOO_LARGE, AuthOutcome.DENIED, EventSeverity.WARN],
    [422, SecurityEvents.MALFORMED_PAYLOAD, AuthOutcome.DENIED, EventSeverity.WARN],
    [429, SecurityEvents.RATE_LIMIT_EXCEEDED, AuthOutcome.BLOCKED_TEMPORARILY, EventSeverity.SECURITY],
  ])('should map status %i to %s', (code, event, outcome, severity) => {
    // Arrange & Act
    const actual = mapStatusToSecurityEvent(code);

    // Assert
    expect(actual).toEqual({ securityEvent: event, authOutcome: outcome, eventSeverity: severity });
  });

  test.each([200, 301, 404, 500, 400])('should return null for status %i', (code) => {
    // Arrange & Act
    const actual = mapStatusToSecurityEvent(code);

    // Assert
    expect(actual).toBeNull();
  });
});

describe('mapMethodToAuditEvent', () => {
  test.each([
    ['POST', 201, AuditEvents.RESOURCE_CREATED],
    ['PUT', 200, AuditEvents.RESOURCE_UPDATED],
    ['PUT', 204, AuditEvents.RESOURCE_UPDATED],
    ['PATCH', 200, AuditEvents.RESOURCE_UPDATED],
    ['PATCH', 204, AuditEvents.RESOURCE_UPDATED],
    ['DELETE', 200, AuditEvents.RESOURCE_DELETED],
    ['DELETE', 204, AuditEvents.RESOURCE_DELETED],
    ['post', 201, AuditEvents.RESOURCE_CREATED],
  ])('should map %s %i to %s', (method, status, expected) => {
    // Arrange & Act
    const actual = mapMethodToAuditEvent(method, status);

    // Assert
    expect(actual).toBe(expected);
  });

  test.each([
    ['GET', 200],
    ['HEAD', 200],
    ['OPTIONS', 200],
    ['POST', 200],
    ['POST', 202],
    ['POST', 400],
    ['POST', 500],
    ['PUT', 202],
    ['PUT', 404],
    ['PATCH', 202],
    ['DELETE', 202],
    ['DELETE', 403],
  ])('should return null for %s %i', (method, status) => {
    // Arrange & Act
    const actual = mapMethodToAuditEvent(method, status);

    // Assert
    expect(actual).toBeNull();
  });
});

describe('buildRequestLog', () => {
  it('should build a request log with all fields populated', () => {
    // Arrange
    const req = makeReq({
      method: 'GET',
      originalUrl: '/api/users/123?page=2',
      headers: { 'user-agent': 'curl/8.0', 'referer': 'https://example.com', 'content-length': '42' },
      query: { page: '2' },
      route: { path: '/:id' },
    });

    // Act
    const log = buildRequestLog({ req, requestId: 'req-1', traceId: 'trace-1' });

    // Assert
    expect(log).toMatchObject({
      eventSeverity: EventSeverity.INFO,
      ip: '127.0.0.1',
      requestId: 'req-1',
      traceId: 'trace-1',
      method: 'GET',
      url: '/api/users/123?page=2',
      route: '/:id',
      query: { page: '2' },
      userAgent: 'curl/8.0',
      referrer: 'https://example.com',
      bytesReceived: 42,
    });
  });

  it('should omit optional fields when not present', () => {
    // Arrange
    const req = makeReq({ method: 'POST', originalUrl: '/api/users', query: {} });

    // Act
    const log = buildRequestLog({ req, requestId: 'req-2', traceId: 'trace-2' });

    // Assert
    expect(log.query).toBeUndefined();
    expect(log.userAgent).toBeUndefined();
    expect(log.referrer).toBeUndefined();
    expect(log.bytesReceived).toBe(0);
    expect(log.requestBody).toBeUndefined();
  });

  it('should include requestBody when req.body is a non-empty object', () => {
    // Arrange
    const req = makeReq({ method: 'POST', body: { username: 'admin', senha: 'x' } });

    // Act
    const log = buildRequestLog({ req, requestId: 'req-body-1', traceId: 't-1' });

    // Assert
    expect(log.requestBody).toEqual({ username: 'admin', senha: 'x' });
  });

  it('should omit requestBody for empty object body', () => {
    // Arrange
    const req = makeReq({ method: 'POST', body: {} });

    // Act
    const log = buildRequestLog({ req, requestId: 'req-body-2', traceId: 't-2' });

    // Assert
    expect(log.requestBody).toBeUndefined();
  });

  it('should omit requestBody when body is a Buffer', () => {
    // Arrange
    const req = makeReq({ method: 'POST', body: Buffer.from('binary') });

    // Act
    const log = buildRequestLog({ req, requestId: 'req-body-3', traceId: 't-3' });

    // Assert
    expect(log.requestBody).toBeUndefined();
  });

  it('should include requestBody when body is a non-empty string', () => {
    // Arrange
    const req = makeReq({ method: 'POST', body: 'raw-text' });

    // Act
    const log = buildRequestLog({ req, requestId: 'req-body-4', traceId: 't-4' });

    // Assert
    expect(log.requestBody).toBe('raw-text');
  });
});

describe('buildResponseLog', () => {
  it('should build a response log with status fields populated', () => {
    // Arrange
    const req = makeReq({ originalUrl: '/api/users/1', route: { path: '/:id' } });
    const res = makeRes({ statusCode: 200, contentLength: 128 });

    // Act
    const log = buildResponseLog({ req, res, requestId: 'req-3', responseTimeMs: 15 });

    // Assert
    expect(log).toMatchObject({
      eventSeverity: EventSeverity.INFO,
      requestId: 'req-3',
      route: '/:id',
      statusCode: 200,
      statusClass: '2xx',
      responseTimeMs: 15,
      bytesSent: 128,
    });
  });

  it('should classify 5xx as error severity and omit responseBody when not captured', () => {
    // Arrange
    const req = makeReq();
    const res = makeRes({ statusCode: 500 });

    // Act
    const log = buildResponseLog({ req, res, requestId: 'req-4', responseTimeMs: 50 });

    // Assert
    expect(log.eventSeverity).toBe(EventSeverity.ERROR);
    expect(log.statusClass).toBe('5xx');
    expect(log.responseBody).toBeUndefined();
  });

  it('should include responseBody captured in res.locals.__responseBody', () => {
    // Arrange
    const req = makeReq();
    const res = makeRes({ statusCode: 200, locals: { __responseBody: { id: 1, ok: true } } });

    // Act
    const log = buildResponseLog({ req, res, requestId: 'req-rb-1', responseTimeMs: 5 });

    // Assert
    expect(log.responseBody).toEqual({ id: 1, ok: true });
  });
});

describe('buildAuditLog', () => {
  it('should emit a RESOURCE_CREATED audit for POST 201', () => {
    // Arrange
    const req = makeReq({ method: 'POST', originalUrl: '/api/users' });
    const res = makeRes({ statusCode: 201, locals: { userId: 'u-1', userRoles: ['admin'] } });

    // Act
    const log = buildAuditLog({ req, res, requestId: 'req-5', prefix: '/api' });

    // Assert
    expect(log).toMatchObject({
      auditEvent: AuditEvents.RESOURCE_CREATED,
      resource: 'users',
      userId: 'u-1',
      userRoles: ['admin'],
      requestId: 'req-5',
    });
    expect(log?.auditMessage).toContain('RESOURCE_CREATED');
  });

  it('should include resourceId from req.params.id on PATCH', () => {
    // Arrange
    const req = makeReq({ method: 'PATCH', originalUrl: '/api/users/42', params: { id: '42' } });
    const res = makeRes({ statusCode: 200 });

    // Act
    const log = buildAuditLog({ req, res, requestId: 'req-6', prefix: '/api' });

    // Assert
    expect(log?.resourceId).toBe('42');
    expect(log?.auditEvent).toBe(AuditEvents.RESOURCE_UPDATED);
  });

  it('should return null for GET requests', () => {
    // Arrange
    const req = makeReq({ method: 'GET', originalUrl: '/api/users' });
    const res = makeRes({ statusCode: 200 });

    // Act
    const log = buildAuditLog({ req, res, requestId: 'req-7', prefix: '/api' });

    // Assert
    expect(log).toBeNull();
  });

  it('should return null for POST with non-2xx status', () => {
    // Arrange
    const req = makeReq({ method: 'POST', originalUrl: '/api/users' });
    const res = makeRes({ statusCode: 400 });

    // Act
    const log = buildAuditLog({ req, res, requestId: 'req-8', prefix: '/api' });

    // Assert
    expect(log).toBeNull();
  });
});

describe('buildSecurityLog', () => {
  it('should emit UNAUTHORIZED_ACCESS for 401', () => {
    // Arrange
    const req = makeReq({ method: 'GET', originalUrl: '/api/users' });
    const res = makeRes({ statusCode: 401 });

    // Act
    const log = buildSecurityLog({ req, res, requestId: 'req-9', traceId: 'trace-9' });

    // Assert
    expect(log).toMatchObject({
      securityEvent: SecurityEvents.UNAUTHORIZED_ACCESS,
      authOutcome: AuthOutcome.DENIED,
      eventSeverity: EventSeverity.WARN,
      requestId: 'req-9',
      traceId: 'trace-9',
    });
  });

  it('should include the exception name in the security message when provided', () => {
    // Arrange
    const req = makeReq({ method: 'GET', originalUrl: '/api/users' });
    const res = makeRes({ statusCode: 401 });

    // Act
    const log = buildSecurityLog({
      req, res, requestId: 'req-10', traceId: 'trace-10',
      exceptionName: 'UnauthorizedException',
    });

    // Assert
    expect(log?.securityMessage).toContain('UnauthorizedException');
  });

  it('should emit RATE_LIMIT_EXCEEDED with BLOCKED_TEMPORARILY for 429', () => {
    // Arrange
    const req = makeReq({ method: 'POST', originalUrl: '/api/login' });
    const res = makeRes({ statusCode: 429 });

    // Act
    const log = buildSecurityLog({ req, res, requestId: 'req-11', traceId: 'trace-11' });

    // Assert
    expect(log?.securityEvent).toBe(SecurityEvents.RATE_LIMIT_EXCEEDED);
    expect(log?.authOutcome).toBe(AuthOutcome.BLOCKED_TEMPORARILY);
    expect(log?.eventSeverity).toBe(EventSeverity.SECURITY);
  });

  it('should return null for a 200 response', () => {
    // Arrange
    const req = makeReq();
    const res = makeRes({ statusCode: 200 });

    // Act
    const log = buildSecurityLog({ req, res, requestId: 'req-12', traceId: 'trace-12' });

    // Assert
    expect(log).toBeNull();
  });
});

describe('buildErrorLog', () => {
  it('should classify HttpException as HTTP_EXCEPTION', () => {
    // Arrange
    const req = makeReq({ method: 'GET', originalUrl: '/api/users' });
    const err = new UnauthorizedException('token expired');

    // Act
    const log = buildErrorLog({ err, req, requestId: 'req-13' });

    // Assert
    expect(log.errorType).toBe(ErrorType.HTTP_EXCEPTION);
    expect(log.errorMessage).toBe('token expired');
    expect(log.causeUrl).toBe('GET /api/users');
  });

  it('should classify non-HttpException as RUNTIME_ERROR', () => {
    // Arrange
    const req = makeReq();
    const err = new Error('boom');

    // Act
    const log = buildErrorLog({ err, req, requestId: 'req-14' });

    // Assert
    expect(log.errorType).toBe(ErrorType.RUNTIME_ERROR);
    expect(log.errorMessage).toBe('boom');
  });

  it('should preserve the stack trace', () => {
    // Arrange
    const req = makeReq();
    const err = new HttpException(500, 'internal');

    // Act
    const log = buildErrorLog({ err, req, requestId: 'req-15' });

    // Assert
    expect(log.stackTrace).toBeDefined();
  });
});

describe('buildSystemLog', () => {
  it('should build a system log with required fields', () => {
    // Arrange & Act
    const log = buildSystemLog({
      systemEvent: SystemEvent.SERVICE_STARTED,
      systemStatus: SystemStatus.ONLINE,
      systemMessage: 'Service started',
    });

    // Assert
    expect(log).toMatchObject({
      systemEvent: SystemEvent.SERVICE_STARTED,
      systemStatus: SystemStatus.ONLINE,
      systemMessage: 'Service started',
      eventSeverity: EventSeverity.INFO,
    });
  });

  it('should honour an override for eventSeverity and metadata', () => {
    // Arrange & Act
    const log = buildSystemLog({
      systemEvent: SystemEvent.MANUAL_SHUTDOWN_ACTION,
      systemStatus: SystemStatus.OFFLINE,
      systemMessage: 'Shutting down',
      eventSeverity: EventSeverity.WARN,
      metadata: { signal: 'SIGTERM' },
    });

    // Assert
    expect(log.eventSeverity).toBe(EventSeverity.WARN);
    expect(log.metadata).toEqual({ signal: 'SIGTERM' });
  });
});

