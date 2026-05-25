import type { FastifyRequest, FastifyReply } from 'fastify';
import { HttpException } from '../exceptions/http.exception';
import { logger } from '../logger/superman-logger';
import { buildErrorLog, responseSeverityOf } from '../logger/log-builders';
import { EventSeverity } from '../logger/superman-logger.types';

const log = logger.child('Exception');

export function globalExceptionMiddleware(
  err: Error,
  req: FastifyRequest,
  res: FastifyReply,
): void {
  const locals = (res as any).locals || ((res as any).locals = {});
  locals.exceptionName = err.constructor.name;

  const requestId = (locals.requestId as string | undefined) ?? 'unknown';

  if (err instanceof HttpException) {
    locals.exceptionMetadata = err.metadata;
    const severity = responseSeverityOf(err.statusCode);
    const meta = { statusCode: err.statusCode, ...(err.metadata ?? {}) };

    if (severity === EventSeverity.ERROR) {
      log.error(err.message, meta);
    } else {
      log.warn(err.message, meta);
    }

    const body: Record<string, unknown> = { error: err.message };
    if (err.metadata) body.metadata = err.metadata;

    res.status(err.statusCode).send(body);
    if (severity === EventSeverity.ERROR) {
      log.events.error(buildErrorLog({ err, req: req as any, requestId }));
    }
    return;
  }

  log.error(err.message, { stack: err.stack?.split('\n')[1]?.trim() });
  log.events.error(buildErrorLog({ err, req: req as any, requestId }));
  res.status(500).send({ error: 'Internal Server Error' });
}
