import { Request, Response, NextFunction } from 'express';
import { HttpException } from '../exceptions/http.exception';
import { logger } from '../logger/superman-logger';
import { buildErrorLog, responseSeverityOf } from '../logger/log-builders';
import { EventSeverity } from '../logger/superman-logger.types';

const log = logger.child('Exception');

export function globalExceptionMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  res.locals.exceptionName = err.constructor.name;

  const requestId = (res.locals.requestId as string | undefined) ?? 'unknown';

  if (err instanceof HttpException) {
    res.locals.exceptionMetadata = err.metadata;
    const severity = responseSeverityOf(err.statusCode);
    const meta = { statusCode: err.statusCode, ...(err.metadata ?? {}) };

    if (severity === EventSeverity.ERROR) {
      log.error(err.message, meta);
    } else {
      log.warn(err.message, meta);
    }

    const body: Record<string, unknown> = { error: err.message };
    if (err.metadata) body.metadata = err.metadata;

    res.status(err.statusCode).json(body);
    if (severity === EventSeverity.ERROR) {
      log.events.error(buildErrorLog({ err, req, requestId }));
    }
    return;
  }

  log.error(err.message, { stack: err.stack?.split('\n')[1]?.trim() });
  log.events.error(buildErrorLog({ err, req, requestId }));
  res.status(500).json({ error: 'Internal Server Error' });
}
