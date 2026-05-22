import type { Request, Response, RequestHandler, NextFunction } from 'express';
import { TooManyRequestsException } from '../exceptions/http.exception';
import { ControllerThrottler } from '../throttle/controller-throttler';
import { THROTTLE_CONFIG } from '../throttle/throttle.constants';
import type { ThrottleConfig, ThrottlePreset } from '../throttle/throttle.constants';
import { readOpenApiMeta, type OpenApiMiddlewareMeta } from '../middlewares/openapi-meta';
import { isReply, type Reply } from './reply';

export type RouteHandler = (req: Request, res: Response) => Promise<void> | void;

/**
 * Permissive structural type for a JSON Schema 2020-12 object. The framework
 * intentionally does not ship a Zod/JSON-Schema dependency - callers convert
 * their schemas (e.g. `z.toJSONSchema(MySchema)`) and pass the result here.
 */
export type JsonSchema = Record<string, unknown>;

/**
 * Structural shape matching a schema-builder instance (`Schema<T>` from
 * `src/schema/builder.ts`). Defined locally to avoid a circular import -
 * any object that exposes a `toJsonSchema()` method is accepted.
 */
export interface SchemaLike {
  toJsonSchema(): JsonSchema;
}

/** Either a plain JSON Schema fragment or a builder instance. */
export type SchemaInput = JsonSchema | SchemaLike;

export interface MediaTypeExample {
  value: unknown;
  summary?: string;
  description?: string;
}

export interface MediaTypeDefinition {
  schema: SchemaInput;
  /** Single example. Lifted from `schema.example` if omitted. */
  example?: unknown;
  /** Named examples map. Lifted from `schema.examples` if omitted. */
  examples?: Record<string, MediaTypeExample>;
}

/**
 * Body definition. Use either the single-schema shorthand (`schema` +
 * optional `contentType`) for the common JSON-only case, or the `content`
 * map to advertise multiple media types (e.g. JSON + XML, JSON + multipart).
 * When both are supplied, `content` wins.
 */
export interface RequestBodyDefinition {
  schema?: SchemaInput;
  /** Defaults to 'application/json'. Only used with the `schema` shorthand. */
  contentType?: string;
  /** Multi-media-type map. Keys are media-type strings (e.g. 'application/xml'). */
  content?: Record<string, MediaTypeDefinition>;
  /** Optional override; falls back to the schema's `description`. */
  description?: string;
  /** Defaults to true. */
  required?: boolean;
}

/** Alias to make `user.schemas.ts` style files read fluently. */
export type RequestBodySchema = RequestBodyDefinition;

/**
 * Object JSON Schema where each top-level property becomes one parameter
 * (`in: 'query'`, `in: 'header'`, or `in: 'cookie'` respectively). Required
 * parameters are listed in the schema's `required[]` array. Per-property
 * `description`, `deprecated`, `example`, and `examples` flow through to
 * the generated parameter.
 */
export type QuerySchema = JsonSchema;
export type RequestHeadersSchema = JsonSchema;
export type CookiesSchema = JsonSchema;

export interface RequestDefinition {
  body?: RequestBodyDefinition;
  query?: QuerySchema;
  headers?: RequestHeadersSchema;
  cookies?: CookiesSchema;
}

export interface ResponseHeaderDefinition {
  schema: SchemaInput;
  description?: string;
  required?: boolean;
  deprecated?: boolean;
}

/** Map of header name â†’ header definition. Keys are emitted verbatim. */
export type ResponseHeadersSchema = Record<string, ResponseHeaderDefinition>;

export interface ResponseDefinition {
  schema?: SchemaInput;
  contentType?: string;
  content?: Record<string, MediaTypeDefinition>;
  /** Optional override; falls back to the schema's `description` then `HTTP <code>`. */
  description?: string;
  /** Response headers documented on this status code. */
  headers?: ResponseHeadersSchema;
}

export type ResponseBodySchema = ResponseDefinition;

export interface ErrorResponseDefinition {
  /** HTTP status code this route may emit (e.g. 422). */
  status: number;
  description: string;
  /** JSON Schema for the `metadata` field inside the framework error envelope. */
  metadataSchema?: JsonSchema;
}

/**
 * OpenAPI Security Scheme object - passthrough. Examples:
 *   { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
 *   { type: 'apiKey', in: 'header', name: 'X-API-Key' }
 */
export type SecuritySchemeDefinition = Record<string, unknown>;

/**
 * OpenAPI Security Requirement - `Array<Record<schemeName, scopes[]>>`.
 * Empty scope array means "any scope is acceptable" (typical for bearer/apiKey).
 */
export type SecurityRequirement = Record<string, ReadonlyArray<string>>;

export interface ControllerOptions {
  /** Rate-limit preset name or custom config. Defaults to 'STANDARD'. */
  throttleConfig?: ThrottlePreset | ThrottleConfig;
  /**
   * Express middlewares to run after rate limiting and before the handler.
   * Framework-provided middlewares (`validateBody`, `validateQuery`,
   * `requireAuth`, `requireRoles`, â€¦) self-document - their schemas and
   * thrown statuses are surfaced in the auto-generated OpenAPI spec
   * automatically. User-defined middlewares run normally but don't appear
   * in the spec.
   */
  middlewares?: ReadonlyArray<RequestHandler>;
  /** Response definitions by status code (success/non-framework responses). */
  responses?: Record<number, ResponseDefinition>;
  /** Framework-envelope errors this route may emit beyond auto-injected ones. */
  errors?: ReadonlyArray<ErrorResponseDefinition>;
  /** Stable identifier used by codegen tools (`operation.operationId`). */
  operationId?: string;
  /** Marks the operation as deprecated in the generated spec. */
  deprecated?: boolean;
  /** Short summary; overrides route.description as the OpenAPI `summary`. */
  summary?: string;
  /** Per-operation security requirement; overrides config-level default. */
  security?: ReadonlyArray<SecurityRequirement>;
}

export interface ControllerMetadata {
  throttlePreset: string | null;
  throttleConfig: ThrottleConfig;
  request?: RequestDefinition;
  responses?: Record<number, ResponseDefinition>;
  errors?: ReadonlyArray<ErrorResponseDefinition>;
  operationId?: string;
  deprecated?: boolean;
  summary?: string;
  security?: ReadonlyArray<SecurityRequirement>;
}

interface SynthResult {
  request?: RequestDefinition;
  security?: ReadonlyArray<SecurityRequirement>;
  errors?: ReadonlyArray<ErrorResponseDefinition>;
}

/**
 * Walks the middleware chain, reads any attached OpenAPI annotations, and
 * builds the equivalent declarative metadata the spec builder consumes.
 *
 * Conventions:
 *   - Last writer wins per slot (body/query/headers/cookies/path).
 *   - Auth schemes accumulate; role-scoped `authorize` middleware merges
 *     its scopes onto the closest preceding auth scheme.
 *   - Each middleware's `errorStatuses[]` becomes an auto-error response,
 *     deduplicated by status code (first wins).
 */
const synthesiseFromMiddlewares = (middlewares: ReadonlyArray<RequestHandler>): SynthResult => {
  let body: RequestBodyDefinition | undefined;
  let query: JsonSchema | undefined;
  let headers: JsonSchema | undefined;
  let cookies: JsonSchema | undefined;
  let path: JsonSchema | undefined;

  const authSchemes: string[] = [];                              // order preserved
  const schemeScopes = new Map<string, Set<string>>();           // scheme name â†’ scope set
  const errorByStatus = new Map<number, ErrorResponseDefinition>();
  const contentTypeMediaTypes: string[] = [];

  for (const mw of middlewares) {
    const ann: OpenApiMiddlewareMeta | undefined = readOpenApiMeta(mw);
    if (!ann) continue;

    if (ann.errorStatuses) {
      for (const err of ann.errorStatuses) {
        if (!errorByStatus.has(err.status)) {
          errorByStatus.set(err.status, {
            status: err.status,
            description: err.description,
            metadataSchema: err.metadataSchema,
          });
        }
      }
    }

    switch (ann.kind) {
      case 'body':
        body = ann.bodyContent
          ? { content: ann.bodyContent }
          : { schema: ann.schema };
        break;
      case 'query':   if (ann.schema) query   = ann.schema; break;
      case 'headers': if (ann.schema) headers = ann.schema; break;
      case 'cookies': if (ann.schema) cookies = ann.schema; break;
      case 'path':    if (ann.schema) path    = ann.schema; break;
      case 'content-type':
        if (ann.mediaTypes) contentTypeMediaTypes.push(...ann.mediaTypes);
        break;
      case 'auth':
        if (ann.security) {
          for (const scheme of Object.keys(ann.security)) {
            if (!schemeScopes.has(scheme)) {
              authSchemes.push(scheme);
              schemeScopes.set(scheme, new Set<string>());
            }
          }
        }
        break;
      case 'roles': {
        // The `roles` middleware itself doesn't declare a security scheme;
        // its scopes (if any) get merged onto the nearest preceding auth scheme.
        const scopesProp = (ann.schema?.properties as { scopes?: { default?: string[] } } | undefined)?.scopes;
        const scopes = scopesProp?.default ?? [];
        if (scopes.length > 0 && authSchemes.length > 0) {
          const lastScheme = authSchemes[authSchemes.length - 1];
          const set = schemeScopes.get(lastScheme)!;
          for (const s of scopes) set.add(s);
        }
        break;
      }
    }
  }

  // If validateContentType was used, fold its media types into the body content
  // (each gets the body schema). Skip when the user already supplied a multi-content body.
  if (body && contentTypeMediaTypes.length > 0 && !body.content && body.schema) {
    const content: Record<string, { schema: SchemaInput }> = {};
    for (const mt of contentTypeMediaTypes) content[mt] = { schema: body.schema };
    body = { content };
  }

  let request: RequestDefinition | undefined;
  if (body || query || headers || cookies || path) {
    request = {};
    if (body)    request.body    = body;
    if (query)   request.query   = query;
    if (headers) request.headers = headers;
    if (cookies) request.cookies = cookies;
  }

  const security: ReadonlyArray<SecurityRequirement> | undefined = authSchemes.length > 0
    ? authSchemes.map((scheme) => ({ [scheme]: [...schemeScopes.get(scheme)!] }))
    : undefined;

  const errors: ReadonlyArray<ErrorResponseDefinition> | undefined = errorByStatus.size > 0
    ? [...errorByStatus.values()]
    : undefined;

  return { request, security, errors };
};

const mergeErrors = (
  fromMiddlewares: ReadonlyArray<ErrorResponseDefinition> | undefined,
  fromController: ReadonlyArray<ErrorResponseDefinition> | undefined,
): ReadonlyArray<ErrorResponseDefinition> | undefined => {
  if (!fromMiddlewares && !fromController) return undefined;
  const out = new Map<number, ErrorResponseDefinition>();
  for (const e of fromMiddlewares ?? []) out.set(e.status, e);
  for (const e of fromController ?? []) out.set(e.status, e);   // user override wins
  return [...out.values()];
};

/**
 * Runs a single Express middleware as a promise.
 * Returns true if next() was called (continue chain), false otherwise (response sent).
 */
function runMiddleware(mw: RequestHandler, req: Request, res: Response): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    let settled = false;

    const next: NextFunction = (err?: unknown) => {
      if (settled) return;
      settled = true;
      if (err) return reject(err instanceof Error ? err : new Error(String(err)));
      resolve(true);
    };

    try {
      const result = mw(req, res, next);
      if (result instanceof Promise) {
        result.then(() => {
          if (settled) return;
          settled = true;
          resolve(false);
        }).catch(reject);
        return;
      }
    } catch (error) {
      reject(error);
      return;
    }

    if (!settled) {
      settled = true;
      resolve(false);
    }
  });
}

/**
 * Either a legacy `(req, res, service?)` express handler, or a context
 * handler `(ctx) => unknown` that lets the framework write the response.
 * Distinguished at runtime by `Function.length`.
 */
type AnyHandler = (...args: unknown[]) => Promise<unknown> | unknown;

const pickSuccessStatus = (responses: Record<number, ResponseDefinition> | undefined): number => {
  if (!responses) return 200;
  const twoXx = Object.keys(responses)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 200 && n < 300);
  if (twoXx.length === 1) return twoXx[0];
  return 200;                                       // 0 or 2+ keys â†’ default 200
};

/**
 * Structural keys the context always exposes - these are never overwritten
 * by a flattened source even if a body/params/query/etc. schema has a
 * field with the same name.
 */
const RESERVED_CONTEXT_KEYS: ReadonlySet<string> = new Set([
  'req', 'res', 'service',
  'body', 'query', 'params', 'headers', 'cookies', 'user',
]);

const buildContext = (req: Request, res: Response, service: unknown): Record<string, unknown> => {
  const ctx: Record<string, unknown> = {
    req,
    res,
    service,
    body:    req.body,
    query:   req.query,
    params:  req.params,
    headers: req.headers,
    cookies: (req as Request & { cookies?: unknown }).cookies,
    user:    (req as Request & { user?: unknown }).user,
  };

  // Spread leaf properties at the root in precedence order - later writes
  // win, so params shadows body, body shadows query, etc. Reserved
  // structural keys are never overwritten.
  const sources: unknown[] = [ctx.cookies, ctx.headers, ctx.query, ctx.body, ctx.params];
  for (const src of sources) {
    if (src && typeof src === 'object') {
      for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
        if (!RESERVED_CONTEXT_KEYS.has(k)) ctx[k] = v;
      }
    }
  }

  return ctx;
};

const writeReply = (res: Response, value: Reply<unknown> | unknown, fallbackStatus: number): void => {
  if (res.headersSent) return;
  if (value === undefined) return;

  if (isReply(value)) {
    const { data, options } = value;
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) res.setHeader(k, v);
    }
    const status = options.status ?? fallbackStatus;
    res.status(status);
    if (options.mediaType) {
      res.type(options.mediaType).send(data as string | Buffer);
    } else {
      res.json(data);
    }
    return;
  }

  res.status(fallbackStatus).json(value);
};

export class SupermanController {
  private readonly handleFn: AnyHandler;
  private readonly service: unknown;
  private readonly throttleConfig: ThrottlePreset | ThrottleConfig;
  private readonly middlewares: ReadonlyArray<RequestHandler>;
  private readonly _responses?: Record<number, ResponseDefinition>;
  private readonly _errors?: ReadonlyArray<ErrorResponseDefinition>;
  private readonly _operationId?: string;
  private readonly _deprecated?: boolean;
  private readonly _summary?: string;
  private readonly _security?: ReadonlyArray<SecurityRequirement>;
  private _throttler?: ControllerThrottler;

  constructor(handler: AnyHandler, serviceOrOptions?: unknown, maybeOptions?: ControllerOptions) {
    // Two call forms are supported:
    //   new SupermanController(handler, options)                  â† legacy direct usage
    //   new SupermanController(handler, service, options)         â† defineController
    // Detect which by inspecting the second arg: if it looks like a
    // ControllerOptions object (has a known key), treat it as options; else
    // treat it as a service value.
    const looksLikeOptions = (v: unknown): v is ControllerOptions => {
      if (typeof v !== 'object' || v === null) return false;
      const keys = [
        'throttleConfig', 'middlewares', 'responses', 'errors',
        'operationId', 'deprecated', 'summary', 'security',
      ];
      return keys.some((k) => k in (v as Record<string, unknown>));
    };

    this.handleFn = handler;
    const secondIsOptions = looksLikeOptions(serviceOrOptions);
    this.service = secondIsOptions ? undefined : serviceOrOptions;
    const options = (secondIsOptions ? serviceOrOptions : maybeOptions) as ControllerOptions | undefined;

    this.throttleConfig = options?.throttleConfig ?? 'STANDARD';
    this.middlewares = options?.middlewares ?? [];
    this._responses = options?.responses;
    this._errors = options?.errors;
    this._operationId = options?.operationId;
    this._deprecated = options?.deprecated;
    this._summary = options?.summary;
    this._security = options?.security;
  }

  /** Exposes throttle config + middleware-synthesized OpenAPI metadata for spec generation. */
  get metadata(): ControllerMetadata {
    const isPreset = typeof this.throttleConfig === 'string';
    const resolved = isPreset
      ? THROTTLE_CONFIG[this.throttleConfig as ThrottlePreset]
      : this.throttleConfig;
    const meta: ControllerMetadata = {
      throttlePreset: isPreset ? (this.throttleConfig as string) : null,
      throttleConfig: resolved,
    };

    const synth = synthesiseFromMiddlewares(this.middlewares);
    if (synth.request) meta.request = synth.request;

    const mergedErrors = mergeErrors(synth.errors, this._errors);
    if (mergedErrors) meta.errors = mergedErrors;

    const mergedSecurity = this._security ?? synth.security;
    if (mergedSecurity && mergedSecurity.length > 0) meta.security = mergedSecurity;

    if (this._responses) meta.responses = this._responses;
    if (this._operationId !== undefined) meta.operationId = this._operationId;
    if (this._deprecated !== undefined) meta.deprecated = this._deprecated;
    if (this._summary !== undefined) meta.summary = this._summary;
    return meta;
  }

  private get throttler(): ControllerThrottler {
    if (!this._throttler) {
      const config = typeof this.throttleConfig === 'string'
        ? THROTTLE_CONFIG[this.throttleConfig]
        : this.throttleConfig;
      this._throttler = new ControllerThrottler(config);
    }
    return this._throttler;
  }

  /** Bound handler with rate limiting and middleware chain, ready for Express router */
  get handler(): RouteHandler {
    return async (req: Request, res: Response) => {
      const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';

      if (!this.throttler.check(ip)) {
        res.setHeader('Retry-After', String(this.throttler.retryAfter(ip)));
        throw new TooManyRequestsException();
      }

      res.setHeader('X-RateLimit-Remaining', String(this.throttler.remaining(ip)));

      for (const mw of this.middlewares) {
        const shouldContinue = await runMiddleware(mw, req, res);
        if (!shouldContinue) return;
      }

      // Arity sniff: 3 â†’ legacy (req, res, service); â‰¤2 â†’ context handler.
      if (this.handleFn.length >= 3) {
        await (this.handleFn as (req: Request, res: Response, service: unknown) => Promise<void> | void)(
          req, res, this.service,
        );
        return;
      }

      // Heuristic: a handler with arity 2 *might* still be legacy
      // `(req, res) => { res.json(...) }`. Detect by name of the first
      // declared parameter? Not reliable. Instead: if the handler returns a
      // value (or `reply()`), we write it; if it returned undefined and
      // didn't touch `res`, that's a programmer error caught elsewhere.
      // Arity-2 functions that wrote to `res` themselves are handled by
      // the `res.headersSent` guard in `writeReply`.
      if (this.handleFn.length <= 1) {
        const result = await (this.handleFn as (ctx: ReturnType<typeof buildContext>) => Promise<unknown> | unknown)(
          buildContext(req, res, this.service),
        );
        writeReply(res, result, pickSuccessStatus(this._responses));
        return;
      }

      // Arity 2 â†’ legacy `(req, res)` form (used by internal tests / direct
      // SupermanController instantiation without a service).
      await (this.handleFn as (req: Request, res: Response) => Promise<void> | void)(req, res);
    };
  }
}

