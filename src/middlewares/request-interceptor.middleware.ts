import { randomUUID } from 'crypto';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { logger } from '../logger/superman-logger';
import { config } from '../config/superman-config';
import {
  buildAuditLog,
  buildRequestLog,
  buildResponseLog,
  buildSecurityLog,
  responseSeverityOf,
} from '../logger/log-builders';
import { writeEventSummaryLine } from '../logger/pretty-formatter';
import { EventSeverity, EventType } from '../logger/superman-logger.types';

const log = logger.child('HTTP');

const headerString = (value: string | string[] | undefined): string | undefined => {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
};

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (req, res) => {
    const method = req.method;
    const url = req.url;

    const requestId = headerString(req.headers['x-request-id']) ?? `req_${randomUUID()}`;
    const traceId = headerString(req.headers['x-trace-id']) ?? requestId;

    const locals = (res as any).locals || ((res as any).locals = {});
    locals.requestId = requestId;
    locals.traceId = traceId;
    res.header('X-Request-Id', requestId);

    writeEventSummaryLine({
      severity: EventSeverity.INFO,
      context: 'HTTP',
      eventType: EventType.REQUEST,
      summary: `${method} ${url}`,
    });
  });

  fastify.addHook('preHandler', async (req, res) => {
    const locals = (res as any).locals || {};
    log.events.request(buildRequestLog({ req: req as any, requestId: locals.requestId, traceId: locals.traceId }));
  });

  fastify.addHook('onSend', async (req, res, payload) => {
    const locals = (res as any).locals || ((res as any).locals = {});
    locals.__responseBody = payload;
  });

  fastify.addHook('onResponse', async (req, res) => {
    const status = res.statusCode;
    const route = req.routeOptions?.url ?? req.url.split('?')[0];
    const duration = res.elapsedTime;
    const locals = (res as any).locals || {};
    const requestId = locals.requestId ?? 'unknown';
    const traceId = locals.traceId ?? requestId;

    writeEventSummaryLine({
      severity: responseSeverityOf(status),
      context: 'HTTP',
      eventType: EventType.RESPONSE,
      summary: `${status} ${route} (${Math.round(duration)}ms)`,
    });
    log.events.response(buildResponseLog({ req: req as any, res: res as any, requestId, responseTimeMs: duration }));

    const auditLog = buildAuditLog({ req: req as any, res: res as any, requestId, prefix: config.isInitialized() ? config.prefix : '' });
    if (auditLog) log.events.audit(auditLog);

    const exceptionName = locals.exceptionName as string | undefined;
    const securityLog = buildSecurityLog({ req: req as any, res: res as any, requestId, traceId, exceptionName });
    if (securityLog) {
      writeEventSummaryLine({
        severity: securityLog.eventSeverity,
        context: 'HTTP',
        eventType: EventType.SECURITY,
        summary: `${securityLog.securityEvent} (${securityLog.authOutcome})`,
      });
      log.events.security(securityLog);
    }
  });
};

export const requestInterceptorMiddleware = fp(plugin, { name: 'superman-request-interceptor' });
