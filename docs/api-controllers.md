# Controllers

## `defineController<TService>(options)`

Generic factory that returns a `ControllerFactory<TService>`. The handler receives a **destructured context object** with `body`, `query`, `params`, `headers`, `cookies`, `user`, `service`, `req`, `res` — each typed by the middleware that populates it (no manual casts). Return whatever you want; the framework JSON-encodes it and picks the success status from `responses` (defaults to `200`).

```typescript
// src/modules/users/user.controllers.ts
import {
  s, defineController,
  validateBody, validateQuery, validateHeaders,
  requireAuth, requireRoles,
} from '@supersec-ai/superman';
import {
  ListUsersQuery,
  TenancyHeaders,
  CreateUserBody,
  UserResponse,
} from './user.schemas';

const createUserController = defineController<IMyService>({
  middlewares: [
    requireAuth('bearerAuth'),                // ➡️ security + auto 401
    requireRoles('admin'),                    // ➡️ scopes + auto 403
    validateHeaders(TenancyHeaders),          // ➡️ header params + auto 400
    validateBody(CreateUserBody),             // ➡️ requestBody + auto 400
  ],
  responses: {
    201: { schema: UserResponse },
  },
  errors: [
    { status: 409, description: 'Email already in use.' },
    {
      status: 422,
      description: 'Validation failed.',
      metadataSchema: s.object({
        field:  s.string(),
        reason: s.string(),
      }),
    },
  ],
  throttleConfig: 'STANDARD',
  operationId: 'createUser',
  summary: 'Create a user',
  handler: async ({ body, service }) => service.create(body),
  //                ^^^^ CreateUserDto (inferred from validateBody)
  // ➡️ framework writes 201 Created with the returned object as the JSON body
});
```

The middleware list is the single source of truth: each framework middleware validates at runtime *and* brands its context slot so the handler argument is fully typed. No `as CreateUserDto`, no `res.status(...).json(...)`, no parallel `request:` declaration.

### Handler shapes

The framework accepts **two** handler forms, distinguished by arity:

| Shape | Detected by | What you can do |
|---|---|---|
| `async ({ body, query, ..., service }) => result` | arity â‰¤ 1 | Return a value (or `reply()`); the framework writes the response. Returning `undefined` after writing to `res` works for streaming. |
| `async (req, res, service) => void` | arity 3 | Legacy positional form. Write to `res` yourself. Useful when you need full control. |

**Flat-context shorthand.** Leaf properties from `body` / `query` / `params` / `headers` / `cookies` are spread at the context root, so you can destructure values directly:

```typescript
handler: async ({ id, name, email, user, service }) =>
  service.update(id, { name, email }, user.id)
//                â†‘ from params      â†‘ from body          â†‘ from requireAuth
```

Both `ctx.params.id` and `ctx.id` reference the same value. **Precedence on key collision** (higher wins): `params > body > query > headers > cookies`. **Reserved structural keys** (`req`, `res`, `service`, `body`, `query`, `params`, `headers`, `cookies`, `user`) are never overwritten by a flattened source — `ctx.service` always refers to the injected service, even if a body schema declared a field named `service`. The `user` principal stays structural only — its inner fields aren't spread to avoid colliding with path params (`user.id` vs `params.id`).

```typescript
// Context form — recommended
handler: async ({ params, service }) => service.findById(params.id),

// reply() for status / header / mediaType overrides
import { reply } from '@supersec-ai/superman';
handler: async ({ body, service }) => {
  const order = await service.checkout(body);
  return reply(order, { status: 202, headers: { Location: `/orders/${order.id}` } });
},

// XML / non-JSON via reply({ mediaType })
handler: async ({ params, service }) => {
  const user = await service.findById(params.id);
  return reply(toXml(user), { mediaType: 'application/xml' });
},

// Legacy form — full control over res
handler: async (req, res, service) => {
  res.setHeader('Content-Type', 'text/event-stream');
  for await (const event of service.stream()) res.write(`data: ${JSON.stringify(event)}\n\n`);
  res.end();
},
```

### Success status rules

When the context handler returns a value, the framework picks the response status by this rule:

1. `reply(data, { status })` overrides everything.
2. Else if `responses` has **exactly one** `2xx` key, use that key.
3. Else default to `200`.

`responses` is **never obligatory** — omit it and successful returns get `200`. The OpenAPI document still shows the framework's auto-injected `429`/`500`/`default` envelopes for the route.

### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `handler` | `({ body, query, ..., service }) => unknown` *or* `(req, res, service) => void` | yes | Context-form (recommended) or legacy positional form. See [Handler shapes](#handler-shapes). |
| `throttleConfig` | `ThrottlePreset \| { limit, ttl }` | no | Rate limit config. Defaults to `'STANDARD'` |
| `middlewares` | `RequestHandler[]` | no | Framework-provided middlewares self-document (see table below). User-defined middlewares run normally but don't appear in the spec. |
| `responses` | `Record<number, { schema?; contentType?; content?; description?; headers? }>` | no | Success / non-framework responses by status code. Optional `headers` map documents response headers. |
| `errors` | `Array<{ status; description; metadataSchema? }>` | no | Framework-envelope errors this route may emit *beyond* the middleware auto-errors. Each entry is rendered as `allOf [FrameworkError, { metadata: <your-schema> }]`. |
| `operationId` | `string` | no | Stable identifier surfaced as `operation.operationId` — used by OpenAPI codegen tools |
| `summary` | `string` | no | Short summary; overrides `route.description` as the OpenAPI `summary` |
| `deprecated` | `boolean` | no | Marks the operation as deprecated in the generated spec |
| `security` | `Array<Record<scheme, scopes[]>>` | no | Per-operation security requirement override. Usually unneeded — `requireAuth(...)` middlewares set this automatically. |

### Middlewares and what they auto-document

| Middleware | Validates at runtime | Auto-emits in OpenAPI |
|---|---|---|
| `validateBody(schema \| {mediaType: schema})` | `req.body` | `requestBody` (single or multi-media-type), auto `400` |
| `validateQuery(schema)` | `req.query` (string ➡️ typed) | `parameters[in: 'query']`, auto `400` |
| `validateHeaders(schema)` | `req.headers` (string ➡️ typed) | `parameters[in: 'header']`, auto `400` |
| `validateCookies(schema)` | `req.cookies` | `parameters[in: 'cookie']`, auto `400` |
| `validatePathParams(schema)` | `req.params` (string ➡️ typed) | refines auto-generated path-param schemas, auto `400` |
| `validateContentType(...types)` | `Content-Type` header | `requestBody.content` keys, auto `415` |
| `requireAuth(scheme \| opts)` | runs verifier; populates `req.user` | `security: [{ scheme: [] }]`, auto `401` |
| `requireRoles(...roles)` / `authorize({ roles, scopes })` | checks `req.user.roles` / scopes | scopes merge onto preceding scheme, auto `403` |

The framework **also auto-documents** on every operation, no controller code needed:

- `429` (rate limit) and `Retry-After` response header
- `500` (uncaught error)
- `default` catch-all referencing `FrameworkError`
- `X-RateLimit-Remaining` response header (every response)

Declare statuses *beyond* the auto-injected ones via `errors`; a declaration with the same status overrides the auto-injected one.

### Example — Post creation (auth-aware writes + custom message)

A post is created by an authenticated user; the `authorId` is taken from the `Principal` populated by `requireAuth`. The validation middleware uses a friendlier custom error message:

```typescript
export const createPostController = defineController<IPostsService>({
  middlewares: [
    requireAuth('bearerAuth'),
    requireRoles('author', 'admin'),
    validateBody(CreatePostBody, { message: 'Please supply a valid post payload.' }),
  ],
  responses: { 201: { schema: PostResponse } },
  operationId: 'createPost',
  handler: async ({ body, user, service }) =>          // body=CreatePostDto, user=Principal
    service.create({ ...body, authorId: user.id }),
});
```

### Example — Comments on a post (nested path params + flat destructure)

Comments live under a post (`GET /posts/:postId/comments`). Path params flatten to the context root, so `postId` is destructurable directly:

```typescript
export const listCommentsController = defineController<ICommentsService>({
  middlewares: [
    validatePathParams(PostIdParam),                   // ➡️ ctx.postId
    validateQuery(ListCommentsQuery),                  // ➡️ ctx.query
  ],
  responses: { 200: { schema: PaginatedCommentsResponse } },
  operationId: 'listComments',
  handler: async ({ postId, query, service }) =>      // flat: postId from params
    service.listForPost(postId, query),
});
```

### Defining schemas in a `*.schemas.ts` file

Park your module's schemas in a co-located file. Use the framework's built-in chainable builder (`s.*`) — runtime validation, OpenAPI emission, and TypeScript types all come from one declaration. No Zod or any other dep required (see [docs/schemas.md](./schemas.md) for the full reference, and [docs/api-config.md](./api-config.md#schemavalidator--replace-the-built-in-validator) for swapping the validator).

```typescript
// src/modules/users/user.schemas.ts
import { s, type Infer } from '@supersec-ai/superman';

export const ListUsersQuery = s.object({
  page:  s.integer().min(1).default(1).describe('Page number.'),
  limit: s.integer().min(1).max(100).default(20).describe('Items per page.'),
});

export const TenancyHeaders = s.object({
  'X-Tenant-Id':     s.string().uuid().describe('Tenant identifier.'),
  'Idempotency-Key': s.string().min(8).optional().describe('Idempotency token.'),
});

export const SessionCookies = s.object({
  session: s.string().describe('Session token.'),
});

export const CreateUserBody = s.object({
  name:  s.string().min(1),
  email: s.string().email(),
})
  .describe('New user payload.')
  .example({ name: 'Ada', email: 'ada@example.com' });

export type CreateUserDto = Infer<typeof CreateUserBody>;

export const UserResponse = s.object({
  id:    s.string().uuid(),
  name:  s.string(),
  email: s.string().email(),
}).describe('A user record.');
```

Raw JSON Schema objects are still accepted everywhere `s.*` is — see [docs/schemas.md](./schemas.md#escape-hatch--raw-json-schema).

### Parameters: query, headers, cookies, path

- **Path params** (`/users/:id`) are extracted automatically from the route — no declaration needed. Pass them to `validatePathParams(schema)` only if you want type coercion (e.g. "`id` must be a UUID") or richer per-param documentation.
- **Query / request-headers / cookies** schemas pass to `validateQuery` / `validateHeaders` / `validateCookies` as **object schemas** (built with `s.object({...})` or a raw JSON Schema). Each top-level property becomes one OpenAPI parameter; properties listed in `required[]` are marked required. Per-property `.describe()`, `.deprecated()`, `.example()`, and `.examples()` flow through.
- **Authorization, Accept, Content-Type** headers cannot be declared as parameters under OpenAPI 3.1. Use `requireAuth(...)` for `Authorization`, `validateContentType(...)` for the others.

### Response headers

`X-RateLimit-Remaining` is auto-injected on **every** response, and `Retry-After` is auto-injected on the `429` response — the framework actually sets those headers itself, so it documents them too. To declare additional response headers, pass a `headers` map on the status code:

```typescript
responses: {
  200: {
    schema: UserResponse,
    headers: {
      'X-Request-Id': { schema: s.string(), description: 'Correlation id echoed back.' },
    },
  },
}
```

A user-declared header with the same name as an auto-injected one wins.

### Security

Declare reusable security schemes and their verifiers at the app level in `defineConfig`, then reference them per-controller via `requireAuth(scheme)`. See [docs/api-config.md](./api-config.md#openapi-security).

```typescript
middlewares: [
  requireAuth('bearerAuth'),               // uses the verifier registered in defineConfig
  // — or, per-controller override —
  requireAuth({ scheme: 'bearerAuth', verify: async (req) => myCustomVerifier(req) }),
],
```

`requireAuth` auto-injects `401` and the operation's `security` requirement. `requireRoles(...)` / `authorize({ scopes })` auto-injects `403` and merges its scopes onto the preceding auth scheme. Declare your own `401`/`403` via `errors` if you want a custom description or metadata shape.

### Streaming responses (SSE, NDJSON, file downloads)

OpenAPI 3.1 doesn't model "streaming" as a first-class concept — it just sees the media type. Declare your stream's media type via `content`, with a schema describing **one message/chunk**:

```typescript
responses: {
  200: {
    description: 'Server-Sent Events stream of order updates.',
    content: {
      'text/event-stream': {
        schema: OrderEventJsonSchema,                  // shape of one event payload
        example: 'data: {"orderId":"123","status":"shipped"}\n\n',
      },
    },
  },
}
```

The same pattern works for `application/x-ndjson`, `application/octet-stream` (binary downloads via `schema: { type: 'string', format: 'binary' }`), chunked text, etc.

### Multiple media types

**Responses** — pass a `content` map on the status:

```typescript
responses: {
  200: {
    description: 'User',
    content: {
      'application/json': { schema: UserResponse, example: { id: '1', name: 'Ada' } },
      'application/xml':  { schema: s.string(),    example: '<user><id>1</id></user>' },
    },
  },
}
```

**Request bodies** — pass `validateBody` a media-type-keyed map:

```typescript
middlewares: [
  validateBody({
    'application/json':    CreateUserJsonSchema,
    'multipart/form-data': CreateUserMultipartSchema,
  }),
]
```

The middleware picks the right schema by inspecting the incoming `Content-Type`. Both keys appear under `requestBody.content` in the spec.

## Related

- **[docs/schemas.md](./schemas.md)** — JSON Schema authoring guide: validator's supported keywords, coercion rules, the full CRUD-module recipe (routes Ã— middlewares Ã— responses table), TypeScript-types ergonomics, and how to swap in AJV.
- **[docs/api-middlewares.md](./api-middlewares.md)** — exhaustive reference for every shipped middleware (`validateBody`, `validateQuery`, `validateHeaders`, `validateCookies`, `validatePathParams`, `validateContentType`, `requireAuth`, `requireRoles`, `authorize`) and how to write your own.

## Error Metadata

When throwing `HttpException` subclasses, pass an optional `metadata` object that's included in the error response envelope:

```typescript
throw new NotFoundException('User not found', {
  code: 'USER_NOT_FOUND',
  userId: '123',
});
// Response: { "error": "User not found", "metadata": { "code": "USER_NOT_FOUND", "userId": "123" } }
```

If no metadata is passed, the response is just `{ "error": "message" }`.

To document the *shape* of that metadata in the OpenAPI spec, declare the error in the controller's `errors` array with a `metadataSchema` — the generated spec will then render that exact shape under `metadata` so API consumers know what to expect.

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
    validatePathParams(PostIdParam),                            // ➡️ params: { postId }
    validateBody(CreateCommentBody),
  ],
  responses: { 201: { schema: CommentResponse } },
  handler: async ({ postId, body, user, service }) =>           // flat: postId from params
    service.create(postId, { ...body, authorId: user.id }),
});
```

Middlewares run after rate limiting and before the handler. If a middleware throws an `HttpException`, the chain stops.

## Exceptions

Throw anywhere in handlers or middleware — the framework catches and formats the response.

```typescript
import { NotFoundException, BadRequestException } from '@supersec-ai/superman';

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

