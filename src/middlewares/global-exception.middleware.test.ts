import type { Request, Response, NextFunction } from 'express';
import { globalExceptionMiddleware } from './global-exception.middleware';
import {
  BadRequestException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '../exceptions/http.exception';
import { logger } from '../logger/superman-logger';
import { resetLogRuntime } from '../logger/log-runtime';
import { config } from '../config/superman-config';

interface MockRes {
  status: jest.Mock;
  json: jest.Mock;
  locals: Record<string, unknown>;
}

const makeRes = (locals: Record<string, unknown> = {}): MockRes => ({
  status: jest.fn().mockReturnThis() as unknown as jest.Mock,
  json: jest.fn().mockReturnThis() as unknown as jest.Mock,
  locals,
});

const makeReq = (): Request => ({
  method: 'GET',
  originalUrl: '/api/users',
  ip: '127.0.0.1',
  headers: {},
  socket: { remoteAddress: '127.0.0.1' } as unknown,
  get: () => undefined,
} as unknown as Request);

describe('globalExceptionMiddleware', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    config.reset();
    resetLogRuntime();
    errorSpy = jest.spyOn(logger.child('Exception').events.constructor.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('should return structured JSON for HttpException', () => {
    // Arrange
    const err = new BadRequestException('Invalid email');
    const res = makeRes();

    // Act
    globalExceptionMiddleware(err, makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Assert
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid email' });
  }, 1000);

  it('should return 500 for generic errors', () => {
    // Arrange
    const err = new Error('Something broke');
    const res = makeRes();

    // Act
    globalExceptionMiddleware(err, makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
  }, 1000);

  it('should preserve the status code from HttpException', () => {
    // Arrange
    const err = new HttpException(503, 'Service down');
    const res = makeRes();

    // Act
    globalExceptionMiddleware(err, makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Assert
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Service down' });
  }, 1000);

  it('should stash exceptionName on res.locals for the response-finish hook', () => {
    // Arrange
    const err = new BadRequestException('Invalid email');
    const res = makeRes();

    // Act
    globalExceptionMiddleware(err, makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Assert
    expect(res.locals.exceptionName).toBe('BadRequestException');
  }, 1000);

  it('should emit an ERROR event for runtime (non-HttpException) errors', () => {
    // Arrange
    const err = new Error('boom');
    const res = makeRes({ requestId: 'req-1' });

    // Act
    globalExceptionMiddleware(err, makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Assert
    expect(errorSpy).toHaveBeenCalledTimes(1);
  }, 1000);

  it('should emit an ERROR event for HttpException with 5xx status', () => {
    // Arrange
    const err = new HttpException(503, 'Service down');
    const res = makeRes({ requestId: 'req-1' });

    // Act
    globalExceptionMiddleware(err, makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Assert
    expect(errorSpy).toHaveBeenCalledTimes(1);
  }, 1000);

  it('should emit an ERROR event for HttpException with 400 Bad Request', () => {
    // Arrange
    const err = new BadRequestException('Invalid email');
    const res = makeRes({ requestId: 'req-1' });

    // Act
    globalExceptionMiddleware(err, makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Assert
    expect(errorSpy).toHaveBeenCalledTimes(1);
  }, 1000);

  it('should emit an ERROR event for HttpException with 422 Unprocessable Entity', () => {
    // Arrange
    const err = new UnprocessableEntityException('Semantically invalid');
    const res = makeRes({ requestId: 'req-1' });

    // Act
    globalExceptionMiddleware(err, makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Assert
    expect(errorSpy).toHaveBeenCalledTimes(1);
  }, 1000);

  it('should NOT emit an ERROR event for HttpException with 404 Not Found', () => {
    // Arrange
    const err = new NotFoundException('User missing');
    const res = makeRes({ requestId: 'req-1' });

    // Act
    globalExceptionMiddleware(err, makeReq(), res as unknown as Response, jest.fn() as unknown as NextFunction);

    // Assert
    expect(errorSpy).not.toHaveBeenCalled();
  }, 1000);
});

