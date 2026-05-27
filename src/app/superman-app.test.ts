import { SupermanApp, SupermanExpressApp } from './superman-app';
import { SupermanModule } from '../core/superman-module';

describe('SupermanApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create an app with default options', () => {
      // Arrange & Act
      const app = new SupermanApp();

      // Assert
      expect(app.serverInstanceUid).toBeDefined();
      expect(app.serverInstanceUid).toMatch(/^srv_/);
      expect(app.serverInstanceUid).toHaveLength(40);
    }, 1000);
  });

  describe('serverInstanceUid', () => {
    it('should share the same process-scoped UID across instances', () => {
      // Arrange & Act
      const app1 = new SupermanApp();
      const app2 = new SupermanApp();

      // Assert
      expect(app1.serverInstanceUid).toBe(app2.serverInstanceUid);
      expect(app1.serverInstanceUid).toMatch(/^srv_/);
      expect(app1.serverInstanceUid).toHaveLength(40);
    }, 1000);
  });

  describe('registerModule', () => {
    it('should call register on the module', async () => {
      // Arrange
      const registerFn = jest.fn();
      const mod = new SupermanModule(registerFn, { name: 'TestModule' });
      const app = new SupermanApp();

      // Act
      await app.registerModule('/test', mod);

      // Assert
      expect(registerFn).toHaveBeenCalledWith(expect.any(Object));
    }, 1000);

    it('should return the app instance for chaining', async () => {
      // Arrange
      const mod = new SupermanModule(jest.fn());
      const app = new SupermanApp();

      // Act
      const result = await app.registerModule('/test', mod);

      // Assert
      expect(result).toBe(app);
    }, 1000);
  });

  describe('shutdown', () => {
    it('should call destroy on all registered modules', async () => {
      // Arrange
      const destroyFn1 = jest.fn();
      const destroyFn2 = jest.fn();
      const mod1 = new SupermanModule(jest.fn(), { destroy: destroyFn1 });
      const mod2 = new SupermanModule(jest.fn(), { destroy: destroyFn2 });
      const app = new SupermanApp();
      await app.registerModule('/a', mod1);
      await app.registerModule('/b', mod2);

      // Act
      await app.shutdown();

      // Assert
      expect(destroyFn1).toHaveBeenCalled();
      expect(destroyFn2).toHaveBeenCalled();
    }, 1000);

    it('should not throw when no modules are registered', async () => {
      // Arrange
      const app = new SupermanApp();

      // Act & Assert
      await expect(app.shutdown()).resolves.toBeUndefined();
    }, 1000);
  });

  describe('getFastifyApp', () => {
    it('should return the underlying Fastify app', () => {
      // Arrange
      const app = new SupermanApp();

      // Act
      const fastifyApp = app.getFastifyApp();

      // Assert
      expect(fastifyApp).toBeDefined();
      expect(typeof fastifyApp.route).toBe('function');
    }, 1000);
  });

  describe('useMiddleware', () => {
    it('should add middleware to the Fastify app', () => {
      // Arrange
      const app = new SupermanApp();
      const middleware = jest.fn();

      // Act
      const result = app.useMiddleware(middleware);

      // Assert
      expect(result).toBe(app);
    }, 1000);
  });

  describe('backward compatibility', () => {
    it('should export SupermanExpressApp as alias for SupermanApp', () => {
      // Assert
      expect(SupermanExpressApp).toBe(SupermanApp);
    }, 1000);
  });
});

