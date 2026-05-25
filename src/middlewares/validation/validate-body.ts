import type { FastifyRequest } from 'fastify';
import { BadRequestException } from '../../exceptions/http.exception';
import { config } from '../../config/superman-config';
import {
  validateJsonSchema,
  type ValidationResult,
  type ValidateOptions,
} from '../../validation/json-schema-validator';
import type { JsonSchema, MediaTypeDefinition } from '../../core/superman-controller';
import { attachOpenApiMeta } from '../openapi-meta';
import { VALIDATION_ERROR_METADATA_SCHEMA } from './validation-error-schema';
import { Schema, toJsonSchemaInput, type SchemaInput, type Infer } from '../../schema/builder';
import type { TypedHandler, FastifyMiddleware } from '../typed-handler';
import type { ValidateMiddlewareOptions } from './validate-builder';

const AUTO_400 = {
  status: 400,
  description: 'Request validation failed.',
  metadataSchema: VALIDATION_ERROR_METADATA_SCHEMA,
} as const;

const runValidator = (value: unknown, schema: JsonSchema, options: ValidateOptions): ValidationResult => {
  const custom = config.isInitialized() ? config.schemaValidator : undefined;
  if (custom) {
    const result = custom(value, schema, options);
    return { valid: result.valid, value: result.value, errors: [...result.errors] };
  }
  return validateJsonSchema(value, schema, options);
};

const stripParams = (contentTypeHeader: string | undefined): string =>
  (contentTypeHeader ?? 'application/json').split(';')[0].trim().toLowerCase();

const isSingleSchema = (input: SchemaInput | Record<string, SchemaInput>): input is SchemaInput => {
  if (input instanceof Schema) return true;
  const obj = input as Record<string, unknown>;
  return 'type' in obj || 'properties' in obj || 'oneOf' in obj
      || 'anyOf' in obj || 'allOf' in obj || 'enum' in obj || 'const' in obj;
};

const pickSchemaForRequest = (
  req: FastifyRequest,
  schemaOrMap: SchemaInput | Record<string, SchemaInput>,
): JsonSchema | null => {
  if (isSingleSchema(schemaOrMap)) return toJsonSchemaInput(schemaOrMap);
  const map = schemaOrMap as Record<string, SchemaInput>;
  const ct = stripParams(req.headers['content-type'] as string | undefined);
  const hit = map[ct];
  return hit ? toJsonSchemaInput(hit) : null;
};

const buildBodyContent = (
  schemaOrMap: SchemaInput | Record<string, SchemaInput>,
): { schema?: JsonSchema; bodyContent?: Record<string, MediaTypeDefinition> } => {
  if (isSingleSchema(schemaOrMap)) return { schema: toJsonSchemaInput(schemaOrMap) };
  const map = schemaOrMap as Record<string, SchemaInput>;
  const content: Record<string, MediaTypeDefinition> = {};
  for (const [mediaType, schema] of Object.entries(map)) {
    content[mediaType] = { schema: toJsonSchemaInput(schema) };
  }
  return { bodyContent: content };
};

/**
 * Validates `req.body` against a JSON Schema (or a media-type â†’ schema map).
 *
 * - Throws `BadRequestException` with `metadata: { errors }` on failure.
 * - Contributes the schema to `requestBody` in the OpenAPI document.
 * - Auto-injects a `400` response on the operation.
 *
 * Examples:
 *   validateBody(CreateUserSchema)
 *   validateBody({ 'application/json': JsonSchema, 'application/xml': XmlSchema })
 */
type InferMap<M> = M extends Record<string, infer V> ? Infer<V> : unknown;

export function validateBody<S extends SchemaInput>(
  schema: S,
  options?: ValidateMiddlewareOptions,
): TypedHandler<'body', Infer<S>>;
export function validateBody<M extends Record<string, SchemaInput>>(
  map: M,
  options?: ValidateMiddlewareOptions,
): TypedHandler<'body', InferMap<M>>;
export function validateBody(
  schemaOrMap: SchemaInput | Record<string, SchemaInput>,
  options: ValidateMiddlewareOptions = {},
): FastifyMiddleware {
  const message = options.message ?? 'Request body validation failed.';
  const handler: FastifyMiddleware = async (req, _res) => {
    const schema = pickSchemaForRequest(req, schemaOrMap);
    if (!schema) {
      throw new BadRequestException(options.message ?? 'Unsupported request body for this Content-Type.');
    }
    const result = runValidator(req.body, schema, { coerce: false });
    if (!result.valid) {
      throw new BadRequestException(message, { errors: result.errors });
    }
    req.body = result.value;
  };

  const meta = buildBodyContent(schemaOrMap);
  return attachOpenApiMeta(handler, {
    kind: 'body',
    schema: meta.schema,
    bodyContent: meta.bodyContent,
    errorStatuses: [AUTO_400],
  });
}

