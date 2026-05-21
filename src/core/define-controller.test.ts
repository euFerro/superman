import type { Request, RequestHandler, Response } from 'express';
import { defineController } from './define-controller';
import { SupermanController } from './superman-controller';

const makeReq = (): Request =>
  ({ ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as unknown as Request);

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

interface IMockService {
  getData(): string;
}

const mockService: IMockService = { getData: () => 'test-data' };

describe('defineController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a controller factory function', () => {
    // Arrange & Act
    const factory = defineController<IMockService>({ handler: jest.fn() });

    // Assert
    expect(typeof factory).toBe('function');
  }, 1000);

  it('should produce a SupermanController when factory is called with service', () => {
    // Arrange
    const factory = defineController<IMockService>({ handler: jest.fn() });

    // Act
    const controller = factory(mockService);

    // Assert
    expect(controller).toBeInstanceOf(SupermanController);
  }, 1000);

  it('should pass service to the handler context', async () => {
    // Arrange
    const handlerFn = jest.fn();
    const factory = defineController<IMockService>({ handler: handlerFn });
    const controller = factory(mockService);
    const req = makeReq();
    const res = makeRes();

    // Act
    await controller.handler(req, res);

    // Assert
    expect(handlerFn).toHaveBeenCalledWith(expect.objectContaining({ service: mockService, req, res }));
  }, 1000);

  it('should allow handler to use the service', async () => {
    // Arrange
    const factory = defineController<IMockService>({
      handler: async (_req, res, service) => {
        res.json({ result: service.getData() });
      },
    });
    const controller = factory(mockService);
    const res = makeRes();

    // Act
    await controller.handler(makeReq(), res);

    // Assert
    expect(res.json).toHaveBeenCalledWith({ result: 'test-data' });
  }, 1000);

  it('should apply throttle config', async () => {
    // Arrange
    const factory = defineController<IMockService>({
      handler: jest.fn(),
      throttleConfig: 'SECURITY',
    });
    const controller = factory(mockService);
    const res = makeRes();

    // Act
    await controller.handler(makeReq(), res);

    // Assert
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
  }, 1000);

  it('should apply custom throttle config', async () => {
    // Arrange
    const factory = defineController<IMockService>({
      handler: jest.fn(),
      throttleConfig: { limit: 50, ttl: 30_000 },
    });
    const controller = factory(mockService);
    const res = makeRes();

    // Act
    await controller.handler(makeReq(), res);

    // Assert
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '49');
  }, 1000);

  it('should run middlewares before the handler', async () => {
    // Arrange
    const callOrder: string[] = [];
    const factory = defineController<IMockService>({
      handler: () => { callOrder.push('handler'); },
      middlewares: [((_req, _res, next) => { callOrder.push('mw'); next(); }) as RequestHandler],
    });
    const controller = factory(mockService);

    // Act
    await controller.handler(makeReq(), makeRes());

    // Assert
    expect(callOrder).toEqual(['mw', 'handler']);
  }, 1000);
});

