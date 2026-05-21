# Middlewares

The framework ships a set of **self-documenting middlewares** that do two things at once:

1. **Validate / guard the incoming request at runtime** â€” throwing the right `HttpException` when something is wrong.
2. **Contribute their own piece of the OpenAPI 3.1 spec** â€” request body schemas, parameter entries, security requirements, allowed content types, auto-error responses.

There's no parallel `request: { body, query, headers }` declaration on the controller. The middleware *is* the source of truth. A schema and a guard can't drift apart because they're the same object.

```typescript
import {
  s, defineController,
  validateBody, validateQuery, validateHeaders, validateCookies, validatePathParams,
  validateContentType,
  requireAuth, requireRoles,
} from 'superman';

defineController<IPostsService>({
  middlewares: [
    requireAuth('bearerAuth'),                                                   // â†’ user: Principal
    requireRoles('author', 'admin'),
    validateContentType('application/json'),
    validateHeaders(TenancyHeaders),
    validatePathParams(PostIdParam),                                             // â†’ params: { postId }
    validateBody(UpdatePostBody, { message: 'Please supply a valid post payload.' }),
  ],
  responses: { 200: { schema: PostResponse } },
  handler: async ({ postId, body, user, service }) =>                            // flat: postId; body=UpdatePostDto
    service.update(postId, body, user.id),
});
```

Every `validate*` middleware accepts either an `s.*` builder (recommended â€” see [docs/schemas.md](./schemas.md)) or a plain JSON Schema object.

**Custom exception message.** All `validate*` middlewares accept an optional second argument `{ message }` that overrides the default exception message â€” the `metadata` field (validation errors, supported types, etc.) is preserved.

```typescript
validateBody(CreatePostBody,    { message: 'Please supply a valid post payload.' })
validateQuery(ListPostsQuery,   { message: 'Invalid pagination on /posts.' })
validateHeaders(TenancyHeaders, { message: 'Missing tenant context.' })
validatePathParams(PostIdParam, { message: 'Bad post id format.' })
validateContentType({ types: ['application/json'], message: 'This endpoint only accepts JSON.' })
```

> **Typed handler context.** Each shipped middleware also **brands its return type** so `defineController`'s handler argument is automatically typed. `validateBody(CreatePostBody)` produces a `body: Infer<typeof CreatePostBody>` slot, `validatePathParams(PostIdParam)` produces `params`, `requireAuth` produces `user: Principal`, and so on. The same body/query/params/headers/cookies *leaf* properties are also spread at the context root (precedence `params > body > query > headers > cookies`) so handlers can destructure values directly: `async ({ postId, title, content, user, service }) => ...`. Users writing custom self-documenting middlewares can opt into this by returning `TypedHandler<'body' | 'query' | â€¦, T>` instead of a plain `RequestHandler`. See [docs/api-controllers.md](./api-controllers.md#handler-shapes).

## At a glance

| Middleware | Runtime effect | Throws | Auto-OpenAPI contribution |
|---|---|---|---|
| [`validateBody`](#validatebody) | Validates `req.body` against a schema (or media-type map). | `BadRequestException` w/ `metadata.errors` | `requestBody.content`, auto `400` |
| [`validateQuery`](#validatequery) | Validates `req.query` and **coerces** strings â†’ typed values. | same | `parameters[in: 'query']`, auto `400` |
| [`validateHeaders`](#validateheaders) | Validates `req.headers` and coerces. | same | `parameters[in: 'header']`, auto `400` |
| [`validateCookies`](#validatecookies) | Validates `req.cookies` and coerces. | same | `parameters[in: 'cookie']`, auto `400` |
| [`validatePathParams`](#validatepathparams) | Validates `req.params`, refines `:id` defaults. | same | refined path-param schemas, auto `400` |
| [`validateContentType`](#validatecontenttype) | Rejects mismatched `Content-Type`. | `UnsupportedMediaTypeException` (415) | `requestBody.content` keys, auto `415` |
| [`requireAuth`](#requireauth) | Runs a verifier, populates `req.user`. | `UnauthorizedException` (401) | `security: [{ scheme: [] }]`, auto `401` |
| [`requireRoles` / `authorize`](#requirerolesauthorize) | Checks `req.user.roles` / scopes. | `ForbiddenException` (403) | scopes merge onto preceding auth scheme, auto `403` |

The framework **always** auto-injects `429` (rate-limit), `500` (uncaught error), `default` (catch-all), the `X-RateLimit-Remaining` response header on every response, and the `Retry-After` response header on `429` â€” regardless of which middlewares are present.

---

## Validation middlewares

### `validateBody`

**Signature**
```typescript
validateBody(
  schemaOrMediaMap: SchemaInput | Record<string, SchemaInput>,
  options?: { message?: string },
): RequestHandler
type SchemaInput = JsonSchema | Schema<unknown>   // accepts s.* builders or raw JSON Schema
```

**Behaviour**
- Validates `req.body` against the supplied schema. **No coercion** (JSON bodies are already typed).
- On failure, throws `BadRequestException('Request body validation failed.', { errors })` where `errors` is `Array<{ path, keyword, message }>`.
- Accepts either a single schema (defaults to `application/json`) **or** a media-type â†’ schema map. With the map form, the middleware picks the right schema from the incoming `Content-Type`.

**Single-schema form (recommended â€” `s.*` builder)**
```typescript
validateBody(s.object({
  name:  s.string().min(1),
  email: s.string().email(),
}))
```

**Single-schema form (raw JSON Schema)**
```typescript
validateBody({
  type: 'object',
  properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' } },
  required: ['name', 'email'],
  additionalProperties: false,
})
```

**Multi-media-type form**
```typescript
validateBody({
  'application/json':    CreateUserJsonSchema,        // s.object({...}) or raw
  'multipart/form-data': CreateUserMultipartSchema,
})
```

**OpenAPI emission**
- Single form â†’ `requestBody.content['application/json'].schema = <your schema>`
- Map form â†’ one entry per media type under `requestBody.content`
- Always adds a `400` response referencing `FrameworkError` with `metadata: { errors }`.

**Why no coercion?** Bodies arrive parsed by `express.json()` / `multer` / etc â€” numbers are already numbers, booleans are booleans. Coercion would mask real client bugs.

---

### `validateQuery`

**Signature**
```typescript
validateQuery(schema: SchemaInput, options?: { message?: string }): RequestHandler
```

**Behaviour**
- Validates `req.query` against an **object** schema.
- **Coerces** strings â†’ integers/numbers/booleans/null when the schema's `type` expects them. `?page=3&active=true` becomes `{ page: 3, active: true }` *in `req.query`*.
- Each top-level property in the schema becomes one OpenAPI parameter; properties listed in `required[]` are marked required; per-property `description`, `deprecated`, `example`, `examples` flow through.

```typescript
validateQuery(s.object({
  page:  s.integer().min(1).default(1).describe('Page number.'),
  limit: s.integer().min(1).max(100).default(20),
  q:     s.string().max(100).optional(),
}))
```

**OpenAPI emission**
- One `parameters[in: 'query']` entry per property
- Auto `400`

---

### `validateHeaders`

**Signature**
```typescript
validateHeaders(schema: SchemaInput, options?: { message?: string }): RequestHandler
```

**Behaviour**
- Validates `req.headers` against an object schema.
- Coerces strings â†’ typed values per the schema (header values arrive as strings).
- The builder **filters out** `Authorization`, `Accept`, and `Content-Type` from the emitted parameters with a one-time warning â€” OpenAPI 3.1 forbids declaring them as `parameters[in: 'header']` (they're modeled via `security` and `requestBody.content` respectively).

```typescript
validateHeaders(s.object({
  'X-Tenant-Id':     s.string().uuid(),
  'Idempotency-Key': s.string().min(8).optional(),
}))
```

**OpenAPI emission**
- One `parameters[in: 'header']` entry per non-filtered property
- Auto `400`

---

### `validateCookies`

**Signature**
```typescript
validateCookies(schema: SchemaInput, options?: { message?: string }): RequestHandler
```

**Behaviour**
- Validates `req.cookies` against an object schema.
- Coerces strings â†’ typed values per the schema.
- **Requires `cookie-parser` (or equivalent) mounted upstream** to populate `req.cookies`.

```typescript
validateCookies(s.object({
  session: s.string().describe('Session token.'),
}))
```

**OpenAPI emission**
- One `parameters[in: 'cookie']` entry per property
- Auto `400`

---

### `validatePathParams`

**Signature**
```typescript
validatePathParams(schema: SchemaInput, options?: { message?: string }): RequestHandler
```

**Behaviour**
- Validates `req.params` against an object schema (one property per `:placeholder` in the route).
- Coerces strings â†’ typed values (e.g. `id: '42'` â†’ `42` when `s.integer()`).
- **Path params are already extracted automatically from the route** (`/users/:id` â†’ `parameters[in: 'path', name: 'id']` with a default `{ type: 'string' }` schema). Use this middleware only when you want stronger typing (`.uuid()`, `.min()`, etc.) and richer per-param documentation.

```typescript
validatePathParams(s.object({
  id: s.string().uuid().describe('User id.'),
}))
```

**OpenAPI emission**
- Refines the auto-generated path-param schemas with the user's tighter version
- Auto `400`

---

### `validateContentType`

**Signature**
```typescript
validateContentType(...types: string[]): RequestHandler
validateContentType(options: { types: string[]; message?: string }): RequestHandler
```

**Behaviour**
- Rejects requests whose `Content-Type` (parameters stripped) isn't in the allowed set.
- Throws `UnsupportedMediaTypeException(415, ..., { supported })`.

```typescript
validateContentType('application/json', 'multipart/form-data')
```

**OpenAPI emission**
- The allowed types flow into `requestBody.content` keys (the body schema, if also declared via `validateBody`, is paired with every allowed type)
- Auto `415` with `metadata: { supported: string[] }`

---

## Auth middlewares

### `requireAuth`

**Signature**
```typescript
requireAuth(schemeName: string): RequestHandler
requireAuth(options: { scheme: string; verify?: AuthVerifier }): RequestHandler

type AuthVerifier = (req: Request) => Promise<Principal> | Principal
interface Principal { id: string; roles?: string[]; scopes?: string[]; [k: string]: unknown }
```

**Behaviour**
- Looks up a verifier for the scheme:
  1. Per-middleware `verify` override (highest priority)
  2. Falls back to `config.openapi.auth[scheme]` registered in `defineConfig`
- Runs the verifier. If it throws or returns falsy, throws `UnauthorizedException`. Otherwise attaches the returned `Principal` to `req.user`.

**Form 1 â€” use the verifier registered in `defineConfig`**
```typescript
// server.config.ts
defineConfig({
  openapi: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    auth: {
      bearerAuth: async (req) => {
        const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
        const claims = await verifyJwt(token);
        return { id: claims.sub, roles: claims.roles ?? [] };
      },
    },
  },
});

// controller
middlewares: [requireAuth('bearerAuth')]
```

**Form 2 â€” per-middleware override**
```typescript
middlewares: [
  requireAuth({
    scheme: 'bearerAuth',
    verify: async (req) => myCustomVerifier(req),
  }),
]
```

**OpenAPI emission**
- `operation.security` adds `{ [scheme]: [] }`
- `components.securitySchemes` populated from `defineConfig.openapi.securitySchemes`
- Auto `401`

---

### `requireRoles` / `authorize`

**Signatures**
```typescript
requireRoles(...roles: string[]): RequestHandler            // shorthand
authorize(options: { roles?: string[]; scopes?: string[] }): RequestHandler
```

**Behaviour**
- Reads `req.user` (populated by an earlier `requireAuth(...)` middleware). If absent, throws `UnauthorizedException` (the user forgot to chain `requireAuth` first).
- Checks that the principal holds **all** required roles **and** **all** required scopes. On any miss, throws `ForbiddenException('Insufficient permissions.', { requiredRoles, requiredScopes })`.

```typescript
middlewares: [
  requireAuth('bearerAuth'),
  requireRoles('admin'),                                 // roles only
  // or
  authorize({ roles: ['admin'], scopes: ['users:write'] }),
]
```

**OpenAPI emission**
- Scopes are **merged onto the immediately preceding `requireAuth` scheme** in the spec â€” i.e. `security: [{ bearerAuth: ['users:write'] }]`, not a separate requirement.
- Auto `403` with `metadata: { requiredRoles?: string[]; requiredScopes?: string[] }`

---

## Custom self-documenting middlewares

You can write your own middleware that contributes to the spec by attaching an `OpenApiMiddlewareMeta` annotation:

```typescript
import type { RequestHandler } from 'express';
import { attachOpenApiMeta, BadRequestException } from 'superman';

export const checkIdempotencyKey = (): RequestHandler => {
  const handler: RequestHandler = (req, _res, next) => {
    if (!req.headers['idempotency-key']) {
      return next(new BadRequestException('Missing Idempotency-Key.', {
        errors: [{ path: '/headers/idempotency-key', keyword: 'required', message: 'Required header.' }],
      }));
    }
    next();
  };

  return attachOpenApiMeta(handler, {
    kind: 'headers',
    schema: {
      type: 'object',
      properties: { 'Idempotency-Key': { type: 'string', minLength: 8 } },
      required: ['Idempotency-Key'],
    },
    errorStatuses: [{
      status: 400,
      description: 'Missing Idempotency-Key.',
      metadataSchema: {
        type: 'object',
        properties: { errors: { type: 'array', items: { type: 'object' } } },
      },
    }],
  });
};
```

The framework will treat your middleware exactly like a built-in one: validation runs at request time, OpenAPI parameters and a `400` response are emitted into the spec, and `defineController` users don't need to declare anything extra.

### `OpenApiMiddlewareMeta` shape

```typescript
interface OpenApiMiddlewareMeta {
  kind: 'body' | 'query' | 'headers' | 'cookies' | 'path' | 'content-type' | 'auth' | 'roles';
  schema?: JsonSchema;                                                       // body/query/headers/cookies/path
  bodyContent?: Record<string, MediaTypeDefinition>;                         // overrides `schema` when present
  mediaTypes?: string[];                                                      // content-type
  security?: SecurityRequirement;                                            // auth
  errorStatuses?: ReadonlyArray<{ status: number; description: string; metadataSchema?: JsonSchema }>;
}
```

**Conventions** the controller-metadata synthesizer applies:

- Last writer wins per slot (`body`, `query`, `headers`, `cookies`, `path`).
- Auth schemes accumulate in declaration order; `authorize({ scopes })` scopes merge onto the **nearest preceding** auth scheme.
- Each middleware's `errorStatuses[]` flows into the operation's `errors[]` â€” deduplicated by status (first wins). Controller-declared `errors[]` always override middleware ones with the same status.

## Common chain patterns

**Public read** â€” no auth, just shape validation:
```typescript
middlewares: [validateQuery(ListThingsQuery)]
```

**Authenticated write** â€” auth + role check + body validation:
```typescript
middlewares: [
  requireAuth('bearerAuth'),
  requireRoles('admin'),
  validateBody(CreateThingBody),
]
```

**Scoped write** â€” auth + scope check:
```typescript
middlewares: [
  requireAuth('bearerAuth'),
  authorize({ scopes: ['things:write'] }),
  validateBody(CreateThingBody),
]
// â†’ spec: security: [{ bearerAuth: ['things:write'] }]
```

**File upload** â€” multi-media-type body:
```typescript
middlewares: [
  requireAuth('bearerAuth'),
  validateContentType('multipart/form-data'),
  validateBody(s.object({
    file: s.raw({ type: 'string', format: 'binary' }),         // binary needs a raw fragment
  })),
]
```

**Strict typed path/query**:
```typescript
middlewares: [
  validatePathParams(s.object({ id: s.string().uuid() })),
  validateQuery(s.object({ include: s.enum(['sessions', 'tokens'] as const).optional() })),
]
```

## Order matters

Middlewares execute top-to-bottom. The framework's general advice:

1. **`requireAuth(...)`** first â€” short-circuit unauthenticated traffic before doing expensive validation work.
2. **`requireRoles` / `authorize`** next â€” reject under-privileged callers before reading the body.
3. **`validateContentType(...)`** before `validateBody` â€” pointless to validate a body whose Content-Type you'll reject anyway.
4. **`validateHeaders` / `validateQuery` / `validatePathParams`** â€” cheap, fail fast on malformed requests.
5. **`validateBody(...)`** last â€” body parsing/validation is the most expensive step.

Spec emission is order-independent â€” the OpenAPI document looks the same regardless of middleware order.

## See also

- [docs/schemas.md](./schemas.md) â€” JSON Schema authoring, the built-in validator's supported subset, TypeScript-types ergonomics, CRUD schemas recipe.
- [docs/api-config.md](./api-config.md#openapi-security) â€” `defineConfig.openapi.securitySchemes` and the `auth` verifier registry.
- [docs/api-controllers.md](./api-controllers.md) â€” `defineController` options + how middlewares plug in.
