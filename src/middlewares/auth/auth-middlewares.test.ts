import type { FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth } from './require-auth';
import { authorize, requireRoles } from './require-roles';
import { readOpenApiMeta } from '../openapi-meta';
import { ForbiddenException, UnauthorizedException } from '../../exceptions/http.exception';
import { config } from '../../config/superman-config';
import type { Principal } from '../../config/superman-config';

const makeReq = (overrides: Partial<FastifyRequest> = {}): FastifyRequest => ({ ...overrides } as FastifyRequest);
const makeRes = (): FastifyReply => ({} as FastifyReply);

const executeMw = async (mw: any, req: any): Promise<unknown> => {
  try {
    await mw(req, makeRes());
    return undefined;
  } catch (err) {
    return err;
  }
};

describe('auth middlewares', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    config.reset();
  });

  describe('requireAuth', () => {
    it('should attach the verified principal to req.user', async () => {
      // Arrange
      const principal: Principal = { id: 'u-1', roles: ['admin'] };
      const mw = requireAuth({ scheme: 'bearerAuth', verify: async () => principal });
      const req = makeReq();

      // Act
      const err = await executeMw(mw, req);

      // Assert
      expect(err).toBeUndefined();
      expect((req as FastifyRequest & { user?: Principal }).user).toBe(principal);
    }, 1000);

    it('should throw UnauthorizedException when the verifier throws', async () => {
      // Arrange
      const mw = requireAuth({
        scheme: 'bearerAuth',
        verify: () => { throw new Error('bad token'); },
      });

      // Act
      const err = await executeMw(mw, makeReq());

      // Assert
      expect(err).toBeInstanceOf(UnauthorizedException);
    }, 1000);

    it('should fall back to the verifier registered in defineConfig', async () => {
      // Arrange
      const principal: Principal = { id: 'u-2' };
      config.init({ openapi: { auth: { bearerAuth: async () => principal } } });
      const mw = requireAuth('bearerAuth');
      const req = makeReq();

      // Act
      const err = await executeMw(mw, req);

      // Assert
      expect(err).toBeUndefined();
      expect((req as FastifyRequest & { user?: Principal }).user).toBe(principal);
    }, 1000);

    it('should annotate the middleware with kind=auth and a security requirement', () => {
      // Arrange / Act
      const mw = requireAuth({ scheme: 'bearerAuth', verify: () => ({ id: 'x' }) });
      const meta = readOpenApiMeta(mw)!;

      // Assert
      expect(meta.kind).toBe('auth');
      expect(meta.security).toEqual({ bearerAuth: [] });
      expect(meta.errorStatuses).toEqual([{ status: 401, description: 'Authentication required or invalid.' }]);
    }, 1000);
  });

  describe('requireRoles / authorize', () => {
    it('should pass when the user holds the required roles', async () => {
      // Arrange
      const mw = requireRoles('admin');
      const req = makeReq();
      (req as FastifyRequest & { user?: Principal }).user = { id: 'u', roles: ['admin'] };

      // Act
      const err = await executeMw(mw, req);

      // Assert
      expect(err).toBeUndefined();
    }, 1000);

    it('should throw ForbiddenException with required roles in metadata', async () => {
      // Arrange
      const mw = requireRoles('admin');
      const req = makeReq();
      (req as FastifyRequest & { user?: Principal }).user = { id: 'u', roles: ['viewer'] };

      // Act
      const err = await executeMw(mw, req);

      // Assert
      const error = err as ForbiddenException;
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error.metadata as { requiredRoles: string[] }).requiredRoles).toEqual(['admin']);
    }, 1000);

    it('should require both roles and scopes when authorize gets both', async () => {
      // Arrange
      const mw = authorize({ roles: ['admin'], scopes: ['users:write'] });
      const req = makeReq();
      (req as FastifyRequest & { user?: Principal }).user = { id: 'u', roles: ['admin'] }; // no scopes

      // Act
      const err = await executeMw(mw, req);

      // Assert
      expect(err).toBeInstanceOf(ForbiddenException);
    }, 1000);

    it('should throw Unauthorized when no principal is attached', async () => {
      // Arrange
      const mw = requireRoles('admin');

      // Act
      const err = await executeMw(mw, makeReq());

      // Assert
      expect(err).toBeInstanceOf(UnauthorizedException);
    }, 1000);

    it('should annotate with kind=roles and an auto-403', () => {
      // Arrange / Act
      const meta = readOpenApiMeta(requireRoles('admin'))!;

      // Assert
      expect(meta.kind).toBe('roles');
      expect(meta.errorStatuses?.[0]).toMatchObject({ status: 403 });
    }, 1000);
  });
});

