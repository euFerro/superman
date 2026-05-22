import type { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'events';
import { requestInterceptorMiddleware } from './request-interceptor.middleware';
import { logger } from '../logger/superman-logger';
import { config } from '../config/superman-config';
import { resetLogRuntime } from '../logger/log-runtime';
import { EventType } from '../logger/superman-logger.types';

interface ReqOverrides {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

const makeReq = (overrides: ReqOverrides = {}): Request => {
  const headers = overrides.headers ?? {};
  const emitter = new EventEmitter();
  const req = Object.assign(emitter, {
    method: overrides.method ?? 'GET',
    originalUrl: overrides.url ?? '/test',
    ip: '127.0.0.1',
    headers,
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    socket: { remoteAddress: '127.0.0.1' },
    get: (name: string) => headers[name.toLowerCase()],
  });
  return req as unknown as Request;
};

interface ResShape extends EventEmitter {
  statusCode: number;
  locals: Record<string, unknown>;
  setHeader: jest.Mock;
  getHeader: jest.Mock;
  json: jest.Mock;
  send: jest.Mock;
}

const makeRes = (statusCode = 200): ResShape => {
  const emitter = new EventEmitter() as ResShape;
  emitter.statusCode = statusCode;
  emitter.locals = {};
  emitter.setHeader = jest.fn();
  emitter.getHeader = jest.fn();
  emitter.json = jest.fn().mockReturnValue(emitter);
  emitter.send = jest.fn().mockReturnValue(emitter);
  return emitter;
};

const hub = logger.child('HTTP');

describe('requestInterceptorMiddleware', () => {
  let requestSpy: jest.SpyInstance;
  let responseSpy: jest.SpyInstance;
  let auditSpy: jest.SpyInstance;
  let securitySpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-04-14T12:00:00Z'));
    config.reset();
    resetLogRuntime();

    // Spy on the events namespace of the logger instance used by the middleware
    // The middleware creates `logger.child('HTTP')` - since child() creates new
    // instances, stub at the emitter prototype level instead.
    const emitter = hub.events;
    requestSpy = jest.spyOn(emitter.constructor.prototype, 'request').mockImplementation(() => {});
    responseSpy = jest.spyOn(emitter.constructor.prototype, 'response').mockImplementation(() => {});
    auditSpy = jest.spyOn(emitter.constructor.prototype, 'audit').mockImplementation(() => {});
    securitySpy = jest.spyOn(emitter.constructor.prototype, 'security').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    requestSpy.mockRestore();
    responseSpy.mockRestore();
    auditSpy.mockRestore();
    securitySpy.mockRestore();
  });

  it('should call next()', () => {
    // Arrange
    const next = jest.fn() as unknown as NextFunction;

    // Act
    requestInterceptorMiddleware(makeReq(), makeRes() as unknown as Response, next);

    // Assert
    expect(next).toHaveBeenCalled();
  }, 1000);

  it('should set X-Request-Id header with a generated UUID', () => {
    // Arrange
    const res = makeRes();

    // Act
    requestInterceptorMiddleware(makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Assert
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', expect.any(String));
    expect(res.locals.requestId).toBeDefined();
    expect(res.locals.traceId).toBeDefined();
  }, 1000);

  it('should honour an inbound X-Request-Id header', () => {
    // Arrange
    const res = makeRes();

    // Act
    requestInterceptorMiddleware(
      makeReq({ headers: { 'x-request-id': 'client-abc' } }),
      res as unknown as Response,
      jest.fn() as unknown as NextFunction,
    );

    // Assert
    expect(res.locals.requestId).toBe('client-abc');
  }, 1000);

  it('should emit REQUEST after the request stream end', () => {
    // Arrange
    const res = makeRes();
    const req = makeReq();
    requestInterceptorMiddleware(req, res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Act
    (req as unknown as EventEmitter).emit('end');
    jest.advanceTimersByTime(0);

    // Assert
    expect(requestSpy).toHaveBeenCalledTimes(1);
  }, 1000);

  it('should fall back to emitting REQUEST on response finish if stream end never fires', () => {
    // Arrange
    const res = makeRes();
    requestInterceptorMiddleware(makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Act
    res.emit('finish');

    // Assert
    expect(requestSpy).toHaveBeenCalledTimes(1);
  }, 1000);

  it('should emit REQUEST only once even if both end and finish fire', () => {
    // Arrange
    const res = makeRes();
    const req = makeReq();
    requestInterceptorMiddleware(req, res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Act
    (req as unknown as EventEmitter).emit('end');
    jest.advanceTimersByTime(0);
    res.emit('finish');

    // Assert
    expect(requestSpy).toHaveBeenCalledTimes(1);
  }, 1000);

  it('should emit RESPONSE on finish', () => {
    // Arrange
    const res = makeRes(200);

    // Act
    requestInterceptorMiddleware(makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);
    res.emit('finish');

    // Assert
    expect(responseSpy).toHaveBeenCalledTimes(1);
  }, 1000);

  it('should emit AUDIT on POST with 2xx status', () => {
    // Arrange
    const res = makeRes(201);

    // Act
    requestInterceptorMiddleware(
      makeReq({ method: 'POST', url: '/api/users' }),
      res as unknown as Response,
      jest.fn() as unknown as NextFunction,
    );
    res.emit('finish');

    // Assert
    expect(auditSpy).toHaveBeenCalledTimes(1);
  }, 1000);

  it('should NOT emit AUDIT on GET requests', () => {
    // Arrange
    const res = makeRes(200);

    // Act
    requestInterceptorMiddleware(
      makeReq({ method: 'GET', url: '/api/users' }),
      res as unknown as Response,
      jest.fn() as unknown as NextFunction,
    );
    res.emit('finish');

    // Assert
    expect(auditSpy).not.toHaveBeenCalled();
  }, 1000);

  it('should emit SECURITY on 401 response', () => {
    // Arrange
    const res = makeRes(401);

    // Act
    requestInterceptorMiddleware(
      makeReq({ method: 'GET', url: '/api/users' }),
      res as unknown as Response,
      jest.fn() as unknown as NextFunction,
    );
    res.emit('finish');

    // Assert
    expect(securitySpy).toHaveBeenCalledTimes(1);
  }, 1000);

  it('should emit SECURITY on 429 response', () => {
    // Arrange
    const res = makeRes(429);

    // Act
    requestInterceptorMiddleware(
      makeReq({ method: 'POST', url: '/api/login' }),
      res as unknown as Response,
      jest.fn() as unknown as NextFunction,
    );
    res.emit('finish');

    // Assert
    expect(securitySpy).toHaveBeenCalledTimes(1);
  }, 1000);

  it('should NOT emit SECURITY on a plain 200 response', () => {
    // Arrange
    const res = makeRes(200);

    // Act
    requestInterceptorMiddleware(makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);
    res.emit('finish');

    // Assert
    expect(securitySpy).not.toHaveBeenCalled();
  }, 1000);

  it('should capture response body when handler calls res.json()', () => {
    // Arrange
    const res = makeRes(200);
    requestInterceptorMiddleware(makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Act
    (res as unknown as Response).json({ data: { id: 7 } });

    // Assert
    expect(res.locals.__responseBody).toEqual({ data: { id: 7 } });
  }, 1000);

  it('should mark response body as <binary> for Buffer payloads via res.send', () => {
    // Arrange
    const res = makeRes(200);
    requestInterceptorMiddleware(makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Act
    (res as unknown as Response).send(Buffer.from('pdfdata'));

    // Assert
    expect(res.locals.__responseBody).toBe('<binary>');
  }, 1000);

  it('should parse JSON string passed to res.send into an object', () => {
    // Arrange
    const res = makeRes(200);
    requestInterceptorMiddleware(makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Act
    (res as unknown as Response).send('{"ok":true}');

    // Assert
    expect(res.locals.__responseBody).toEqual({ ok: true });
  }, 1000);

  it('should keep non-JSON strings passed to res.send as raw string', () => {
    // Arrange
    const res = makeRes(200);
    requestInterceptorMiddleware(makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Act
    (res as unknown as Response).send('plain text');

    // Assert
    expect(res.locals.__responseBody).toBe('plain text');
  }, 1000);

  it('should not overwrite responseBody once res.json has captured it', () => {
    // Arrange
    const res = makeRes(200);
    requestInterceptorMiddleware(makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Act
    (res as unknown as Response).json({ first: true });
    (res as unknown as Response).send('would-overwrite');

    // Assert
    expect(res.locals.__responseBody).toEqual({ first: true });
  }, 1000);
});

