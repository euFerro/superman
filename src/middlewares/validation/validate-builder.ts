/**
 * Internal factory that wires a JSON Schema validator into an Express
 * middleware and attaches OpenAPI documentation metadata.
 *
 * Each validate* middleware is a thin shell around this â€” they all share
 * the same error envelope (`BadRequestException` with `metadata.errors`)
 * and the same auto-injected `400` response.
 */

import type { Request, RequestHandler } from 'express';
import { BadRequestException } from '../../exceptions/http.exception';
import { config } from '../../config/superman-config';
import {
  validateJsonSchema,
  type ValidateOptions,
  type ValidationResult,
} from '../../validation/json-schema-validator';
import type { JsonSchema } from '../../core/superman-controller';
import { attachOpenApiMeta, type OpenApiMiddlewareKind } from '../openapi-meta';
import { VALIDATION_ERROR_METADATA_SCHEMA } from './validation-error-schema';
import { toJsonSchemaInput, type SchemaInput } from '../../schema/builder';

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

const extractValue = (req: Request, kind: OpenApiMiddlewareKind): unknown => {
  switch (kind) {
    case 'body':    return req.body;
    case 'query':   return req.query;
    case 'headers': return req.headers;
    case 'cookies': return (req as Request & { cookies?: unknown }).cookies;
    case 'path':    return req.params;
    default:        return undefined;
  }
};

const writeValue = (req: Request, kind: OpenApiMiddlewareKind, value: unknown): void => {
  switch (kind) {
    case 'body':
      req.body = value;
      return;
    case 'query':
      // Express's req.query is sometimes read-only via Object.defineProperty.
      // Mutate field-by-field so we don't trip the setter.
      if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          (req.query as Record<string, unknown>)[k] = v;
        }
      }
      return;
    case 'headers':
      // Headers are case-insensitive and lowercase by the time Node parses
      // them. Don't rewrite â€” coercion result is reported via the validator
      // result but the original headers stay intact for downstream code.
      return;
    case 'cookies':
      (req as Request & { cookies?: unknown }).cookies = value;
      return;
    case 'path':
      if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          (req.params as Record<string, unknown>)[k] = v;
        }
      }
      return;
  }
};

/** Options accepted by every `validate*` middleware. */
export interface ValidateMiddlewareOptions {
  /** Override the default `BadRequestException` message thrown on failure. */
  message?: string;
}

export interface BuildValidatorOptions {
  kind: OpenApiMiddlewareKind;
  schema: SchemaInput;
  coerce: boolean;
  /** Override the default `BadRequestException` message thrown on failure. */
  message?: string;
}

export const buildValidatorMiddleware = ({
  kind,
  schema,
  coerce,
  message,
}: BuildValidatorOptions): RequestHandler => {
  const jsonSchema = toJsonSchemaInput(schema);
  const defaultMessage = 'Request validation failed.';
  const handler: RequestHandler = (req, _res, next) => {
    const value = extractValue(req, kind);
    const result = runValidator(value, jsonSchema, { coerce });
    if (!result.valid) {
      return next(
        new BadRequestException(message ?? defaultMessage, { errors: result.errors }),
      );
    }
    writeValue(req, kind, result.value);
    next();
  };

  return attachOpenApiMeta(handler, {
    kind,
    schema: jsonSchema,
    errorStatuses: [AUTO_400],
  });
};

