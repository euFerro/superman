import type { FastifyRequest } from 'fastify';
import type { FastifyMiddleware } from '../typed-handler';
import { ForbiddenException, UnauthorizedException } from '../../exceptions/http.exception';
import type { Principal } from '../../config/superman-config';
import { attachOpenApiMeta } from '../openapi-meta';
import type { JsonSchema } from '../../core/superman-controller';

const FORBIDDEN_METADATA_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    requiredRoles:  { type: 'array', items: { type: 'string' }, description: 'Roles the route requires.' },
    requiredScopes: { type: 'array', items: { type: 'string' }, description: 'Scopes the route requires.' },
  },
};

const AUTO_403 = {
  status: 403,
  description: 'Insufficient permissions.',
  metadataSchema: FORBIDDEN_METADATA_SCHEMA,
} as const;

export interface AuthorizeOptions {
  roles?: ReadonlyArray<string>;
  scopes?: ReadonlyArray<string>;
}

const hasAll = (held: ReadonlyArray<string> | undefined, required: ReadonlyArray<string>): boolean => {
  if (required.length === 0) return true;
  if (!held) return false;
  const set = new Set(held);
  return required.every((r) => set.has(r));
};

const buildHandler = ({ roles = [], scopes = [] }: AuthorizeOptions): FastifyMiddleware => async (req, _res) => {
  const user = (req as FastifyRequest & { user?: Principal }).user;
  if (!user) {
    throw new UnauthorizedException('Authentication required before authorization.');
  }
  const okRoles = hasAll(user.roles, roles);
  const okScopes = hasAll(user.scopes, scopes);
  if (!okRoles || !okScopes) {
    throw new ForbiddenException('Insufficient permissions.', {
      requiredRoles: [...roles],
      requiredScopes: [...scopes],
    });
  }
};

/**
 * Generic authorization guard. Reads `req.user` (populated by an earlier
 * `requireAuth(...)` middleware) and checks the principal's `roles` /
 * `scopes` against the required sets.
 *
 * On mismatch throws `ForbiddenException` with
 * `metadata: { requiredRoles, requiredScopes }`. Auto-injects a `403`
 * response on the operation. Scopes are exposed in the operation's
 * `security` requirement by the spec builder (merged onto the closest
 * `requireAuth` scheme).
 */
export const authorize = (options: AuthorizeOptions): FastifyMiddleware => {
  const handler = buildHandler(options);
  return attachOpenApiMeta(handler, {
    kind: 'roles',
    security: undefined,
    errorStatuses: [AUTO_403],
    // Pass roles/scopes through schema property so the builder can read
    // them; we reuse the `schema` slot as a structural carrier.
    schema: {
      type: 'object',
      properties: {
        roles:  { type: 'array', items: { type: 'string' }, default: [...(options.roles ?? [])] },
        scopes: { type: 'array', items: { type: 'string' }, default: [...(options.scopes ?? [])] },
      },
    },
  });
};

/** Convenience wrapper: `requireRoles('admin', 'editor')`. */
export const requireRoles = (...roles: string[]): FastifyMiddleware => authorize({ roles });

