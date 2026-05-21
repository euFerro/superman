import type { ThrottleConfig } from './throttle.constants';

interface IpRecord {
  count: number;
  resetAt: number;
}

export class ControllerThrottler {
  private readonly store = new Map<string, IpRecord>();
  private readonly limit: number;
  private readonly ttl: number;

  constructor(config: ThrottleConfig) {
    this.limit = config.limit;
    this.ttl = config.ttl;
  }

  /**
   * Check if the IP is allowed to proceed.
   * Returns true if allowed, false if rate limited.
   */
  check(ip: string): boolean {
    const now = Date.now();
    const record = this.store.get(ip);

    // No record or window expired — allow and start fresh
    if (!record || now >= record.resetAt) {
      this.store.set(ip, { count: 1, resetAt: now + this.ttl });
      return true;
    }

    // Within window — increment
    record.count++;

    if (record.count > this.limit) {
      return false;
    }

    return true;
  }

  /** Seconds remaining until the rate limit resets for this IP */
  retryAfter(ip: string): number {
    const record = this.store.get(ip);
    if (!record) return 0;
    return Math.max(0, Math.ceil((record.resetAt - Date.now()) / 1000));
  }

  /** Remaining requests in the current window for this IP */
  remaining(ip: string): number {
    const now = Date.now();
    const record = this.store.get(ip);
    if (!record || now >= record.resetAt) return this.limit;
    return Math.max(0, this.limit - record.count);
  }
}
