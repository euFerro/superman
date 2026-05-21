/**
 * Short timestamp used by the pretty console formatter — `HH:mm:ss.SSS`.
 *
 * Timezone:
 *   - Defaults to **UTC** for predictable output across hosts.
 *   - Overridden by the `TZ` env var (Node-native — `Date.getHours()` already
 *     follows it) OR the `TIME_ZONE` env var (Node-agnostic; we apply it via
 *     `Intl.DateTimeFormat`). `TZ` wins when both are set.
 *
 * Note: the structured `@timestamp` field in JSON logs (see
 * `infra-fields.ts`) stays strict UTC ISO 8601 — that's the exchange format
 * downstream tools (Datadog, ELK, etc.) expect, and changing it would break
 * log shipping.
 */

const resolveTimeZone = (): string =>
  process.env.TZ ?? process.env.TIME_ZONE ?? 'UTC';

let cachedZone: string | undefined;
let cachedFormatter: Intl.DateTimeFormat | undefined;

const getFormatter = (zone: string): Intl.DateTimeFormat => {
  if (cachedZone !== zone || !cachedFormatter) {
    cachedZone = zone;
    cachedFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }
  return cachedFormatter;
};

export const formatShortTimestamp = (date: Date = new Date()): string => {
  const hms = getFormatter(resolveTimeZone()).format(date);
  // Milliseconds are timezone-independent — read them off the UTC clock.
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${hms}.${ms}`;
};