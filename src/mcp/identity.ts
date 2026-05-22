import type { Request } from 'express';

import type { JsonRpcBody, McpClientIdentity } from './types';

/**
 * Extracts the best-effort identity of the MCP client that issued the request.
 *
 * Priority for `name` and `version`:
 *   1. `params.clientInfo` (sent on `initialize` by the MCP client) — canonical.
 *   2. First segment of `User-Agent` (e.g. `claude-code/2.1.0` → `claude-code`).
 *   3. The literal string `'unknown'`.
 *
 * In stateless mode (the framework default), `clientInfo` is only present on
 * `initialize` requests; subsequent `tools/call` requests will resolve identity
 * from `User-Agent` alone.
 */
export const identifyMcpClient = (req: Request, body: JsonRpcBody | undefined): McpClientIdentity => {
  const userAgent = String(req.headers['user-agent'] ?? 'unknown');
  const ip = String(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  const clientInfo = body?.params?.clientInfo;
  const inferredName = clientInfo?.name ?? userAgent.split('/')[0] ?? 'unknown';
  const identity: McpClientIdentity = { name: inferredName, userAgent, ip };
  if (clientInfo?.version) identity.version = clientInfo.version;
  return identity;
};