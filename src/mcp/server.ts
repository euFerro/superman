import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { config } from '../config/superman-config';

/**
 * Lazy-initialized singleton MCP server. The framework creates it on first
 * access using the resolved `config.mcpServer.{name,version,description}`. All
 * consumer-side tools register against this instance.
 *
 *     import { mcpServer } from 'superman';
 *
 *     mcpServer.registerTool('my_tool', { title, description, inputSchema }, async (args) => ({
 *       content: [{ type: 'text', text: JSON.stringify(args) }],
 *     }));
 *
 * Lazy initialization matters: the singleton must outlive `defineConfig` so
 * tool files imported anywhere in the app can register against the same
 * instance regardless of import order.
 */
let _instance: McpServer | undefined;
const _toolNames: string[] = [];

/** Returns the names of every tool registered against the singleton, in order. */
export const getMcpToolNames = (): readonly string[] => _toolNames.slice();

const buildInstance = (): McpServer => {
  const resolved = config.isInitialized()
    ? config.mcpServer
    : {
        name: 'unknown-app-mcp',
        version: '0.0.0',
        description: 'MCP (Model Context Protocol) server exposing application tools to AI clients.',
      };

  return new McpServer({
    name: resolved.name,
    version: resolved.version,
    description: resolved.description,
  });
};

/**
 * Proxy that defers McpServer construction until first use. This lets module
 * files do `import { mcpServer } from 'superman'` at top level without
 * forcing `defineConfig` to run first.
 */
export const mcpServer: McpServer = new Proxy({} as McpServer, {
  get(_target, prop, receiver) {
    if (!_instance) _instance = buildInstance();

    if (prop === 'registerTool') {
      return (name: string, ...rest: unknown[]) => {
        if (!_toolNames.includes(name)) _toolNames.push(name);
        return (_instance as unknown as Record<string, (...args: unknown[]) => unknown>)
          .registerTool(name, ...rest);
      };
    }

    const value = Reflect.get(_instance, prop, receiver);
    return typeof value === 'function' ? value.bind(_instance) : value;
  },
});

/** @internal — reset for tests only. */
export const _resetMcpServer = (): void => {
  _instance = undefined;
  _toolNames.length = 0;
};

export { McpServer };