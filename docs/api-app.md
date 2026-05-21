# App

## `app`

The application singleton. No need to instantiate â€” it's created by the framework.

```typescript
import { app } from 'superman';

// Add global middleware
app.useMiddleware(cors());

// Start the server (flushes all queued modules, then listens)
app.listen(() => { /* optional callback */ });

// Graceful shutdown (calls destroy() on all modules, flushes log sinks)
await app.shutdown(); // async â€” awaits module destroy functions + log flush
```

`SIGTERM` and `SIGINT` are handled automatically: the framework emits a
`SYSTEM_SIGNAL_RECEIVED` event, runs `shutdown()`, then calls `process.exit(0)`.

## `logger`

Two APIs on one singleton.

### Free-form methods

Colored console output for developer messages. Controlled by `LOG_LEVEL`.

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

### Typed events â€” `logger.events.*`

Structured JSON logs matching the `*Log` interfaces. Routed through the
configured sinks (console + optional file) and filtered by
`config.logger.enabledEventTypes`.

```typescript
import {
  logger, EventSeverity,
  SecurityEvents, AuthOutcome,
  SystemEvent,    SystemStatus,
  AuditEvents,
} from 'superman';

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

log.events.audit({
  auditEvent: AuditEvents.PASSWORD_CHANGED,
  userRoles: ['user'],
  auditMessage: 'User changed their password',
  resource: 'users',
  resourceId: userId,
});

log.events.system({
  systemEvent: SystemEvent.DB_CONNECTED,
  systemStatus: SystemStatus.ONLINE,
  systemMessage: 'PostgreSQL connection established',
});
```

Infra fields (`@timestamp`, `appName`, `appVersion`, `environment`,
`serverInstanceUid`, `hostname`, `uptimeMs`, `memoryUsage`, `cpuUsage`,
`context`) are filled in automatically â€” callers only supply the
event-specific fields.

## What Happens Automatically

- **Request logging** â€” every incoming/outgoing request produces a `REQUEST` and `RESPONSE` event (method, URL, status, duration, bytes)
- **Exception handling** â€” every caught error produces an `ERROR` event with stack trace; `HttpException` subclasses return structured JSON, unhandled errors return 500
- **Audit logs** â€” successful mutations (POST/PUT/PATCH/DELETE with 2xx) produce an `AUDIT` event auto-derived from method + URL (resource, resourceId)
- **Security logs** â€” responses with status 401, 403, 413, 422, 429 produce a `SECURITY` event (UNAUTHORIZED_ACCESS / FORBIDDEN_ACTION / PAYLOAD_TOO_LARGE / MALFORMED_PAYLOAD / RATE_LIMIT_EXCEEDED)
- **System logs** â€” `SERVICE_STARTED`, `MANUAL_SHUTDOWN_ACTION`, `SYSTEM_SIGNAL_RECEIVED` on lifecycle transitions
- **Request/trace IDs** â€” every request gets an `X-Request-Id` (mints via `crypto.randomUUID()` if absent, honours inbound `X-Request-Id`/`X-Trace-Id`), echoed on the response and attached to every log line
- **Rate limiting** â€” every controller has per-IP throttling (configurable per controller)
- **Startup banner**

```
14:32:05.123 INFO  [App] ----------------------------------------
14:32:05.123 INFO  [App] Server started at 2026-04-13T14:32:05.123Z
14:32:05.123 INFO  [App] Instance UID : a1b2c3d4-e5f6-7890-abcd-ef1234567890
14:32:05.123 INFO  [App] Port         : 3000
14:32:05.123 INFO  [App] Environment  : development
14:32:05.123 INFO  [App] Log Level    : debug
14:32:05.123 INFO  [App] Modules      : 1 registered
14:32:05.123 INFO  [App]   -> UsersModule on /api/users
14:32:05.123 INFO  [App] ----------------------------------------
```

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
        users.schemas.ts        # user api schemas
```

## Development

```bash
npm run build     # Compile TypeScript
npm run dev       # Watch mode
npm test          # Run tests
npm publish       # Publish to registry
```

