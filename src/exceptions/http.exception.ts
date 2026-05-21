export type ExceptionMetadata = Record<string, unknown>;

export class HttpException extends Error {
  public readonly metadata?: ExceptionMetadata;

  constructor(
    public readonly statusCode: number,
    message: string,
    metadata?: ExceptionMetadata,
  ) {
    super(message);
    this.name = this.constructor.name;
    if (metadata) this.metadata = metadata;
  }
}

export class BadRequestException extends HttpException {
  constructor(message = 'Bad Request', metadata?: ExceptionMetadata) {
    super(400, message, metadata);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = 'Unauthorized', metadata?: ExceptionMetadata) {
    super(401, message, metadata);
  }
}

export class ForbiddenException extends HttpException {
  constructor(message = 'Forbidden', metadata?: ExceptionMetadata) {
    super(403, message, metadata);
  }
}

export class NotFoundException extends HttpException {
  constructor(message = 'Not Found', metadata?: ExceptionMetadata) {
    super(404, message, metadata);
  }
}

export class ConflictException extends HttpException {
  constructor(message = 'Conflict', metadata?: ExceptionMetadata) {
    super(409, message, metadata);
  }
}

export class GoneException extends HttpException {
  constructor(message = 'Gone', metadata?: ExceptionMetadata) {
    super(410, message, metadata);
  }
}

export class PayloadTooLargeException extends HttpException {
  constructor(message = 'Payload Too Large', metadata?: ExceptionMetadata) {
    super(413, message, metadata);
  }
}

export class UnsupportedMediaTypeException extends HttpException {
  constructor(message = 'Unsupported Media Type', metadata?: ExceptionMetadata) {
    super(415, message, metadata);
  }
}

export class UnprocessableEntityException extends HttpException {
  constructor(message = 'Unprocessable Entity', metadata?: ExceptionMetadata) {
    super(422, message, metadata);
  }
}

export class TooManyRequestsException extends HttpException {
  constructor(message = 'Too Many Requests', metadata?: ExceptionMetadata) {
    super(429, message, metadata);
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(message = 'Internal Server Error', metadata?: ExceptionMetadata) {
    super(500, message, metadata);
  }
}

export class NotImplementedException extends HttpException {
  constructor(message = 'Not Implemented', metadata?: ExceptionMetadata) {
    super(501, message, metadata);
  }
}

export class BadGatewayException extends HttpException {
  constructor(message = 'Bad Gateway', metadata?: ExceptionMetadata) {
    super(502, message, metadata);
  }
}

export class ServiceUnavailableException extends HttpException {
  constructor(message = 'Service Unavailable', metadata?: ExceptionMetadata) {
    super(503, message, metadata);
  }
}

export class GatewayTimeoutException extends HttpException {
  constructor(message = 'Gateway Timeout', metadata?: ExceptionMetadata) {
    super(504, message, metadata);
  }
}
