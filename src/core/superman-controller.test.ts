import type { Request, Response, NextFunction } from 'express';
import { SupermanController } from './superman-controller';
import { TooManyRequestsException } from '../exceptions/http.exception';
import { reply } from './reply';

const makeReq = (overrides: Partial<Request> = {}): Request =>
  ({ ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' }, ...overrides } as unknown as Request);

const makeRes = (): Response => {
  const headers: Record<string, string> = {};
  return {
    setHeader: jest.fn((key: string, value: string) => { headers[key] = value; }),
    getHeader: jest.fn((key: string) => headers[key]),
    headersSent: false,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
};

describe('SupermanController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handler', () => {
    it('should call the handler function', async () => {
      // Arrange
      const handlerFn = jest.fn();
      const controller = new SupermanController(handlerFn);
      const req = makeReq();
      const res = makeRes();

      // Act
      await controller.handler(req, res);

      // Assert
      expect(handlerFn).toHaveBeenCalledWith(expect.objectContaining({ req, res }));
    }, 1000);

    it('should set X-RateLimit-Remaining header', async () => {
      // Arrange
      const controller = new SupermanController(jest.fn(), { throttleConfig: { limit: 10, ttl: 60_000 } });
      const req = makeReq();
      const res = makeRes();

      // Act
      await controller.handler(req, res);

      // Assert
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '9');
    }, 1000);

    it('should throw TooManyRequestsException when rate limited', async () => {
      // Arrange
      const controller = new SupermanController(jest.fn(), { throttleConfig: { limit: 1, ttl: 60_000 } });
      const req = makeReq();
      const res = makeRes();
      await controller.handler(req, res);

      // Act & Assert
      await expect(controller.handler(req, makeRes())).rejects.toThrow(TooManyRequestsException);
    }, 1000);

    it('should set Retry-After header when rate limited', async () => {
      // Arrange
      const controller = new SupermanController(jest.fn(), { throttleConfig: { limit: 1, ttl: 60_000 } });
      const req = makeReq();
      const res = makeRes();
      await controller.handler(req, res);

      // Act
      const res2 = makeRes();
      try { await controller.handler(req, res2); } catch { /* expected */ }

      // Assert
      expect(res2.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    }, 1000);

    it('should use fallback IP from socket when req.ip is undefined', async () => {
      // Arrange
      const handlerFn = jest.fn();
      const controller = new SupermanController(handlerFn);
      const req = makeReq({ ip: undefined });
      const res = makeRes();

      // Act
      await controller.handler(req, res);

      // Assert
      expect(handlerFn).toHaveBeenCalled();
    }, 1000);
  });

  describe('middlewares', () => {
    it('should run middlewares before the handler', async () => {
      // Arrange
      const callOrder: string[] = [];
      const middleware = (_req: Request, _res: Response, next: NextFunction) => {
        callOrder.push('middleware');
        next();
      };
      const handlerFn = () => { callOrder.push('handler'); };
      const controller = new SupermanController(handlerFn, { middlewares: [middleware] });

      // Act
      await controller.handler(makeReq(), makeRes());

      // Assert
      expect(callOrder).toEqual(['middleware', 'handler']);
    }, 1000);

    it('should run multiple middlewares in order', async () => {
      // Arrange
      const callOrder: string[] = [];
      const mw1 = (_req: Request, _res: Response, next: NextFunction) => {
        callOrder.push('mw1');
        next();
      };
      const mw2 = (_req: Request, _res: Response, next: NextFunction) => {
        callOrder.push('mw2');
        next();
      };
      const handlerFn = () => { callOrder.push('handler'); };
      const controller = new SupermanController(handlerFn, { middlewares: [mw1, mw2] });

      // Act
      await controller.handler(makeReq(), makeRes());

      // Assert
      expect(callOrder).toEqual(['mw1', 'mw2', 'handler']);
    }, 1000);

    it('should stop the chain when middleware sends a response without calling next', async () => {
      // Arrange
      const handlerFn = jest.fn();
      const blockingMiddleware = (_req: Request, res: Response) => {
        res.status(403).json({ error: 'Forbidden' });
      };
      const controller = new SupermanController(handlerFn, { middlewares: [blockingMiddleware] });

      // Act
      await controller.handler(makeReq(), makeRes());

      // Assert
      expect(handlerFn).not.toHaveBeenCalled();
    }, 1000);

    it('should propagate errors thrown by middleware', async () => {
      // Arrange
      const errorMiddleware = () => {
        throw new Error('Middleware error');
      };
      const controller = new SupermanController(jest.fn(), { middlewares: [errorMiddleware] });

      // Act & Assert
      await expect(controller.handler(makeReq(), makeRes())).rejects.toThrow('Middleware error');
    }, 1000);

    it('should propagate errors passed to next(err)', async () => {
      // Arrange
      const errorMiddleware = (_req: Request, _res: Response, next: NextFunction) => {
        next(new Error('Next error'));
      };
      const controller = new SupermanController(jest.fn(), { middlewares: [errorMiddleware] });

      // Act & Assert
      await expect(controller.handler(makeReq(), makeRes())).rejects.toThrow('Next error');
    }, 1000);

    it('should handle async middlewares that call next', async () => {
      // Arrange
      const handlerFn = jest.fn();
      const asyncMiddleware = async (_req: Request, _res: Response, next: NextFunction) => {
        await Promise.resolve();
        next();
      };
      const controller = new SupermanController(handlerFn, { middlewares: [asyncMiddleware] });

      // Act
      await controller.handler(makeReq(), makeRes());

      // Assert
      expect(handlerFn).toHaveBeenCalled();
    }, 1000);

    it('should handle async middlewares that send response without next', async () => {
      // Arrange
      const handlerFn = jest.fn();
      const asyncBlockingMiddleware = async (_req: Request, res: Response) => {
        await Promise.resolve();
        res.status(400).json({ error: 'Bad' });
      };
      const controller = new SupermanController(handlerFn, { middlewares: [asyncBlockingMiddleware] });

      // Act
      await controller.handler(makeReq(), makeRes());

      // Assert
      expect(handlerFn).not.toHaveBeenCalled();
    }, 1000);
  });

  describe('throttleConfig', () => {
    it('should use STANDARD preset by default', async () => {
      // Arrange
      const controller = new SupermanController(jest.fn());
      const req = makeReq();
      const res = makeRes();

      // Act
      await controller.handler(req, res);

      // Assert
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
    }, 1000);

    it('should accept a preset string', async () => {
      // Arrange
      const controller = new SupermanController(jest.fn(), { throttleConfig: 'SECURITY' });
      const req = makeReq();
      const res = makeRes();

      // Act
      await controller.handler(req, res);

      // Assert
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
    }, 1000);

    it('should accept a custom config object', async () => {
      // Arrange
      const controller = new SupermanController(jest.fn(), { throttleConfig: { limit: 50, ttl: 30_000 } });
      const req = makeReq();
      const res = makeRes();

      // Act
      await controller.handler(req, res);

      // Assert
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '49');
    }, 1000);
  });

  describe('metadata', () => {
    it('should return preset name and resolved config for preset throttle', () => {
      // Arrange
      const controller = new SupermanController(jest.fn(), { throttleConfig: 'SECURITY' });

      // Act
      const meta = controller.metadata;

      // Assert
      expect(meta.throttlePreset).toBe('SECURITY');
      expect(meta.throttleConfig).toEqual({ limit: 5, ttl: 60_000 });
    }, 1000);

    it('should return null preset for custom throttle config', () => {
      // Arrange
      const controller = new SupermanController(jest.fn(), { throttleConfig: { limit: 25, ttl: 120_000 } });

      // Act
      const meta = controller.metadata;

      // Assert
      expect(meta.throttlePreset).toBeNull();
      expect(meta.throttleConfig).toEqual({ limit: 25, ttl: 120_000 });
    }, 1000);

    it('should default to STANDARD preset', () => {
      // Arrange
      const controller = new SupermanController(jest.fn());

      // Act
      const meta = controller.metadata;

      // Assert
      expect(meta.throttlePreset).toBe('STANDARD');
      expect(meta.throttleConfig).toEqual({ limit: 100, ttl: 60_000 });
    }, 1000);
  });

  describe('context handler - return-value writing', () => {
    it('should write a returned plain object as JSON with status 200 by default', async () => {
      // Arrange
      const handler = async () => ({ id: 1, name: 'Ada' });
      const controller = new SupermanController(handler);
      const req = makeReq();
      const res = makeRes();

      // Act
      await controller.handler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ id: 1, name: 'Ada' });
    }, 1000);

    it('should pick the single 2xx key declared in responses as the success status', async () => {
      // Arrange
      const handler = async () => ({ id: 1 });
      const controller = new SupermanController(handler, undefined, {
        responses: { 201: { description: 'Created.' } },
      });
      const req = makeReq();
      const res = makeRes();

      // Act
      await controller.handler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: 1 });
    }, 1000);

    it('should default to 200 when multiple 2xx keys are declared', async () => {
      // Arrange
      const handler = async () => ({ ok: true });
      const controller = new SupermanController(handler, undefined, {
        responses: { 200: { description: 'ok' }, 202: { description: 'accepted' } },
      });
      const req = makeReq();
      const res = makeRes();

      // Act
      await controller.handler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(200);
    }, 1000);

    it('should not touch res when the handler returns undefined', async () => {
      // Arrange
      const handler = async () => undefined;
      const controller = new SupermanController(handler);
      const req = makeReq();
      const res = makeRes();

      // Act
      await controller.handler(req, res);

      // Assert - only the rate-limit header is set; status/json are not called
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    }, 1000);

    it('should not touch res when headersSent is already true', async () => {
      // Arrange
      const handler = async () => ({ ignored: true });
      const controller = new SupermanController(handler);
      const req = makeReq();
      const res = { ...makeRes(), headersSent: true } as Response;

      // Act
      await controller.handler(req, res);

      // Assert
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    }, 1000);
  });

  describe('reply() envelope', () => {
    it('should honour an explicit status from reply()', async () => {
      // Arrange
      const handler = async () => reply({ id: 1 }, { status: 202 });
      const controller = new SupermanController(handler);
      const req = makeReq();
      const res = makeRes();

      // Act
      await controller.handler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({ id: 1 });
    }, 1000);

    it('should set headers from reply()', async () => {
      // Arrange
      const handler = async () => reply({ ok: true }, { headers: { 'X-Trace-Id': 'abc' } });
      const controller = new SupermanController(handler);
      const req = makeReq();
      const res = makeRes();

      // Act
      await controller.handler(req, res);

      // Assert
      expect(res.setHeader).toHaveBeenCalledWith('X-Trace-Id', 'abc');
    }, 1000);

    it('should send body verbatim when reply() declares a mediaType', async () => {
      // Arrange
      const xml = '<user><id>1</id></user>';
      const type = jest.fn().mockReturnThis();
      const send = jest.fn().mockReturnThis();
      const handler = async () => reply(xml, { mediaType: 'application/xml' });
      const controller = new SupermanController(handler);
      const req = makeReq();
      const res = { ...makeRes(), type, send } as unknown as Response;

      // Act
      await controller.handler(req, res);

      // Assert
      expect(type).toHaveBeenCalledWith('application/xml');
      expect(send).toHaveBeenCalledWith(xml);
    }, 1000);
  });

  describe('legacy (req, res, service) handler', () => {
    it('should still receive (req, res, service) positionally', async () => {
      // Arrange
      const calls: Array<[unknown, unknown, unknown]> = [];
      const handler = async (req: Request, res: Response, service: unknown) => {
        calls.push([req, res, service]);
      };
      const mockService = { hello: 'world' };
      const controller = new SupermanController(handler as unknown as () => unknown, mockService);
      const req = makeReq();
      const res = makeRes();

      // Act
      await controller.handler(req, res);

      // Assert
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual([req, res, mockService]);
    }, 1000);
  });

  describe('flat context (body/query/params spread at root)', () => {
    const captureCtx = (target: { ctx?: Record<string, unknown> }) =>
      async (ctx: Record<string, unknown>) => { target.ctx = ctx; };

    it('should spread body leaf properties at the context root', async () => {
      // Arrange
      const captured: { ctx?: Record<string, unknown> } = {};
      const controller = new SupermanController(captureCtx(captured) as unknown as (ctx: unknown) => unknown);
      const req = makeReq({ body: { name: 'Ada', email: 'ada@example.com' } } as Partial<Request>);

      // Act
      await controller.handler(req, makeRes());

      // Assert
      expect(captured.ctx).toMatchObject({
        name: 'Ada',
        email: 'ada@example.com',
        body: { name: 'Ada', email: 'ada@example.com' },
      });
    }, 1000);

    it('should spread params leaf properties at the context root', async () => {
      // Arrange
      const captured: { ctx?: Record<string, unknown> } = {};
      const controller = new SupermanController(captureCtx(captured) as unknown as (ctx: unknown) => unknown);
      const req = makeReq({ params: { id: '42' } } as unknown as Partial<Request>);

      // Act
      await controller.handler(req, makeRes());

      // Assert
      expect(captured.ctx?.id).toBe('42');
      expect((captured.ctx?.params as { id: string }).id).toBe('42');
    }, 1000);

    it('should let params win over body on key collision', async () => {
      // Arrange
      const captured: { ctx?: Record<string, unknown> } = {};
      const controller = new SupermanController(captureCtx(captured) as unknown as (ctx: unknown) => unknown);
      const req = makeReq({
        body: { id: 'body-id' },
        params: { id: 'param-id' },
      } as unknown as Partial<Request>);

      // Act
      await controller.handler(req, makeRes());

      // Assert
      expect(captured.ctx?.id).toBe('param-id');
    }, 1000);

    it('should never overwrite reserved structural keys', async () => {
      // Arrange
      const captured: { ctx?: Record<string, unknown> } = {};
      const mockService = { real: true };
      const controller = new SupermanController(
        captureCtx(captured) as unknown as (ctx: unknown) => unknown,
        mockService,
      );
      const req = makeReq({ body: { service: 'evil', body: 'inner-body' } } as Partial<Request>);

      // Act
      await controller.handler(req, makeRes());

      // Assert
      expect(captured.ctx?.service).toBe(mockService);
      expect(captured.ctx?.body).toEqual({ service: 'evil', body: 'inner-body' });
    }, 1000);

    it('should not flatten the user principal as separate context keys', async () => {
      // Arrange
      const captured: { ctx?: Record<string, unknown> } = {};
      const controller = new SupermanController(captureCtx(captured) as unknown as (ctx: unknown) => unknown);
      const principal = { id: 'u1', roles: ['admin'] };
      const req = makeReq({ user: principal } as unknown as Partial<Request>);

      // Act
      await controller.handler(req, makeRes());

      // Assert - user stays structural; `id`/`roles` do NOT appear at the root
      expect(captured.ctx?.user).toEqual(principal);
      expect(captured.ctx?.id).toBeUndefined();
      expect(captured.ctx?.roles).toBeUndefined();
    }, 1000);

    it('should give body precedence over query on key collision', async () => {
      // Arrange
      const captured: { ctx?: Record<string, unknown> } = {};
      const controller = new SupermanController(captureCtx(captured) as unknown as (ctx: unknown) => unknown);
      const req = makeReq({
        body: { page: 'from-body' },
        query: { page: 'from-query' },
      } as unknown as Partial<Request>);

      // Act
      await controller.handler(req, makeRes());

      // Assert
      expect(captured.ctx?.page).toBe('from-body');
    }, 1000);
  });
});

