import { defineModule, flushPendingModules } from './define-module';
import { SupermanController } from './superman-controller';

describe('defineModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    flushPendingModules(); // clear queue between tests
  });

  it('should queue the module definition', () => {
    // Arrange
    const controller = new SupermanController(jest.fn());

    // Act
    defineModule({
      name: 'TestModule',
      prefix: '/test',
      routes: [{ method: 'GET', path: '/hello', controller }],
    });

    // Assert
    const pending = flushPendingModules();
    expect(pending).toHaveLength(1);
    expect(pending[0].name).toBe('TestModule');
  }, 1000);

  it('should queue multiple modules', () => {
    // Arrange
    const controller = new SupermanController(jest.fn());

    // Act
    defineModule({
      name: 'ModuleA',
      prefix: '/a',
      routes: [{ method: 'GET', path: '/', controller }],
    });
    defineModule({
      name: 'ModuleB',
      prefix: '/b',
      routes: [{ method: 'POST', path: '/', controller }],
    });

    // Assert
    const pending = flushPendingModules();
    expect(pending).toHaveLength(2);
    expect(pending[0].name).toBe('ModuleA');
    expect(pending[1].name).toBe('ModuleB');
  }, 1000);

  it('should clear the queue after flush', () => {
    // Arrange
    const controller = new SupermanController(jest.fn());
    defineModule({
      name: 'FlushModule',
      prefix: '/flush',
      routes: [{ method: 'GET', path: '/', controller }],
    });

    // Act
    flushPendingModules();
    const secondFlush = flushPendingModules();

    // Assert
    expect(secondFlush).toHaveLength(0);
  }, 1000);

  it('should preserve route definitions', () => {
    // Arrange
    const getController = new SupermanController(jest.fn());
    const postController = new SupermanController(jest.fn());

    // Act
    defineModule({
      name: 'RoutesModule',
      prefix: '/routes',
      routes: [
        { method: 'GET', path: '/items', controller: getController },
        { method: 'POST', path: '/items', controller: postController },
      ],
    });

    // Assert
    const pending = flushPendingModules();
    expect(pending[0].routes).toHaveLength(2);
    expect(pending[0].routes[0].method).toBe('GET');
    expect(pending[0].routes[1].method).toBe('POST');
  }, 1000);

  it('should preserve destroy function', () => {
    // Arrange
    const destroyFn = jest.fn();
    const controller = new SupermanController(jest.fn());

    // Act
    defineModule({
      name: 'DestroyModule',
      prefix: '/destroy',
      routes: [{ method: 'GET', path: '/', controller }],
      destroy: destroyFn,
    });

    // Assert
    const pending = flushPendingModules();
    expect(pending[0].destroy).toBe(destroyFn);
  }, 1000);

  it('should preserve middlewares', () => {
    // Arrange
    const middleware = jest.fn();
    const controller = new SupermanController(jest.fn());

    // Act
    defineModule({
      name: 'MwModule',
      prefix: '/mw',
      routes: [{ method: 'GET', path: '/', controller }],
      middlewares: [middleware],
    });

    // Assert
    const pending = flushPendingModules();
    expect(pending[0].middlewares).toHaveLength(1);
  }, 1000);
});

