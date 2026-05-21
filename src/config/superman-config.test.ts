import { SupermanConfig, defineConfig, config } from './superman-config';
import { EventType } from '../logger/superman-logger.types';

describe('SupermanConfig', () => {
  let supermanConfig: SupermanConfig;

  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    supermanConfig = new SupermanConfig();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('init', () => {
    it('should initialize with default values when no options given', () => {
      // Arrange
      process.env.NODE_ENV = 'development';

      // Act
      supermanConfig.init({});

      // Assert
      expect(supermanConfig.port).toBe(3000);
      expect(supermanConfig.jsonLimit).toBe('10mb');
      expect(supermanConfig.environment).toBe('development');
      expect(supermanConfig.isInitialized()).toBe(true);
    });

    it('should only initialize once', () => {
      // Arrange & Act
      supermanConfig.init({ port: 4000 });
      supermanConfig.init({ port: 5000 });

      // Assert
      expect(supermanConfig.port).toBe(4000);
    });

    it('should resolve port from static number', () => {
      // Arrange & Act
      supermanConfig.init({ port: 8080 });

      // Assert
      expect(supermanConfig.port).toBe(8080);
    });

    it('should resolve port from env var with fallback to default', () => {
      // Arrange
      process.env.PORT = '9090';

      // Act
      supermanConfig.init({ port: { env: 'PORT', default: 3000 } });

      // Assert
      expect(supermanConfig.port).toBe(9090);
    });

    it('should use default port when env var is not set', () => {
      // Arrange
      delete process.env.PORT;

      // Act
      supermanConfig.init({ port: { env: 'PORT', default: 6767 } });

      // Assert
      expect(supermanConfig.port).toBe(6767);
    });

    it('should set jsonLimit', () => {
      // Arrange & Act
      supermanConfig.init({ jsonLimit: '50mb' });

      // Assert
      expect(supermanConfig.jsonLimit).toBe('50mb');
    });

    it('should set prefix', () => {
      // Arrange & Act
      supermanConfig.init({ prefix: '/api' });

      // Assert
      expect(supermanConfig.prefix).toBe('/api');
    });

    it('should default prefix to empty string', () => {
      // Arrange & Act
      supermanConfig.init({});

      // Assert
      expect(supermanConfig.prefix).toBe('');
    });
  });

  describe('env', () => {
    it('should collect env vars with values', () => {
      // Arrange
      process.env.DB_URL = 'postgres://localhost/test';

      // Act
      supermanConfig.init({
        env: { DB_URL: { required: true } },
      });

      // Assert
      expect(supermanConfig.env.DB_URL).toBe('postgres://localhost/test');
    });

    it('should use default when env var is not set', () => {
      // Arrange
      delete process.env.DB_POOL;

      // Act
      supermanConfig.init({
        env: { DB_POOL: { default: '10' } },
      });

      // Assert
      expect(supermanConfig.env.DB_POOL).toBe('10');
    });

    it('should return the env var value via get(key)', () => {
      // Arrange
      process.env.DB_URL = 'postgres://localhost/test';
      supermanConfig.init({
        env: { DB_URL: { required: true } },
      });

      // Act
      const value = supermanConfig.get('DB_URL');

      // Assert
      expect(value).toBe('postgres://localhost/test');
    });

    it('should return undefined from get(key) when the key was never declared', () => {
      // Arrange
      supermanConfig.init({ env: { KNOWN: { default: 'yes' } } });

      // Act
      const value = supermanConfig.get('UNKNOWN');

      // Assert
      expect(value).toBeUndefined();
    });

    it('should throw when required env var is missing', () => {
      // Arrange
      delete process.env.SECRET_KEY;

      // Act & Assert
      expect(() =>
        supermanConfig.init({
          env: { SECRET_KEY: { required: true } },
        }),
      ).toThrow('Missing required environment variable: SECRET_KEY');
    });

    it('should not throw when required env var is present', () => {
      // Arrange
      process.env.SECRET_KEY = 'my-secret';

      // Act & Assert
      expect(() =>
        supermanConfig.init({
          env: { SECRET_KEY: { required: true } },
        }),
      ).not.toThrow();
    });
  });

  describe('environments', () => {
    const environments = {
      development: {
        endpoints: {
          api: 'https://dev.example.com/api',
          auth: 'https://dev.example.com/auth',
        },
      },
      production: {
        endpoints: {
          api: 'https://example.com/api',
          auth: 'https://example.com/auth',
        },
      },
    };

    it('should resolve endpoints for development by default', () => {
      // Arrange
      process.env.NODE_ENV = 'development';

      // Act
      supermanConfig.init({ environments });

      // Assert
      expect(supermanConfig.endpoints.api).toBe('https://dev.example.com/api');
      expect(supermanConfig.endpoints.auth).toBe('https://dev.example.com/auth');
    });

    it('should resolve endpoints for production when NODE_ENV is production', () => {
      // Arrange
      process.env.NODE_ENV = 'production';

      // Act
      supermanConfig.init({ environments });

      // Assert
      expect(supermanConfig.endpoints.api).toBe('https://example.com/api');
      expect(supermanConfig.endpoints.auth).toBe('https://example.com/auth');
    });

    it('should fallback to development when NODE_ENV is unknown', () => {
      // Arrange
      process.env.NODE_ENV = 'staging';

      // Act
      supermanConfig.init({ environments });

      // Assert
      expect(supermanConfig.endpoints.api).toBe('https://dev.example.com/api');
    });
  });

  describe('helpers', () => {
    it('should return true for isProduction when NODE_ENV is production', () => {
      // Arrange
      process.env.NODE_ENV = 'production';

      // Act
      supermanConfig.init({});

      // Assert
      expect(supermanConfig.isProduction()).toBe(true);
    });

    it('should return false for isProduction when NODE_ENV is development', () => {
      // Arrange
      process.env.NODE_ENV = 'development';

      // Act
      supermanConfig.init({});

      // Assert
      expect(supermanConfig.isProduction()).toBe(false);
    });
  });

  describe('logger', () => {
    it('should default to all event types enabled, console on, file off', () => {
      // Arrange & Act
      supermanConfig.init({});

      // Assert
      expect(supermanConfig.logger.events.enabled).toBe(true);
      expect(supermanConfig.logger.events.byType.size).toBe(6);
      expect(supermanConfig.logger.consoleOutput.enabled).toBe(true);
      expect(supermanConfig.logger.fileOutput.enabled).toBe(false);
    });

    it('should default per-event options (savePayload, payloadMaxLength, console, file, minSeverity, sampleRate)', () => {
      // Arrange & Act
      supermanConfig.init({});

      // Assert
      const sys = supermanConfig.logger.events.byType.get(EventType.SYSTEM)!;
      expect(sys.savePayload).toBe(true);
      expect(sys.payloadMaxLength).toBe(5000);
      expect(sys.console).toBe(true);
      expect(sys.file).toBe(true);
      expect(sys.minSeverity).toBe('INFO');
      expect(sys.sampleRate).toBe(1);
      expect(sys.captureFields).toEqual([]);
      expect(sys.redactFields).toEqual([]);
    });

    it('should honour custom captureFields', () => {
      // Arrange & Act
      supermanConfig.init({
        logger: {
          events: {
            include: [{ type: 'AUDIT', captureFields: ['userId', 'resourceId'] }],
          },
        },
      });

      // Assert
      const audit = supermanConfig.logger.events.byType.get(EventType.AUDIT)!;
      expect(audit.captureFields).toEqual(['userId', 'resourceId']);
    });

    it('should default file directory to /var/log/superman', () => {
      // Arrange & Act
      supermanConfig.init({ logger: { fileOutput: { enabled: true } } });

      // Assert
      expect(supermanConfig.logger.fileOutput.directory).toBe('/var/log/superman');
    });

    it('should honour a custom absolute directory', () => {
      // Arrange & Act
      supermanConfig.init({ logger: { fileOutput: { enabled: true, directory: '/tmp/myapp-logs' } } });

      // Assert
      expect(supermanConfig.logger.fileOutput.directory).toBe('/tmp/myapp-logs');
    });

    it('should honour a custom relative directory', () => {
      // Arrange & Act
      supermanConfig.init({ logger: { fileOutput: { enabled: true, directory: './logs' } } });

      // Assert
      expect(supermanConfig.logger.fileOutput.directory).toBe('./logs');
    });

    it('should reject an unknown event type', () => {
      // Arrange & Act & Assert
      expect(() =>
        supermanConfig.init({
          logger: { events: { include: [{ type: 'BOGUS' as never }] } },
        }),
      ).toThrow('Invalid event type in logger.events.include: BOGUS');
    });

    it('should respect an explicit subset of event types via events.include', () => {
      // Arrange & Act
      supermanConfig.init({
        logger: {
          events: {
            include: [
              { type: 'SECURITY' },
              { type: 'ERROR' },
            ],
          },
        },
      });

      // Assert
      expect(supermanConfig.logger.events.byType.has(EventType.SECURITY)).toBe(true);
      expect(supermanConfig.logger.events.byType.has(EventType.ERROR)).toBe(true);
      expect(supermanConfig.logger.events.byType.has(EventType.REQUEST)).toBe(false);
    });

    it('should honour custom per-event options', () => {
      // Arrange & Act
      supermanConfig.init({
        logger: {
          events: {
            include: [
              {
                type: 'REQUEST',
                savePayload: false,
                payloadMaxLength: 500,
                console: false,
                file: true,
                minSeverity: 'WARN',
                redactFields: ['authorization'],
                sampleRate: 0.5,
              },
            ],
          },
        },
      });

      // Assert
      const req = supermanConfig.logger.events.byType.get(EventType.REQUEST)!;
      expect(req.savePayload).toBe(false);
      expect(req.payloadMaxLength).toBe(500);
      expect(req.console).toBe(false);
      expect(req.file).toBe(true);
      expect(req.minSeverity).toBe('WARN');
      expect(req.redactFields).toEqual(['authorization']);
      expect(req.sampleRate).toBe(0.5);
    });

    it('should reject invalid sampleRate', () => {
      // Arrange & Act & Assert
      expect(() =>
        supermanConfig.init({
          logger: { events: { include: [{ type: 'REQUEST', sampleRate: 1.5 }] } },
        }),
      ).toThrow(/Invalid sampleRate/);
    });

    it('should support master switch events.enabled = false', () => {
      // Arrange & Act
      supermanConfig.init({ logger: { events: { enabled: false } } });

      // Assert
      expect(supermanConfig.logger.events.enabled).toBe(false);
    });

    it('should allow disabling console output explicitly', () => {
      // Arrange & Act
      supermanConfig.init({ logger: { consoleOutput: { enabled: false } } });

      // Assert
      expect(supermanConfig.logger.consoleOutput.enabled).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset all state to defaults', () => {
      // Arrange
      supermanConfig.init({ port: 9999, jsonLimit: '50mb' });

      // Act
      supermanConfig.reset();

      // Assert
      expect(supermanConfig.port).toBe(3000);
      expect(supermanConfig.jsonLimit).toBe('10mb');
      expect(supermanConfig.isInitialized()).toBe(false);
    });
  });
});

describe('defineConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    config.reset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should initialize the global config singleton', () => {
    // Arrange
    process.env.MY_VAR = 'hello';

    // Act
    defineConfig({
      port: 4000,
      env: { MY_VAR: { required: true } },
    });

    // Assert
    expect(config.port).toBe(4000);
    expect(config.env.MY_VAR).toBe('hello');
    expect(config.isInitialized()).toBe(true);
  });
});
