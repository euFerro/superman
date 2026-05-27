/**
 * Standard shape returned by the global exception middleware whenever an
 * HttpException or runtime error is caught. Exposed through every auto-generated
 * /spec endpoint so consumers know what error payloads look like without
 * reading the framework source.
 */
export const FRAMEWORK_ERROR_RESPONSE_FORMAT = {
  description: 'Standard error envelope emitted by the global exception handler for any caught HttpException or uncaught runtime error.',
  schema: {
    type: 'object',
    properties: {
      error: {
        type: 'string',
        description: 'Human-readable error message.',
      },
      metadata: {
        type: 'object',
        additionalProperties: true,
        description: 'Optional metadata attached to the exception. For ERROR-severity responses (5xx, 400, 422) it always carries an `errorId` (the `err_`-prefixed id also recorded on the matching ERROR log) plus any metadata the thrower supplied.',
        properties: {
          errorId: {
            type: 'string',
            description: 'Short `err_`-prefixed id correlating this response to the server-side ERROR log; safe to surface to end users for support tickets.',
          },
        },
      },
    },
    required: ['error'],
  },
  example: {
    error: 'Validation failed',
    metadata: { field: 'email', errorId: 'err_3f2a9c8e' },
  },
} as const;

export type FrameworkErrorResponseFormat = typeof FRAMEWORK_ERROR_RESPONSE_FORMAT;
