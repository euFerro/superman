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
        description: 'Optional metadata attached to the exception (present only when the thrower supplies it).',
      },
    },
    required: ['error'],
  },
  example: {
    error: 'Validation failed',
    metadata: { field: 'email' },
  },
} as const;

export type FrameworkErrorResponseFormat = typeof FRAMEWORK_ERROR_RESPONSE_FORMAT;
