/**
 * Resolve the active runtime environment, in this order of precedence:
 *
 *   1. `ENV`         — universal name, preferred. Works on any runtime that
 *                       exposes `process.env` (Node, Bun, Deno --node-globals).
 *   2. `NODE_ENV`    — backward-compatible fallback for existing deployments
 *                       and Node ecosystem tooling that still reads it.
 *   3. `'development'` — last-resort default when neither var is set.
 *
 * Centralised here so every consumer (config, logger, runtime, infra fields,
 * sinks) reads the environment through the same precedence chain.
 */
export const resolveEnvironment = (): string =>
  process.env.ENV ?? process.env.NODE_ENV ?? 'development';