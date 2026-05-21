import { buildValidatorMiddleware, type ValidateMiddlewareOptions } from './validate-builder';
import type { SchemaInput, Infer } from '../../schema/builder';
import type { TypedHandler } from '../typed-handler';

/**
 * Validates `req.params` against an object JSON Schema, refining the
 * default `{ type: 'string' }` schemas the framework auto-emits for
 * Express path params (e.g. `:id`).
 *
 * Each top-level property in the schema corresponds to a path placeholder
 * in the route pattern. Strings are coerced to typed values.
 *
 * Throws `BadRequestException` with `metadata.errors` on failure;
 * auto-injects a `400` response. Pass `{ message }` to override the
 * default exception message.
 */
export const validatePathParams = <S extends SchemaInput>(
  schema: S,
  options: ValidateMiddlewareOptions = {},
): TypedHandler<'params', Infer<S>> =>
  buildValidatorMiddleware({
    kind: 'path', schema, coerce: true, message: options.message,
  }) as TypedHandler<'params', Infer<S>>;