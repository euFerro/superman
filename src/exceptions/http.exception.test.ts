import {
  HttpException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  GoneException,
  PayloadTooLargeException,
  UnprocessableEntityException,
  TooManyRequestsException,
  InternalServerErrorException,
  NotImplementedException,
  BadGatewayException,
  ServiceUnavailableException,
  GatewayTimeoutException,
} from './http.exception';

describe('HttpException', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should store statusCode and message', () => {
    // Arrange & Act
    const exception = new HttpException(418, 'I am a teapot');

    // Assert
    expect(exception.statusCode).toBe(418);
    expect(exception.message).toBe('I am a teapot');
    expect(exception.name).toBe('HttpException');
  }, 1000);

  it('should extend Error', () => {
    // Arrange & Act
    const exception = new HttpException(500, 'Error');

    // Assert
    expect(exception).toBeInstanceOf(Error);
  }, 1000);

  test.each([
    ['BadRequestException', BadRequestException, 400, 'Bad Request'],
    ['UnauthorizedException', UnauthorizedException, 401, 'Unauthorized'],
    ['ForbiddenException', ForbiddenException, 403, 'Forbidden'],
    ['NotFoundException', NotFoundException, 404, 'Not Found'],
    ['ConflictException', ConflictException, 409, 'Conflict'],
    ['GoneException', GoneException, 410, 'Gone'],
    ['PayloadTooLargeException', PayloadTooLargeException, 413, 'Payload Too Large'],
    ['UnprocessableEntityException', UnprocessableEntityException, 422, 'Unprocessable Entity'],
    ['TooManyRequestsException', TooManyRequestsException, 429, 'Too Many Requests'],
    ['InternalServerErrorException', InternalServerErrorException, 500, 'Internal Server Error'],
    ['NotImplementedException', NotImplementedException, 501, 'Not Implemented'],
    ['BadGatewayException', BadGatewayException, 502, 'Bad Gateway'],
    ['ServiceUnavailableException', ServiceUnavailableException, 503, 'Service Unavailable'],
    ['GatewayTimeoutException', GatewayTimeoutException, 504, 'Gateway Timeout'],
  ] as const)('%s should have status %i and default message "%s"', (_name, ExceptionClass, expectedStatus, expectedMessage) => {
    // Arrange & Act
    const exception = new ExceptionClass();

    // Assert
    expect(exception.statusCode).toBe(expectedStatus);
    expect(exception.message).toBe(expectedMessage);
    expect(exception).toBeInstanceOf(HttpException);
  }, 1000);

  test.each([
    ['BadRequestException', BadRequestException],
    ['NotFoundException', NotFoundException],
    ['InternalServerErrorException', InternalServerErrorException],
  ] as const)('%s should accept a custom message', (_name, ExceptionClass) => {
    // Arrange & Act
    const exception = new ExceptionClass('Custom message');

    // Assert
    expect(exception.message).toBe('Custom message');
  }, 1000);
});
