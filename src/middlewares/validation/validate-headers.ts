import { buildValidatorMiddleware, type ValidateMiddlewareOptions } from './validate-builder';
import type { SchemaInput, Infer } from '../../schema/builder';
import type { TypedHandler } from '../typed-handler';

/**
 * Validates `req.headers` against an object JSON Schema. Each top-level
 * property is documented as a `parameters[in: 'header']` entry.
 *
 * Note: OpenAPI 3.1 forbids declaring `Authorization`, `Accept`, and
 * `Content-Type` under `parameters` — those are modeled via `security` and
 * `requestBody.content` respectively. The builder filters them out of the
 * generated spec (with a warning).
 *
 * Strings are coerced to integers/numbers/booleans/null per the schema.
 * Throws `BadRequestException` with `metadata.errors` on failure;
 * auto-injects a `400` response. Pass `{ message }` to override the
 * default exception message.
 */
export const validateHeaders = <S extends SchemaInput>(
  schema: S,
  options: ValidateMiddlewareOptions = {},
): TypedHandler<'headers', Infer<S>> =>
  buildValidatorMiddleware({
    kind: 'headers', schema, coerce: true, message: options.message,
  }) as TypedHandler<'headers', Infer<S>>;