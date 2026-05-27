import { randomBytes } from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  AuditEvents,
  AuditLog,
  AuthOutcome,
  ErrorLog,
  ErrorType,
  EventSeverity,
  EventType,
  RequestLog,
  ResponseLog,
  SecurityEvents,
  SecurityLog,
  SystemEvent,
  SystemLog,
  SystemStatus,
} from './superman-logger.types';
import { HttpException } from '../exceptions/http.exception';

type InfraFields =
  | '@timestamp'
  | 'eventType'
  | 'context'
  | 'appName'
  | 'appVersion'
  | 'environment'
  | 'serverInstanceUid'
  | 'hostname'
  | 'uptimeMs'
  | 'memoryUsage'
  | 'cpuUsage';

export type SystemLogInput = Omit<SystemLog, InfraFields>;
export type RequestLogInput = Omit<RequestLog, InfraFields>;
export type ResponseLogInput = Omit<ResponseLog, InfraFields>;
export type ErrorLogInput = Omit<ErrorLog, InfraFields>;
export type AuditLogInput = Omit<AuditLog, InfraFields>;
export type SecurityLogInput = Omit<SecurityLog, InfraFields>;

export const statusClassOf = (code: number): '2xx' | '3xx' | '4xx' | '5xx' => {
  if (code < 300) return '2xx';
  if (code < 400) return '3xx';
  if (code < 500) return '4xx';
  return '5xx';
};

const ERROR_STATUS_CODES = new Set<number>([400, 422]);

export const responseSeverityOf = (code: number): EventSeverity => {
  if (code >= 500) return EventSeverity.ERROR;
  if (ERROR_STATUS_CODES.has(code)) return EventSeverity.ERROR;
  if (code >= 400) return EventSeverity.WARN;
  return EventSeverity.INFO;
};

export const extractResource = (originalUrl: string, prefix: string): string => {
  const withoutPrefix = prefix && originalUrl.startsWith(prefix)
    ? originalUrl.slice(prefix.length)
    : originalUrl;
  const path = withoutPrefix.split('?')[0];
  const segments = path.split('/').filter(Boolean);
  return segments[0] || 'root';
};

export const mapStatusToSecurityEvent = (status: number): {
  securityEvent: SecurityEvents;
  authOutcome: AuthOutcome;
  eventSeverity: EventSeverity;
} | null => {
  if (status === 401) {
    return { securityEvent: SecurityEvents.UNAUTHORIZED_ACCESS, authOutcome: AuthOutcome.DENIED, eventSeverity: EventSeverity.WARN };
  }
  if (status === 403) {
    return { securityEvent: SecurityEvents.FORBIDDEN_ACTION, authOutcome: AuthOutcome.DENIED, eventSeverity: EventSeverity.WARN };
  }
  if (status === 413) {
    return { securityEvent: SecurityEvents.PAYLOAD_TOO_LARGE, authOutcome: AuthOutcome.DENIED, eventSeverity: EventSeverity.WARN };
  }
  if (status === 422) {
    return { securityEvent: SecurityEvents.MALFORMED_PAYLOAD, authOutcome: AuthOutcome.DENIED, eventSeverity: EventSeverity.WARN };
  }
  if (status === 429) {
    return { securityEvent: SecurityEvents.RATE_LIMIT_EXCEEDED, authOutcome: AuthOutcome.BLOCKED_TEMPORARILY, eventSeverity: EventSeverity.SECURITY };
  }
  return null;
};

export const mapMethodToAuditEvent = (method: string, status: number): AuditEvents | null => {
  const m = method.toUpperCase();
  // Tight HTTP semantics so RPC-style POSTs (login, search, JSON-RPC) and
  // idempotent PUT/PATCH/DELETE don't emit spurious audits. Only the
  // canonical status codes per RFC 9110 Â§15.3 trigger the auto-audit:
  //   POST           â†’ 201 Created
  //   PUT / PATCH    â†’ 200 OK or 204 No Content
  //   DELETE         â†’ 200 OK or 204 No Content
  if (m === 'POST'   && status === 201) return AuditEvents.RESOURCE_CREATED;
  if ((m === 'PUT' || m === 'PATCH') && (status === 200 || status === 204)) return AuditEvents.RESOURCE_UPDATED;
  if (m === 'DELETE' && (status === 200 || status === 204)) return AuditEvents.RESOURCE_DELETED;
  return null;
};

const mapErrorToErrorType = (err: Error): ErrorType => {
  if (err instanceof HttpException) return ErrorType.HTTP_EXCEPTION;
  return ErrorType.RUNTIME_ERROR;
};

const extractIp = (req: FastifyRequest): string =>
  req.ip ?? req.raw.socket?.remoteAddress ?? 'unknown';

const contentLength = (headerValue: string | string[] | undefined): number => {
  if (!headerValue) return 0;
  const v = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const hasUsefulBody = (body: unknown): boolean => {
  if (body == null) return false;
  if (typeof body === 'string') return body.length > 0;
  if (Buffer.isBuffer(body)) return false;
  if (typeof body === 'object') return Object.keys(body as object).length > 0;
  return true;
};

export interface BuildRequestLogOptions {
  req: FastifyRequest;
  requestId: string;
  traceId: string;
}

export const buildRequestLog = ({ req, requestId, traceId }: BuildRequestLogOptions): RequestLogInput => {
  const query = req.query as Record<string, string> | undefined;
  const body = req.body as unknown;
  return {
    eventSeverity: EventSeverity.INFO,
    ip: extractIp(req),
    requestId,
    traceId,
    method: req.method,
    url: req.url,
    route: req.routeOptions?.url ?? req.url.split('?')[0],
    query: query && Object.keys(query).length > 0 ? query : undefined,
    requestBody: hasUsefulBody(body) ? body : undefined,
    userAgent: req.headers['user-agent'] as string | undefined,
    referrer: (req.headers['referer'] as string | undefined) ?? (req.headers['referrer'] as string | undefined),
    bytesReceived: contentLength(req.headers['content-length']),
  };
};

export interface BuildResponseLogOptions {
  req: FastifyRequest;
  res: FastifyReply;
  requestId: string;
  responseTimeMs: number;
}

export const buildResponseLog = ({ req, res, requestId, responseTimeMs }: BuildResponseLogOptions): ResponseLogInput => {
  const statusCode = res.statusCode;
  const bytesSentHeader = res.getHeader('content-length');
  const bytesSent = typeof bytesSentHeader === 'number'
    ? bytesSentHeader
    : contentLength(bytesSentHeader as string | undefined);

  return {
    eventSeverity: responseSeverityOf(statusCode),
    requestId,
    route: req.routeOptions?.url ?? req.url.split('?')[0],
    statusCode,
    statusClass: statusClassOf(statusCode),
    responseTimeMs,
    responseBody: ((res as any).locals?.__responseBody as unknown) ?? undefined,
    bytesSent: bytesSent || undefined,
  };
};

export interface BuildAuditLogOptions {
  req: FastifyRequest;
  res: FastifyReply;
  requestId: string;
  prefix: string;
}

export const buildAuditLog = ({ req, res, requestId, prefix }: BuildAuditLogOptions): AuditLogInput | null => {
  const auditEvent = mapMethodToAuditEvent(req.method, res.statusCode);
  if (!auditEvent) return null;

  // The audit log is a correlation-only event marker: it records that an action
  // happened on a resource type, by whom, and a `requestId`. The mutated payload
  // is recovered from the correlated REQUEST/RESPONSE logs via that `requestId`.
  const resource = extractResource(req.url, prefix);
  const userId = ((res as any).locals?.userId as string | undefined) ?? undefined;
  const userRoles = ((res as any).locals?.userRoles as string[] | undefined) ?? [];

  return {
    requestId,
    ip: extractIp(req),
    userId,
    auditEvent,
    userRoles,
    auditMessage: `${auditEvent} on resource "${resource}"`,
    resource,
  };
};

export interface BuildSecurityLogOptions {
  req: FastifyRequest;
  res: FastifyReply;
  requestId: string;
  traceId: string;
  exceptionName?: string;
}

export const buildSecurityLog = ({
  req, res, requestId, traceId, exceptionName,
}: BuildSecurityLogOptions): SecurityLogInput | null => {
  const mapping = mapStatusToSecurityEvent(res.statusCode);
  if (!mapping) return null;

  const prefix = exceptionName ? `${exceptionName}: ` : '';
  const securityMessage = `${prefix}${mapping.securityEvent} on ${req.method} ${req.url}`;

  return {
    eventSeverity: mapping.eventSeverity,
    ip: extractIp(req),
    traceId,
    requestId,
    securityEvent: mapping.securityEvent,
    authOutcome: mapping.authOutcome,
    securityMessage,
  };
};

/** Short, user-quotable error id: `err_` + 4 random bytes as hex (e.g. `err_3f2a9c8e`). */
export const generateErrorId = (): string => `err_${randomBytes(4).toString('hex')}`;

export interface BuildErrorLogOptions {
  err: Error;
  req: FastifyRequest;
  requestId: string;
  /** Shared `err_`-prefixed id; generated here when the caller doesn't supply one. */
  errorId?: string;
}

export const buildErrorLog = ({ err, req, requestId, errorId }: BuildErrorLogOptions): ErrorLogInput => ({
  eventSeverity: EventSeverity.ERROR,
  causeUrl: `${req.method} ${req.url}`,
  requestId,
  errorId: errorId ?? generateErrorId(),
  errorType: mapErrorToErrorType(err),
  errorMessage: err.message,
  stackTrace: err.stack,
  ip: extractIp(req),
});

export interface BuildSystemLogOptions {
  systemEvent: SystemEvent;
  systemStatus: SystemStatus;
  systemMessage: string;
  eventSeverity?: EventSeverity;
  metadata?: Record<string, unknown>;
}

export const buildSystemLog = ({
  systemEvent, systemStatus, systemMessage, eventSeverity, metadata,
}: BuildSystemLogOptions): SystemLogInput => ({
  eventSeverity: eventSeverity ?? EventSeverity.INFO,
  systemEvent,
  systemStatus,
  systemMessage,
  metadata,
});

export const EVENT_TYPE_OF = {
  system: EventType.SYSTEM,
  request: EventType.REQUEST,
  response: EventType.RESPONSE,
  error: EventType.ERROR,
  audit: EventType.AUDIT,
  security: EventType.SECURITY,
} as const;

