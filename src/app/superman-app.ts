import Fastify, { FastifyInstance } from 'fastify';
import type { FastifyMiddleware } from '../middlewares/typed-handler';
import { globalExceptionMiddleware } from '../middlewares/global-exception.middleware';
import { requestInterceptorMiddleware } from '../middlewares/request-interceptor.middleware';
import { SupermanModule } from '../core/superman-module';
import { logger } from '../logger/superman-logger';
import { config } from '../config/superman-config';
import { resolveEnvironment } from '../config/resolve-environment';
import { defineModule, flushPendingModules } from '../core/define-module';
import type { DefineModuleOptions } from '../core/define-module';
import { createMcpController, mcpEndpointDescription } from '../mcp/controller';
import { getMcpToolNames } from '../mcp/server';
import { SERVER_INSTANCE_UID } from '../logger/infra-fields';
import { closeLogRuntime } from '../logger/log-runtime';
import { SystemEvent, SystemStatus, EventSeverity } from '../logger/superman-logger.types';
import { FRAMEWORK_ERROR_RESPONSE_FORMAT } from '../exceptions/error-response-format';
import { buildOpenApiDocument } from './build-openapi';
import { renderDocsHtml } from './render-docs';
import type {
  RequestDefinition,
  ResponseDefinition,
  ErrorResponseDefinition,
  SecurityRequirement,
} from '../core/superman-controller';

const log = logger.child('App');

export interface SupermanAppOptions {
  port?: number;
  cors?: boolean;
  jsonLimit?: string;
}

interface RegisteredModuleSpec {
  name: string;
  prefix: string;
  description?: string;
  routes: {
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
  }[];
}

export class SupermanApp {
  public readonly serverInstanceUid: string = SERVER_INSTANCE_UID;
  private app: FastifyInstance;
  private options: SupermanAppOptions;
  private modules: { prefix: string; module: SupermanModule }[] = [];
  private moduleSpecs: RegisteredModuleSpec[] = [];
  private initialized = false;
  private signalHandlersInstalled = false;

  constructor(options: SupermanAppOptions = {}) {
    this.options = options;
    const jsonLimitStr = this.options.jsonLimit || '10mb';
    const limitBytes = parseInt(jsonLimitStr) * 1024 * 1024 || 10485760;
    
    this.app = Fastify({ bodyLimit: limitBytes });
    this.app.addHook('onSend', async (_request, reply) => {
      reply.header('X-Powered-By', 'Superman');
    });
    this.app.register(requestInterceptorMiddleware);
  }

  private installSignalHandlers(): void {
    if (this.signalHandlersInstalled) return;
    this.signalHandlersInstalled = true;

    const onSignal = async (signal: NodeJS.Signals): Promise<void> => {
      log.events.system({
        systemEvent: SystemEvent.SYSTEM_SIGNAL_RECEIVED,
        systemStatus: SystemStatus.ONLINE,
        systemMessage: `Received ${signal}`,
        eventSeverity: EventSeverity.WARN,
        metadata: { signal },
      });
      try {
        await this.shutdown();
      } finally {
        process.exit(0);
      }
    };

    process.on('SIGTERM', () => { void onSignal('SIGTERM'); });
    process.on('SIGINT', () => { void onSignal('SIGINT'); });
  }

  /** Lazily apply config-dependent middleware (called once before listen) */
  private ensureInit(): void {
    if (this.initialized) return;
    this.initialized = true;
    // Fastify handles JSON out of the box, limit was set in constructor
  }

  /** Register a module: mounts its Fastify plugin, tracks for shutdown */
  async registerModule(prefix: string, module: SupermanModule): Promise<this> {
    this.ensureInit();
    await this.app.register(module.plugin, { prefix });
    this.modules.push({ prefix, module });
    return this;
  }

  public useMiddleware(...handlers: FastifyMiddleware[]): this {
    handlers.forEach((h) => this.app.addHook('preHandler', h));
    return this;
  }

  /** Normalize paths to avoid double slashes */
  /**
   * If `config.mcpServer.enabled`, queue a synthetic module exposing the
   * framework's MCP controller at `{prefix}{config.mcpServer.path}`. The
   * synthetic module is enqueued via `defineModule(...)` so it flows through
   * the same spec/openapi/throttle pipeline as user-declared modules.
   */
  private registerMcpModule(): void {
    if (!config.isInitialized() || !config.mcpServer.enabled) return;

    const mcp = config.mcpServer;
    defineModule({
      name: 'MCP',
      description: mcp.description,
      prefix: '',
      routes: [
        {
          method: 'POST',
          path: mcp.path,
          controller: createMcpController(mcp.throttle)(undefined),
          description: mcpEndpointDescription,
        },
      ],
    });
  }

  private normalizePath(path: string): string {
    return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  }

  /** Build spec metadata from module options */
  private buildModuleSpec(options: DefineModuleOptions, fullPrefix: string): RegisteredModuleSpec {
    const normalizedPrefix = this.normalizePath(fullPrefix);
    return {
      name: options.name,
      prefix: normalizedPrefix,
      ...(options.description !== undefined ? { description: options.description } : {}),
      routes: options.routes.map((route) => {
        const meta = route.controller.metadata;
        const spec: RegisteredModuleSpec['routes'][number] = {
          method: route.method,
          path: route.path,
          fullPath: this.normalizePath(normalizedPrefix + route.path),
          description: route.description,
          throttle: {
            preset: meta.throttlePreset,
            limit: meta.throttleConfig.limit,
            ttl: meta.throttleConfig.ttl,
          },
        };
        if (meta.request) spec.request = meta.request;
        if (meta.responses) spec.responses = meta.responses;
        if (meta.errors) spec.errors = meta.errors;
        if (meta.operationId !== undefined) spec.operationId = meta.operationId;
        if (meta.deprecated !== undefined) spec.deprecated = meta.deprecated;
        if (meta.summary !== undefined) spec.summary = meta.summary;
        if (meta.security) spec.security = meta.security;
        return spec;
      }),
    };
  }

  /**
   * Registers the `/spec` and (optionally) `/docs` global routes against the Fastify app
   * using the modules already known to `this.moduleSpecs`. Idempotent only at the listen()
   * boundary - calling more than once would attach duplicate handlers.
   */
  public installOpenApiRoutes(): void {
    const globalPrefix = config.isInitialized() ? config.prefix : '';
    const allSpecs = this.moduleSpecs;
    const specPath = this.normalizePath(`${globalPrefix}/spec`);
    const buildSpec = () => {
      const openapi = config.isInitialized()
        ? config.openapi
        : { securitySchemes: {}, security: [], description: undefined };
      return buildOpenApiDocument({
        modules: allSpecs,
        errorFormat: FRAMEWORK_ERROR_RESPONSE_FORMAT,
        securitySchemes: openapi.securitySchemes,
        defaultSecurity: openapi.security,
        ...(openapi.description !== undefined ? { description: openapi.description } : {}),
      });
    };
    this.app.get(specPath, async (_request, reply) => {
      return buildSpec();
    });

    if (config.isInitialized() && config.openapi.docs.enabled) {
      const docsCfg = config.openapi.docs;
      const docsPath = this.normalizePath(`${globalPrefix}${docsCfg.path}`);
      this.app.get(docsPath, async (_request, reply) => {
        if (config.isProduction() && !docsCfg.exposeInProduction) {
          return reply
            .status(503)
            .type('text/plain')
            .send(`in ${config.environment} docs/ is disabled`);
        }
        const spec = buildSpec();
        const html = await renderDocsHtml({
          spec,
          specUrl: specPath,
          title: docsCfg.title ?? spec.info.title,
          theme: docsCfg.theme,
          template: docsCfg.template,
        });
        return reply.type('text/html').send(html);
      });
    }
  }

  public listen(callback?: () => void): void {
    this.ensureInit();

    this.registerMcpModule();

    // Flush all modules queued via defineModule()
    const pending = flushPendingModules();

    // Build specs first so global route has all data
    const builtModules: { module: SupermanModule; fullPrefix: string; spec: RegisteredModuleSpec }[] = [];
    for (const options of pending) {
      const module = new SupermanModule(
        async (fastify) => {
          for (const route of options.routes) {
            const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
            const handler = route.controller.handler;
            fastify[method](route.path, async (request, reply) => {
              await handler(request, reply);
            });
          }
        },
        {
          name: options.name,
          destroy: options.destroy,
          middlewares: options.middlewares,
        },
      );

      const fullPrefix = this.normalizePath(config.prefix + options.prefix);
      const spec = this.buildModuleSpec(options, fullPrefix);
      this.moduleSpecs.push(spec);

      builtModules.push({ module, fullPrefix, spec });
    }

    this.installOpenApiRoutes();

    // Now register all modules
    for (const { module, fullPrefix } of builtModules) {
      this.app.register(module.plugin, { prefix: fullPrefix });
      this.modules.push({ prefix: fullPrefix, module });
    }

    const port = this.options.port || (config.isInitialized() ? config.port : 3000);

    // Global exception handler
    this.app.setErrorHandler(globalExceptionMiddleware);

    this.installSignalHandlers();

    this.app.listen({ port, host: '0.0.0.0' }, (err) => {
      if (err) {
        log.error(err.message, { error: err });
        process.exit(1);
      }
      const env = resolveEnvironment();
      const logLevel = process.env.LOG_LEVEL || (env === 'production' ? 'info' : 'debug');

      log.info('----------------------------------------');
      log.info(`Server started at ${new Date().toISOString()}`);
      log.info(`Instance UID : ${this.serverInstanceUid}`);
      log.info(`Port         : ${port}`);
      log.info(`Environment  : ${env}`);
      log.info(`Log Level    : ${logLevel}`);
      log.info(`Modules      : ${this.modules.length} registered`);
      this.modules.forEach(({ prefix, module }) => {
        log.info(`  -> ${module.name} on ${prefix || '/'}`);
      });

      if (config.isInitialized() && config.mcpServer.enabled) {
        const tools = getMcpToolNames();
        log.info(`MCP tools    : ${tools.length} registered`);
        tools.forEach((name) => log.info(`  -> ${name}`));
      }

      log.info('----------------------------------------');

      log.events.system({
        systemEvent: SystemEvent.SERVICE_STARTED,
        systemStatus: SystemStatus.ONLINE,
        systemMessage: `Server listening on port ${port}`,
        metadata: { port, environment: env, modules: this.modules.length },
      });

      if (callback) callback();
    });
  }

  /** Graceful shutdown: calls destroy() on all registered modules */
  async shutdown(): Promise<void> {
    log.info('Shutting down...');
    log.events.system({
      systemEvent: SystemEvent.MANUAL_SHUTDOWN_ACTION,
      systemStatus: SystemStatus.OFFLINE,
      systemMessage: 'Graceful shutdown started',
      eventSeverity: EventSeverity.WARN,
    });
    await Promise.all(this.modules.map(({ module }) => module.destroy()));
    await closeLogRuntime();
    log.info('Shutdown complete');
  }

  getFastifyApp(): FastifyInstance {
    return this.app;
  }
}

/** @deprecated Use SupermanApp instead */
export const SupermanExpressApp = SupermanApp;

// -- Singleton --
export const app = new SupermanApp();

