/**
 * MCP (Model Context Protocol) integration — public surface.
 *
 * Consumers typically only need the {@link mcpServer} singleton to register
 * tools; everything else is wired automatically when
 * `defineConfig({ mcpServer: { enabled: true } })` is set (or env
 * `MCP_ENABLED=true`). See `docs/mcp-server.md` for the full workflow.
 */
export { mcpServer, McpServer, getMcpToolNames, _resetMcpServer } from './server';
export { createMcpController, mcpEndpointDescription } from './controller';
export { auditMcpRequest } from './audit';
export { identifyMcpClient } from './identity';
export type { JsonRpcBody, McpClientIdentity } from './types';