import type { RequestHandler } from 'express';
import { attachOpenApiMeta, readOpenApiMeta } from './openapi-meta';

const makeHandler = (): RequestHandler => (_req, _res, next) => next();

describe('openapi-meta', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should attach and read back metadata', () => {
    // Arrange
    const handler = makeHandler();

    // Act
    attachOpenApiMeta(handler, { kind: 'body', schema: { type: 'object' } });
    const meta = readOpenApiMeta(handler);

    // Assert
    expect(meta).toEqual({ kind: 'body', schema: { type: 'object' } });
  }, 1000);

  it('should return undefined when no metadata was attached', () => {
    // Arrange
    const handler = makeHandler();

    // Act
    const meta = readOpenApiMeta(handler);

    // Assert
    expect(meta).toBeUndefined();
  }, 1000);

  it('should keep separate metadata for different handlers', () => {
    // Arrange
    const a = makeHandler();
    const b = makeHandler();

    // Act
    attachOpenApiMeta(a, { kind: 'query', schema: { type: 'object', properties: { page: { type: 'integer' } } } });
    attachOpenApiMeta(b, { kind: 'auth', security: { bearerAuth: [] } });

    // Assert
    expect(readOpenApiMeta(a)?.kind).toBe('query');
    expect(readOpenApiMeta(b)?.kind).toBe('auth');
  }, 1000);
});
