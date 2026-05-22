<div align="center">
  <img src="docs/superman-logo.png" alt="Superman Logo" width="180" />

  <h1><span style="font-weight: 600">Superman</span></h1>

  <p>Web backend framework built for agentic development</code>.</p>

  <p>
    <a href="docs/guia-arquitetura.md">Website</a> •
    <a href="docs/divergencias.md">Docs</a> •
    <a href="docs/plano-refatoracao.md">Author</a>
  </p>

  <hr />
</div>

Superman is a declarative framework for backend applications focused on low token utilization and high readability specially for coding agents. Define your config, controllers, and modules and the framework handles everything else.

![alt text](/docs/image.png)

## Introduction

This framework was designed with the future of AI-assisted development in mind. As AI becomes a core part of how we build and maintain software, codebases need to be **readable, predictable, and consistent** â€” not just for humans, but for AI agents too.

Traditional Express apps scatter configuration, routing, error handling, logging, and rate limiting across dozens of files with imperative patterns that are hard to parse and reason about. This framework replaces all of that with a small set of declarative functions (`defineConfig`, `defineController`, `defineModule`) that make the entire application structure explicit and self-documenting.

**Why this matters for AI development:**

- **Consistency** â€” Every project follows the same patterns for config, routing, errors, and logging. An AI reading one project instantly understands all of them.
- **Declarative structure** â€” No hidden side effects, no imperative middleware chains to trace. The entire app is defined in ~3 function calls that AI can parse in a single pass.
- **Auto-generated OpenAPI 3.1 documentation** â€” The framework exposes a single `/spec` route that returns a valid OpenAPI 3.1 document built from your declarations. Drop it into Swagger UI, Redoc, Postman, or any codegen tool. No manual docs to maintain or drift out of sync. Opt-in `openapi.docs.enabled` to also expose `/docs`, a built-in Scalar interactive UI rendered from the same document (Pug/EJS/Handlebars template hook included).
- **~60% fewer tokens** â€” A typical module definition in this framework is 15-20 lines of pure declarations vs. 50-60 lines of imperative Express code (router setup, middleware wiring, error handling, handler wrapping). AI agents spend significantly fewer tokens reading, understanding, and modifying the codebase.
- **Predictable error handling** â€” Throw an `HttpException` anywhere, the framework catches it. No more hunting for missing `try/catch` blocks or inconsistent error responses.

The result: a framework that is easier to write, easier to read, and easier to maintain â€” whether you're a human developer or an AI agent working on the code.

## Install

```bash
npm install superman       # Node / npm
bun add superman           # Bun
# Deno: import from 'npm:superman'
```

Express is a regular dependency and is installed automatically by the package manager. The bundle itself is ~45 KB and ships both CommonJS (`dist/index.js`) and ES Module (`dist/index.mjs`) entries, resolved via the `exports` map.

### Supported runtimes

| Runtime | Minimum version | Notes |
|---|---|---|
| Node.js | 20 | Primary target. CI runs here. |
| Bun | 1.0 | Consumes the ESM entry natively. `bun add superman` just works. |
| Deno | any recent | Import via `npm:superman`. Deno's npm compatibility layer resolves the package exports map. |

The framework only uses cross-runtime-safe APIs: `process.env`, `process.stdout/stderr`, `process.on('SIGTERM'|'SIGINT')`, `process.exit`, `os.hostname`, `fs`, `path`. No `__dirname`, no `require.resolve`, no Node-only native modules.

## Principles

### Depend on interfaces, not implementations

Services, repositories, gateways, and any other dependency should never receive or reference a concrete class directly. Always depend on an **interface** (contract) and inject the implementation.

```typescript
// âœ… Correct â€” depends on interface
class UsersService implements IUsersService {
  constructor(private readonly repository: IUsersRepository) {}
}

// âŒ Wrong â€” depends on concrete class
class UsersService {
  constructor(private readonly repository: UsersRepository) {}
}
```

This applies at every layer:
- **Controllers** depend on a service interface (`IUsersService`), never on `UsersService`
- **Services** depend on a repository interface (`IUsersRepository`), never on `UsersRepository`
- **Services** depend on gateway interfaces (`IPaymentGateway`), never on `StripeGateway`

This makes your code testable (swap real implementations for mocks), decoupled (change the database without touching the service), and explicit about its contracts.

## Quick Start

### Step 1 â€” Define your config

```typescript
// src/server.config.ts
import 'dotenv/config'; // side-effect â€” loads .env into process.env
import { defineConfig } from 'superman';

defineConfig({
  port: { env: 'PORT', default: 3000 },
  prefix: '/api',
  jsonLimit: '10mb',

  environments: {
    development: {
      endpoints: {
        usersApi: 'https://dev.api.example.com/users',
      },
    },
    staging: {
      endpoints: {
        usersApi: 'https://staging.api.example.com/users',
      },
    },
    production: {
      endpoints: {
        usersApi: 'https://api.example.com/users',
      },
    },
  },

  env: {
    DATABASE_URL: { required: true },
    JWT_SECRET: { required: true },
    MY_CUSTOM_ENV_VAR: { default: 'my_custom_env_var' },
  },

  // Optional — see docs/mcp-server.md
  mcpServer: {
    enabled: true,                         // also honors `MCP_ENABLED=true`
    path: '/mcp',                          // mounts at `{prefix}{path}` → `/api/mcp`
    name: 'my-app-mcp',                    // default `<package.json name>-mcp`
    version: '0.1.0',                      // default `<package.json version>`
    description: 'Read-only AI tools for inspecting customer data.',
    throttle: 'PERMISSIVE',                // preset name or full ThrottleConfig
  },
});
```

The framework validates required env vars on startup, resolves endpoints for the active environment (via `ENV` environment variable), and makes everything available through the `config` singleton. The `prefix` is prepended to all module routes automatically.

### Step 2 â€” Define module schemas

Park your module's schemas in a co-located `*.schemas.ts` file using the framework's chainable schema builder (`s.*`). No Zod or other dep required â€” the builder emits plain JSON Schema 2020-12 under the hood, the framework's built-in validator consumes it at runtime, and the OpenAPI doc is built from the very same object. `Infer<typeof Schema>` gives you the TypeScript type for free, so DTOs can't drift from the schema â€” and the service layer can consume the same inferred types directly.

```typescript
// src/modules/users/user.schemas.ts
import { s, type Infer } from 'superman';

export const UserResponse = s.object({
  id:        s.string().uuid(),
  name:      s.string().min(1),
  email:     s.string().email(),
  createdAt: s.string().datetime(),
}).describe('A user record.');

export type User = Infer<typeof UserResponse>;
// â†’ { id: string; name: string; email: string; createdAt: string }

export const CreateUserBody = s.object({
  name:  s.string().min(1).describe('Full name.'),
  email: s.string().email().describe('Primary email.'),
});

export type CreateUserDto = Infer<typeof CreateUserBody>;
// â†’ { name: string; email: string }

export const ListUsersQuery = s.object({
  page:  s.integer().min(1).default(1).describe('Page number.'),
  limit: s.integer().min(1).max(100).default(20).describe('Items per page.'),
  q:     s.string().optional().describe('Search query.'),
});

export type ListUsersDto = Infer<typeof ListUsersQuery>;

export const TenancyHeaders = s.object({
  'X-Tenant-Id': s.string().uuid().describe('Tenant identifier.'),
});
```

> Raw JSON Schema objects are still accepted everywhere â€” useful for hand-written schemas, generated schemas (typia, `z.toJSONSchema()`), or features the DSL doesn't cover. See [docs/schemas.md](./docs/schemas.md#escape-hatch--raw-json-schema).

### Step 3 â€” Define a service

Define an interface for the contract and implement it with a plain class. Controllers depend on the interface, never on the implementation. Use the DTO types inferred from your schemas â€” one declaration drives the schema, the validator, the OpenAPI spec, *and* the service contract.

```typescript
// src/modules/users/services/users.services.ts
import { NotFoundException } from 'superman';
import type { User, CreateUserDto, ListUsersDto } from '../user.schemas';

export interface PaginatedResult<T> { data: T[]; page: number; limit: number; total: number }

export interface IUsersService {
  findAll(params: ListUsersDto): Promise<PaginatedResult<User>>;
  findById(id: string): Promise<User>;
  create(data: CreateUserDto): Promise<User>;
}

class UsersService implements IUsersService {
  constructor(private readonly repository: IUsersRepository) {}

  async findAll(params: ListUsersDto) {
    return this.repository.findAll(params);
  }

  async findById(id: string) {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(data: CreateUserDto) {
    return this.repository.create(data);
  }
}
```

### Step 4 â€” Define controllers

The middleware list describes *what arrives*. Each framework middleware validates at runtime **and** brands its piece of the context â€” so the handler receives a fully-typed `{ body, query, params, headers, cookies, user, service, req, res }` object with no manual casts. Return whatever you want; the framework writes it as JSON and picks the status from `responses` (defaults to `200`).

```typescript
// src/modules/users/controllers/users.controllers.ts
import {
  defineController,
  validateBody, validateQuery, validateHeaders,
  requireAuth, requireRoles,
} from 'superman';
import type { IUsersService } from '../services/users.service';
import {
  ListUsersQuery, TenancyHeaders, CreateUserBody, UserResponse,
} from '../user.schemas';

export const listUsersController = defineController<IUsersService>({
  middlewares: [
    requireAuth('bearerAuth'),
    requireRoles('admin'),
    validateHeaders(TenancyHeaders),
    validateQuery(ListUsersQuery),
  ],
  responses: { 200: { schema: UserResponse, description: 'Paginated list of users.' } },
  operationId: 'listUsers',
  summary: 'List users.',
  handler: async ({ query, service }) => service.findAll(query),
  //                ^^^^^ ListUsersDto (inferred from validateQuery)
});

export const createUserController = defineController<IUsersService>({
  middlewares: [
    requireAuth('bearerAuth'),
    requireRoles('admin'),
    validateHeaders(TenancyHeaders),
    validateBody(CreateUserBody),
  ],
  responses: { 201: { schema: UserResponse, description: 'User created.' } },
  operationId: 'createUser',
  throttleConfig: 'STRICT',
  handler: async ({ body, service }) => service.create(body),
  //                ^^^^ CreateUserDto (inferred from validateBody)
  //  â†’ 201 Created (framework picks the single declared 2xx status)
});
```

> **`responses` is optional.** Omit it and successful returns get `200 OK`. Declare a single `2xx` status and the framework uses it. Declare multiple `2xx`s and you must opt into one explicitly via `reply(data, { status: 202 })`.
>
> **Multi-media-type responses** (`content: { 'application/json': ..., 'application/xml': ... }`): default returns are JSON-encoded. For real `Accept`-header negotiation either branch on `req.accepts(...)` and return `reply(body, { mediaType: 'application/xml' })` for non-JSON, or drop into `ctx.res.format({...})` directly.
>
> **Legacy `(req, res, service)` handlers** still work unchanged â€” the framework detects the 3-arg arity and routes through the old path. Useful for streaming endpoints or any case where you need full control over `res`.

#### Flat-context shorthand

Leaf properties from `body` / `query` / `params` / `headers` / `cookies` are **also spread at the context root**, so you can destructure values directly without going through the structural slot. Both styles compile, both work at runtime â€” pick whichever reads best per handler:

```ts
// Structural
handler: async ({ body, params, user, service }) =>
  service.update(params.id, body, user.id)

// Flat â€” leaves at the root
handler: async ({ id, name, email, user, service }) =>
  service.update(id, { name, email }, user.id)

// Mixed
handler: async ({ id, body, user, service }) =>
  service.update(id, body, user.id)
```

**Precedence** when the same leaf name appears in multiple sources (higher wins): `params > body > query > headers > cookies`. **Reserved structural keys** (`req`, `res`, `service`, `body`, `query`, `params`, `headers`, `cookies`, `user`) are never overwritten â€” a body field literally called `service` stays accessible at `ctx.body.service`, not `ctx.service`. The `user` principal stays structural only (`ctx.user`) â€” its inner fields don't get spread, since collapsing `user.id` into `ctx.id` would conflict with path params.

What the framework derives from those middlewares â€” no extra declarations needed:

| Middleware | Validates at runtime | Auto-emits in OpenAPI |
|---|---|---|
| `validateBody(schema)` | `req.body` | `requestBody`, auto `400` |
| `validateQuery(schema)` | `req.query` (string â†’ typed) | `parameters[in:query]`, auto `400` |
| `validateHeaders(schema)` | `req.headers` (string â†’ typed) | `parameters[in:header]`, auto `400` |
| `validateCookies(schema)` | `req.cookies` | `parameters[in:cookie]`, auto `400` |
| `validatePathParams(schema)` | `req.params` | refined path-param schemas, auto `400` |
| `validateContentType(...)` | `Content-Type` header | `requestBody.content` keys, auto `415` |
| `requireAuth('scheme')` | runs the verifier; sets `req.user` | `security: [{ scheme: [] }]`, auto `401` |
| `requireRoles(...)` / `authorize({ scopes })` | checks `req.user.roles` / scopes | scopes merge onto preceding scheme, auto `403` |

The framework still auto-injects `429`, `500`, `default`, and the `X-RateLimit-Remaining` / `Retry-After` response headers on every operation. You only declare success responses and route-specific errors (e.g. `404`, `409`, `422`) in `responses` / `errors`.

`defineController` is generic and returns a factory. Call the factory with your service implementation to get a `SupermanController`.

### Step 5 â€” Define a module

The module file is the **composition root** â€” you instantiate implementations, wire dependencies, and declare routes.

```typescript
// src/modules/users/users.module.ts
import { defineModule } from 'superman';
import { listUsersController, findUserController, createUserController } from './controllers/users.controllers';

const usersDb = new UsersPostgresDb();
const usersRepository = new UsersRepository(usersDb);
const usersService = new UsersService(usersRepository);

defineModule({
  name: 'UsersModule',
  prefix: '/users',
  routes: [
    { method: 'GET',  path: '/',    controller: listUsersController(usersService) },
    { method: 'GET',  path: '/:id', controller: findUserController(usersService) },
    { method: 'POST', path: '/',    controller: createUserController(usersService) },
  ],
});
```

Each controller factory is called with the service â€” you can see exactly which implementations are being used. Swap a database or service implementation by changing one line.

With `prefix: '/api'` in `defineConfig` and `prefix: '/users'` in the module, the framework generates these routes:

```
GET  /api/users
GET  /api/users/:id
POST /api/users
```

### Step 6 â€” Main

```typescript
// src/server.ts
import './server.config'; // side-effect â€” runs defineConfig()
import { app, config, logger } from 'superman';

const log = logger.child('Server');

const main = async () => {
  // Add any db connection or any other logic you need here...

  app.listen(() => {
    log.info(`${process.env.npm_package_name} v${process.env.npm_package_version} started`, {
      url: `http://localhost:${config.port}/`
    });
  });
};

main();
```

That's it. Config, logging, rate limiting, exception handling, and graceful shutdown â€” all automatic.

## API Summary

| Export | Type | Sync? | Description |
|--------|------|-------|-------------|
| `defineConfig()` | function | sync | Registers app config: port, prefix, env vars, environment endpoints, structured logger, OpenAPI security schemes + auth verifiers, custom `schemaValidator` |
| `defineController()` | function | sync | Generic factory â€” returns `ControllerFactory<TService>` |
| `defineModule()` | function | sync | Declares a module with routes. |
| `config` | singleton | â€” | Access resolved config: `config.port`, `config.env.X` (or `config.get('X')`), `config.endpoints.X`, `config.logger`, `config.openapi`, `config.schemaValidator` |
| `app` | singleton | â€” | Express app: `app.listen()`, `app.shutdown()`, `app.useMiddleware()` |
| `logger` | singleton | â€” | Free-form logger (`logger.info()`, `logger.child('Context')`) + typed events (`logger.events.system()`, `.request()`, `.response()`, `.error()`, `.audit()`, `.security()`) |
| `s` | schema-builder namespace | â€” | Chainable Zod-like DSL: `s.string()`, `s.number()`, `s.object({...})`, `s.array(...)`, `s.union(...)`, etc. Emits JSON Schema under the hood, runs runtime validation, and types DTOs via `Infer`. See [docs/schemas.md](./docs/schemas.md) |
| `Schema` / `Infer` / `SchemaInput` | types | â€” | `Schema<T>` is the builder base class; `Infer<typeof S>` extracts the TypeScript type from a schema; `SchemaInput = JsonSchema \| Schema<unknown>` is the union every `validate*` middleware accepts |
| `Schema.parse()` / `.safeParse()` | methods | sync | Validate ad-hoc data inside services (queue messages, webhooks, cron jobs). `.parse()` throws `BadRequestException` with `metadata.errors`; `.safeParse()` returns a result object |
| `JsonSchema` | type | â€” | Permissive alias for any JSON Schema 2020-12 object â€” the escape hatch for hand-written or generated schemas. Middlewares accept both `s.*` builders and raw `JsonSchema` |
| `validateBody` `validateQuery` `validateHeaders` `validateCookies` `validatePathParams` | middleware factories | â€” | Take a `SchemaInput`, validate the corresponding request slot at runtime, contribute the schema to the OpenAPI doc, auto-document `400`. Query/header/cookie/path coerce strings â†’ typed values. See [docs/api-middlewares.md](./docs/api-middlewares.md) |
| `validateContentType()` | middleware factory | â€” | Guards `Content-Type` to a set of allowed media types. Throws `UnsupportedMediaTypeException` (415); auto-documents `415` |
| `requireAuth()` | middleware factory | â€” | Auth guard. Looks up the verifier in `config.openapi.auth[scheme]` (or per-call `verify` override), populates `req.user`, throws `UnauthorizedException`. Auto-emits `security` + `401` |
| `requireRoles()` / `authorize()` | middleware factories | â€” | Role / scope check against `req.user`. Throws `ForbiddenException`. Auto-emits `403`; scopes merge onto the preceding auth scheme |
| `validateJsonSchema()` | function | sync | The framework's built-in JSON Schema validator. Subset of 2020-12 â€” see [docs/schemas.md](./docs/schemas.md). Plug a full validator (e.g. AJV, Zod) via `defineConfig({ schemaValidator })` |
| `attachOpenApiMeta()` / `readOpenApiMeta()` | functions | sync | Lets you author **your own self-documenting middleware** â€” attach an `OpenApiMiddlewareMeta` annotation so it contributes to `/spec` just like the built-ins |
| `reply()` | function | sync | Return-value wrapper for handlers. `return reply(data, { status, headers, mediaType })` overrides the framework's defaults. Without it, returning a value JSON-encodes with status from `responses` (single `2xx`) or `200` |
| `HandlerContext` / `HandlerContextOf` / `TypedHandler` | types | â€” | `HandlerContext<TService, Ctx>` is the destructured handler argument; `HandlerContextOf<MWs>` derives `Ctx` from a middleware tuple; `TypedHandler<K, T>` brands custom middlewares so they participate in context inference |
| `EventType`, `SecurityEvents`, `SystemEvent`, `AuditEvents`, `AuthOutcome`, `EventSeverity` | enums | â€” | Discriminators for typed structured logs (see [Automatic Event Logging](#automatic-event-logging)) |
| `THROTTLE_CONFIG` | constant | â€” | Rate limit presets: `SECURITY`, `STRICT`, `STANDARD`, `PERMISSIVE`, `EXTRA_PERMISSIVE` |
| `*Exception` | classes | â€” | 15 HTTP exception classes (400â€“504), including `UnsupportedMediaTypeException` (415). Throw anywhere, caught by framework |

**Lifecycle:** `defineConfig()` â†’ `defineController()` â†’ `defineModule()` â†’ `app.listen()`

**Single source of truth for schemas:** the same `s.*` schema you pass to `validateBody` / `validateQuery` / etc. is what shows up in `GET /spec` *and* what `Infer<typeof Schema>` types your DTOs from *and* what `Schema.parse()` validates inside services. One declaration, four surfaces, no drift. See [docs/schemas.md](./docs/schemas.md) for the full CRUD recipe and the chain-method matrix.

## Core API

### `defineConfig(options)`

Registers application configuration. Call once at the top of your entry point.

```typescript
import 'dotenv/config';
import { defineConfig } from 'superman';

defineConfig({
  port: 3000,                          // static number
  port: { env: 'PORT', default: 3000 },// or from env var with fallback
  prefix: '/api',                      // prepended to all module prefixes
  jsonLimit: '10mb',                   // Express JSON body limit

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
    consoleOutput: {
      enabled: true,                  // default: enabled â€” silences ALL console output (free-form + events) when false
      enableEventDebug: true,       // default: false â€” when true, prints event JSON bodies to the dev console
    },
  },

  openapi: {                          // OpenAPI 3.1 security schemes + verifiers + global default
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    security: [{ bearerAuth: [] }],   // applied to every operation unless overridden per-controller
    auth: {                            // verifiers consulted by `requireAuth('bearerAuth')`
      bearerAuth: async (req) => {
        const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
        const claims = await verifyJwt(token);
        return { id: claims.sub, roles: claims.roles ?? [] };
      },
    },
  },
});
```

### `config`

Singleton with resolved configuration. Available after `defineConfig()`.

```typescript
import { config } from 'superman';

config.port                  // number
config.prefix                // string (e.g. '/api')
config.jsonLimit             // string
config.environment           // 'development' | 'staging' | 'production' | ...
config.endpoints.api         // resolved for active environment
config.env.MY_VAR            // validated env var value (direct record access)
config.get('MY_VAR')         // same value â€” idiomatic getter; returns `string | undefined`
config.isProduction()        // boolean
config.isInitialized()       // boolean
```

### `defineController<TService>(options)`

Generic factory that returns a `ControllerFactory<TService>`. The handler receives `(req, res, service)` â€” the service is injected by `defineModule` at registration time.

```typescript
import {
  defineController,
  validateBody, validateQuery, validateHeaders, validateCookies, validatePathParams,
  validateContentType,
  requireAuth, requireRoles,
  s,
} from 'superman';

const createPostController = defineController<IPostsService>({
  middlewares: [
    requireAuth('bearerAuth'),                                                   // â†’ security + auto 401
    requireRoles('author', 'admin'),                                             // â†’ scopes + auto 403
    validateContentType('application/json'),                                     // â†’ content keys + auto 415
    validateHeaders(TenancyHeaders),                                             // â†’ header parameters + auto 400
    validateBody(CreatePostBody, { message: 'Please supply a valid post payload.' }),  // â†’ requestBody + auto 400 with custom message
  ],
  throttleConfig: 'STANDARD',                                                    // preset or { limit, ttl }
  operationId: 'createPost',
  summary: 'Create a post',
  deprecated: false,
  responses: {
    201: {
      schema: PostResponse,
      headers: {                                 // `X-RateLimit-Remaining` is auto-injected; declare only custom ones
        'X-Request-Id': { schema: s.string(), description: 'Correlation id echoed back.' },
      },
    },
  },
  errors: [                                      // beyond the auto-injected 400/401/403/415/429/500
    { status: 404, description: 'Author not found.' },
    {
      status: 422,
      description: 'Validation failed.',
      metadataSchema: s.object({ field: s.string() }),
    },
  ],
  handler: async ({ body, user, service }) =>                                    // typed: body=CreatePostDto, user=Principal
    service.create({ ...body, authorId: user.id }),
});
```

The middlewares are the single source of truth: each one validates at runtime *and* contributes its schema/security/error status to the OpenAPI doc. No `request:` field on the controller â€” request shape lives entirely on the middleware list.

**Parameters.** `query` / `headers` / `cookies` schemas passed to the corresponding `validate*` middleware are object schemas (`s.object({...})` or raw JSON Schema). Each top-level property becomes one OpenAPI parameter; properties listed in `required[]` are marked required. Path parameters (`/:id`) are extracted automatically; pass them to `validatePathParams(schema)` if you want type coercion (e.g. `id` must be a UUID) and richer documentation. Standard headers (`Authorization`, `Accept`, `Content-Type`) cannot be declared as parameters under OpenAPI 3.1 â€” use `requireAuth(...)` and `validateContentType(...)` for those.

**Multi-media-type request bodies** â€” pass `validateBody` a media-type map:

```typescript
validateBody({
  'application/json':    UserJsonBody,
  'multipart/form-data': UserMultipartBody,
})
```

**Multi-media-type responses** on the same status:

```typescript
responses: {
  200: {
    description: 'User',
    content: {
      'application/json': { schema: UserResponse, example: { id: '1' } },
      'application/xml':  { schema: s.string(),  example: '<user><id>1</id></user>' },
    },
  },
},
```

**Streaming (SSE / NDJSON / file downloads)** â€” just another media type:

```typescript
responses: {
  200: {
    description: 'SSE stream of order updates.',
    content: {
      'text/event-stream': {
        schema: OrderEvent,
        example: 'data: {"orderId":"123","status":"shipped"}\n\n',
      },
    },
  },
},
```

**Custom schema validator** â€” if you need keywords beyond the built-in subset (e.g. `$ref`, `patternProperties`, full Zod refinements), plug in AJV / Zod / any compatible validator via `defineConfig({ schemaValidator })`. All `validate*` middlewares delegate to it transparently; the `s.*` authoring surface keeps working since builders serialise to plain JSON Schema.

### `defineModule(options)`

Declares a module with routes. The module is queued and registered automatically when `app.listen()` is called. Routes receive built `SupermanController` instances â€” call your `defineController` factories with the service implementation in the routes array.

```typescript
import { defineModule } from 'superman';

const ordersService = new OrdersService(new OrdersRepository(db));

defineModule({
  name: 'OrdersModule',
  prefix: '/orders',
  routes: [
    { method: 'GET',  path: '/',    controller: listOrdersController(ordersService) },
    { method: 'GET',  path: '/:id', controller: findOrderController(ordersService) },
    { method: 'POST', path: '/',    controller: createOrderController(ordersService) },
  ],
  middlewares: [requireAuth],  // applied to all routes in this module
  destroy: async () => {       // called on graceful shutdown
    await closeConnections();
  },
});
```

### `app`

The application singleton. No need to instantiate â€” it's created by the framework.

```typescript
import { app } from 'superman';

// Add global middleware
app.useMiddleware(cors());

// Start the server (flushes all queued modules, then listens)
app.listen(() => { /* optional callback */ });

// Graceful shutdown (calls destroy() on all modules)
await app.shutdown(); // async â€” awaits all module destroy functions
```

### `logger`

Two APIs on one singleton:

**Free-form methods** â€” colored console output for developer messages.
Controlled by `LOG_LEVEL`.

```typescript
import { logger } from 'superman';

logger.info('App started', { port: 3000 });

const log = logger.child('MyService');
log.debug('Processing', { id: '123' });
log.warn('Slow query', { duration: '500ms' });
log.error('Failed', { error: err });
```

**Log levels:** `debug` | `info` | `warn` | `error` | `silent`

- `NODE_ENV=production` defaults to `info`
- `NODE_ENV=test` defaults to `silent`
- Otherwise defaults to `debug`
- `LOG_LEVEL` overrides all defaults

**Typed events** â€” structured JSON logs that match `SystemLog`, `RequestLog`,
`ResponseLog`, `ErrorLog`, `AuditLog`, `SecurityLog`. Goes through the
configured sinks (console + file) and respects `logger.enabledEventTypes`.

```typescript
import { logger, SecurityEvents, AuthOutcome, EventSeverity } from 'superman';

logger.events.security({
  ip: req.ip,
  traceId: res.locals.traceId,
  requestId: res.locals.requestId,
  securityEvent: SecurityEvents.LOGIN_FAILED,
  authOutcome: AuthOutcome.DENIED,
  securityMessage: `Invalid password for ${email}`,
  eventSeverity: EventSeverity.WARN,
});
```

Infra fields (`@timestamp`, `appName`, `appVersion`, `environment`,
`serverInstanceUid`, `hostname`, `uptimeMs`, `memoryUsage`, `cpuUsage`,
`context`) are filled in automatically. See [Automatic Event Logging](#automatic-event-logging)
for the full event model, the status-code â†’ security mapping, and file
layout.

## What Happens Automatically

- **Request logging** â€” incoming/outgoing requests with method, URL, status, duration
- **Exception handling** â€” `HttpException` subclasses return structured JSON; unhandled errors return 500
- **Rate limiting** â€” every controller has per-IP throttling (configurable per controller)
- **Startup banner** â€” instance UID, port, environment, debug level, registered modules
- **Structured event logs** â€” every request, response, error, mutation, security-relevant status, and lifecycle signal is emitted as a typed log (see [Automatic Event Logging](#automatic-event-logging) below)

```
14:32:05.123 INFO  [App] ----------------------------------------
14:32:05.123 INFO  [App] Server started at 2026-04-13T14:32:05.123Z
14:32:05.123 INFO  [App] Instance UID : a1b2c3d4-e5f6-7890-abcd-ef1234567890
14:32:05.123 INFO  [App] Port         : 3000
14:32:05.123 INFO  [App] Environment  : development
14:32:05.123 INFO  [App] Debug Level  : debug
14:32:05.123 INFO  [App] Modules      : 1 registered
14:32:05.123 INFO  [App]   -> UsersModule on /api/users
14:32:05.123 INFO  [App] ----------------------------------------
```

## Auto-Generated OpenAPI Spec

The framework exposes a single `GET {prefix}/spec` route that returns a valid **OpenAPI 3.1.0** document describing every registered module and route. It is built from your `defineModule` / `defineController` declarations at request time, so it never drifts out of sync with the code.

```
GET /api/spec
```

> **Interactive docs UI (opt-in).** Set `openapi.docs.enabled: true` in `defineConfig` to also expose `GET {prefix}/docs` â€” a Scalar HTML rendering of the same document (endpoints grouped by module/tag in the sidebar, schemas, parameters, "Send API Request" panel). The default page is fully rendered out of the box â€” **no template engine required**. Need full control? Plug a Pug/EJS/Handlebars template via `openapi.docs.template`. Toggle without redeploys via the `DOCS=true/false` env var (wins over `defineConfig`); production requests get a plain-text 503 unless `exposeInProduction: true`. See [`openapi.docs` in docs/api-config.md](./docs/api-config.md#openapidocs--built-in-interactive-docs-ui).

```json
{
  "openapi": "3.1.0",
  "info": { "title": "my-service", "version": "1.2.3" },
  "tags": [
    { "name": "UsersModule" },
    { "name": "ExampleModule" }
  ],
  "paths": {
    "/api/example/authorize": {
      "post": {
        "tags": ["ExampleModule"],
        "summary": "Authorize a new example resource",
        "operationId": "authorizeExample",
        "x-rate-limit": { "preset": "STRICT", "limit": 10, "ttl": 60000 },
        "security": [{ "bearerAuth": [] }],
        "parameters": [
          { "name": "X-Tenant-Id",     "in": "header", "required": true,  "schema": { "type": "string" } },
          { "name": "Idempotency-Key", "in": "header", "required": false, "schema": { "type": "string" } }
        ],
        "requestBody": {
          "required": true,
          "description": "Example payload",
          "content": {
            "application/json": {
              "schema":  { "type": "object", "properties": { "...": "..." } },
              "example": { "...": "..." }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Example authorized",
            "content": { "application/json": { "schema": { "...": "..." } } },
            "headers": {
              "X-RateLimit-Remaining": { "schema": { "type": "integer" } },
              "Retry-After":           { "schema": { "type": "integer" } }
            }
          },
          "401": { "description": "Authentication required or invalid.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/FrameworkError" } } } },
          "422": {
            "description": "Validation failed.",
            "content": { "application/json": { "schema": { "allOf": [
              { "$ref": "#/components/schemas/FrameworkError" },
              { "type": "object", "properties": { "metadata": { "type": "object", "properties": { "field": { "type": "string" } } } } }
            ] } } }
          },
          "429": { "description": "Rate limit exceeded â€” too many requests.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/FrameworkError" } } } },
          "500": { "description": "Internal server error.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/FrameworkError" } } } },
          "default": { "description": "Standard framework error envelope.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/FrameworkError" } } } }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "FrameworkError": {
        "type": "object",
        "description": "Standard error envelope emitted by the global exception handler for any caught HttpException or uncaught runtime error.",
        "properties": {
          "error": { "type": "string" },
          "metadata": { "type": "object", "additionalProperties": true }
        },
        "required": ["error"],
        "example": { "error": "Validation failed", "metadata": { "field": "email" } }
      }
    },
    "securitySchemes": {
      "bearerAuth": { "type": "http", "scheme": "bearer", "bearerFormat": "JWT" }
    }
  }
}
```

Highlights:

- **`info.title` / `info.version`** are read from `process.env.npm_package_name` / `npm_package_version` (set automatically when starting via `npm`/`yarn` scripts), falling back to `'API'` / `'1.0.0'`.
- **`429`, `500`, and `default`** responses are auto-injected on every operation. When security is required, `401` is auto-injected too. All reference the shared `FrameworkError` schema.
- **`errors[].metadataSchema`** in `defineController` is rendered as `allOf [FrameworkError, { metadata: <your-schema> }]`, so consumers know exactly what to expect inside `metadata`.
- **`x-rate-limit`** vendor extension exposes each route's throttle budget so clients can pace themselves.
- **Parameters** â€” path (`/:id` â†’ `/{id}`), query, request-headers, and cookies are all emitted; each top-level property of the corresponding object schema becomes one parameter.
- **Response headers** are documented under each Response Object's `headers` map.
- **Security** â€” schemes declared in `defineConfig.openapi.securitySchemes` flow to `components.securitySchemes`; per-op `security` (or the config-level default) attaches the requirement.
- **Schemas, examples, and descriptions** are forwarded straight from your JSON Schema inputs â€” the schema is the single source of truth.

Drop the JSON into Swagger Editor, Redoc, Postman, Insomnia, or any OpenAPI-aware codegen tool.

### Adding descriptions to routes

Pass an optional `description` to any route in `defineModule`:

```typescript
defineModule({
  name: 'ExampleModule',
  prefix: '/example',
  routes: [
    {
      method: 'POST',
      path: '/authorize',
      controller: createAuthorizeController(exampleService),
      description: 'Authorize a new example resource',
    },
  ],
});
```

### Using spec for AI-assisted development

The `/spec` endpoint is a machine-readable contract of your entire API. You can use it to accelerate AI-assisted development:

- **Client generation** â€” Pass the spec JSON to an AI in plan mode and ask it to generate a typed HTTP client, SDK, or frontend service layer. The AI has every route, method, path, and rate limit â€” it can produce deterministic, correct code without reading the server source.
- **Test generation** â€” Give the spec to an AI and ask it to generate integration tests for every endpoint. The throttle config tells it exactly how many requests it can make before hitting 429.
- **Documentation** â€” Feed the spec into an AI to generate human-readable API docs, Postman collections, or OpenAPI schemas.
- **Cross-service contracts** â€” When building microservices, the spec of one service can be passed to an AI building another service's client. The contract is always up-to-date because it's generated from the actual running code.
- **Code review** â€” An AI reviewing a PR can fetch `/spec` before and after the change to understand exactly what API surface changed.

Since the spec is auto-generated from your `defineModule` and `defineController` declarations, it never drifts out of sync with the actual implementation. It's the single source of truth for your API surface.

## Automatic Event Logging

The framework emits six categories of **typed, structured logs** out of the box.
Every HTTP request, every exception, every resource mutation, every
security-relevant status code, and every lifecycle transition is captured as a
JSON object that matches one of the `*Log` interfaces in
`superman` â€” no application code required.

### Enabling

```typescript
import { defineConfig, EventType } from 'superman';

defineConfig({
  port: 3000,
  logger: {
    enabledEventTypes: [
      EventType.SYSTEM, EventType.REQUEST, EventType.RESPONSE,
      EventType.ERROR, EventType.AUDIT, EventType.SECURITY,
    ],
    fileOutput: { enabled: true, directory: '/var/log/superman' },
    consoleOutput: { enabled: true },
  },
});
```

**Defaults:** all six event types enabled, console output ON, file output OFF.
Pass a subset of `enabledEventTypes` to silence categories you don't need (e.g.
only `SECURITY` + `ERROR` for low-volume security audit trails).

### Event types

| Event      | When it fires                                                  | Shape            |
|------------|----------------------------------------------------------------|------------------|
| `SYSTEM`   | Server start, manual shutdown, SIGTERM/SIGINT received        | `SystemLog`      |
| `REQUEST`  | Every incoming HTTP request                                    | `RequestLog`     |
| `RESPONSE` | Every completed HTTP response                                  | `ResponseLog`    |
| `ERROR`    | Every caught exception (HTTP and runtime)                      | `ErrorLog`       |
| `AUDIT`    | Successful mutations â€” POST/PUT/PATCH/DELETE with 2xx status   | `AuditLog`       |
| `SECURITY` | 401, 403, 413, 422, 429 responses (auto-mapped)                | `SecurityLog`    |

### Status â†’ security event mapping

| HTTP status | `securityEvent`           | `authOutcome`            |
|-------------|---------------------------|--------------------------|
| 401         | `UNAUTHORIZED_ACCESS`     | `DENIED`                 |
| 403         | `FORBIDDEN_ACTION`        | `DENIED`                 |
| 413         | `PAYLOAD_TOO_LARGE`       | `DENIED`                 |
| 422         | `MALFORMED_PAYLOAD`       | `DENIED`                 |
| 429         | `RATE_LIMIT_EXCEEDED`     | `BLOCKED_TEMPORARILY`    |

### Method â†’ audit event mapping

| Method  | Status | `auditEvent`          |
|---------|--------|-----------------------|
| POST    | 2xx    | `RESOURCE_CREATED`    |
| PUT     | 2xx    | `RESOURCE_UPDATED`    |
| PATCH   | 2xx    | `RESOURCE_UPDATED`    |
| DELETE  | 2xx    | `RESOURCE_DELETED`    |

The `resource` is inferred from the first URL segment after your `prefix`
(e.g. `POST /api/users` â†’ `resource: "users"`), and `resourceId` from
`req.params.id` when present.

### File layout

When `fileOutput.enabled` is `true`, one NDJSON file is created per event type
per day:

```
/var/log/superman/
  system-logs-2026-04-17.log
  error-logs-2026-04-17.log
  request-logs-2026-04-17.log
  response-logs-2026-04-17.log
  audit-logs-2026-04-17.log
  security-logs-2026-04-17.log
```

Each line is a single JSON object â€” ready for Filebeat / Fluentd / Vector /
Datadog agent ingestion. The `directory` option accepts both absolute
(`/var/log/superman`) and relative (`./logs`, `logs`) paths. If the process
lacks permission to create the directory, the file sink disables itself with a
single diagnostic and the app keeps running â€” it never crashes your service.

### Request / Trace IDs

Every incoming request is tagged with a `X-Request-Id` header (generated via
`crypto.randomUUID()` when absent, honoured when the client supplies one). The
id is echoed back on the response and attached to every log line for the same
request â€” so you can trace `REQUEST â†’ RESPONSE â†’ AUDIT â†’ SECURITY â†’ ERROR`
across logs with a single grep. `X-Trace-Id` is also honoured when present
(falls back to `requestId` otherwise).

### Emitting your own events

The typed emitter is also available for app-level logs via
`logger.events.*`:

```typescript
import { logger, SecurityEvents, AuthOutcome, EventSeverity } from 'superman';

const log = logger.child('Auth');

log.events.security({
  ip: req.ip,
  traceId: res.locals.traceId,
  requestId: res.locals.requestId,
  securityEvent: SecurityEvents.LOGIN_FAILED,
  authOutcome: AuthOutcome.DENIED,
  securityMessage: `Invalid password for ${email}`,
  eventSeverity: EventSeverity.WARN,
});
```

The emitter fills in infra fields automatically (`@timestamp`, `appName`,
`appVersion`, `environment`, `serverInstanceUid`, `hostname`, `uptimeMs`,
`memoryUsage`, `cpuUsage`, `context`) and respects your
`enabledEventTypes` filter.

### Graceful shutdown

On `SIGTERM` / `SIGINT` the framework emits a `SYSTEM_SIGNAL_RECEIVED` event,
runs every module's `destroy()`, and flushes all file streams before calling
`process.exit(0)` â€” no truncated NDJSON lines on deployment.

## MCP Server (AI tools)

The framework can host a [Model Context Protocol](https://modelcontextprotocol.io)
server alongside the regular HTTP API. Turn it on:

```ts
defineConfig({
  // ...
  mcpServer: { enabled: true }, // or set MCP_ENABLED=true
});
```

Register tools anywhere:

```ts
import { mcpServer } from 'superman';
import { z } from 'zod';

mcpServer.registerTool(
  'lookup_customer_by_id',
  { title: 'Lookup customer', description: 'Fetch a customer by id.',
    inputSchema: { id: z.string().describe('Customer id') } },
  async ({ id }) => ({ content: [{ type: 'text', text: await fetch(`/api/customers/${id}`).then(r => r.text()) }] }),
);
```

The framework auto-registers `POST {prefix}/mcp` with Streamable HTTP transport,
audit events (`MCP_SESSION_STARTED` / `MCP_TOOL_EXECUTED`), and an OpenAPI entry.
Install `@modelcontextprotocol/sdk` in the consumer.

Full guide: [`docs/mcp-server.md`](./docs/mcp-server.md).

## Rate Limiting

Every controller has built-in per-IP rate limiting. Configure via `throttleConfig` in `defineController`.

| Preset | Limit | TTL | Use case |
|---|---|---|---|
| `SECURITY` | 5 req | 60s | Login, password reset, MFA |
| `STRICT` | 10 req | 60s | Write operations, payments |
| `STANDARD` | 100 req | 60s | General API endpoints (default) |
| `PERMISSIVE` | 1,000 req | 60s | High-traffic reads |
| `EXTRA_PERMISSIVE` | 10,000 req | 60s | Public assets, health checks |

When a client exceeds the limit, the framework returns HTTP 429 with a `Retry-After` header. Every response includes `X-RateLimit-Remaining`.

Custom config:

```typescript
defineController<IPostsService>({
  throttleConfig: { limit: 3, ttl: 300_000 },                   // 3 requests per 5 minutes
  handler: async ({ service }) => service.findAll(),
});
```

## Middleware

### Per-Controller

```typescript
defineController<ICommentsService>({
  middlewares: [
    requireAuth('bearerAuth'),
    validatePathParams(PostIdParam),                            // â†’ params: { postId }
    validateBody(CreateCommentBody),
  ],
  responses: { 201: { schema: CommentResponse } },
  handler: async ({ postId, body, user, service }) =>           // flat: postId from params
    service.create(postId, { ...body, authorId: user.id }),
});
```

Middlewares run after rate limiting and before the handler. If a middleware throws an `HttpException`, the chain stops.

### Per-Module

```typescript
defineModule({
  name: 'AdminModule',
  prefix: '/admin',
  routes: [/* ... */],
  middlewares: [requireAuth], // applied to all routes
});
```

## Exceptions

Throw anywhere in handlers or middleware â€” the framework catches and formats the response.

```typescript
import { NotFoundException, BadRequestException } from 'superman';

throw new NotFoundException('Order not found');
// -> 404 { "error": "Order not found" }

throw new BadRequestException('Invalid email');
// -> 400 { "error": "Invalid email" }
```

| Class | Status |
|---|---|
| `BadRequestException` | 400 |
| `UnauthorizedException` | 401 |
| `ForbiddenException` | 403 |
| `NotFoundException` | 404 |
| `ConflictException` | 409 |
| `GoneException` | 410 |
| `PayloadTooLargeException` | 413 |
| `UnprocessableEntityException` | 422 |
| `TooManyRequestsException` | 429 |
| `InternalServerErrorException` | 500 |
| `NotImplementedException` | 501 |
| `BadGatewayException` | 502 |
| `ServiceUnavailableException` | 503 |
| `GatewayTimeoutException` | 504 |

## Project Structure

```
src/
  server.config.ts              # defineConfig()
  server.ts                     # main + app.listen()
  modules/
    users/
      users.module.ts           # defineModule()
      controllers/
        users.controllers.ts    # defineController() factories
      middlewares/
        users.middlewares.ts     # Zod validation, auth guards
      services/
        users.service.ts        # implements IUsersService
        users.service.interface.ts
      repositories/
        users.repository.ts     # implements IUsersRepository
      schemas/
        users.schemas.ts        # Zod schemas
```

## NPM Scripts for Consumer Projects

A project consuming `superman` only needs four scripts. The single `start` script covers **development**, **staging**, and **production** because the framework resolves per-env behaviour at runtime via `NODE_ENV` â€” one build, three environments.

```jsonc
{
  "scripts": {
    "dev":   "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test":  "jest"
  }
}
```

| Script | Command | When to run |
|--------|---------|-------------|
| `dev`   | `tsx watch src/server.ts` | Local dev loop â€” TS direct, reload on save |
| `build` | `tsc`                     | Compile to `dist/` before deploying |
| `start` | `node dist/server.js`     | Run the compiled artifact; inherits `NODE_ENV` from the shell / orchestrator |
| `test`  | `jest`                    | Unit tests (colocation, `*.test.ts`) |

```bash
npm run dev                                      # development
npm run build
NODE_ENV=staging npm start                       # staging â€” loads environments.staging.endpoints
NODE_ENV=production LOG_LEVEL=info npm start     # production
```

Full explanation â€” why one `start` is enough, why `tsc` (not `tsup`) for consumer apps, Jest + ts-jest setup, and a full example test â€” in [docs/scripts.md](./docs/scripts.md).

## Framework Development

Scripts on this repo (for working on the framework itself):

```bash
npm run build     # Compile TypeScript via tsup
npm run dev       # Watch mode
npm test          # Run the framework's own 230+ tests
npm publish       # Publish to registry
```

