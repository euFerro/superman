/**
 * Public types for the framework's MCP (Model Context Protocol) integration.
 *
 * These describe the shape of the JSON-RPC request body the MCP transport
 * receives and the client identity extracted from it. Consumers rarely import
 * these directly — they're surfaced for advanced tracing / instrumentation.
 */
export interface JsonRpcBody {
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
    clientInfo?: { name?: string; version?: string };
  };
}

export interface McpClientIdentity {
  name: string;
  version?: string;
  userAgent: string;
  ip: string;
}