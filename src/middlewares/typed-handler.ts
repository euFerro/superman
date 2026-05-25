/**
 * Type-level glue between validation/auth middlewares and the typed handler
 * context. Each `validate*` / `requireAuth` factory returns a `TypedHandler`
 * carrying a phantom slot that records which context key it populates and
 * with what type. `HandlerContextOf<MWs>` walks a middleware tuple and
 * assembles the matching `{ body, query, params, headers, cookies, user }`
 * shape, which `defineController` mixes into the handler's argument.
 *
 * The brand is purely a TypeScript witness — erased at runtime; factories
 * still return plain Express `RequestHandler`s.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

export type FastifyMiddleware = (req: FastifyRequest, res: FastifyReply) => Promise<void> | void;

declare const __brand: unique symbol;

export type ContextKey = 'body' | 'query' | 'params' | 'headers' | 'cookies' | 'user';

export type TypedHandler<K extends ContextKey, T> = FastifyMiddleware & {
  readonly [__brand]?: { kind: K; type: T };
};

type UnionToIntersection<U> =
  (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

/** Structural slot: a single `{ [kind]: type }` entry. */
type StructuralExpand<K extends ContextKey, T> = { [P in K]: T };

/**
 * Flat leaf spread. For body/query/params/headers/cookies the leaf
 * properties of the validated object schema also appear at the context
 * root (e.g. `validatePathParams(s.object({ id }))` makes both
 * `ctx.params.id` and `ctx.id` available). `user` stays structural only —
 * it's a single principal value, not an object of leaves to spread.
 */
type FlatExpand<K extends ContextKey, T> =
  K extends 'user'
    ? Record<never, never>
    : T extends object
      ? T
      : Record<never, never>;

/**
 * Walk a tuple of middlewares and produce the corresponding context object
 * type. Each branded middleware contributes both:
 *   - a `{ [kind]: T }` structural slot
 *   - the leaf properties of `T` flattened at the root (except for `user`)
 *
 * Untyped middlewares contribute nothing.
 */
export type HandlerContextOf<MWs extends ReadonlyArray<unknown>> = UnionToIntersection<
  {
    [I in keyof MWs]: MWs[I] extends TypedHandler<infer K, infer T>
      ? StructuralExpand<K, T> & FlatExpand<K, T>
      : never;
  }[number]
>;
