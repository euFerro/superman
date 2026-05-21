import { EventSeverity, EventType, EventSeverityName, EventTypeName } from '../logger/superman-logger.types';
import { resolveEnvironment } from './resolve-environment';

export interface EnvVarDefinition {
  required?: boolean;
  default?: string;
}

export interface EnvironmentConfig {
  endpoints: Record<string, string>;
}

export interface LoggerFileOutputOptions {
  enabled: boolean;
  directory?: string;
}

export interface LoggerConsoleOutputOptions {
  enabled: boolean;
  /**
   * When true, the console sink prints the pretty-formatted JSON body for typed
   * events (REQUEST / RESPONSE / ERROR / SYSTEM / AUDIT / SECURITY) in dev mode.
   * Summary lines emitted by the request interceptor and the exception
   * middleware are unaffected, and the file sink still persists the full JSON
   * payload regardless of this flag. Production JSON-per-line output ignores
   * this flag. Default: false.
   */
  eventDebug?: boolean;
}

/**
 * Per-event configuration. `type` is required; everything else has sensible
 * defaults so users can opt into richer control gradually.
 */
export interface EventConfig {
  /** Required event type. Use the string literal â€” `'SYSTEM' | 'ERROR' | ...`. */
  type: EventTypeName;

  /**
   * Whether the event's heavy "payload" fields (e.g. `requestBody`,
   * `stackTrace`, `metadata`, `changes`, `query`) are persisted at all.
   * When `false`, those fields are stripped before any sink writes the log.
   * Useful to keep file noise low while still keeping the event line.
   * Default: `true`.
   */
  savePayload?: boolean;

  /**
   * Maximum stringified length per payload field. Longer values are truncated
   * with `â€¦[truncated]`. Applied only when `savePayload` is `true`.
   * Default: `5000`.
   */
  payloadMaxLength?: number;

  /** Whether this event type is emitted to the console sink. Default: `true`. */
  console?: boolean;

  /** Whether this event type is written to the file sink. Default: `true`. */
  file?: boolean;

  /**
   * Drop events whose severity is below this threshold (e.g. setting
   * `'WARN'` mutes INFO-level events for this type). Default: `'INFO'`.
   */
  minSeverity?: EventSeverityName;

  /**
   * Inclusive whitelist for the event's payload objects (`metadata`,
   * `requestBody`, `query`, `changes`). When non-empty, **only** the listed
   * keys survive at any nesting depth inside those payload objects; every
   * other key is stripped before sinks see the log. Top-level log fields
   * (`@timestamp`, `eventType`, `requestId`, etc.) are not affected â€” the log
   * line stays parseable. Applied before `redactFields`. Default: `[]`
   * (no whitelist; all keys captured).
   *
   * Tip: combine with `redactFields` to first narrow the captured surface,
   * then mask anything sensitive that remains.
   */
  captureFields?: string[];

  /**
   * Top-level keys to redact from this event's log object before any sink
   * writes it. Matched recursively; matched values become `'***'`. Useful for
   * masking authorization headers, tokens, secret fields, etc. Default: `[]`.
   */
  redactFields?: string[];

  /**
   * Probabilistic sampling rate `0..1`. `1` logs every event, `0.1` logs ~10%.
   * Useful for high-volume types like REQUEST/RESPONSE in production.
   * Default: `1`.
   */
  sampleRate?: number;
}

export interface EventsConfig {
  /** Master switch. When `false`, no typed events are emitted at all. Default: `true`. */
  enabled?: boolean;
  /**
   * Whitelist of events to emit, with per-event options. Event types absent
   * from this list are dropped. When `events` is omitted entirely, all six
   * event types are emitted with default options.
   */
  include?: EventConfig[];
}

export interface LoggerOptions {
  fileOutput?: LoggerFileOutputOptions;
  consoleOutput?: LoggerConsoleOutputOptions;
  events?: EventsConfig;
}

export interface ResolvedEventConfig {
  type: EventType;
  savePayload: boolean;
  payloadMaxLength: number;
  console: boolean;
  file: boolean;
  minSeverity: EventSeverity;
  captureFields: readonly string[];
  redactFields: readonly string[];
  sampleRate: number;
}

export interface ResolvedLoggerOptions {
  fileOutput: { enabled: boolean; directory: string };
  consoleOutput: { enabled: boolean; eventDebug: boolean };
  events: {
    enabled: boolean;
    byType: ReadonlyMap<EventType, ResolvedEventConfig>;
  };
}

export interface Principal {
  id: string;
  roles?: ReadonlyArray<string>;
  scopes?: ReadonlyArray<string>;
  [key: string]: unknown;
}

export type AuthVerifier = (req: import('express').Request) => Promise<Principal> | Principal;

export interface DocsTemplateContext {
  spec: import('../app/build-openapi').OpenApiDocument;
  specUrl: string;
  title: string;
  theme?: string;
}

export type DocsTemplateFn = (ctx: DocsTemplateContext) => string | Promise<string>;

export interface OpenApiDocsOptions {
  /** Set to `true` to expose the docs UI at `{prefix}/docs`. Off by default. */
  enabled?: boolean;
  /** Mount path (joined with the global config prefix). Defaults to `/docs`. */
  path?: string;
  /** Page `<title>`. Defaults to the app's `package.json` `name` (or `'unknown-app'`). */
  title?: string;
  /** Forwarded to the default Scalar configuration. */
  theme?: string;
  /** Plug-in a custom HTML renderer (Pug/EJS/Handlebars/etc.) â€” fully replaces the default Scalar page. */
  template?: DocsTemplateFn;
  /**
   * Allow serving the docs UI when `config.environment === 'production'`. Defaults to `false`:
   * production requests return a plain-text 503 instead of the HTML page. Set to `true` for
   * internal services where exposing the UI in prod is intentional.
   */
  exposeInProduction?: boolean;
}

export interface ResolvedOpenApiDocsConfig {
  enabled: boolean;
  path: string;
  title?: string;
  theme?: string;
  template?: DocsTemplateFn;
  exposeInProduction: boolean;
}

export interface OpenApiConfigOptions {
  /** Named security schemes copied to `components.securitySchemes`. */
  securitySchemes?: Record<string, Record<string, unknown>>;
  /** Default security requirement applied to every operation unless overridden. */
  security?: ReadonlyArray<Record<string, ReadonlyArray<string>>>;
  /** Verifier function per security-scheme name. `requireAuth('foo')` looks the verifier up here. */
  auth?: Record<string, AuthVerifier>;
  /** Top-level API description â€” surfaced as `info.description` and rendered on the docs UI landing page. Supports CommonMark. */
  description?: string;
  /** Built-in interactive docs UI configuration. Off by default. */
  docs?: OpenApiDocsOptions;
}

export interface ResolvedOpenApiConfig {
  securitySchemes: Record<string, Record<string, unknown>>;
  security: ReadonlyArray<Record<string, ReadonlyArray<string>>>;
  auth: Record<string, AuthVerifier>;
  description?: string;
  docs: ResolvedOpenApiDocsConfig;
}

export type SchemaValidator = (
  value: unknown,
  schema: Record<string, unknown>,
  options?: { coerce?: boolean },
) => { valid: boolean; value: unknown; errors: ReadonlyArray<{ path: string; keyword: string; message: string }> };

export interface DefineConfigOptions {
  port?: number | { env: string; default: number };
  prefix?: string;
  jsonLimit?: string;
  environments?: Record<string, EnvironmentConfig>;
  env?: Record<string, EnvVarDefinition>;
  logger?: LoggerOptions;
  openapi?: OpenApiConfigOptions;
  /** Override the framework's built-in JSON Schema validator with your own (AJV, Zod-adapter, etc.). */
  schemaValidator?: SchemaValidator;
}

const DEFAULT_LOG_DIRECTORY = '/var/log/superman';

const ALL_EVENT_TYPES: EventType[] = [
  EventType.SYSTEM,
  EventType.ERROR,
  EventType.REQUEST,
  EventType.RESPONSE,
  EventType.AUDIT,
  EventType.SECURITY,
];

const VALID_EVENT_TYPES = new Set<string>(Object.values(EventType));
const VALID_SEVERITIES = new Set<string>(Object.values(EventSeverity));

const DEFAULT_PAYLOAD_MAX_LENGTH = 5000;

const defaultEventConfig = (type: EventType): ResolvedEventConfig => ({
  type,
  savePayload: true,
  payloadMaxLength: DEFAULT_PAYLOAD_MAX_LENGTH,
  console: true,
  file: true,
  minSeverity: EventSeverity.INFO,
  captureFields: [],
  redactFields: [],
  sampleRate: 1,
});

const resolveSampleRate = (raw: number | undefined): number => {
  if (raw === undefined) return 1;
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) {
    throw new Error(`Invalid sampleRate: ${raw}. Must be a finite number between 0 and 1.`);
  }
  return raw;
};

const resolveEventConfig = (cfg: EventConfig): ResolvedEventConfig => {
  if (!VALID_EVENT_TYPES.has(cfg.type)) {
    throw new Error(`Invalid event type in logger.events.include: ${String(cfg.type)}`);
  }
  if (cfg.minSeverity !== undefined && !VALID_SEVERITIES.has(cfg.minSeverity)) {
    throw new Error(`Invalid minSeverity for ${cfg.type}: ${cfg.minSeverity}`);
  }
  if (cfg.payloadMaxLength !== undefined && (!Number.isInteger(cfg.payloadMaxLength) || cfg.payloadMaxLength < 0)) {
    throw new Error(`Invalid payloadMaxLength for ${cfg.type}: must be a non-negative integer.`);
  }

  return {
    type: cfg.type as EventType,
    savePayload: cfg.savePayload ?? true,
    payloadMaxLength: cfg.payloadMaxLength ?? DEFAULT_PAYLOAD_MAX_LENGTH,
    console: cfg.console ?? true,
    file: cfg.file ?? true,
    minSeverity: (cfg.minSeverity as EventSeverity | undefined) ?? EventSeverity.INFO,
    captureFields: cfg.captureFields ?? [],
    redactFields: cfg.redactFields ?? [],
    sampleRate: resolveSampleRate(cfg.sampleRate),
  };
};

const resolveEvents = (events?: EventsConfig): ResolvedLoggerOptions['events'] => {
  const enabled = events?.enabled !== false;

  const byType = new Map<EventType, ResolvedEventConfig>();

  if (events?.include === undefined) {
    for (const t of ALL_EVENT_TYPES) byType.set(t, defaultEventConfig(t));
    return { enabled, byType };
  }

  for (const cfg of events.include) {
    const resolved = resolveEventConfig(cfg);
    byType.set(resolved.type, resolved);
  }

  return { enabled, byType };
};

const normalizeDocsPath = (raw: string | undefined): string => {
  const trimmed = (raw ?? '/docs').trim();
  if (!trimmed) return '/docs';
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, '') || '/docs';
};

const resolveDocsEnabled = (configValue: boolean | undefined): boolean => {
  const envRaw = process.env.DOCS;
  if (envRaw !== undefined) {
    const normalized = envRaw.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1')  return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return configValue === true;
};

const resolveDocsConfig = (docs: OpenApiDocsOptions | undefined): ResolvedOpenApiDocsConfig => {
  const resolved: ResolvedOpenApiDocsConfig = {
    enabled: resolveDocsEnabled(docs?.enabled),
    path: normalizeDocsPath(docs?.path),
    exposeInProduction: docs?.exposeInProduction === true,
  };
  if (docs?.title !== undefined) resolved.title = docs.title;
  if (docs?.theme !== undefined) resolved.theme = docs.theme;
  if (docs?.template !== undefined) resolved.template = docs.template;
  return resolved;
};

const resolveLoggerOptions = (options?: LoggerOptions): ResolvedLoggerOptions => {
  const fileEnabled = options?.fileOutput?.enabled === true;
  const rawDir = options?.fileOutput?.directory?.trim();
  const directory = rawDir && rawDir.length > 0 ? rawDir : DEFAULT_LOG_DIRECTORY;

  const consoleEnabled = options?.consoleOutput?.enabled !== false;
  const consoleEventLogging = options?.consoleOutput?.eventDebug === true;

  return {
    fileOutput: { enabled: fileEnabled, directory },
    consoleOutput: { enabled: consoleEnabled, eventDebug: consoleEventLogging },
    events: resolveEvents(options?.events),
  };
};

export class SupermanConfig {
  private _port: number = 3000;
  private _prefix: string = '';
  private _jsonLimit: string = '10mb';
  private _env: Record<string, string> = {};
  private _endpoints: Record<string, string> = {};
  private _initialized = false;
  private _environment: string = 'development';
  private _logger: ResolvedLoggerOptions = resolveLoggerOptions();
  private _openapi: ResolvedOpenApiConfig = {
    securitySchemes: {},
    security: [],
    auth: {},
    docs: { enabled: false, path: '/docs', exposeInProduction: false },
  };
  private _schemaValidator: SchemaValidator | undefined;

  init(options: DefineConfigOptions): void {
    if (this._initialized) return;

    this._environment = resolveEnvironment();

    if (typeof options.port === 'object') {
      this._port = Number(process.env[options.port.env]) || options.port.default;
    } else if (typeof options.port === 'number') {
      this._port = options.port;
    }

    if (options.prefix) {
      this._prefix = options.prefix;
    }

    if (options.jsonLimit) {
      this._jsonLimit = options.jsonLimit;
    }

    if (options.env) {
      for (const [key, def] of Object.entries(options.env)) {
        const value = process.env[key] ?? def.default;
        if (def.required && !value) {
          throw new Error(`Missing required environment variable: ${key}`);
        }
        if (value) this._env[key] = value;
      }
    }

    if (options.environments) {
      const activeEnv = options.environments[this._environment]
        ?? options.environments['development'];
      if (activeEnv?.endpoints) {
        this._endpoints = { ...activeEnv.endpoints };
      }
    }

    this._logger = resolveLoggerOptions(options.logger);

    this._openapi = {
      securitySchemes: options.openapi?.securitySchemes ?? {},
      security: options.openapi?.security ?? [],
      auth: options.openapi?.auth ?? {},
      docs: resolveDocsConfig(options.openapi?.docs),
      ...(options.openapi?.description !== undefined ? { description: options.openapi.description } : {}),
    };

    this._schemaValidator = options.schemaValidator;

    this._initialized = true;
  }

  /** Reset config state (for testing only) */
  reset(): void {
    this._port = 3000;
    this._prefix = '';
    this._jsonLimit = '10mb';
    this._env = {};
    this._endpoints = {};
    this._initialized = false;
    this._environment = 'development';
    this._logger = resolveLoggerOptions();
    this._openapi = {
      securitySchemes: {},
      security: [],
      auth: {},
      docs: { enabled: false, path: '/docs', exposeInProduction: false },
    };
    this._schemaValidator = undefined;
  }

  get port(): number { return this._port; }
  get prefix(): string { return this._prefix; }
  get jsonLimit(): string { return this._jsonLimit; }
  get env(): Record<string, string> { return this._env; }
  get endpoints(): Record<string, string> { return this._endpoints; }
  get environment(): string { return this._environment; }
  get logger(): ResolvedLoggerOptions { return this._logger; }
  get openapi(): ResolvedOpenApiConfig { return this._openapi; }
  get schemaValidator(): SchemaValidator | undefined { return this._schemaValidator; }

  isProduction(): boolean { return this._environment === 'production'; }
  isInitialized(): boolean { return this._initialized; }

  /**
   * Convenience lookup for a validated env var.
   * Same result as `config.env[key]` but more idiomatic at call sites.
   *
   * Returns `undefined` when the key was never declared in `defineConfig({ env })`
   * or when the process-level env was not set and no `default` was provided.
   */
  get(key: string): string | undefined {
    return this._env[key];
  }
}

// Singleton
export const config = new SupermanConfig();

export const defineConfig = (options: DefineConfigOptions): void => {
  config.init(options);
};

