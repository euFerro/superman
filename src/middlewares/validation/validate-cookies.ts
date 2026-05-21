import { buildValidatorMiddleware, type ValidateMiddlewareOptions } from './validate-builder';
import type { SchemaInput, Infer } from '../../schema/builder';
import type { TypedHandler } from '../typed-handler';

/**
 * Validates `req.cookies` against an object JSON Schema. Each top-level
 * property is documented as a `parameters[in: 'cookie']` entry. Strings are
 * coerced to typed values where the schema expects them.
 *
 * Requires a cookie parser to populate `req.cookies` upstream (e.g. the
 * `cookie-parser` Express middleware mounted globally).
 *
 * Throws `BadRequestException` with `metadata.errors` on failure;
 * auto-injects a `400` response. Pass `{ message }` to override the
 * default exception message.
 */
export const validateCookies = <S extends SchemaInput>(
  schema: S,
  options: ValidateMiddlewareOptions = {},
): TypedHandler<'cookies', Infer<S>> =>
  buildValidatorMiddleware({
    kind: 'cookies', schema, coerce: true, message: options.message,
  }) as TypedHandler<'cookies', Infer<S>>;