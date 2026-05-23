# Security Middlewares

## Declarative Auth Middlewares

Stop writing bespoke permission checks inside your business logic. Superman ships with built-in, type-safe middlewares that inject the user principal securely into the request pipeline.

### `requireAuth`
Enforces that a request contains valid credentials (e.g., a Bearer token or a session cookie) and attaches the resolved `user` to the controller context.

```typescript
import { defineController, requireAuth } from '@supersec-ai/superman';

export const getProfile = defineController({
  middlewares: [requireAuth('bearerAuth')],
  handler: async ({ user }) => {
    // `user` is strictly typed and guaranteed to be present here.
    return { id: user.id, email: user.email };
  }
});
```

### `requireRoles`
A declarative Role-Based Access Control (RBAC) middleware.

```typescript
export const deleteUser = defineController({
  middlewares: [
    requireAuth('bearerAuth'),
    requireRoles('admin', 'super-admin') // Must have one of these roles
  ],
  handler: async ({ params, service }) => service.delete(params.id)
});
```

### `authorize`
For Attribute-Based Access Control (ABAC), where permissions depend on the resource being accessed (e.g., "users can only edit their own profile").

```typescript
export const updateProfile = defineController({
  middlewares: [
    requireAuth('bearerAuth'),
    authorize(async (req, user) => req.params.id === user.id)
  ],
  handler: async ({ params, body, service }) => service.update(params.id, body)
});
```
