import type { FastifyRequest } from 'fastify';

import { logger } from '../logger/superman-logger';
import { AuditEvents, EventSeverity } from '../logger/superman-logger.types';

import { identifyMcpClient } from './identity';
import type { JsonRpcBody } from './types';

const log = logger.child('Mcp');

/**
 * Emits a typed AUDIT event for every meaningful MCP request:
 *   - `initialize`  → `AuditEvents.MCP_SESSION_STARTED` (resource `mcp.session`)
 *   - `tools/call`  → `AuditEvents.MCP_TOOL_EXECUTED`  (resource `mcp.tool/<name>`)
 *
 *   - `initialize` connection closes → `AuditEvents.MCP_SESSION_ENDED`
 *
 * Even though StreamableHTTPServerTransport handles a single HTTP connection,
 * tracking when the `initialize` request closes allows us to bookend the session.
 *
 * The audit event is a correlation-only marker; the tool arguments themselves
 * live in the correlated REQUEST log, joinable via `requestId`.
 */
export const auditMcpRequest = (req: FastifyRequest): void => {
  const body = req.body as JsonRpcBody | undefined;
  if (!body || typeof body !== 'object') return;

  const client = identifyMcpClient(req, body);
  const versionSuffix = client.version ? ` v${client.version}` : '';

  if (body.method === 'initialize') {
    log.events.audit({
      auditEvent: AuditEvents.MCP_SESSION_STARTED,
      eventSeverity: EventSeverity.INFO,
      auditMessage: `MCP session started: ${client.name}${versionSuffix} (${client.ip})`,
      resource: 'mcp.session',
      userRoles: ['mcp-client'],
    });
    return;
  }

  if (body.method !== 'tools/call') return;

  const toolName = body.params?.name ?? 'unknown';

  log.events.audit({
    auditEvent: AuditEvents.MCP_TOOL_EXECUTED,
    eventSeverity: EventSeverity.INFO,
    auditMessage: `MCP tool executed: ${toolName} by ${client.name}${versionSuffix} (${client.ip})`,
    resource: `mcp.tool/${toolName}`,
    userRoles: ['mcp-client'],
  });
};

export const auditMcpSessionEnded = (req: FastifyRequest): void => {
  const body = req.body as JsonRpcBody | undefined;
  if (!body || typeof body !== 'object') return;

  const client = identifyMcpClient(req, body);
  const versionSuffix = client.version ? ` v${client.version}` : '';

  log.events.audit({
    auditEvent: AuditEvents.MCP_SESSION_ENDED,
    eventSeverity: EventSeverity.INFO,
    auditMessage: `MCP session ended: ${client.name}${versionSuffix} (${client.ip})`,
    resource: 'mcp.session',
    userRoles: ['mcp-client'],
  });
};