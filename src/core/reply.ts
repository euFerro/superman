/**
 * Optional return-value wrapper for context handlers. When the framework
 * encounters a `reply()` instead of a plain value, it lifts the embedded
 * `status` / `headers` / `mediaType` overrides and writes the body
 * accordingly:
 *
 *   - `mediaType` unset â†’ `res.json(data)` with the chosen status.
 *   - `mediaType` set   â†’ `res.type(mediaType).send(data)` - `data` must be
 *                          a string or `Buffer` the user has already
 *                          encoded.
 */

const REPLY = Symbol.for('superman/back/reply');

export interface ReplyOptions {
  status?: number;
  headers?: Record<string, string>;
  /**
   * When set, the framework writes the body verbatim with this
   * `Content-Type` instead of JSON-encoding. The `data` must be a `string`
   * or `Buffer` the caller has already encoded.
   */
  mediaType?: string;
}

export interface Reply<T> {
  readonly [REPLY]: true;
  readonly data: T;
  readonly options: ReplyOptions;
}

export const reply = <T>(data: T, options: ReplyOptions = {}): Reply<T> => ({
  [REPLY]: true,
  data,
  options,
});

export const isReply = (value: unknown): value is Reply<unknown> =>
  typeof value === 'object'
  && value !== null
  && (value as { [REPLY]?: unknown })[REPLY] === true;

