# API Summary

| Export | Type | Sync? | Description |
|--------|------|-------|-------------|
| `defineConfig()` | function | sync | Registers app config: port, prefix, env vars, environment endpoints, structured logger |
| `defineController()` | function | sync | Generic factory — returns `ControllerFactory<TService>` |
| `defineModule()` | function | sync | Declares a module with routes. |
| `config` | singleton | — | Access resolved config: `config.port`, `config.env.X`, `config.endpoints.X`, `config.logger` |
| `app` | singleton | — | Server singleton: `app.listen()`, `app.shutdown()`, `app.useMiddleware()` |
| `logger` | singleton | — | Free-form logger (`logger.info()`, `logger.child('Context')`) + typed events (`logger.events.system()`, `.request()`, `.response()`, `.error()`, `.audit()`, `.security()`) |
| `EventType`, `SecurityEvents`, `SystemEvent`, `AuditEvents`, `AuthOutcome`, `EventSeverity` | enums | — | Discriminators for typed structured logs |
| `THROTTLE_CONFIG` | constant | — | Rate limit presets: `SECURITY`, `STRICT`, `STANDARD`, `PERMISSIVE`, `EXTRA_PERMISSIVE` |
| `*Exception` | classes | — | 14 HTTP exception classes (400–504). Throw anywhere, caught by framework |

**Lifecycle:** `defineConfig()` → `defineController()` → `defineModule()` → `app.listen()`
