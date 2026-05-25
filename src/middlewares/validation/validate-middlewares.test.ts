import type { FastifyRequest, FastifyReply } from 'fastify';
import { validateBody } from './validate-body';
import { validateQuery } from './validate-query';
import { validateHeaders } from './validate-headers';
import { validateCookies } from './validate-cookies';
import { validatePathParams } from './validate-path-params';
import { validateContentType } from './validate-content-type';
import { readOpenApiMeta } from '../openapi-meta';
import { BadRequestException, UnsupportedMediaTypeException } from '../../exceptions/http.exception';

const makeReq = (overrides: Partial<FastifyRequest> = {}): FastifyRequest => ({
  body: {},
  query: {},
  params: {},
  headers: {},
  cookies: {},
  ...overrides,
} as FastifyRequest);

const makeRes = (): FastifyReply => ({} as FastifyReply);

const executeMw = async (mw: any, req: any): Promise<unknown> => {
  try {
    await mw(req, makeRes());
    return undefined;
  } catch (err) {
    return err;
  }
};

describe('validate middlewares', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateBody', () => {
    it('should pass with no error when the body matches the schema', async () => {
      // Arrange
      const mw = validateBody({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] });
      const req = makeReq({ body: { name: 'Ada' } });

      // Act
      const err = await executeMw(mw, req);

      // Assert
      expect(err).toBeUndefined();
    }, 1000);

    it('should throw BadRequestException carrying metadata.errors on failure', async () => {
      // Arrange
      const mw = validateBody({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] });
      const req = makeReq({ body: {} });

      // Act
      const err = await executeMw(mw, req);

      // Assert
      const error = err as BadRequestException;
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error.metadata as { errors: unknown[] }).errors).toHaveLength(1);
    }, 1000);

    it('should annotate as a body middleware with the schema attached', () => {
      // Arrange
      const schema = { type: 'object', properties: { x: { type: 'integer' } } };

      // Act
      const mw = validateBody(schema);

      // Assert
      expect(readOpenApiMeta(mw)).toMatchObject({ kind: 'body', schema });
    }, 1000);

    it('should support a media-type schema map', async () => {
      // Arrange
      const mw = validateBody({
        'application/json': { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
        'application/xml':  { type: 'string' },
      });
      const req = makeReq({ body: 'not-json-form', headers: { 'content-type': 'application/xml' } as FastifyRequest['headers'] });

      // Act
      const err = await executeMw(mw, req);

      // Assert
      expect(err).toBeUndefined();
      const meta = readOpenApiMeta(mw)!;
      expect(meta.bodyContent).toEqual({
        'application/json': { schema: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } },
        'application/xml':  { schema: { type: 'string' } },
      });
    }, 1000);
  });

  describe('validateQuery', () => {
    it('should coerce numeric strings on success', async () => {
      // Arrange
      const mw = validateQuery({ type: 'object', properties: { page: { type: 'integer', minimum: 1 } } });
      const req = makeReq({ query: { page: '3' } as unknown as FastifyRequest['query'] });

      // Act
      const err = await executeMw(mw, req);

      // Assert
      expect(err).toBeUndefined();
      expect((req.query as Record<string, unknown>).page).toBe(3);
    }, 1000);

    it('should reject out-of-range values', async () => {
      // Arrange
      const mw = validateQuery({ type: 'object', properties: { page: { type: 'integer', minimum: 1 } } });
      const req = makeReq({ query: { page: '0' } as unknown as FastifyRequest['query'] });

      // Act
      const err = await executeMw(mw, req);

      // Assert
      expect(err).toBeInstanceOf(BadRequestException);
    }, 1000);
  });

  describe('validateHeaders / validateCookies / validatePathParams', () => {
    it('should annotate validateHeaders with kind=headers', () => {
      // Arrange / Act
      const mw = validateHeaders({ type: 'object', properties: { 'x-tenant-id': { type: 'string' } } });

      // Assert
      expect(readOpenApiMeta(mw)?.kind).toBe('headers');
    }, 1000);

    it('should annotate validateCookies with kind=cookies', () => {
      // Arrange / Act
      const mw = validateCookies({ type: 'object', properties: { session: { type: 'string' } } });

      // Assert
      expect(readOpenApiMeta(mw)?.kind).toBe('cookies');
    }, 1000);

    it('should annotate validatePathParams with kind=path and coerce ids', async () => {
      // Arrange
      const mw = validatePathParams({ type: 'object', properties: { id: { type: 'integer' } } });
      const req = makeReq({ params: { id: '42' } });

      // Act
      const err = await executeMw(mw, req);

      // Assert
      expect(err).toBeUndefined();
      expect((req.params as Record<string, unknown>).id).toBe(42);
      expect(readOpenApiMeta(mw)?.kind).toBe('path');
    }, 1000);
  });

  describe('validateContentType', () => {
    it('should pass through a matching Content-Type', async () => {
      // Arrange
      const mw = validateContentType('application/json');
      const req = makeReq({ headers: { 'content-type': 'application/json; charset=utf-8' } as FastifyRequest['headers'] });

      // Act
      const err = await executeMw(mw, req);

      // Assert
      expect(err).toBeUndefined();
    }, 1000);

    it('should throw UnsupportedMediaTypeException with metadata.supported on mismatch', async () => {
      // Arrange
      const mw = validateContentType('application/json', 'multipart/form-data');
      const req = makeReq({ headers: { 'content-type': 'text/plain' } as FastifyRequest['headers'] });

      // Act
      const err = await executeMw(mw, req);

      // Assert
      const error = err as UnsupportedMediaTypeException;
      expect(error).toBeInstanceOf(UnsupportedMediaTypeException);
      expect((error.metadata as { supported: string[] }).supported).toEqual(['application/json', 'multipart/form-data']);
    }, 1000);

    it('should annotate with mediaTypes and an auto-415 status', () => {
      // Arrange / Act
      const mw = validateContentType('application/json');
      const meta = readOpenApiMeta(mw)!;

      // Assert
      expect(meta.kind).toBe('content-type');
      expect(meta.mediaTypes).toEqual(['application/json']);
      expect(meta.errorStatuses).toEqual([
        { status: 415, description: 'Unsupported Content-Type.', metadataSchema: expect.any(Object) },
      ]);
    }, 1000);
  });

  describe('custom message override', () => {
    it('should override the default BadRequestException message in validateBody', async () => {
      // Arrange
      const mw = validateBody(
        { type: 'object', properties: { email: { type: 'string', format: 'email' } }, required: ['email'] },
        { message: 'Please supply a valid user payload.' },
      );
      const req = makeReq({ body: {} });

      // Act
      const err = await executeMw(mw, req);

      // Assert
      const e = err as BadRequestException;
      expect(e).toBeInstanceOf(BadRequestException);
      expect(e.message).toBe('Please supply a valid user payload.');
      expect(e.metadata).toHaveProperty('errors');
    }, 1000);

    it('should keep the default message when options.message is omitted', async () => {
      // Arrange
      const mw = validateBody({
        type: 'object', properties: { email: { type: 'string' } }, required: ['email'],
      });
      const req = makeReq({ body: {} });

      // Act
      const err = await executeMw(mw, req);

      // Assert
      expect((err as BadRequestException).message).toBe('Request body validation failed.');
    }, 1000);

    it('should override the message in validateQuery', async () => {
      // Arrange
      const mw = validateQuery(
        { type: 'object', properties: { page: { type: 'integer', minimum: 1 } }, required: ['page'] },
        { message: 'Invalid pagination.' },
      );
      const req = makeReq({ query: {} });

      // Act
      const err = await executeMw(mw, req);

      // Assert
      expect((err as BadRequestException).message).toBe('Invalid pagination.');
    }, 1000);

    it('should override the message in validateHeaders / validateCookies / validatePathParams', async () => {
      // Arrange
      const headersMw = validateHeaders(
        { type: 'object', properties: { 'x-tenant-id': { type: 'string' } }, required: ['x-tenant-id'] },
        { message: 'Tenant header required.' },
      );
      const cookiesMw = validateCookies(
        { type: 'object', properties: { session: { type: 'string' } }, required: ['session'] },
        { message: 'Session cookie missing.' },
      );
      const pathMw = validatePathParams(
        { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
        { message: 'Bad route id.' },
      );

      // Act
      const headersErr = await executeMw(headersMw, makeReq({ headers: {} }));
      const cookiesErr = await executeMw(cookiesMw, makeReq({ cookies: {} } as any));
      const pathErr = await executeMw(pathMw, makeReq({ params: { id: 'not-a-uuid' } }));

      // Assert
      expect((headersErr as BadRequestException).message).toBe('Tenant header required.');
      expect((cookiesErr as BadRequestException).message).toBe('Session cookie missing.');
      expect((pathErr as BadRequestException).message).toBe('Bad route id.');
    }, 1000);

    it('should override the UnsupportedMediaTypeException message in validateContentType', async () => {
      // Arrange
      const mw = validateContentType({
        types: ['application/json'],
        message: 'This endpoint only accepts JSON.',
      });
      const req = makeReq({ headers: { 'content-type': 'application/xml' } });

      // Act
      const err = await executeMw(mw, req);

      // Assert
      const e = err as UnsupportedMediaTypeException;
      expect(e).toBeInstanceOf(UnsupportedMediaTypeException);
      expect(e.message).toBe('This endpoint only accepts JSON.');
      expect(e.metadata).toEqual({ supported: ['application/json'] });
    }, 1000);
  });
});
