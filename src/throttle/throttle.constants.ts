export interface ThrottleConfig {
  limit: number;
  ttl: number;
}

export const THROTTLE_CONFIG = {
  SECURITY: { limit: 5, ttl: 60_000 } as ThrottleConfig,
  STRICT: { limit: 10, ttl: 60_000 } as ThrottleConfig,
  STANDARD: { limit: 100, ttl: 60_000 } as ThrottleConfig,
  PERMISSIVE: { limit: 1_000, ttl: 60_000 } as ThrottleConfig,
  EXTRA_PERMISSIVE: { limit: 10_000, ttl: 60_000 } as ThrottleConfig,
};

export type ThrottlePreset = keyof typeof THROTTLE_CONFIG;
