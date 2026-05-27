# Modules

## `defineModule(options)`

Declares a module with routes. The module is queued and registered automatically when `app.listen()` is called. Routes receive built `SupermanController` instances — call your `defineController` factories with the service implementation in the routes array.

```typescript
import { defineModule, requireAuth } from '@supersec-ai/superman';

const postsService = new PostsService(new PostsRepository(db));

defineModule({
  name: 'PostsModule',
  prefix: '/posts',
  routes: [
    { method: 'GET',  path: '/',    controller: listPostsController(postsService) },
    { method: 'GET',  path: '/:id', controller: findPostController(postsService) },
    { method: 'POST', path: '/',    controller: createPostController(postsService) },
  ],
  middlewares: [requireAuth('bearerAuth')],   // applied to all routes in this module
  destroy: async () => {                       // called on graceful shutdown
    await closeConnections();
  },
});
```

## Per-Module Middleware

```typescript
defineModule({
  name: 'AdminModule',
  prefix: '/admin',
  routes: [/* ... */],
  middlewares: [requireAuth('bearerAuth')],   // applied to all routes
});
```

## Auto-Generated OpenAPI Spec

The framework automatically exposes a single `GET {prefix}/spec` route that returns a valid **OpenAPI 3.1.0** document describing every registered module and route. The document is built from your `defineModule` / `defineController` declarations at request time — it never drifts out of sync with the code.

```
GET /api/spec
```

> **Interactive docs UI.** Set `openapi.docs.enabled: true` in `defineConfig` to also expose `GET {prefix}/docs` — a Scalar HTML rendering of the same document (sidebar of endpoints + schemas, content pane with summary/parameters/responses, "Send API Request" panel on the right). Disabled by default. See [`openapi.docs` in api-config.md](./api-config.md#openapidocs--built-in-interactive-docs-ui) for all options and the Pug/EJS template-engine plug-in.

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
          { "name": "X-Tenant-Id", "in": "header", "required": true, "schema": { "type": "string" } }
        ],
        "requestBody": {
          "required": true,
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
              "X-RateLimit-Remaining": { "schema": { "type": "integer" } }
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
          "429": { "description": "Rate limit exceeded — too many requests.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/FrameworkError" } } } },
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
        "example": { "error": "Validation failed", "metadata": { "field": "email", "errorId": "err_3f2a9c8e" } }
      }
    },
    "securitySchemes": {
      "bearerAuth": { "type": "http", "scheme": "bearer", "bearerFormat": "JWT" }
    }
  }
}
```

Highlights:

- **`info.title` / `info.version`** are read from `process.env.npm_package_name` / `npm_package_version` (set automatically when starting the app via `npm`/`yarn` scripts), falling back to `'API'` / `'1.0.0'`.
- **`429`, `500`, `default`** responses are auto-injected on every operation. `401` is also auto-injected when security is required.
- **`x-rate-limit`** is a vendor extension carrying the route's throttle config so consumers know the rate-limit budget for each endpoint.
- **Parameters** — path (`/:id` ➡️ `/{id}`), query, request headers, and cookies are all emitted from controller `request.{query,headers,cookies}` object schemas.
- **Response headers** are documented under each Response Object's `headers` map.
- **Security** — schemes declared in `defineConfig.openapi.securitySchemes` flow to `components.securitySchemes`; per-op `security` (or the config-level default) attaches the requirement.
- **Schemas, examples, and descriptions** are forwarded straight from your JSON Schema inputs — the schema is the single source of truth.

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

- **Client generation** — Pass the spec JSON to an AI in plan mode and ask it to generate a typed HTTP client, SDK, or frontend service layer. The AI has every route, method, path, and rate limit — it can produce deterministic, correct code without reading the server source.
- **Test generation** — Give the spec to an AI and ask it to generate integration tests for every endpoint. The throttle config tells it exactly how many requests it can make before hitting 429.
- **Documentation** — Feed the spec into an AI to generate human-readable API docs, Postman collections, or OpenAPI schemas.
- **Cross-service contracts** — When building microservices, the spec of one service can be passed to an AI building another service's client. The contract is always up-to-date because it's generated from the actual running code.
- **Code review** — An AI reviewing a PR can fetch `/spec` before and after the change to understand exactly what API surface changed.

Since the spec is auto-generated from your `defineModule` and `defineController` declarations, it never drifts out of sync with the actual implementation. It's the single source of truth for your API surface.

