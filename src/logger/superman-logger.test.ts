import { SupermanLogger } from './superman-logger';
import { resetLogRuntime } from './log-runtime';
import { config } from '../config/superman-config';
import { SystemEvent, SystemStatus } from './superman-logger.types';

describe('SupermanLogger', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv, NODE_ENV: 'test', LOG_LEVEL: 'debug' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('log methods', () => {
    it('should write debug messages to stdout', () => {
      // Arrange
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const log = new SupermanLogger('Test');

      // Act
      log.debug('debug message');

      // Assert
      expect(writeSpy).toHaveBeenCalledTimes(1);
      expect(writeSpy.mock.calls[0][0]).toContain('debug message');

      writeSpy.mockRestore();
    }, 1000);

    it('should write info messages to stdout', () => {
      // Arrange
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const log = new SupermanLogger('Test');

      // Act
      log.info('info message');

      // Assert
      expect(writeSpy).toHaveBeenCalledTimes(1);
      expect(writeSpy.mock.calls[0][0]).toContain('info message');

      writeSpy.mockRestore();
    }, 1000);

    it('should write warn messages to stdout', () => {
      // Arrange
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const log = new SupermanLogger('Test');

      // Act
      log.warn('warn message');

      // Assert
      expect(writeSpy).toHaveBeenCalledTimes(1);
      expect(writeSpy.mock.calls[0][0]).toContain('warn message');

      writeSpy.mockRestore();
    }, 1000);

    it('should write error messages to stderr', () => {
      // Arrange
      const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const log = new SupermanLogger('Test');

      // Act
      log.error('error message');

      // Assert
      expect(writeSpy).toHaveBeenCalledTimes(1);
      expect(writeSpy.mock.calls[0][0]).toContain('error message');

      writeSpy.mockRestore();
    }, 1000);
  });

  describe('context', () => {
    it('should include context tag in output', () => {
      // Arrange
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const log = new SupermanLogger('MyModule');

      // Act
      log.info('test');

      // Assert
      expect(writeSpy.mock.calls[0][0]).toContain('[MyModule]');

      writeSpy.mockRestore();
    }, 1000);
  });

  describe('child', () => {
    it('should create a child logger with a different context', () => {
      // Arrange
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const parent = new SupermanLogger('Parent');

      // Act
      const child = parent.child('Child');
      child.info('from child');

      // Assert
      expect(writeSpy.mock.calls[0][0]).toContain('[Child]');

      writeSpy.mockRestore();
    }, 1000);
  });

  describe('metadata', () => {
    it('should include metadata in output', () => {
      // Arrange
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const log = new SupermanLogger('Test');

      // Act
      log.info('request', { method: 'GET', url: '/api' });

      // Assert
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('method=');
      expect(output).toContain('GET');
      expect(output).toContain('url=');
      expect(output).toContain('/api');

      writeSpy.mockRestore();
    }, 1000);
  });

  describe('events namespace', () => {
    beforeEach(() => {
      resetLogRuntime();
      config.reset();
    });

    afterEach(() => {
      resetLogRuntime();
      config.reset();
    });

    it('should expose an events emitter', () => {
      // Arrange
      const log = new SupermanLogger('Test');

      // Act
      const emitter = log.events;

      // Assert
      expect(emitter).toBeDefined();
      expect(typeof emitter.system).toBe('function');
      expect(typeof emitter.security).toBe('function');
    });

    it('should print summary-only for SYSTEM/AUDIT by default (eventDebug=false hides body)', () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      config.reset();
      config.init({ logger: { events: { include: [{ type: 'SYSTEM' }] }, fileOutput: { enabled: false } } });
      resetLogRuntime();
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const log = new SupermanLogger('Test');

      // Act
      log.events.system({
        systemEvent: SystemEvent.SERVICE_STARTED,
        systemStatus: SystemStatus.ONLINE,
        systemMessage: 'test',
      });

      // Assert — summary line ('[Test|SYSTEM] …') prints; JSON body does not.
      expect(writeSpy).toHaveBeenCalled();
      const output = writeSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
      const stripped = output.replace(/\x1B\[\d+m/g, '');
      expect(stripped).toContain('[Test|SYSTEM]');
      expect(stripped).not.toContain('"systemEvent":');

      writeSpy.mockRestore();
    }, 1000);

    it('should route a system event to stdout when eventDebug is true', () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      config.reset();
      config.init({
        logger: {
          events: { include: [{ type: 'SYSTEM' }] },
          fileOutput: { enabled: false },
          consoleOutput: { enabled: true, eventDebug: true },
        },
      });
      resetLogRuntime();
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const log = new SupermanLogger('Test');

      // Act
      log.events.system({
        systemEvent: SystemEvent.SERVICE_STARTED,
        systemStatus: SystemStatus.ONLINE,
        systemMessage: 'test',
      });

      // Assert
      expect(writeSpy).toHaveBeenCalled();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('SYSTEM');

      writeSpy.mockRestore();
    }, 1000);

    it('should skip events not in events.include', () => {
      // Arrange
      config.init({ logger: { events: { include: [{ type: 'SECURITY' }] }, fileOutput: { enabled: false } } });
      resetLogRuntime();
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const log = new SupermanLogger('Test');

      // Act
      log.events.system({
        systemEvent: SystemEvent.SERVICE_STARTED,
        systemStatus: SystemStatus.ONLINE,
        systemMessage: 'test',
      });

      // Assert
      expect(writeSpy).not.toHaveBeenCalled();

      writeSpy.mockRestore();
    }, 1000);
  });

  describe('consoleOutput config', () => {
    beforeEach(() => {
      resetLogRuntime();
      config.reset();
    });

    afterEach(() => {
      resetLogRuntime();
      config.reset();
    });

    it('should suppress free-form output when consoleOutput.enabled is false', () => {
      // Arrange
      config.init({ logger: { consoleOutput: { enabled: false } } });
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const log = new SupermanLogger('Test');

      // Act
      log.debug('nope');
      log.info('nope');
      log.warn('nope');
      log.error('nope');

      // Assert
      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();

      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }, 1000);

    it('should write free-form output when consoleOutput.enabled is true', () => {
      // Arrange
      config.init({ logger: { consoleOutput: { enabled: true } } });
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const log = new SupermanLogger('Test');

      // Act
      log.info('should appear');

      // Assert
      expect(writeSpy).toHaveBeenCalledTimes(1);

      writeSpy.mockRestore();
    }, 1000);
  });

  describe('log level filtering', () => {
    it('should suppress debug when level is info', () => {
      // Arrange
      process.env.LOG_LEVEL = 'info';
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const log = new SupermanLogger('Test');

      // Act
      log.debug('should not appear');

      // Assert
      expect(writeSpy).not.toHaveBeenCalled();

      writeSpy.mockRestore();
    }, 1000);

    it('should suppress all output when level is silent', () => {
      // Arrange
      process.env.LOG_LEVEL = 'silent';
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const log = new SupermanLogger('Test');

      // Act
      log.debug('nope');
      log.info('nope');
      log.warn('nope');
      log.error('nope');

      // Assert
      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();

      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }, 1000);
  });
});

