# MCP Server

`superman` ships with a built-in [Model Context Protocol](https://modelcontextprotocol.io) server. When enabled, the framework auto-registers a single `POST {prefix}/mcp` route that hosts a JSON-RPC Streamable HTTP transport. Consumers only need to **register tools** against the exported `mcpServer` singleton — everything else (controller, audit, identity, OpenAPI doc entry, throttle, lifecycle) is wired automatically.

The integration is meant for exposing application capabilities to AI agents (Claude Desktop, Claude Code, LM Studio, etc.) without writing a parallel transport layer.

---

## Enabling it

The MCP server is **off by default**. Turn it on either by env or by config.

### Via env

```env
MCP_ENABLED=true
# optional overrides:
MCP_PATH=/mcp                    # default `/mcp`, joined with global `config.prefix`
MCP_NAME=my-app-mcp              # default `<package.json name>-mcp`
MCP_VERSION=1.2.3                # default `<package.json version>`
MCP_DESCRIPTION="..."            # default generic message
```

### Via `defineConfig`

```ts
import { defineConfig } from '@supersec-ai/superman';

defineConfig({
  port: { env: 'PORT', default: 3000 },
  prefix: '/api',
  // ...
  mcpServer: {
    enabled: true,
    path: '/mcp',                          // optional; default '/mcp'
    name: 'my-app-mcp',                    // optional
    version: '0.1.0',                      // optional
    description: 'Read-only tools for AI agents to inspect customer data.',
    throttle: 'PERMISSIVE',                // preset name or full ThrottleConfig
  },
});
```

Env vars always win over `defineConfig` values.

Final URL: `POST /api/mcp` (assuming `prefix: '/api'` + default `path: '/mcp'`).

---

## Registering tools

The framework exports a lazy singleton `mcpServer`. Import it anywhere and call `registerTool(name, config, handler)`:

```ts
import { mcpServer } from '@supersec-ai/superman';
import { z } from 'zod';

mcpServer.registerTool(
  'lookup_customer_by_id',
  {
    title: 'Lookup customer by id',
    description: 'Fetch a customer record by its internal id.',
    inputSchema: {
      id: z.string().min(1).describe('Internal customer id'),
      includeArchived: z.boolean().optional().describe('Include archived records?'),
    },
  },
  async ({ id, includeArchived }) => {
    const url = `http://localhost:3000/api/customers/${id}${includeArchived ? '?archived=true' : ''}`;
    const response = await fetch(url);
    return {
      content: [{ type: 'text', text: await response.text() }],
      isError: !response.ok,
    };
  },
);
```

Recommended file layout for a non-trivial set of tools:

```
src/
└── mcp/
    ├── schemas/
    │   └── customer.schemas.ts      # reusable z.* schemas
    └── tools/
        ├── customer.tools.ts        # side-effectful mcpServer.registerTool(...) calls
        └── orders.tools.ts
```

Then `import './mcp/tools/customer.tools'` from `src/server.ts` so the tool files load (and self-register) at boot.

The framework does **not** care about file structure — the only contract is "call `mcpServer.registerTool` somewhere before `app.listen()`".

---

## What runs at boot

When `config.mcpServer.enabled === true`:

1. A synthetic module named `MCP` is enqueued via the standard `defineModule(...)` path. It contains a single `POST` route at `{prefix}{path}`.
2. The route is included in the OpenAPI spec at `/api/spec` with the required-headers description.
3. The startup log includes a tool inventory:

```
INFO [App] Modules      : 3 registered
INFO [App]   -> Customers on /api/customers
INFO [App]   -> Orders on /api/orders
INFO [App]   -> MCP on /api
INFO [App] MCP tools    : 4 registered
INFO [App]   -> lookup_customer_by_id
INFO [App]   -> search_customers
INFO [App]   -> lookup_order
INFO [App]   -> ...
```

Disabled (`MCP_ENABLED=false` or omitted), nothing is registered: no route, no spec entry, no startup line.

---

## Calling it

The Streamable HTTP transport requires both media types in `Accept`:

```bash
curl -sN -X POST http://localhost:3000/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

```bash
curl -sN -X POST http://localhost:3000/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0","id":2,"method":"tools/call",
    "params":{
      "name":"lookup_customer_by_id",
      "arguments":{"id":"12345"}
    }
  }'
```

`*/*` is rejected with `406 Not Acceptable` — this is the MCP SDK enforcing the spec, not the framework.

---



## Audit events

The framework emits typed `AUDIT` events automatically:

| Trigger | Event | Resource |
|---|---|---|
| `initialize` JSON-RPC method | `AuditEvents.MCP_SESSION_STARTED` | `mcp.session` |
| `tools/call` JSON-RPC method | `AuditEvents.MCP_TOOL_EXECUTED`  | `mcp.tool/<name>` |
| `initialize` connection close   | `AuditEvents.MCP_SESSION_ENDED`  | `mcp.session` |

`MCP_SESSION_ENDED` is emitted when the HTTP request that carried the `initialize` method gracefully (or abruptly) closes, cleanly bookending the session lifecycle.

Both events include `resourceId` when the tool argument carries a known identifier (`userId`, `customerId` — extend with your own conventions inside `auditMcpRequest`).

The client identity is best-effort:
- `params.clientInfo` from MCP `initialize` (canonical) — only present on initialize.
- `User-Agent` first segment (fallback for `tools/call` in stateless mode).
- Source IP from `req.ip` / socket remote.

---

## Architecture notes

- **Stateless transport**: each `POST /api/mcp` creates a fresh `StreamableHTTPServerTransport` with `sessionIdGenerator: undefined`. No session affinity required.
- **Lazy singleton**: `mcpServer` is a `Proxy` that materializes the underlying `McpServer` on first access. This means `import { mcpServer }` works at top-level in tool files regardless of import order.
- **Optional peer dep**: `@modelcontextprotocol/sdk` is a `peerDependency` (not bundled). Install it in the consumer:
  ```bash
  npm i @modelcontextprotocol/sdk
  ```
- **Throttle**: default `'PERMISSIVE'`. Override via `mcpServer.throttle`.
- **OpenAPI**: the route shows up under the auto-generated docs at `/api/docs` with the JSON-RPC body description.

---

## Programmatic API (advanced)

| Export | Purpose |
|---|---|
| `mcpServer: McpServer` | Singleton; call `registerTool`/`registerPrompt`/etc. |
| `getMcpToolNames(): readonly string[]` | Snapshot of registered tool names (for diagnostics). |
| `auditMcpRequest(req)` | Manually emit MCP audit events for a request. |
| `identifyMcpClient(req, body)` | Extract client identity. |
| `createMcpController(throttle)` | The controller factory the framework uses internally; expose to wire MCP under a non-default mount. |
| `JsonRpcBody`, `McpClientIdentity` | Types. |
| `AuditEvents.MCP_SESSION_STARTED` / `MCP_SESSION_ENDED` / `MCP_TOOL_EXECUTED` | Audit enum. |