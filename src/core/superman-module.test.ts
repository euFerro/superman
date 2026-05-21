import type { Request, Response, NextFunction } from 'express';
import { SupermanModule } from './superman-module';

describe('SupermanModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should call the register function with the router', async () => {
      // Arrange
      const registerFn = jest.fn();
      const mod = new SupermanModule(registerFn);

      // Act
      await mod.register();

      // Assert
      expect(registerFn).toHaveBeenCalledWith(mod.router);
    }, 1000);

    it('should handle async register functions', async () => {
      // Arrange
      let registered = false;
      const mod = new SupermanModule(async () => {
        await Promise.resolve();
        registered = true;
      });

      // Act
      await mod.register();

      // Assert
      expect(registered).toBe(true);
    }, 1000);

    it('should apply module middlewares before calling registerFn', async () => {
      // Arrange
      const callOrder: string[] = [];
      const middleware = (_req: Request, _res: Response, next: NextFunction) => {
        callOrder.push('middleware');
        next();
      };
      const mod = new SupermanModule(
        () => { callOrder.push('register'); },
        { middlewares: [middleware] },
      );

      // Act
      await mod.register();

      // Assert
      expect(callOrder).toEqual(['register']);
      expect(mod.router.stack).toHaveLength(1);
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

    it('should have a router instance', () => {
      // Arrange & Act
      const mod = new SupermanModule(jest.fn());

      // Assert
      expect(mod.router).toBeDefined();
    }, 1000);
  });
});

