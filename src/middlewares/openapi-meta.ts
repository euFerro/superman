/**
 * Mechanism that lets framework middlewares attach OpenAPI documentation
 * metadata to themselves. SupermanController walks its `middlewares` array,
 * reads each annotation, and synthesizes the OpenAPI inputs (request body,
 * parameters, security requirement, auto-error responses) the spec builder
 * already consumes.
 *
 * User-defined Express middlewares without an attached annotation are
 * ignored by the doc layer (they still run at request time).
 */

import type { RequestHandler } from 'express';
import type {
  JsonSchema,
  SecurityRequirement,
  MediaTypeDefinition,
} from '../core/superman-controller';

export type OpenApiMiddlewareKind =
  | 'body'
  | 'query'
  | 'headers'
  | 'cookies'
  | 'path'
  | 'content-type'
  | 'auth'
  | 'roles';

export interface AutoErrorResponse {
  status: number;
  description: string;
  metadataSchema?: JsonSchema;
}

export interface OpenApiMiddlewareMeta {
  kind: OpenApiMiddlewareKind;
  /** Body / query / headers / cookies / path JSON Schema. */
  schema?: JsonSchema;
  /** Multi-media-type body map; overrides `schema` when present. */
  bodyContent?: Record<string, MediaTypeDefinition>;
  /** Allowed media types for `validateContentType`. */
  mediaTypes?: string[];
  /** Security requirement contributed by this middleware (auth/roles). */
  security?: SecurityRequirement;
  /** Statuses this middleware can throw; injected into the operation's responses. */
  errorStatuses?: ReadonlyArray<AutoErrorResponse>;
}

const OPENAPI_META = Symbol.for('superman/back/openapi-middleware-meta');

interface AnnotatedHandler {
  [OPENAPI_META]?: OpenApiMiddlewareMeta;
}

export const attachOpenApiMeta = <H extends RequestHandler>(
  handler: H,
  meta: OpenApiMiddlewareMeta,
): H => {
  (handler as unknown as AnnotatedHandler)[OPENAPI_META] = meta;
  return handler;
};

export const readOpenApiMeta = (handler: RequestHandler): OpenApiMiddlewareMeta | undefined =>
  (handler as unknown as AnnotatedHandler)[OPENAPI_META];

