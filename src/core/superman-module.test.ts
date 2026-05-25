import type { FastifyRequest, FastifyReply } from 'fastify';
import Fastify from 'fastify';
import { SupermanModule } from './superman-module';

describe('SupermanModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('plugin', () => {
    it('should call the register function with fastify instance', async () => {
      // Arrange
      const registerFn = jest.fn();
      const mod = new SupermanModule(registerFn);
      const fastify = Fastify();

      // Act
      await fastify.register(mod.plugin);

      // Assert
      expect(registerFn).toHaveBeenCalledWith(expect.anything());
    }, 1000);

    it('should handle async register functions', async () => {
      // Arrange
      let registered = false;
      const mod = new SupermanModule(async () => {
        await Promise.resolve();
        registered = true;
      });
      const fastify = Fastify();

      // Act
      await fastify.register(mod.plugin);

      // Assert
      expect(registered).toBe(true);
    }, 1000);

    it('should apply module middlewares', async () => {
      // Arrange
      const callOrder: string[] = [];
      const middleware = async (_req: FastifyRequest, _res: FastifyReply) => {
        callOrder.push('middleware');
      };
      const mod = new SupermanModule(
        (f) => {
          f.get('/', async () => {
            callOrder.push('handler');
            return 'ok';
          });
        },
        { middlewares: [middleware] },
      );
      const fastify = Fastify();

      // Act
      await fastify.register(mod.plugin);
      await fastify.inject({ method: 'GET', url: '/' });

      // Assert
      expect(callOrder).toEqual(['middleware', 'handler']);
    }, 1000);
  });

  describe('destroy', () => {
    it('should call the destroy function when provided', async () => {
      // Arrange
      const destroyFn = jest.fn();
      const mod = new SupermanModule(jest.fn(), { destroy: destroyFn });

      // Act
      await mod.destroy();

      // Assert
      expect(destroyFn).toHaveBeenCalled();
    }, 1000);

    it('should not throw when destroy is not provided', async () => {
      // Arrange
      const mod = new SupermanModule(jest.fn());

      // Act & Assert
      await expect(mod.destroy()).resolves.toBeUndefined();
    }, 1000);

    it('should handle async destroy functions', async () => {
      // Arrange
      let destroyed = false;
      const mod = new SupermanModule(jest.fn(), {
        destroy: async () => {
          await Promise.resolve();
          destroyed = true;
        },
      });

      // Act
      await mod.destroy();

      // Assert
      expect(destroyed).toBe(true);
    }, 1000);
  });

  describe('options', () => {
    it('should default name to SupermanModule', () => {
      // Arrange & Act
      const mod = new SupermanModule(jest.fn());

      // Assert
      expect(mod.name).toBe('SupermanModule');
    }, 1000);

    it('should use provided name', () => {
      // Arrange & Act
      const mod = new SupermanModule(jest.fn(), { name: 'UsersModule' });

      // Assert
      expect(mod.name).toBe('UsersModule');
    }, 1000);
  });
});
