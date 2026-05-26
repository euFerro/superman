# Configuration

## `defineConfig(options)`

Registers application configuration. Call once at the top of your entry point.

```typescript
import 'dotenv/config';
import { defineConfig, EventType } from '@supersec-ai/superman';

defineConfig({
  port: 3000,                          // static number
  port: { env: 'PORT', default: 3000 },// or from env var with fallback
  prefix: '/api',                      // prepended to all module prefixes
  jsonLimit: '10mb',                   // JSON body limit

  environments: {                      // endpoint sets per NODE_ENV
    development: { endpoints: { api: 'https://dev.api.com' } },
    staging:     { endpoints: { api: 'https://staging.api.com' } },
    production:  { endpoints: { api: 'https://api.com' } },
  },

  env: {                               // custom env vars
    DB_URL: { required: true },        // throws on startup if missing
    MY_CUSTOM_ENV_VAR: { default: 'my_custom_env_var' },    // optional with default
  },

  logger: {                            // structured event logs (optional)
    enabledEventTypes: [               // default: all 6 types
      EventType.SYSTEM, EventType.REQUEST, EventType.RESPONSE,
      EventType.ERROR,  EventType.AUDIT,   EventType.SECURITY,
    ],
    fileOutput:    { enabled: true, directory: '/var/log/superman' }, // default: disabled
    consoleOutput: {                                                  // default: enabled, event bodies hidden
      enabled: true,
      enableEventDebug: true,                                          // default: false — print event JSON bodies in dev
    },
  },
});
```

### `openapi` options <a id="openapi-security"></a>

Configure reusable OpenAPI security schemes, their verifiers, and a global default security requirement. Used by both runtime auth (via `requireAuth(...)`) and the auto-generated `/spec` document.

```typescript
defineConfig({
  // …
  openapi: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      apiKey:     { type: 'apiKey', in: 'header', name: 'X-API-Key' },
    },
    security: [{ bearerAuth: [] }],   // applies to every operation unless overridden per-controller
    auth: {                            // verifier per scheme — consulted by `requireAuth(schemeName)`
      bearerAuth: async (req) => {
        const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
        const claims = await verifyJwt(token);
        return { id: claims.sub, roles: claims.roles ?? [] };
      },
      apiKey: async (req) => {
        const key = req.headers['x-api-key'] as string | undefined;
        const principal = await lookupApiKey(key);
        if (!principal) throw new UnauthorizedException();
        return principal;
      },
    },
  },
});
```

| Option | Type | Description |
|--------|------|-------------|
| `securitySchemes` | `Record<string, OpenApiSecurityScheme>` | Named scheme definitions. Copied verbatim to `components.securitySchemes` so any OpenAPI 3.1 scheme (`http`, `apiKey`, `oauth2`, `openIdConnect`, mutual TLS) works. |
| `security` | `Array<Record<schemeName, scopes[]>>` | Default security requirement. Applied to every operation that doesn't set its own. |
| `auth` | `Record<schemeName, (req) => Principal>` | Verifier per scheme. `requireAuth(schemeName)` looks the verifier up here; the result is attached to `req.user`. Per-middleware `{ scheme, verify }` overrides win when present. |

The framework auto-injects a `401` response on every operation where security is required.

### `openapi.docs` — built-in interactive docs UI

Opt-in to a **Scalar HTML rendering** of the OpenAPI document at `GET {prefix}/docs`. Disabled by default. When enabled, the page is rendered from the same `/spec` document, so it can never drift.

```typescript
defineConfig({
  prefix: '/api',
  openapi: {
    docs: {
      enabled: true,                         // default: false — must be set to expose the route
      // path: '/docs',                      // default: '/docs' (joined with the global prefix)
      // title: 'My API',                    // default: process.env.npm_package_name
      // theme: 'default',                   // forwarded to the Scalar configuration
      // exposeInProduction: true,           // default: false — see "Production guard" below
      // template: (ctx) => '<html>…</html>',// optional renderer override (see below)
    },
  },
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Whether to expose the `/docs` route. Opt-in to avoid accidentally publishing UI in production. |
| `path`    | `string`  | `'/docs'` | Mount path; joined with the global `prefix`. |
| `title`   | `string`  | `process.env.npm_package_name` | Page `<title>` and the title shown in the rendered UI. |
| `theme`   | `string`  | `'default'` | Forwarded to the Scalar `data-configuration`. |
| `exposeInProduction` | `boolean` | `false` | When `config.environment === 'production'` the route returns a plain-text 503 instead of HTML. Set to `true` for internal services where exposing the UI in prod is intentional. |
| `template`| `(ctx) => string` | — | Optional renderer override. When set, fully replaces the default page. |

**`DOCS` env-var override.** The `DOCS` environment variable wins over `defineConfig` — `DOCS=true` force-enables the route, `DOCS=false` force-disables it. Handy for flipping the UI on per-environment without code changes. Accepts `true`/`false`/`1`/`0` (case-insensitive).

**Production guard.** Even when `enabled: true`, the framework returns `503 in production docs/ is disabled` (plain text) for production requests unless `exposeInProduction: true`. The default rationale: the docs UI ships a CDN script and full API surface — both worth being deliberate about exposing publicly.

**Default rendering — no template engine required.** Out of the box the framework returns a self-contained HTML page that boots [Scalar](https://github.com/scalar/scalar) from the jsDelivr CDN. Endpoints (grouped by module/tag), schemas, parameters and a built-in "Send API Request" panel are all rendered client-side from `/spec`. Zero extra runtime deps in the framework.

**Plug-in a template engine (optional).** Need full control of the HTML (offline assets, custom theme, Pug/EJS/Handlebars templates)? Provide a `template` function. The framework hands it the resolved OpenAPI document plus rendering context; whatever string it returns is served verbatim.

```typescript
import pug from 'pug';
const renderDocs = pug.compileFile('./views/docs.pug');

defineConfig({
  openapi: {
    docs: {
      enabled: true,
      template: (ctx) => renderDocs(ctx),   // ctx: { spec, specUrl, title, theme? }
    },
  },
});
```

The `template` contract is engine-agnostic — it's just `(ctx) => string | Promise<string>` — so any view library works. The framework ships **no template engine as a dependency**; install only the one you actually use.

### `schemaValidator` — replace the built-in validator

> **DSL vs. plug-in validator.** The framework's chainable builder (`s.*`, see [docs/schemas.md](./schemas.md)) is the recommended authoring surface — it covers the vast majority of API shapes and stays dep-free. Replace the **validator engine** (via `schemaValidator`) only when you genuinely need keywords the built-in engine doesn't support (`$ref`, `patternProperties`, `if`/`then`/`else`, refinements, transforms). Schemas you wrote with `s.*` keep working unchanged — the framework hands the JSON Schema produced by `.toJsonSchema()` to your custom validator.

The framework ships a small JSON Schema 2020-12 validator (subset: `type`, `enum`, `const`, `oneOf`/`anyOf`/`allOf`/`not`, string formats, number constraints, array constraints, object constraints, coercion). If you need keywords beyond the subset (`$ref`, `patternProperties`, `if`/`then`/`else`, etc.), plug in any compatible validator:

```typescript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = addFormats(new Ajv({ coerceTypes: true, useDefaults: true }));

defineConfig({
  // …
  schemaValidator: (value, schema, options) => {
    const validate = ajv.compile(schema as object);
    const ok = validate(value);
    return {
      valid: ok,
      value,
      errors: (validate.errors ?? []).map((e) => ({
        path:    e.instancePath || '',
        keyword: e.keyword,
        message: e.message ?? 'invalid',
      })),
    };
  },
});
```

**Zod (carrier pattern).** Zod has its own runtime DSL, so you can't validate a plain JSON Schema with it directly. The idiomatic pattern is to **author in Zod**, derive the JSON Schema for the OpenAPI doc, and carry the original Zod schema alongside via a vendor extension field (`x-zod`) — the validator reads it back at request time. The framework forwards unknown JSON Schema fields verbatim, so `x-zod` shows up in `/spec` as harmless metadata.

```typescript
import { z, type ZodTypeAny } from 'zod';
import type { JsonSchema } from '@supersec-ai/superman';

/** Author in Zod, export a JSON Schema that carries the Zod source. */
export const fromZod = <T extends ZodTypeAny>(zodSchema: T): JsonSchema => ({
  ...(z.toJSONSchema(zodSchema) as JsonSchema),
  'x-zod': zodSchema,                              // ignored by OpenAPI tools; read by the validator
});

// user.schemas.ts — Zod-first, with full inference
const CreateUserZ = z.object({
  name:  z.string().min(1).max(100),
  email: z.string().email(),
  role:  z.enum(['admin', 'editor', 'viewer']).default('viewer'),
});

export const CreateUserBody = fromZod(CreateUserZ);
export type CreateUserDto = z.infer<typeof CreateUserZ>;   // single source for the DTO type
```

```typescript
// server.config.ts
import { z, type ZodTypeAny } from 'zod';
import { validateJsonSchema } from '@supersec-ai/superman';

const pickZod = (schema: unknown): ZodTypeAny | undefined =>
  (schema as { 'x-zod'?: ZodTypeAny } | null)?.['x-zod'];

defineConfig({
  // …
  schemaValidator: (value, schema, options) => {
    const zodSchema = pickZod(schema);

    // Fallback to the framework's built-in validator for hand-written JSON Schemas
    // that don't carry an `x-zod` source.
    if (!zodSchema) return validateJsonSchema(value, schema, options);

    const result = zodSchema.safeParse(value);
    return result.success
      ? { valid: true, value: result.data, errors: [] }
      : {
          valid: false,
          value,
          errors: result.error.issues.map((i) => ({
            path:    '/' + i.path.join('/'),
            keyword: i.code,
            message: i.message,
          })),
        };
  },
});
```

Why the carrier pattern instead of converting JSON Schema ➡️ Zod at runtime: Zod schemas can express **refinements, transforms, and discriminated unions** that don't round-trip through JSON Schema cleanly. Keeping the original Zod object means you get Zod's full validation semantics at request time, and the spec consumers still get a perfectly valid JSON Schema document. Pair this with `z.infer<typeof Schema>` in your `*.schemas.ts` files and you get one declaration that drives runtime validation, OpenAPI documentation, and TypeScript types.

All `validate*` middlewares delegate to whichever validator you wire in. The framework remains dep-free; the user opts in (`ajv`, `zod`, or anything else).

### `logger` options

| Option | Default | Description |
|--------|---------|-------------|
| `enabledEventTypes` | all 6 `EventType` values | Subset of event types to emit. Events outside this set are silently dropped. |
| `fileOutput.enabled` | `false` | Enable NDJSON file output (one file per event type, daily rotation). |
| `fileOutput.directory` | `/var/log/superman` | Target directory. Accepts absolute (`/var/log/...`) or relative (`./logs`) paths. Created on first write. If the process lacks permission, the file sink disables itself and logs a single diagnostic. |
| `consoleOutput.enabled` | `true` | Master switch for ALL console output (free-form + events). Forced off when `NODE_ENV=test`. |
| `consoleOutput.enableEventDebug` | `false` | When true, the console sink prints the pretty JSON body for typed events in dev. Summary lines from the request interceptor / exception middleware are unaffected; file sink always persists the full payload. Ignored in production. |

## `config`

Singleton with resolved configuration. Available after `defineConfig()`.

```typescript
import { config } from '@supersec-ai/superman';

config.port                  // number
config.prefix                // string (e.g. '/api')
config.jsonLimit             // string
config.environment           // 'development' | 'staging' | 'production' | ...
config.endpoints.api         // resolved for active environment
config.env.DB_URL            // validated env var value (direct record access)
config.get('DB_URL')         // same value via idiomatic getter — returns `string | undefined`
config.isProduction()        // boolean
config.isInitialized()       // boolean
config.logger                // { enabledEventTypes: Set<EventType>, fileOutput, consoleOutput }
```

### `config.get(key)`

Convenience lookup for a validated env var. Returns the same value as `config.env[key]` but reads more naturally at call sites. Returns `undefined` when the key was never declared in `defineConfig({ env })` or when the process-level var was not set and no `default` was provided.

```typescript
const apiKey = config.get('API_KEY');              // string | undefined
const dbUrl  = config.get('DB_URL') ?? 'memory://'; // inline fallback
```

For required env vars the framework already throws at startup, so `config.get('DB_URL')` inside application code can be treated as a non-nullable `string` at that point — use a non-null assertion or a narrow helper if you want to dodge the `| undefined` for those specific keys.

