import { SupermanController } from './superman-controller';
import { validateBody } from '../middlewares/validation/validate-body';
import { validateQuery } from '../middlewares/validation/validate-query';
import { validateContentType } from '../middlewares/validation/validate-content-type';
import { requireAuth } from '../middlewares/auth/require-auth';
import { authorize } from '../middlewares/auth/require-roles';

const handler = (): void => undefined;

describe('SupermanController.metadata synthesis from middlewares', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should synthesise request.body from validateBody', () => {
    // Arrange
    const schema = { type: 'object', properties: { name: { type: 'string' } } };

    // Act
    const controller = new SupermanController(handler, { middlewares: [validateBody(schema)] });

    // Assert
    expect(controller.metadata.request?.body?.schema).toBe(schema);
  }, 1000);

  it('should synthesise request.query from validateQuery', () => {
    // Arrange
    const schema = { type: 'object', properties: { page: { type: 'integer' } } };

    // Act
    const controller = new SupermanController(handler, { middlewares: [validateQuery(schema)] });

    // Assert
    expect(controller.metadata.request?.query).toBe(schema);
  }, 1000);

  it('should synthesise an auto-400 error when validate middlewares are present', () => {
    // Arrange / Act
    const controller = new SupermanController(handler, {
      middlewares: [validateBody({ type: 'object' })],
    });
    const codes = controller.metadata.errors?.map((e) => e.status);

    // Assert
    expect(codes).toContain(400);
  }, 1000);

  it('should synthesise security and auto-401 from requireAuth', () => {
    // Arrange / Act
    const controller = new SupermanController(handler, {
      middlewares: [requireAuth({ scheme: 'bearerAuth', verify: () => ({ id: 'x' }) })],
    });

    // Assert
    expect(controller.metadata.security).toEqual([{ bearerAuth: [] }]);
    expect(controller.metadata.errors?.map((e) => e.status)).toContain(401);
  }, 1000);

  it('should merge authorize scopes onto the preceding auth scheme', () => {
    // Arrange / Act
    const controller = new SupermanController(handler, {
      middlewares: [
        requireAuth({ scheme: 'bearerAuth', verify: () => ({ id: 'x' }) }),
        authorize({ scopes: ['users:write'] }),
      ],
    });

    // Assert
    expect(controller.metadata.security).toEqual([{ bearerAuth: ['users:write'] }]);
    expect(controller.metadata.errors?.map((e) => e.status)).toEqual(expect.arrayContaining([401, 403]));
  }, 1000);

  it('should synthesise auto-415 from validateContentType', () => {
    // Arrange / Act
    const controller = new SupermanController(handler, {
      middlewares: [validateContentType('application/json')],
    });
    const codes = controller.metadata.errors?.map((e) => e.status);

    // Assert
    expect(codes).toContain(415);
  }, 1000);

  it('should let controller.errors override middleware auto-errors with the same status', () => {
    // Arrange / Act
    const controller = new SupermanController(handler, {
      middlewares: [validateBody({ type: 'object' })],
      errors: [{ status: 400, description: 'Custom 400.' }],
    });
    const e400 = controller.metadata.errors?.find((e) => e.status === 400);

    // Assert
    expect(e400?.description).toBe('Custom 400.');
  }, 1000);
});

