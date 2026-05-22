# Schemas

Schemas are authored with the framework's built-in **chainable schema builder** (`s.*`). One declaration drives three surfaces at once:

1. **Runtime validation** — `validateBody` / `validateQuery` / …  middlewares reject malformed requests before your handler runs.
2. **OpenAPI** — `requestBody`, `parameters`, `responses`, examples, defaults, descriptions, components.schemas at `GET /spec`.
3. **TypeScript types** — `Infer<typeof Schema>` extracts the corresponding TS type, so DTOs come from a single source.

```typescript
import { s, type Infer } from '@supersec-ai/superman';

export const CreateUserBody = s.object({
  name:  s.string().min(1).max(100).describe('Full name.'),
  email: s.string().email().describe('Primary email.'),
  role:  s.enum(['admin', 'editor', 'viewer'] as const).default('viewer'),
});

export type CreateUserDto = Infer<typeof CreateUserBody>;
// ➡️ { name: string; email: string; role?: 'admin' | 'editor' | 'viewer' }
```

No Zod or any other dep required. The DSL emits plain JSON Schema 2020-12 under the hood and the framework's built-in validator (see [Supported keywords](#supported-keywords)) consumes it.

## Why a DSL?

- **Fluent and terse.** `s.string().email()` beats `{ type: 'string', format: 'email' }`. Chains read like specs.
- **Inferred types.** `Infer<typeof Schema>` removes the parallel `interface` declaration — TypeScript and runtime can't drift.
- **Composable.** `.partial()`, `.pick()`, `.omit()`, `.extend()` cover the common CRUD shape transforms.
- **Standard output.** `.toJsonSchema()` produces a plain JSON Schema fragment — every keyword you emit is valid OpenAPI 3.1 and renderable in Swagger UI, Redoc, Stoplight, Postman, Insomnia.
- **Pluggable.** Replace the engine with AJV, Zod, or anything else via `defineConfig({ schemaValidator })` — schemas keep the same authoring surface.

## Factories

```typescript
import { s } from '@supersec-ai/superman';
```

| Factory | Output type | Chain methods ➡️ JSON Schema keyword |
|---|---|---|
| `s.string()` | `string` | `.min(n)` ➡️ `minLength`; `.max(n)` ➡️ `maxLength`; `.length(n)` ➡️ both; `.regex(pattern)` / `.pattern(pattern)` ➡️ `pattern`; `.email()` / `.uuid()` / `.url()` / `.datetime()` / `.date()` / `.time()` / `.ipv4()` / `.ipv6()` / `.hostname()` ➡️ `format` |
| `s.number()` | `number` | `.min(n)` ➡️ `minimum`; `.max(n)` ➡️ `maximum`; `.gt(n)` ➡️ `exclusiveMinimum`; `.lt(n)` ➡️ `exclusiveMaximum`; `.gte(n)` / `.lte(n)`; `.int()` ➡️ `type: 'integer'`; `.multipleOf(n)`; `.positive()` / `.negative()` / `.nonnegative()` / `.nonpositive()` |
| `s.integer()` | `number` | Shorthand for `s.number().int()`. |
| `s.boolean()` | `boolean` | — |
| `s.null()` | `null` | — |
| `s.literal(v)` | `typeof v` | Emits `const`. |
| `s.enum([...] as const)` | tuple member | Emits `enum`. |
| `s.array(child)` | `Infer<child>[]` | `.min(n)` / `.max(n)` / `.length(n)`; `.unique()` ➡️ `uniqueItems: true` |
| `s.object({ k: schema })` | `{ k: Infer<schema> }` | `.strict()` (default — `additionalProperties: false`); `.passthrough()`; `.partial()`; `.pick(...keys)`; `.omit(...keys)`; `.extend({...})` |
| `s.union([a, b, …])` | `Infer<a> \| Infer<b>` | Emits `anyOf`. |
| `s.discriminatedUnion(key, [...])` | tagged union | Emits `oneOf` + `discriminator`. |
| `s.intersection(a, b)` | `Infer<a> & Infer<b>` | Emits `allOf`. |
| `s.record(child)` | `Record<string, Infer<child>>` | Emits `type:'object'` + `additionalProperties: child`. |
| `s.any()` / `s.unknown()` | `unknown` | Empty schema `{}`. |
| `s.raw(jsonSchema)` | `unknown` | Escape hatch — wraps a hand-written JSON Schema (see [Escape hatch](#escape-hatch-raw-json-schema)). |

Every builder also has these universal chain methods:

| Method | Effect |
|---|---|
| `.optional()` | Marks the field optional; widens the inferred type to `T \| undefined` and removes the key from the parent `required[]`. |
| `.nullable()` | Adds `'null'` to `type` and widens the inferred type to `T \| null`. |
| `.default(value)` | Adds `default` to the schema and removes the key from the parent `required[]`. |
| `.describe(text)` | Sets `description`. |
| `.example(value)` | Sets `example`. |
| `.examples([…])` | Sets `examples` (array). |
| `.deprecated()` | Sets `deprecated: true`. |
| `.toJsonSchema()` | Returns the plain JSON Schema fragment. |
| `.parse(value)` | Validates; returns the typed value or **throws `BadRequestException` with `metadata: { errors }`**. |
| `.safeParse(value)` | Non-throwing variant: `{ success: true, data }` or `{ success: false, errors }`. |

## Service-layer usage

The same schema you pass to a middleware can validate ad-hoc inputs inside a service (queue messages, scheduled jobs, webhook payloads, CLI args). `.parse()` throws the **identical** `BadRequestException` the middleware throws — your exception filter handles both the same way.

```typescript
import { s, type Infer } from '@supersec-ai/superman';
import { CreateUserBody } from './user.schemas';

export type CreateUserDto = Infer<typeof CreateUserBody>;

export class UsersService {
  // HTTP path — body already validated by validateBody(CreateUserBody)
  async create(dto: CreateUserDto) { /* dto is fully typed */ }

  // Queue worker — validate at the edge
  async createFromQueue(rawPayload: unknown) {
    const dto = CreateUserBody.parse(rawPayload);     // throws BadRequest on failure
    return this.create(dto);
  }

  // Lenient path — keep going on invalid rows
  async tryImport(rawPayload: unknown) {
    const result = CreateUserBody.safeParse(rawPayload);
    if (!result.success) return { skipped: true, errors: result.errors };
    return { skipped: false, user: await this.create(result.data) };
  }
}
```

## Supported keywords (validator engine)

The built-in validator ([`src/validation/json-schema-validator.ts`](../src/validation/json-schema-validator.ts)) supports the subset most APIs actually use. Every chain method in the DSL emits one of these:

| Group | Keywords |
|---|---|
| **Generic** | `type` (string \| number \| integer \| boolean \| null \| array \| object, single or `['x', 'null']` union), `enum`, `const`, `nullable` |
| **Combinators** | `oneOf`, `anyOf`, `allOf`, `not` |
| **String** | `minLength`, `maxLength`, `pattern`, `format` (`email`, `uuid`, `date-time`, `date`, `time`, `uri`, `ipv4`, `ipv6`, `hostname`) |
| **Number / integer** | `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf` |
| **Array** | `items` (single schema), `minItems`, `maxItems`, `uniqueItems` |
| **Object** | `properties`, `required`, `additionalProperties` (boolean), `minProperties`, `maxProperties` |

**Not supported in v1** (ignored at runtime; still rendered in the OpenAPI output since they're valid spec annotations):

- `$ref` / `$defs` (no reference resolution)
- `patternProperties`
- `dependentRequired` / `dependentSchemas`
- `contentMediaType` / `contentEncoding`
- `if` / `then` / `else`

If you need any of these, plug a full validator into the `schemaValidator` hook — see [Replacing the validator](#replacing-the-validator).

## Coercion

The query, header, cookie, and path-param validators **coerce strings to typed values** automatically (those surfaces always arrive as strings):

| Schema `type` | Input string | Coerced value |
|---|---|---|
| `'integer'` | `"42"` | `42` |
| `'integer'` | `"4.5"` | (left as `'4.5'`, fails `type`) |
| `'number'` | `"3.14"` | `3.14` |
| `'boolean'` | `"true"`, `"false"` | `true`, `false` |
| `'null'` (or union with null) | `"null"`, `""` | `null` |

Body validation does **not** coerce — JSON bodies are already parsed by `express.json()`. Coerced values are written back to `req.query` / `req.params` / `req.cookies`, so your handler reads typed data without manual casts.

## Examples and descriptions flow through

The OpenAPI builder lifts schema annotations into the generated spec automatically:

- **`.describe(text)`** ➡️ response/parameter description, fallback for request-body description.
- **`.example(value)`** ➡️ `MediaType.example` (single).
- **`.examples([…])`** ➡️ `MediaType.examples` as a numbered map (`example1`, `example2`, …).
- **`.default(value)`** ➡️ rendered by Swagger UI in form inputs; removes the key from `required[]`.
- **Per-property** `describe` / `example` / `examples` / `deprecated` ➡️ flow through to the corresponding `parameters[]` entries when the schema is used by `validateQuery` / `validateHeaders` / `validateCookies` / `validatePathParams`.

```typescript
const ListUsersQuery = s.object({
  page: s.integer().min(1).default(1).describe('Page number.').example(3),
});
```

Renders as:

```json
{
  "name": "page",
  "in": "query",
  "required": false,
  "schema": { "type": "integer", "minimum": 1, "default": 1, "description": "Page number.", "example": 3 },
  "description": "Page number.",
  "example": 3
}
```

## Recipe — CRUD module

A complete schemas file covering the five standard CRUD operations on a `User` resource. Drop this into a real module and you'll have list/read/create/update/delete with full validation + OpenAPI documentation + inferred DTO types.

```typescript
// src/modules/users/user.schemas.ts
import { s, type Infer } from '@supersec-ai/superman';

// ----- Domain shape -------------------------------------------------------

/** Canonical user record returned by the API. */
export const UserResponse = s.object({
  id:        s.string().uuid(),
  name:      s.string().min(1).max(100),
  email:     s.string().email(),
  role:      s.enum(['admin', 'editor', 'viewer'] as const),
  createdAt: s.string().datetime(),
  updatedAt: s.string().datetime(),
})
  .describe('A user record.')
  .example({
    id:        '7b5a3a40-1e8c-4f6a-9b1d-0a2c4d8e1f3a',
    name:      'Ada Lovelace',
    email:     'ada@example.com',
    role:      'admin',
    createdAt: '2026-05-15T09:00:00Z',
    updatedAt: '2026-05-15T09:00:00Z',
  });

export type User = Infer<typeof UserResponse>;

// ----- Path / query schemas -----------------------------------------------

/** `:id` path parameter — used by GET /:id, PUT /:id, DELETE /:id. */
export const UserIdParam = s.object({
  id: s.string().uuid().describe('User id.'),
});

/** GET /users query — pagination + simple search. */
export const ListUsersQuery = s.object({
  page:  s.integer().min(1).default(1).describe('Page number.'),
  limit: s.integer().min(1).max(100).default(20).describe('Items per page.'),
  q:     s.string().max(100).optional().describe('Substring search on name or email.'),
  role:  s.enum(['admin', 'editor', 'viewer'] as const).optional().describe('Filter by role.'),
});

export type ListUsersDto = Infer<typeof ListUsersQuery>;

// ----- Request bodies -----------------------------------------------------

/** POST /users body — all required fields. */
export const CreateUserBody = s.object({
  name:  s.string().min(1).max(100),
  email: s.string().email(),
  role:  s.enum(['admin', 'editor', 'viewer'] as const).default('viewer'),
})
  .describe('New user payload.')
  .example({ name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' });

export type CreateUserDto = Infer<typeof CreateUserBody>;

/** PUT /users/:id body — partial update; at least one property required. */
export const UpdateUserBody = CreateUserBody.partial();
// `.partial()` makes every key optional but additionalProperties:false carries over,
// so unknown keys are still rejected.

export type UpdateUserDto = Infer<typeof UpdateUserBody>;

// ----- Response envelopes -------------------------------------------------

/** GET /users response — paginated page of users. */
export const PaginatedUsersResponse = s.object({
  data:  s.array(UserResponse),
  page:  s.integer().min(1),
  limit: s.integer().min(1),
  total: s.integer().min(0),
}).describe('A page of users.');

// ----- Error metadata shapes ----------------------------------------------

/** Metadata for `404 User not found.` */
export const NotFoundMetadata = s.object({
  userId: s.string().uuid(),
});

/** Metadata for `409 Email already in use.` */
export const ConflictMetadata = s.object({
  email: s.string().email(),
});
```

How each schema is used across the five standard CRUD routes:

| Route   | Path                | Middlewares using these schemas                                          | Response schema                                                                                  |
|---------|---------------------|--------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| List    | `GET /users`        | `validateQuery(ListUsersQuery)`                                          | `PaginatedUsersResponse`                                                                         |
| Read    | `GET /users/:id`    | `validatePathParams(UserIdParam)`                                        | `UserResponse` (+ `errors[404]` with `NotFoundMetadata`)                                         |
| Create  | `POST /users`       | `validateBody(CreateUserBody)`                                           | `UserResponse` (201) (+ `errors[409]` with `ConflictMetadata`)                                   |
| Update  | `PUT /users/:id`    | `validatePathParams(UserIdParam)`, `validateBody(UpdateUserBody)`        | `UserResponse` (+ `errors[404]`)                                                                 |
| Delete  | `DELETE /users/:id` | `validatePathParams(UserIdParam)`                                        | `{ description: 'User deleted; no response body.' }` (204) (+ `errors[404]`)                     |

A few intentional choices worth flagging:

- **`UpdateUserBody = CreateUserBody.partial()`** reuses the create shape and flips every field to optional — no duplication.
- **`.strict()` is the default**, so unknown keys are rejected on writes without an explicit setting.
- **`role` is an enum with a default**, so the OpenAPI spec advertises the valid values and Swagger UI renders them as a dropdown.
- **`UserIdParam` is shared** across three routes — `:id` validation is declared once.
- **Error metadata shapes are first-class schemas**, not inline — reused if multiple routes can throw the same error.
- **Auth, 400/401/403/415/429/500/`default` responses, and rate-limit response headers** are auto-injected on every route in this table — you don't have to declare any of that.

## Escape hatch — raw JSON Schema

Middlewares and controller options accept **either** an `s.*` builder **or** a plain JSON Schema object. Use this for hand-written schemas, generated schemas (typia, `z.toJSONSchema()`), or features the DSL doesn't cover (e.g., `patternProperties`):

```typescript
import { validateBody } from '@supersec-ai/superman';

const RawSchema = {
  type: 'object',
  patternProperties: { '^x-': { type: 'string' } },
  additionalProperties: false,
};

// Plain object — accepted directly by every validate* middleware.
validateBody(RawSchema);
```

The `s.raw(...)` factory wraps a raw schema in a builder so it composes with the rest of the DSL:

```typescript
import { s } from '@supersec-ai/superman';

const Custom = s.raw({ type: 'string', pattern: '^[A-Z]{3}-\\d{4}$' });

const Envelope = s.object({
  ticketId: Custom,
  comment:  s.string().max(500),
});
```

## Replacing the validator

If you need keywords beyond the built-in subset (`$ref`, `patternProperties`, `if`/`then`/`else`, full Zod refinements, …), plug any compatible validator into the `schemaValidator` hook on `defineConfig`. All `validate*` middlewares delegate to it transparently:

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

When the validator is replaced, the **engine** changes but the authoring surface doesn't — you keep writing `s.*` schemas, and the framework hands the JSON Schema produced by `.toJsonSchema()` to your custom validator. See [docs/api-config.md](./api-config.md#schemavalidator--replace-the-built-in-validator) for the Zod carrier pattern.

The framework itself remains dep-free; you opt in.

## Where things appear in the spec

Every schema you write ends up in **exactly one** place in `/spec`:

| Schema purpose | Spec location |
|---|---|
| `validateBody(schema)` | `paths.{path}.{method}.requestBody.content.{mediaType}.schema` |
| `validateBody({ mt1: a, mt2: b })` | one entry per media type under `requestBody.content` |
| `validateQuery(schema)` properties | `paths.{path}.{method}.parameters[]` with `in: 'query'` |
| `validateHeaders(schema)` properties | `parameters[]` with `in: 'header'` (Authorization/Accept/Content-Type filtered) |
| `validateCookies(schema)` properties | `parameters[]` with `in: 'cookie'` |
| `validatePathParams(schema)` properties | `parameters[]` with `in: 'path'`, refining the auto-extracted defaults |
| `responses[code].schema` | `paths.{path}.{method}.responses.{code}.content.application/json.schema` |
| `responses[code].content` map | one entry per media type under that status |
| `errors[].metadataSchema` | inside `allOf [FrameworkError, { metadata: <your-schema> }]` under the response's content |
| `responses[code].headers` | `paths.{path}.{method}.responses.{code}.headers` |

## See also

- [docs/api-middlewares.md](./api-middlewares.md) — every shipped middleware factory, what it throws, what it auto-emits.
- [docs/api-controllers.md](./api-controllers.md) — `defineController` options + how middlewares plug in. Companion **Post** and **Comment** examples show auth-aware writes (`user.id` ➡️ `authorId`) and nested path params (`/posts/:postId/comments`).
- [docs/api-config.md](./api-config.md#openapi-security) — `defineConfig.openapi.securitySchemes` and the `schemaValidator` hook.

