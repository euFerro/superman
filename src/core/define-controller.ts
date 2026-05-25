import { SupermanController } from './superman-controller';
import type { ResponseDefinition, ErrorResponseDefinition, SecurityRequirement } from './superman-controller';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ThrottlePreset, ThrottleConfig } from '../throttle/throttle.constants';
import type { HandlerContextOf, FastifyMiddleware } from '../middlewares/typed-handler';

/**
 * Legacy positional handler: `(req, res, service) => void`. Returning a
 * value is ignored - the handler is expected to call `res.json(...)` (or
 * similar) itself. Kept for back-compat; arity detection in `SupermanController`
 * routes legacy handlers through unchanged.
 */
export type LegacyHandler<TService> = (
  req: FastifyRequest,
  res: FastifyReply,
  service: TService,
) => Promise<void> | void;

/**
 * Object-argument typed handler. The context type is derived from the
 * `middlewares` tuple - each `validate*` / `requireAuth` middleware brands
 * its slot, and `HandlerContextOf<MWs>` assembles them into a single
 * `{ body, query, params, headers, cookies, user }` object.
 *
 * Returning a value writes the response body automatically. Return
 * `undefined` (or write to `ctx.res` directly) to stream / take full
 * control.
 */
export interface HandlerContextBase<TService> {
  req:     FastifyRequest;
  res:     FastifyReply;
  service: TService;
  body:    unknown;
  query:   unknown;
  params:  unknown;
  headers: unknown;
  cookies: unknown;
  user:    unknown;
}

export type HandlerContext<TService, Ctx> = Omit<HandlerContextBase<TService>, keyof Ctx> & Ctx;

export type ContextHandler<TService, Ctx> = (
  ctx: HandlerContext<TService, Ctx>,
) => Promise<unknown> | unknown;

/**
 * Either form is accepted. The framework detects which the user passed by
 * checking the function's declared `length` (legacy: 3, context: 0 or 1).
 */
export type ServiceRouteHandler<TService, Ctx = Record<never, never>> =
  | ContextHandler<TService, Ctx>
  | LegacyHandler<TService>;

export type ControllerFactory<TService> = (service: TService) => SupermanController;

export interface DefineControllerOptions<
  TService,
  MWs extends ReadonlyArray<FastifyMiddleware> = ReadonlyArray<FastifyMiddleware>,
> {
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  // MWs flows in via the `middlewares` field; it drives the handler's
  // context type via `HandlerContextOf<MWs>`.
  handler: ServiceRouteHandler<TService, HandlerContextOf<MWs>>;
  /** Rate-limit preset name or custom config. Defaults to 'STANDARD'. */
  throttleConfig?: ThrottlePreset | ThrottleConfig;
  /** Express middlewares to run after rate limiting and before the handler. */
  middlewares?: MWs;
  /** Response definitions by status code for spec generation. */
  responses?: Record<number, ResponseDefinition>;
  /** Framework-envelope errors this route may emit beyond auto-injected ones. */
  errors?: ReadonlyArray<ErrorResponseDefinition>;
  /** Stable identifier surfaced as `operation.operationId`. */
  operationId?: string;
  /** Marks the operation as deprecated in the generated spec. */
  deprecated?: boolean;
  /** Short summary; overrides route.description as the OpenAPI `summary`. */
  summary?: string;
  /** Per-operation security requirement override. */
  security?: ReadonlyArray<SecurityRequirement>;
}

/**
 * Generic controller factory. Returns a function that, when called with
 * a service instance, produces a configured SupermanController.
 *
 * The handler can be either:
 *   - Context form: `async ({ body, query, params, user, service }) => result`
 *     The framework infers the context type from `middlewares` and writes
 *     the return value (or `reply(...)` envelope) to the response.
 *   - Legacy form: `async (req, res, service) => { res.json(...); }`
 *     Kept for back-compat. Detected by arity.
 */
export const defineController = <
  TService,
  const MWs extends ReadonlyArray<FastifyMiddleware> = ReadonlyArray<FastifyMiddleware>,
>(
  options: DefineControllerOptions<TService, MWs>,
): ControllerFactory<TService> => {
  return (service: TService) => {
    const { handler, ...controllerOptions } = options;
    return new SupermanController(
      handler as unknown as (...args: unknown[]) => Promise<unknown> | unknown,
      service,
      controllerOptions,
    );
  };
};

