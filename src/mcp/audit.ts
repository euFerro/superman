import type { Request } from 'express';

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
 * `MCP_SESSION_ENDED` is reserved for stateful transports — not emitted by the
 * default stateless `StreamableHTTPServerTransport`.
 *
 * The `resourceId` is best-effort: if the tool argument carries a `codCliente`
 * or `cpfOuCnpj` string, it's surfaced for log filtering. Add your own
 * conventions by post-processing in your log sink.
 */
export const auditMcpRequest = (req: Request): void => {
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
  const args = body.params?.arguments ?? {};
  const resourceId =
    typeof args['codCliente'] === 'string'
      ? (args['codCliente'] as string)
      : typeof args['cpfOuCnpj'] === 'string'
        ? (args['cpfOuCnpj'] as string)
        : undefined;

  log.events.audit({
    auditEvent: AuditEvents.MCP_TOOL_EXECUTED,
    eventSeverity: EventSeverity.INFO,
    auditMessage: `MCP tool executed: ${toolName} by ${client.name}${versionSuffix} (${client.ip})`,
    resource: `mcp.tool/${toolName}`,
    ...(resourceId ? { resourceId } : {}),
    userRoles: ['mcp-client'],
  });
};