import type { FastifyRequest } from 'fastify';
import type { FastifyMiddleware } from '../typed-handler';
import { UnauthorizedException } from '../../exceptions/http.exception';
import { config, type AuthVerifier, type Principal } from '../../config/superman-config';
import { attachOpenApiMeta } from '../openapi-meta';
import type { TypedHandler } from '../typed-handler';

const AUTO_401 = {
  status: 401,
  description: 'Authentication required or invalid.',
} as const;

export interface RequireAuthOptions {
  /** Security-scheme name; matched against `defineConfig.openapi.securitySchemes`. */
  scheme: string;
  /** Verifier override; takes precedence over the global one registered in `defineConfig.openapi.auth`. */
  verify?: AuthVerifier;
}

const resolveVerifier = (scheme: string, override: AuthVerifier | undefined): AuthVerifier | undefined => {
  if (override) return override;
  if (!config.isInitialized()) return undefined;
  return config.openapi.auth[scheme];
};

/**
 * Guards an endpoint by running a verifier against the incoming request.
 *
 * Two call forms:
 *   requireAuth('bearerAuth')                                  // use the verifier registered in defineConfig
 *   requireAuth({ scheme: 'bearerAuth', verify: async (req) => ... })  // per-middleware override
 *
 * On success, the returned `Principal` is attached to `req.user`. On
 * failure (no verifier, thrown error, or rejected promise) the middleware
 * throws `UnauthorizedException`. The operation's spec automatically gains:
 *   - `security: [{ [scheme]: [] }]`
 *   - a `401` response referencing `FrameworkError`
 *
 * The security scheme itself must be declared in
 * `defineConfig.openapi.securitySchemes`.
 */
export const requireAuth = (schemeOrOpts: string | RequireAuthOptions): TypedHandler<'user', Principal> => {
  const opts: RequireAuthOptions = typeof schemeOrOpts === 'string'
    ? { scheme: schemeOrOpts }
    : schemeOrOpts;

  const handler: FastifyMiddleware = async (req, _res) => {
    const verify = resolveVerifier(opts.scheme, opts.verify);
    if (!verify) {
      throw new UnauthorizedException(`No verifier registered for scheme "${opts.scheme}".`);
    }
    try {
      const principal = await verify(req);
      if (!principal) {
        throw new UnauthorizedException();
      }
      (req as FastifyRequest & { user?: Principal }).user = principal;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException((error as Error)?.message || 'Unauthorized');
    }
  };

  return attachOpenApiMeta(handler, {
    kind: 'auth',
    security: { [opts.scheme]: [] },
    errorStatuses: [AUTO_401],
  }) as TypedHandler<'user', Principal>;
};

