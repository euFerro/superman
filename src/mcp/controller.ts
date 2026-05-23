import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { defineController, type ControllerFactory } from '../core/define-controller';
import { logger } from '../logger/superman-logger';
import type { ThrottleConfig, ThrottlePreset } from '../throttle/throttle.constants';

import { auditMcpRequest, auditMcpSessionEnded } from './audit';
import { mcpServer } from './server';

const log = logger.child('Mcp');

const description = [
  'MCP (JSON-RPC over Streamable HTTP) endpoint.',
  '',
  '**Required headers:**',
  '- `Content-Type: application/json`',
  '- `Accept: application/json, text/event-stream` (both media types must be listed; `*/*` is rejected by the MCP transport).',
  '',
  '**Example — list registered tools:**',
  '',
  '```json',
  '{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }',
  '```',
  '',
  '**Example — call a tool:**',
  '',
  '```json',
  '{',
  '  "jsonrpc": "2.0",',
  '  "id": 2,',
  '  "method": "tools/call",',
  '  "params": { "name": "<tool>", "arguments": { /* ... */ } }',
  '}',
  '```',
].join('\n');

/**
 * Builds the controller registered at `POST {prefix}{path}` when
 * `config.mcpServer.enabled === true`. The handler:
 *
 *   1. Emits an AUDIT event via {@link auditMcpRequest}.
 *   2. Creates a fresh stateless `StreamableHTTPServerTransport` per request.
 *   3. Connects the singleton {@link mcpServer} and dispatches the JSON-RPC body.
 *
 * Throttle defaults to `'PERMISSIVE'`; override via `config.mcpServer.throttle`.
 */
export const createMcpController = (throttle: ThrottlePreset | ThrottleConfig): ControllerFactory<unknown> => {
  return defineController<unknown>({
    throttleConfig: throttle,
    summary: 'MCP endpoint (JSON-RPC / Streamable HTTP)',
    responses: {
      200: { description: 'JSON-RPC response (single JSON or SSE stream depending on client Accept).' },
    },
    handler: async (req: Request, res: Response) => {
      auditMcpRequest(req);

      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        transport.close();
        if (req.body?.method === 'initialize') {
          auditMcpSessionEnded(req);
        }
      });
      try {
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        log.error('MCP request failed', { error: error as Error });
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal MCP error' },
            id: null,
          });
        }
      }
    },
  });
};

export const mcpEndpointDescription = description;