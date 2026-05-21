import { ControllerThrottler } from './controller-throttler';
import type { ThrottleConfig } from './throttle.constants';

const makeConfig = (overrides: Partial<ThrottleConfig> = {}): ThrottleConfig => ({
  limit: 3,
  ttl: 60_000,
  ...overrides,
});

describe('ControllerThrottler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-04-14T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('check', () => {
    it('should allow requests under the limit', () => {
      // Arrange
      const throttler = new ControllerThrottler(makeConfig({ limit: 3 }));

      // Act
      const first = throttler.check('127.0.0.1');
      const second = throttler.check('127.0.0.1');
      const third = throttler.check('127.0.0.1');

      // Assert
      expect(first).toBe(true);
      expect(second).toBe(true);
      expect(third).toBe(true);
    }, 1000);

    it('should block requests over the limit', () => {
      // Arrange
      const throttler = new ControllerThrottler(makeConfig({ limit: 2 }));
      throttler.check('127.0.0.1');
      throttler.check('127.0.0.1');

      // Act
      const result = throttler.check('127.0.0.1');

      // Assert
      expect(result).toBe(false);
    }, 1000);

    it('should track IPs independently', () => {
      // Arrange
      const throttler = new ControllerThrottler(makeConfig({ limit: 1 }));
      throttler.check('10.0.0.1');

      // Act
      const result = throttler.check('10.0.0.2');

      // Assert
      expect(result).toBe(true);
    }, 1000);

    it('should reset after TTL expires', () => {
      // Arrange
      const throttler = new ControllerThrottler(makeConfig({ limit: 1, ttl: 5_000 }));
      throttler.check('127.0.0.1');
      expect(throttler.check('127.0.0.1')).toBe(false);

      // Act
      jest.advanceTimersByTime(5_000);
      const result = throttler.check('127.0.0.1');

      // Assert
      expect(result).toBe(true);
    }, 1000);
  });

  describe('retryAfter', () => {
    it('should return 0 for unknown IP', () => {
      // Arrange
      const throttler = new ControllerThrottler(makeConfig());

      // Act
      const result = throttler.retryAfter('unknown');

      // Assert
      expect(result).toBe(0);
    }, 1000);

    it('should return seconds until reset', () => {
      // Arrange
      const throttler = new ControllerThrottler(makeConfig({ ttl: 30_000 }));
      throttler.check('127.0.0.1');
      jest.advanceTimersByTime(10_000);

      // Act
      const result = throttler.retryAfter('127.0.0.1');

      // Assert
      expect(result).toBe(20);
    }, 1000);
  });

  describe('remaining', () => {
    it('should return full limit for unknown IP', () => {
      // Arrange
      const throttler = new ControllerThrottler(makeConfig({ limit: 5 }));

      // Act
      const result = throttler.remaining('unknown');

      // Assert
      expect(result).toBe(5);
    }, 1000);

    it('should decrease with each request', () => {
      // Arrange
      const throttler = new ControllerThrottler(makeConfig({ limit: 3 }));
      throttler.check('127.0.0.1');

      // Act
      const result = throttler.remaining('127.0.0.1');

      // Assert
      expect(result).toBe(2);
    }, 1000);

    it('should return 0 when limit is exhausted', () => {
      // Arrange
      const throttler = new ControllerThrottler(makeConfig({ limit: 1 }));
      throttler.check('127.0.0.1');

      // Act
      const result = throttler.remaining('127.0.0.1');

      // Assert
      expect(result).toBe(0);
    }, 1000);

    it('should reset to full limit after TTL', () => {
      // Arrange
      const throttler = new ControllerThrottler(makeConfig({ limit: 3, ttl: 5_000 }));
      throttler.check('127.0.0.1');
      throttler.check('127.0.0.1');

      // Act
      jest.advanceTimersByTime(5_000);
      const result = throttler.remaining('127.0.0.1');

      // Assert
      expect(result).toBe(3);
    }, 1000);
  });
});
