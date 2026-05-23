import type { Request } from 'express';

import { logger } from '../logger/superman-logger';
import { AuditEvents, EventSeverity } from '../logger/superman-logger.types';
import { config } from '../config/superman-config';

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
 * The `resourceId` is best-effort: if the tool argument carries a `userId`
 * or `customerId` string, it's surfaced for log filtering. Add your own
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
  let resourceId: string | undefined;

  if (config.isInitialized()) {
    const patterns = config.logger.events.audit.resourceIdPatterns;
    let found = false;
    for (const [key, value] of Object.entries(args)) {
      if (typeof value !== 'string') continue;
      
      for (const pattern of patterns) {
        const lowerKey = key.toLowerCase();
        const lowerPattern = pattern.toLowerCase();
        
        const isTokenMatch = key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().split(/[-_]+/).includes(lowerPattern);
        const isMatch = pattern.length > 3 ? lowerKey.includes(lowerPattern) : isTokenMatch;

        if (isMatch) {
          resourceId = value;
          found = true;
          break;
        }
      }
      if (found) break;
    }
  } else {
    resourceId =
      typeof args['userId'] === 'string'
        ? (args['userId'] as string)
        : typeof args['customerId'] === 'string'
          ? (args['customerId'] as string)
          : undefined;
  }

  log.events.audit({
    auditEvent: AuditEvents.MCP_TOOL_EXECUTED,
    eventSeverity: EventSeverity.INFO,
    auditMessage: `MCP tool executed: ${toolName} by ${client.name}${versionSuffix} (${client.ip})`,
    resource: `mcp.tool/${toolName}`,
    ...(resourceId ? { resourceId } : {}),
    userRoles: ['mcp-client'],
  });
};

export const auditMcpSessionEnded = (req: Request): void => {
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