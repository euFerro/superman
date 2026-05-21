/**
 * Pure builder that converts the framework's internal module/route metadata
 * into an OpenAPI 3.1.0 document.
 *
 * Schemas are JSON Schema 2020-12 objects (e.g. produced by Zod 4's
 * `z.toJSONSchema()`). The builder forwards schemas verbatim and lifts
 * `examples`/`example` annotations to OpenAPI MediaType objects so tooling
 * renders them. Schema descriptions are used as fallbacks, keeping the schema
 * as the single source of truth.
 *
 * Every operation automatically documents `429` and `500` responses, plus a
 * `default` catch-all referencing `FrameworkError`. When a route has a
 * security requirement (per-op or from `config.openapi.security`), a `401`
 * response is also auto-injected unless the route declared its own.
 */

import type {
  JsonSchema,
  RequestDefinition,
  RequestBodyDefinition,
  ResponseDefinition,
  ResponseHeaderDefinition,
  ErrorResponseDefinition,
  MediaTypeDefinition,
  MediaTypeExample,
  SecurityRequirement,
} from '../core/superman-controller';
import { APP_NAME, APP_VERSION } from '../logger/infra-fields';

export interface OpenApiModuleRoute {
  method: string;
  path: string;
  fullPath: string;
  description?: string;
  throttle: {
    preset: string | null;
    limit: number;
    ttl: number;
  };
  request?: RequestDefinition;
  responses?: Record<number, ResponseDefinition>;
  errors?: ReadonlyArray<ErrorResponseDefinition>;
  operationId?: string;
  deprecated?: boolean;
  summary?: string;
  security?: ReadonlyArray<SecurityRequirement>;
}

export interface OpenApiModuleSpec {
  name: string;
  prefix: string;
  description?: string;
  routes: OpenApiModuleRoute[];
}

export interface FrameworkErrorFormat {
  description: string;
  schema: unknown;
  example?: unknown;
}

export interface BuildOpenApiInput {
  modules: ReadonlyArray<OpenApiModuleSpec>;
  errorFormat: FrameworkErrorFormat;
  /** Named security schemes copied to `components.securitySchemes`. */
  securitySchemes?: Record<string, Record<string, unknown>>;
  /** Default per-operation security requirement when a route has none. */
  defaultSecurity?: ReadonlyArray<SecurityRequirement>;
  /** Top-level API description â€” surfaced as `info.description` (renders on the docs UI landing page). */
  description?: string;
}

interface OpenApiMediaType {
  schema?: unknown;
  example?: unknown;
  examples?: Record<string, MediaTypeExample>;
}

interface OpenApiHeader {
  schema: unknown;
  description?: string;
  required?: boolean;
  deprecated?: boolean;
}

interface OpenApiResponse {
  description: string;
  content?: Record<string, OpenApiMediaType>;
  headers?: Record<string, OpenApiHeader>;
}

interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema: unknown;
  description?: string;
  deprecated?: boolean;
  example?: unknown;
  examples?: Record<string, MediaTypeExample>;
}

interface OpenApiOperation {
  tags: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  deprecated?: boolean;
  parameters?: OpenApiParameter[];
  requestBody?: unknown;
  responses: Record<string, OpenApiResponse>;
  security?: ReadonlyArray<SecurityRequirement>;
  'x-rate-limit': {
    preset: string | null;
    limit: number;
    ttl: number;
  };
}

interface OpenApiComponents {
  schemas: Record<string, unknown>;
  securitySchemes?: Record<string, Record<string, unknown>>;
}

export interface OpenApiDocument {
  openapi: '3.1.0';
  info: { title: string; version: string; description?: string };
  tags: { name: string; description?: string }[];
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: OpenApiComponents;
}

const ERROR_SCHEMA_NAME = 'FrameworkError';
const ERROR_SCHEMA_REF = `#/components/schemas/${ERROR_SCHEMA_NAME}`;
const DEFAULT_CONTENT_TYPE = 'application/json';
const METHODS_WITHOUT_BODY: ReadonlySet<string> = new Set(['get', 'head', 'delete', 'options']);

const FRAMEWORK_AUTO_ERROR_STATUSES: ReadonlyArray<{ code: number; description: string }> = [
  { code: 429, description: 'Rate limit exceeded â€” too many requests.' },
  { code: 500, description: 'Internal server error.' },
];

const RATE_LIMIT_REMAINING_HEADER: OpenApiHeader = {
  schema: { type: 'integer', minimum: 0 },
  description: 'Calls remaining in the current rate-limit window.',
};

const RETRY_AFTER_HEADER: OpenApiHeader = {
  schema: { type: 'integer', minimum: 0 },
  description: 'Seconds until the rate-limit window resets.',
};

/**
 * Header names OpenAPI 3.1 forbids declaring under `parameters[in: header]`.
 * `Accept`/`Content-Type` are modeled via `requestBody.content`;
 * `Authorization` is modeled via `security` + `components.securitySchemes`.
 */
const FORBIDDEN_HEADER_PARAMS: ReadonlySet<string> = new Set([
  'accept',
  'content-type',
  'authorization',
]);

let forbiddenHeaderWarned = false;

const resolveInfo = (description?: string): { title: string; version: string; description?: string } => ({
  title: APP_NAME,
  version: APP_VERSION,
  ...(description !== undefined ? { description } : {}),
});

interface ConvertedPath {
  openApiPath: string;
  paramNames: string[];
}

const expressPathToOpenApi = (path: string): ConvertedPath => {
  const paramNames: string[] = [];
  const openApiPath = path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => {
    paramNames.push(name);
    return `{${name}}`;
  });
  return { openApiPath, paramNames };
};

const buildPathParameters = (paramNames: string[]): OpenApiParameter[] =>
  paramNames.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));

const isJsonSchemaObject = (value: unknown): value is JsonSchema =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const booleanValue = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const buildParametersFromObjectSchema = (
  schema: JsonSchema | undefined,
  location: 'query' | 'header' | 'cookie',
): OpenApiParameter[] => {
  if (!schema) return [];
  const properties = schema.properties;
  if (!isJsonSchemaObject(properties)) return [];

  const requiredList = Array.isArray(schema.required)
    ? schema.required.filter((v): v is string => typeof v === 'string')
    : [];
  const requiredSet = new Set(requiredList);

  const params: OpenApiParameter[] = [];
  for (const [name, propRaw] of Object.entries(properties)) {
    if (location === 'header' && FORBIDDEN_HEADER_PARAMS.has(name.toLowerCase())) {
      if (!forbiddenHeaderWarned) {
        forbiddenHeaderWarned = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[superman/back] OpenAPI: header "${name}" cannot be declared under parameters. ` +
          `Use security schemes for Authorization or requestBody.content for Accept/Content-Type. Skipping.`,
        );
      }
      continue;
    }
    const propSchema = isJsonSchemaObject(propRaw) ? propRaw : { type: 'string' };
    const param: OpenApiParameter = {
      name,
      in: location,
      required: requiredSet.has(name),
      schema: propSchema,
    };
    const description = stringValue(propSchema.description);
    if (description) param.description = description;
    const deprecated = booleanValue(propSchema.deprecated);
    if (deprecated !== undefined) param.deprecated = deprecated;
    const examples = propSchema.examples;
    const example = propSchema.example;
    if (Array.isArray(examples) && examples.length > 0) {
      param.examples = Object.fromEntries(
        examples.map((value, index) => [`example${index + 1}`, { value }]),
      );
    } else if (example !== undefined) {
      param.example = example;
    }
    params.push(param);
  }
  return params;
};

const toJson = (input: unknown): JsonSchema => {
  if (input && typeof input === 'object' && typeof (input as { toJsonSchema?: unknown }).toJsonSchema === 'function') {
    return (input as { toJsonSchema: () => JsonSchema }).toJsonSchema();
  }
  return input as JsonSchema;
};

const buildMediaTypeFromSchema = (schema: JsonSchema): OpenApiMediaType => {
  const media: OpenApiMediaType = { schema };
  const examples = schema.examples;
  const example = schema.example;
  if (Array.isArray(examples) && examples.length > 0) {
    media.examples = Object.fromEntries(
      examples.map((value, index) => [`example${index + 1}`, { value }]),
    );
  } else if (example !== undefined) {
    media.example = example;
  }
  return media;
};

const buildMediaTypeFromDefinition = (def: MediaTypeDefinition): OpenApiMediaType => {
  const media = buildMediaTypeFromSchema(toJson(def.schema));
  if (def.examples) {
    media.examples = def.examples;
    delete media.example;
  } else if (def.example !== undefined) {
    media.example = def.example;
    delete media.examples;
  }
  return media;
};

const schemaDescription = (schema: JsonSchema | undefined): string | undefined =>
  schema && typeof schema.description === 'string' ? schema.description : undefined;

interface ResolvedBody {
  content: Record<string, OpenApiMediaType>;
  primarySchema: JsonSchema | undefined;
}

const resolveBody = (def: RequestBodyDefinition | ResponseDefinition): ResolvedBody | undefined => {
  if (def.content && Object.keys(def.content).length > 0) {
    const content: Record<string, OpenApiMediaType> = {};
    for (const [mediaType, mediaDef] of Object.entries(def.content)) {
      content[mediaType] = buildMediaTypeFromDefinition(mediaDef);
    }
    const firstKey = Object.keys(def.content)[0];
    return { content, primarySchema: toJson(def.content[firstKey].schema) };
  }
  if (def.schema) {
    const contentType = def.contentType || DEFAULT_CONTENT_TYPE;
    const jsonSchema = toJson(def.schema);
    return {
      content: { [contentType]: buildMediaTypeFromSchema(jsonSchema) },
      primarySchema: jsonSchema,
    };
  }
  return undefined;
};

const buildRequestBody = (route: OpenApiModuleRoute): unknown | undefined => {
  const body = route.request?.body;
  if (!body) return undefined;
  if (METHODS_WITHOUT_BODY.has(route.method.toLowerCase())) return undefined;

  const resolved = resolveBody(body);
  if (!resolved) return undefined;

  const description = body.description || schemaDescription(resolved.primarySchema);
  const required = body.required ?? true;
  const out: Record<string, unknown> = {
    required,
    content: resolved.content,
  };
  if (description) out.description = description;
  return out;
};

const buildResponseHeaders = (
  headers: Record<string, ResponseHeaderDefinition> | undefined,
): Record<string, OpenApiHeader> | undefined => {
  if (!headers) return undefined;
  const out: Record<string, OpenApiHeader> = {};
  for (const [name, def] of Object.entries(headers)) {
    const entry: OpenApiHeader = { schema: toJson(def.schema) };
    if (def.description !== undefined) entry.description = def.description;
    if (def.required !== undefined) entry.required = def.required;
    if (def.deprecated !== undefined) entry.deprecated = def.deprecated;
    out[name] = entry;
  }
  return out;
};

const buildSuccessResponse = (code: string, def: ResponseDefinition): OpenApiResponse => {
  const resolved = resolveBody(def);
  const description =
    def.description || schemaDescription(resolved?.primarySchema) || `HTTP ${code}`;
  const response: OpenApiResponse = { description };
  if (resolved) response.content = resolved.content;
  const headers = buildResponseHeaders(def.headers);
  if (headers) response.headers = headers;
  return response;
};

const buildFrameworkErrorResponse = (description: string): OpenApiResponse => ({
  description,
  content: {
    [DEFAULT_CONTENT_TYPE]: { schema: { $ref: ERROR_SCHEMA_REF } },
  },
});

const buildDeclaredErrorResponse = (err: ErrorResponseDefinition): OpenApiResponse => {
  const schemaParts: unknown[] = [{ $ref: ERROR_SCHEMA_REF }];
  if (err.metadataSchema) {
    schemaParts.push({
      type: 'object',
      properties: { metadata: toJson(err.metadataSchema) },
    });
  }
  return {
    description: err.description,
    content: {
      [DEFAULT_CONTENT_TYPE]: { schema: { allOf: schemaParts } },
    },
  };
};

const ensureRateLimitHeaders = (
  response: OpenApiResponse,
  statusCode: string,
): void => {
  const headers = response.headers ?? {};
  if (!headers['X-RateLimit-Remaining']) {
    headers['X-RateLimit-Remaining'] = RATE_LIMIT_REMAINING_HEADER;
  }
  if (statusCode === '429' && !headers['Retry-After']) {
    headers['Retry-After'] = RETRY_AFTER_HEADER;
  }
  response.headers = headers;
};

const buildResponses = (
  route: OpenApiModuleRoute,
  hasSecurity: boolean,
): Record<string, OpenApiResponse> => {
  const responses: Record<string, OpenApiResponse> = {};

  if (route.responses) {
    for (const [code, def] of Object.entries(route.responses)) {
      responses[code] = buildSuccessResponse(code, def);
    }
  }

  for (const { code, description } of FRAMEWORK_AUTO_ERROR_STATUSES) {
    const key = String(code);
    if (responses[key] === undefined) {
      responses[key] = buildFrameworkErrorResponse(description);
    }
  }

  if (hasSecurity && responses['401'] === undefined) {
    responses['401'] = buildFrameworkErrorResponse('Authentication required or invalid.');
  }

  if (route.errors) {
    for (const err of route.errors) {
      responses[String(err.status)] = buildDeclaredErrorResponse(err);
    }
  }

  responses.default = buildFrameworkErrorResponse('Standard framework error envelope.');

  for (const [code, response] of Object.entries(responses)) {
    ensureRateLimitHeaders(response, code);
  }

  return responses;
};

interface OperationContext {
  route: OpenApiModuleRoute;
  tagName: string;
  paramNames: string[];
  defaultSecurity?: ReadonlyArray<SecurityRequirement>;
}

const buildOperation = (ctx: OperationContext): OpenApiOperation => {
  const { route, tagName, paramNames, defaultSecurity } = ctx;

  const security = route.security ?? defaultSecurity;
  const hasSecurity = Array.isArray(security) && security.length > 0;

  const operation: OpenApiOperation = {
    tags: [tagName],
    responses: buildResponses(route, hasSecurity),
    'x-rate-limit': {
      preset: route.throttle.preset,
      limit: route.throttle.limit,
      ttl: route.throttle.ttl,
    },
  };

  const summary = route.summary || route.description;
  if (summary) operation.summary = summary;
  if (route.description) operation.description = route.description;

  if (route.operationId) operation.operationId = route.operationId;
  if (route.deprecated) operation.deprecated = true;

  const parameters: OpenApiParameter[] = [];
  if (paramNames.length > 0) {
    parameters.push(...buildPathParameters(paramNames));
  }
  parameters.push(...buildParametersFromObjectSchema(route.request?.query, 'query'));
  parameters.push(...buildParametersFromObjectSchema(route.request?.headers, 'header'));
  parameters.push(...buildParametersFromObjectSchema(route.request?.cookies, 'cookie'));
  if (parameters.length > 0) operation.parameters = parameters;

  const requestBody = buildRequestBody(route);
  if (requestBody) operation.requestBody = requestBody;

  if (security) operation.security = security;

  return operation;
};

export const buildOpenApiDocument = ({
  modules,
  errorFormat,
  securitySchemes,
  defaultSecurity,
  description,
}: BuildOpenApiInput): OpenApiDocument => {
  forbiddenHeaderWarned = false;

  const paths: OpenApiDocument['paths'] = {};
  const tags: OpenApiDocument['tags'] = [];

  for (const moduleSpec of modules) {
    tags.push(
      moduleSpec.description !== undefined
        ? { name: moduleSpec.name, description: moduleSpec.description }
        : { name: moduleSpec.name },
    );

    for (const route of moduleSpec.routes) {
      const { openApiPath, paramNames } = expressPathToOpenApi(route.fullPath);
      const pathItem = paths[openApiPath] || {};
      pathItem[route.method.toLowerCase()] = buildOperation({
        route,
        tagName: moduleSpec.name,
        paramNames,
        defaultSecurity,
      });
      paths[openApiPath] = pathItem;
    }
  }

  const components: OpenApiComponents = {
    schemas: {
      [ERROR_SCHEMA_NAME]: {
        ...(errorFormat.schema as object),
        description: errorFormat.description,
        ...(errorFormat.example !== undefined ? { example: errorFormat.example } : {}),
      },
    },
  };

  if (securitySchemes && Object.keys(securitySchemes).length > 0) {
    components.securitySchemes = securitySchemes;
  }

  return {
    openapi: '3.1.0',
    info: resolveInfo(description),
    tags,
    paths,
    components,
  };
};

