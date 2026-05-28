# Security Overview

Superman is designed to be secure by default. By taking a declarative approach to routing and configuration, it automatically enforces rate limits, scrubs error payloads in production, and standardizes how security incidents are logged.

![Superman Security](/security-diagram.webp)

---

## Rate Limiting (Throttling)

Denial of Service (DoS) and brute-force attacks are mitigated natively via the `throttleConfig` property on `defineController`.

Instead of applying limits imperatively across your app, simply state the limits upfront:

```typescript
export const login = defineController({
  throttleConfig: { limit: 5, ttl: 60_000 }, // 5 requests per minute
  handler: async ({ body }) => { ... }
});
```

Or use predefined presets configured in `defineConfig` like `'STRICT'`, `'STANDARD'`, or `'PERMISSIVE'`.

---

## Error Masking

In production (`NODE_ENV=production` or `ENV=production`), Superman's `globalExceptionMiddleware` catches all unhandled exceptions.

If a generic `500 Internal Server Error` occurs (e.g., a database connection drops or a variable is undefined), Superman **automatically strips the stack trace** and sensitive error messages from the HTTP response payload to prevent information leakage.

The full stack trace is still captured and logged centrally as an `ERROR` event.

---

## Field Redaction

Even in secure backend environments, sensitive data like passwords, credit card numbers, or API tokens should never be written to your application logs.

Superman includes a powerful, deep-recursive field redaction engine built directly into the logger. By configuring `redactFields` for specific event types, the framework will intercept and mask sensitive payload keys with `'***'` before they ever reach your console or file sinks.

```typescript
// src/server.config.ts
import { defineConfig, EventType } from '@supersec-ai/superman';

defineConfig({
  logger: {
    events: {
      include: [
        { 
          type: EventType.REQUEST, 
          // The framework recursively scans payloads and masks these exact keys!
          redactFields: ['password', 'creditCard', 'secretToken', 'cvv'] 
        }
      ]
    }
  }
});
```

Because redaction is strictly typed and integrated at the framework level, you never have to worry about developers accidentally logging a user's password in a controller!
