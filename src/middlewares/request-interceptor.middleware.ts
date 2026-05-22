import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
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

const captureResponseBody = (res: Response): void => {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    res.locals.__responseBody = body;
    return originalJson(body);
  };
  const originalSend = res.send.bind(res);
  res.send = (body: unknown) => {
    if (res.locals.__responseBody === undefined) {
      if (Buffer.isBuffer(body)) {
        res.locals.__responseBody = '<binary>';
      } else if (typeof body === 'string') {
        try { res.locals.__responseBody = JSON.parse(body); }
        catch { res.locals.__responseBody = body; }
      } else {
        res.locals.__responseBody = body;
      }
    }
    return originalSend(body);
  };
};

export function requestInterceptorMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const method = req.method;
  const url = req.originalUrl;

  const requestId = headerString(req.headers['x-request-id']) ?? randomUUID();
  const traceId = headerString(req.headers['x-trace-id']) ?? requestId;

  res.locals.requestId = requestId;
  res.locals.traceId = traceId;
  res.setHeader('X-Request-Id', requestId);

  captureResponseBody(res);

  writeEventSummaryLine({
    severity: EventSeverity.INFO,
    context: 'HTTP',
    eventType: EventType.REQUEST,
    summary: `${method} ${url}`,
  });

  // Emit REQUEST log after the request stream is fully consumed (so any body
  // parser has populated req.body) but before the route handler runs - keeps
  // it isolated from response timing/hangs. setImmediate defers past body
  // parser's microtask that sets req.body.
  let requestEmitted = false;
  const emitRequest = (): void => {
    if (requestEmitted) return;
    requestEmitted = true;
    log.events.request(buildRequestLog({ req, requestId, traceId }));
  };
  req.once('end', () => setImmediate(emitRequest));
  // Safety net: if the request stream never emits 'end' (handler responds
  // without ever consuming body, or there is no body parser) we still log.
  res.once('finish', emitRequest);
  res.once('close', emitRequest);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const route = req.route?.path ?? url.split('?')[0];

    writeEventSummaryLine({
      severity: responseSeverityOf(status),
      context: 'HTTP',
      eventType: EventType.RESPONSE,
      summary: `${status} ${route} (${duration}ms)`,
    });
    log.events.response(buildResponseLog({ req, res, requestId, responseTimeMs: duration }));

    const auditLog = buildAuditLog({ req, res, requestId, prefix: config.isInitialized() ? config.prefix : '' });
    if (auditLog) log.events.audit(auditLog);

    const exceptionName = res.locals.exceptionName as string | undefined;
    const securityLog = buildSecurityLog({ req, res, requestId, traceId, exceptionName });
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

  next();
}
