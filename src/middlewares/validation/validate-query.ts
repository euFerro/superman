import { buildValidatorMiddleware, type ValidateMiddlewareOptions } from './validate-builder';
import type { SchemaInput, Infer } from '../../schema/builder';
import type { TypedHandler } from '../typed-handler';

/**
 * Validates `req.query` against an object JSON Schema. Each top-level
 * property is documented as a `parameters[in: 'query']` entry, with
 * properties listed in `required[]` marked required.
 *
 * Strings are coerced to integers/numbers/booleans/null when the schema
 * expects those types (query string values arrive as strings).
 *
 * Throws `BadRequestException` with `metadata.errors` on failure;
 * auto-injects a `400` response into the operation's spec. Pass
 * `{ message }` to override the default exception message.
 */
export const validateQuery = <S extends SchemaInput>(
  schema: S,
  options: ValidateMiddlewareOptions = {},
): TypedHandler<'query', Infer<S>> =>
  buildValidatorMiddleware({
    kind: 'query', schema, coerce: true, message: options.message,
  }) as TypedHandler<'query', Infer<S>>;
