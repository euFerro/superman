/**
 * Shared metadata schema used by the auto-injected `400` response when any
 * `validate*` middleware fails. The framework throws a BadRequestException
 * with this exact shape in its `metadata` field.
 */

import type { JsonSchema } from '../../core/superman-controller';

export const VALIDATION_ERROR_METADATA_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    errors: {
      type: 'array',
      description: 'One entry per failing constraint.',
      items: {
        type: 'object',
        properties: {
          path:    { type: 'string', description: 'JSON-pointer-ish location of the failing value.' },
          keyword: { type: 'string', description: 'JSON Schema keyword that failed.' },
          message: { type: 'string', description: 'Human-readable failure message.' },
        },
        required: ['path', 'keyword', 'message'],
      },
    },
  },
  required: ['errors'],
};

