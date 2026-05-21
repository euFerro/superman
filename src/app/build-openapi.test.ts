import { buildOpenApiDocument } from './build-openapi';
import type { FrameworkErrorFormat, OpenApiModuleRoute, OpenApiModuleSpec } from './build-openapi';

const makeRoute = (overrides: Partial<OpenApiModuleRoute> = {}): OpenApiModuleRoute => ({
  method: 'GET',
  path: '/items',
  fullPath: '/api/items',
  throttle: { preset: 'STANDARD', limit: 10, ttl: 60 },
  ...overrides,
});

const makeModule = (overrides: Partial<OpenApiModuleSpec> = {}): OpenApiModuleSpec => ({
  name: 'items',
  prefix: '/api',
  routes: [makeRoute()],
  ...overrides,
});

const makeErrorFormat = (): FrameworkErrorFormat => ({
  description: 'Standard error envelope.',
  schema: {
    type: 'object',
    properties: { error: { type: 'string' } },
    required: ['error'],
  },
  example: { error: 'Boom' },
});

describe('buildOpenApiDocument', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should produce an OpenAPI 3.1.0 document with info and tags', () => {
    // Arrange
    const modules = [makeModule()];
    const errorFormat = makeErrorFormat();

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat });

    // Assert
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info).toHaveProperty('title');
    expect(doc.info).toHaveProperty('version');
    expect(doc.tags).toEqual([{ name: 'items' }]);
  }, 1000);

  it('should convert Express :id params to OpenAPI {id} and emit a path parameter', () => {
    // Arrange
    const modules = [
      makeModule({
        routes: [makeRoute({ path: '/items/:id', fullPath: '/api/items/:id' })],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const operation = doc.paths['/api/items/{id}'].get;

    // Assert
    expect(doc.paths).toHaveProperty('/api/items/{id}');
    expect(operation.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ]);
  }, 1000);

  it('should tag each operation with its module name', () => {
    // Arrange
    const modules = [makeModule({ name: 'orders' })];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });

    // Assert
    expect(doc.paths['/api/items'].get.tags).toEqual(['orders']);
  }, 1000);

  it('should attach throttle metadata under x-rate-limit', () => {
    // Arrange
    const modules = [
      makeModule({
        routes: [makeRoute({ throttle: { preset: 'STRICT', limit: 5, ttl: 30 } })],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });

    // Assert
    expect(doc.paths['/api/items'].get['x-rate-limit']).toEqual({
      preset: 'STRICT',
      limit: 5,
      ttl: 30,
    });
  }, 1000);

  it('should register the framework error schema under components.schemas.FrameworkError', () => {
    // Arrange
    const errorFormat = makeErrorFormat();

    // Act
    const doc = buildOpenApiDocument({ modules: [makeModule()], errorFormat });

    // Assert
    expect(doc.components.schemas).toHaveProperty('FrameworkError');
  }, 1000);

  it('should reference FrameworkError as the default response on every operation', () => {
    // Arrange
    const modules = [
      makeModule({
        routes: [
          makeRoute(),
          makeRoute({ method: 'POST', path: '/items', fullPath: '/api/items' }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });

    // Assert
    expect(doc.paths['/api/items'].get.responses.default).toMatchObject({
      description: 'Standard framework error envelope.',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/FrameworkError' } } },
    });
    expect(doc.paths['/api/items'].post.responses.default).toBeDefined();
  }, 1000);

  it('should auto-inject 429 and 500 referencing FrameworkError on every operation', () => {
    // Arrange
    const modules = [makeModule()];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const responses = doc.paths['/api/items'].get.responses;

    // Assert
    expect(responses['429'].content).toEqual({
      'application/json': { schema: { $ref: '#/components/schemas/FrameworkError' } },
    });
    expect(responses['500'].content).toEqual({
      'application/json': { schema: { $ref: '#/components/schemas/FrameworkError' } },
    });
  }, 1000);

  it('should let user-declared 429 override the auto-injected one', () => {
    // Arrange
    const modules = [
      makeModule({
        routes: [
          makeRoute({
            errors: [{
              status: 429,
              description: 'Custom throttle response.',
              metadataSchema: {
                type: 'object',
                properties: { retryAfter: { type: 'number' } },
              },
            }],
          }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const response = doc.paths['/api/items'].get.responses['429'];

    // Assert
    expect(response.description).toBe('Custom throttle response.');
    expect(response.content?.['application/json'].schema).toEqual({
      allOf: [
        { $ref: '#/components/schemas/FrameworkError' },
        {
          type: 'object',
          properties: {
            metadata: {
              type: 'object',
              properties: { retryAfter: { type: 'number' } },
            },
          },
        },
      ],
    });
  }, 1000);

  it('should render declared errors as allOf [FrameworkError, metadata override]', () => {
    // Arrange
    const modules = [
      makeModule({
        routes: [
          makeRoute({
            errors: [{
              status: 422,
              description: 'Validation failed.',
              metadataSchema: {
                type: 'object',
                properties: { field: { type: 'string' } },
              },
            }],
          }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const response = doc.paths['/api/items'].get.responses['422'];

    // Assert
    expect(response.description).toBe('Validation failed.');
    expect(response.content?.['application/json'].schema).toEqual({
      allOf: [
        { $ref: '#/components/schemas/FrameworkError' },
        {
          type: 'object',
          properties: {
            metadata: {
              type: 'object',
              properties: { field: { type: 'string' } },
            },
          },
        },
      ],
    });
  }, 1000);

  it('should render a declared error without metadataSchema as a plain FrameworkError ref in allOf', () => {
    // Arrange
    const modules = [
      makeModule({
        routes: [makeRoute({ errors: [{ status: 404, description: 'Not found.' }] })],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const response = doc.paths['/api/items'].get.responses['404'];

    // Assert
    expect(response.content?.['application/json'].schema).toEqual({
      allOf: [{ $ref: '#/components/schemas/FrameworkError' }],
    });
  }, 1000);

  it('should lift schema.examples into MediaType examples', () => {
    // Arrange
    const responseSchema = {
      type: 'object',
      properties: { id: { type: 'string' } },
      examples: [{ id: 'abc' }, { id: 'xyz' }],
    };
    const modules = [
      makeModule({
        routes: [
          makeRoute({
            responses: { 200: { schema: responseSchema, description: 'OK' } },
          }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const response = doc.paths['/api/items'].get.responses['200'];

    // Assert
    expect(response.content?.['application/json'].examples).toEqual({
      example1: { value: { id: 'abc' } },
      example2: { value: { id: 'xyz' } },
    });
  }, 1000);

  it('should lift schema.example into MediaType example when no examples array exists', () => {
    // Arrange
    const responseSchema = {
      type: 'object',
      properties: { id: { type: 'string' } },
      example: { id: 'abc' },
    };
    const modules = [
      makeModule({
        routes: [
          makeRoute({
            responses: { 200: { schema: responseSchema } },
          }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const response = doc.paths['/api/items'].get.responses['200'];

    // Assert
    expect(response.content?.['application/json'].example).toEqual({ id: 'abc' });
    expect(response.content?.['application/json'].examples).toBeUndefined();
  }, 1000);

  it('should fall back to schema.description when ResponseDefinition has none', () => {
    // Arrange
    const schema = { type: 'object', description: 'A widget.' };
    const modules = [
      makeModule({
        routes: [makeRoute({ responses: { 200: { schema } } })],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });

    // Assert
    expect(doc.paths['/api/items'].get.responses['200'].description).toBe('A widget.');
  }, 1000);

  it('should fall back to "HTTP <code>" when no description is available anywhere', () => {
    // Arrange
    const modules = [
      makeModule({
        routes: [makeRoute({ responses: { 200: { schema: { type: 'object' } } } })],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });

    // Assert
    expect(doc.paths['/api/items'].get.responses['200'].description).toBe('HTTP 200');
  }, 1000);

  it('should honor a custom contentType on response definitions', () => {
    // Arrange
    const modules = [
      makeModule({
        routes: [
          makeRoute({
            responses: {
              200: { schema: { type: 'string' }, contentType: 'text/plain' },
            },
          }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });

    // Assert
    expect(doc.paths['/api/items'].get.responses['200'].content).toHaveProperty('text/plain');
  }, 1000);

  it('should build a request body using schema, description, and examples', () => {
    // Arrange
    const schema = {
      type: 'object',
      description: 'Create payload.',
      example: { name: 'Foo' },
    };
    const modules = [
      makeModule({
        routes: [
          makeRoute({
            method: 'POST',
            request: { body: { schema } },
          }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const body = doc.paths['/api/items'].post.requestBody as {
      description?: string;
      required: boolean;
      content: Record<string, { schema: unknown; example?: unknown }>;
    };

    // Assert
    expect(body.required).toBe(true);
    expect(body.description).toBe('Create payload.');
    expect(body.content['application/json'].schema).toBe(schema);
    expect(body.content['application/json'].example).toEqual({ name: 'Foo' });
  }, 1000);

  it('should emit multiple media types per response when content map is provided', () => {
    // Arrange
    const jsonSchema = { type: 'object', properties: { id: { type: 'string' } } };
    const xmlSchema = { type: 'string', description: 'XML user document' };
    const modules = [
      makeModule({
        routes: [
          makeRoute({
            responses: {
              200: {
                description: 'User',
                content: {
                  'application/json': { schema: jsonSchema, example: { id: '1' } },
                  'application/xml':  { schema: xmlSchema, example: '<user><id>1</id></user>' },
                },
              },
            },
          }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const content = doc.paths['/api/items'].get.responses['200'].content;

    // Assert
    expect(content).toHaveProperty('application/json');
    expect(content).toHaveProperty('application/xml');
    expect(content?.['application/json'].schema).toBe(jsonSchema);
    expect(content?.['application/json'].example).toEqual({ id: '1' });
    expect(content?.['application/xml'].schema).toBe(xmlSchema);
    expect(content?.['application/xml'].example).toBe('<user><id>1</id></user>');
  }, 1000);

  it('should emit multiple media types on the request body when content map is provided', () => {
    // Arrange
    const jsonSchema = { type: 'object', properties: { name: { type: 'string' } } };
    const multipartSchema = { type: 'object', properties: { file: { type: 'string', format: 'binary' } } };
    const modules = [
      makeModule({
        routes: [
          makeRoute({
            method: 'POST',
            request: {
              body: {
                description: 'Either JSON or a file upload.',
                content: {
                  'application/json':    { schema: jsonSchema },
                  'multipart/form-data': { schema: multipartSchema },
                },
              },
            },
          }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const body = doc.paths['/api/items'].post.requestBody as {
      description: string;
      content: Record<string, { schema: unknown }>;
    };

    // Assert
    expect(body.description).toBe('Either JSON or a file upload.');
    expect(body.content['application/json'].schema).toBe(jsonSchema);
    expect(body.content['multipart/form-data'].schema).toBe(multipartSchema);
  }, 1000);

  it('should let per-media-type examples override schema-derived ones', () => {
    // Arrange
    const schema = { type: 'object', example: { id: 'from-schema' } };
    const modules = [
      makeModule({
        routes: [
          makeRoute({
            responses: {
              200: {
                content: {
                  'application/json': { schema, example: { id: 'from-media' } },
                },
              },
            },
          }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });

    // Assert
    expect(doc.paths['/api/items'].get.responses['200'].content?.['application/json'].example)
      .toEqual({ id: 'from-media' });
  }, 1000);

  it('should omit requestBody for GET routes even when request metadata is provided', () => {
    // Arrange
    const modules = [
      makeModule({
        routes: [
          makeRoute({
            method: 'GET',
            request: { body: { schema: { type: 'object' } } },
          }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });

    // Assert
    expect(doc.paths['/api/items'].get).not.toHaveProperty('requestBody');
  }, 1000);

  it('should expand a query schema into one parameter per property', () => {
    // Arrange
    const query = {
      type: 'object',
      properties: {
        page:  { type: 'integer', description: 'Page number', example: 1 },
        limit: { type: 'integer', description: 'Items per page' },
      },
      required: ['page'],
    };
    const modules = [
      makeModule({
        routes: [makeRoute({ request: { query } })],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const params = doc.paths['/api/items'].get.parameters!;

    // Assert
    expect(params).toEqual(expect.arrayContaining([
      { name: 'page',  in: 'query', required: true,  schema: { type: 'integer', description: 'Page number', example: 1 }, description: 'Page number', example: 1 },
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', description: 'Items per page' }, description: 'Items per page' },
    ]));
  }, 1000);

  it('should expand a request-headers schema into header parameters', () => {
    // Arrange
    const headers = {
      type: 'object',
      properties: {
        'X-Tenant-Id':     { type: 'string', description: 'Tenant id.' },
        'Idempotency-Key': { type: 'string', description: 'Idempotency token.' },
      },
      required: ['X-Tenant-Id'],
    };
    const modules = [
      makeModule({
        routes: [makeRoute({ request: { headers } })],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const params = doc.paths['/api/items'].get.parameters!;

    // Assert
    expect(params.find((p) => p.name === 'X-Tenant-Id')).toMatchObject({
      in: 'header', required: true, description: 'Tenant id.',
    });
    expect(params.find((p) => p.name === 'Idempotency-Key')).toMatchObject({
      in: 'header', required: false,
    });
  }, 1000);

  it('should skip forbidden header names (Authorization, Accept, Content-Type) and warn once', () => {
    // Arrange
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const headers = {
      type: 'object',
      properties: {
        Authorization:    { type: 'string' },
        'X-Custom':       { type: 'string' },
      },
    };
    const modules = [
      makeModule({
        routes: [makeRoute({ request: { headers } })],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const paramNames = doc.paths['/api/items'].get.parameters!.map((p) => p.name);

    // Assert
    expect(paramNames).toContain('X-Custom');
    expect(paramNames).not.toContain('Authorization');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  }, 1000);

  it('should expand a cookies schema into cookie parameters', () => {
    // Arrange
    const cookies = {
      type: 'object',
      properties: { session: { type: 'string', description: 'Session cookie.' } },
      required: ['session'],
    };
    const modules = [
      makeModule({
        routes: [makeRoute({ request: { cookies } })],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const param = doc.paths['/api/items'].get.parameters!.find((p) => p.name === 'session');

    // Assert
    expect(param).toMatchObject({ in: 'cookie', required: true, description: 'Session cookie.' });
  }, 1000);

  it('should emit response headers under the Response Object headers map', () => {
    // Arrange
    const modules = [
      makeModule({
        routes: [
          makeRoute({
            responses: {
              200: {
                schema: { type: 'object' },
                headers: {
                  'X-RateLimit-Remaining': { schema: { type: 'integer' }, description: 'Remaining quota.' },
                  'Retry-After':           { schema: { type: 'integer' } },
                },
              },
            },
          }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const headers = doc.paths['/api/items'].get.responses['200'].headers;

    // Assert
    expect(headers).toEqual({
      'X-RateLimit-Remaining': { schema: { type: 'integer' }, description: 'Remaining quota.' },
      'Retry-After':           { schema: { type: 'integer' } },
    });
  }, 1000);

  it('should honor request.body.required = false', () => {
    // Arrange
    const modules = [
      makeModule({
        routes: [
          makeRoute({
            method: 'POST',
            request: { body: { schema: { type: 'object' }, required: false } },
          }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const body = doc.paths['/api/items'].post.requestBody as { required: boolean };

    // Assert
    expect(body.required).toBe(false);
  }, 1000);

  it('should set operationId, deprecated, and summary on the operation', () => {
    // Arrange
    const modules = [
      makeModule({
        routes: [
          makeRoute({
            operationId: 'listItems',
            deprecated: true,
            summary: 'List items',
            description: 'Long-form description.',
          }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const op = doc.paths['/api/items'].get;

    // Assert
    expect(op.operationId).toBe('listItems');
    expect(op.deprecated).toBe(true);
    expect(op.summary).toBe('List items');
    expect(op.description).toBe('Long-form description.');
  }, 1000);

  it('should apply per-operation security when provided', () => {
    // Arrange
    const modules = [
      makeModule({
        routes: [makeRoute({ security: [{ bearerAuth: [] }] })],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });

    // Assert
    expect(doc.paths['/api/items'].get.security).toEqual([{ bearerAuth: [] }]);
  }, 1000);

  it('should fall back to defaultSecurity when the route has none', () => {
    // Arrange
    const modules = [makeModule({ routes: [makeRoute()] })];

    // Act
    const doc = buildOpenApiDocument({
      modules,
      errorFormat: makeErrorFormat(),
      defaultSecurity: [{ apiKey: [] }],
    });

    // Assert
    expect(doc.paths['/api/items'].get.security).toEqual([{ apiKey: [] }]);
  }, 1000);

  it('should auto-inject 401 when security is required and no 401 is declared', () => {
    // Arrange
    const modules = [
      makeModule({
        routes: [makeRoute({ security: [{ bearerAuth: [] }] })],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });

    // Assert
    expect(doc.paths['/api/items'].get.responses['401']).toMatchObject({
      description: 'Authentication required or invalid.',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/FrameworkError' } } },
    });
  }, 1000);

  it('should let a user-declared 401 override the auto-injected one', () => {
    // Arrange
    const modules = [
      makeModule({
        routes: [
          makeRoute({
            security: [{ bearerAuth: [] }],
            errors: [{ status: 401, description: 'Custom unauthorized.' }],
          }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });

    // Assert
    expect(doc.paths['/api/items'].get.responses['401'].description).toBe('Custom unauthorized.');
  }, 1000);

  it('should auto-inject X-RateLimit-Remaining on every response', () => {
    // Arrange
    const modules = [
      makeModule({
        routes: [
          makeRoute({
            responses: { 200: { schema: { type: 'object' } } },
            errors: [{ status: 404, description: 'Not found.' }],
          }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const responses = doc.paths['/api/items'].get.responses;

    // Assert
    expect(responses['200'].headers).toHaveProperty('X-RateLimit-Remaining');
    expect(responses['404'].headers).toHaveProperty('X-RateLimit-Remaining');
    expect(responses['429'].headers).toHaveProperty('X-RateLimit-Remaining');
    expect(responses['500'].headers).toHaveProperty('X-RateLimit-Remaining');
    expect(responses.default.headers).toHaveProperty('X-RateLimit-Remaining');
  }, 1000);

  it('should auto-inject Retry-After only on the 429 response', () => {
    // Arrange
    const modules = [
      makeModule({
        routes: [
          makeRoute({
            responses: { 200: { schema: { type: 'object' } } },
          }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });
    const responses = doc.paths['/api/items'].get.responses;

    // Assert
    expect(responses['429'].headers).toHaveProperty('Retry-After');
    expect(responses['200'].headers).not.toHaveProperty('Retry-After');
    expect(responses['500'].headers).not.toHaveProperty('Retry-After');
    expect(responses.default.headers).not.toHaveProperty('Retry-After');
  }, 1000);

  it('should not overwrite user-declared rate-limit headers', () => {
    // Arrange
    const customHeader = { schema: { type: 'string' }, description: 'Custom remaining.' };
    const modules = [
      makeModule({
        routes: [
          makeRoute({
            responses: {
              200: {
                schema: { type: 'object' },
                headers: { 'X-RateLimit-Remaining': customHeader },
              },
            },
          }),
        ],
      }),
    ];

    // Act
    const doc = buildOpenApiDocument({ modules, errorFormat: makeErrorFormat() });

    // Assert
    expect(doc.paths['/api/items'].get.responses['200'].headers!['X-RateLimit-Remaining'])
      .toEqual(customHeader);
  }, 1000);

  it('should copy securitySchemes into components.securitySchemes', () => {
    // Arrange
    const schemes = {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    };

    // Act
    const doc = buildOpenApiDocument({
      modules: [makeModule()],
      errorFormat: makeErrorFormat(),
      securitySchemes: schemes,
    });

    // Assert
    expect(doc.components.securitySchemes).toEqual(schemes);
  }, 1000);
});
