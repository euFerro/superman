import type { FastifyMiddleware } from '../typed-handler';
import { UnsupportedMediaTypeException } from '../../exceptions/http.exception';
import { attachOpenApiMeta } from '../openapi-meta';
import type { JsonSchema } from '../../core/superman-controller';

export interface ValidateContentTypeOptions {
  /** Override the default `UnsupportedMediaTypeException` message thrown on a mismatch. */
  message?: string;
}

const SUPPORTED_METADATA_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    supported: {
      type: 'array',
      items: { type: 'string' },
      description: 'Content types the route accepts.',
    },
  },
  required: ['supported'],
};

const AUTO_415 = {
  status: 415,
  description: 'Unsupported Content-Type.',
  metadataSchema: SUPPORTED_METADATA_SCHEMA,
} as const;

const normalise = (value: string | undefined): string =>
  (value ?? '').split(';')[0].trim().toLowerCase();

/**
 * Guards an endpoint to a fixed set of `Content-Type` media types. On
 * mismatch, throws `UnsupportedMediaTypeException` (HTTP 415) with
 * `metadata: { supported: [...] }`.
 *
 * The list also flows into the OpenAPI `requestBody.content` keys, so the
 * generated spec advertises exactly which media types the route accepts.
 *
 * Two call forms:
 *   validateContentType('application/json', 'multipart/form-data')
 *   validateContentType({ types: ['application/json'], message: 'JSON only' })
 */
export function validateContentType(...types: string[]): FastifyMiddleware;
export function validateContentType(
  options: { types: string[] } & ValidateContentTypeOptions,
): FastifyMiddleware;
export function validateContentType(
  ...args: [({ types: string[] } & ValidateContentTypeOptions)] | string[]
): FastifyMiddleware {
  let types: string[];
  let message: string | undefined;

  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && 'types' in args[0]) {
    types = args[0].types;
    message = args[0].message;
  } else {
    types = args as string[];
  }

  const allowed = types.map((t) => t.toLowerCase());
  const allowedSet = new Set(allowed);

  const handler: FastifyMiddleware = async (req, _res) => {
    const incoming = normalise(req.headers['content-type'] as string | undefined);
    if (!allowedSet.has(incoming)) {
      throw new UnsupportedMediaTypeException(
          message ?? `Unsupported Content-Type: ${incoming || '(none)'}`,
          { supported: allowed },
      );
    }
  };

  return attachOpenApiMeta(handler, {
    kind: 'content-type',
    mediaTypes: allowed,
    errorStatuses: [AUTO_415],
  });
}

