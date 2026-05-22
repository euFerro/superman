// App (singleton)
export { app } from './app/superman-app';

// Config
export { defineConfig, config } from './config/superman-config';
export type {
  DefineConfigOptions,
  EnvVarDefinition,
  EnvironmentConfig,
  LoggerOptions,
  LoggerFileOutputOptions,
  LoggerConsoleOutputOptions,
  EventConfig,
  EventsConfig,
  ResolvedEventConfig,
  ResolvedLoggerOptions,
} from './config/superman-config';

// Logger
export { logger, SupermanLogger } from './logger/superman-logger';
export { LogEventEmitter } from './logger/log-event-emitter';

// Logger types â€” enums for typed event logging
export {
  LogIndexSuffix,
  EventType,
  EventSeverity,
  SystemEvent,
  SystemStatus,
  ErrorType,
  BusinessErrorCode,
  AuditEvents,
  SecurityEvents,
  SecuritySeverity,
  AuthOutcome,
} from './logger/superman-logger.types';

// Logger types â€” string-literal aliases for use in user-facing config
export type {
  EventTypeName,
  EventSeverityName,
} from './logger/superman-logger.types';

// Logger types â€” log interfaces
export type {
  BaseLog,
  SystemLog,
  ErrorLog,
  RequestLog,
  ResponseLog,
  AuditLog,
  SecurityLog,
} from './logger/superman-logger.types';

// Logger types â€” builder input shapes
export type {
  SystemLogInput,
  RequestLogInput,
  ResponseLogInput,
  ErrorLogInput,
  AuditLogInput,
  SecurityLogInput,
} from './logger/log-builders';

// Declarative API
export { defineController } from './core/define-controller';
export type {
  DefineControllerOptions,
  ControllerFactory,
  ServiceRouteHandler,
  ContextHandler,
  LegacyHandler,
  HandlerContext,
  HandlerContextBase,
} from './core/define-controller';

// Handler return-value envelope
export { reply, isReply } from './core/reply';
export type { Reply, ReplyOptions } from './core/reply';

// Typed handler context inference (used to brand custom middlewares)
export type { TypedHandler, ContextKey, HandlerContextOf } from './middlewares/typed-handler';
export { defineModule } from './core/define-module';
export type { DefineModuleOptions, RouteDefinition  } from './core/define-module';

// Throttle (presets only, throttler is internal)
export { THROTTLE_CONFIG } from './throttle/throttle.constants';
export type { ThrottlePreset, ThrottleConfig } from './throttle/throttle.constants';

// Exceptions
export {
  HttpException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  GoneException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  UnprocessableEntityException,
  TooManyRequestsException,
  InternalServerErrorException,
  NotImplementedException,
  BadGatewayException,
  ServiceUnavailableException,
  GatewayTimeoutException,
} from './exceptions/http.exception';
export type { ExceptionMetadata } from './exceptions/http.exception';
export type {
  JsonSchema,
  MediaTypeDefinition,
  MediaTypeExample,
  RequestDefinition,
  RequestBodyDefinition,
  RequestBodySchema,
  QuerySchema,
  RequestHeadersSchema,
  CookiesSchema,
  ResponseDefinition,
  ResponseBodySchema,
  ResponseHeaderDefinition,
  ResponseHeadersSchema,
  ErrorResponseDefinition,
  SecuritySchemeDefinition,
  SecurityRequirement,
} from './core/superman-controller';
export type {
  OpenApiConfigOptions,
  ResolvedOpenApiConfig,
  OpenApiDocsOptions,
  ResolvedOpenApiDocsConfig,
  DocsTemplateFn,
  DocsTemplateContext,
  Principal,
  AuthVerifier,
  SchemaValidator,
} from './config/superman-config';
export type { OpenApiDocument } from './app/build-openapi';

// Validation (in-house JSON Schema validator + types)
export { validateJsonSchema } from './validation/json-schema-validator';
export type {
  ValidationError,
  ValidationResult,
  ValidateOptions,
} from './validation/json-schema-validator';

// Schema builder DSL (Zod-like authoring layer over JSON Schema)
export { s, Schema, toJsonSchemaInput } from './schema/builder';
export {
  StringSchema,
  NumberSchema,
  BooleanSchema,
  NullSchema,
  AnySchema,
  LiteralSchema,
  EnumSchema,
  ArraySchema,
  ObjectSchema,
  UnionSchema,
  IntersectionSchema,
  DiscriminatedUnionSchema,
  RecordSchema,
  RawSchema,
} from './schema/builder';
export type {
  Infer,
  SchemaInput,
  ObjectShape,
  ObjectOutput,
  SafeParseResult,
} from './schema/builder';
export type { SchemaLike } from './core/superman-controller';

// Middlewares â€” runtime validation + OpenAPI auto-documentation
export { validateBody } from './middlewares/validation/validate-body';
export { validateQuery } from './middlewares/validation/validate-query';
export { validateHeaders } from './middlewares/validation/validate-headers';
export { validateCookies } from './middlewares/validation/validate-cookies';
export { validatePathParams } from './middlewares/validation/validate-path-params';
export { validateContentType } from './middlewares/validation/validate-content-type';

// Middlewares â€” auth + authorization
export { requireAuth } from './middlewares/auth/require-auth';
export type { RequireAuthOptions } from './middlewares/auth/require-auth';
export { requireRoles, authorize } from './middlewares/auth/require-roles';
export type { AuthorizeOptions } from './middlewares/auth/require-roles';

// OpenAPI middleware annotation helpers (for custom middlewares to self-document)
export { attachOpenApiMeta, readOpenApiMeta } from './middlewares/openapi-meta';
export type {
  OpenApiMiddlewareKind,
  OpenApiMiddlewareMeta,
  AutoErrorResponse,
} from './middlewares/openapi-meta';
export { FRAMEWORK_ERROR_RESPONSE_FORMAT } from './exceptions/error-response-format';
export type { FrameworkErrorResponseFormat } from './exceptions/error-response-format';

// MCP (Model Context Protocol) integration — see `docs/mcp-server.md`.
export {
  mcpServer,
  McpServer,
  getMcpToolNames,
  createMcpController,
  mcpEndpointDescription,
  auditMcpRequest,
  identifyMcpClient,
} from './mcp';
export type { JsonRpcBody, McpClientIdentity } from './mcp';
export type { McpServerOptions, ResolvedMcpServerConfig } from './config/superman-config';

