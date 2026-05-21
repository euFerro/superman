/**
 * Hand-rolled JSON Schema 2020-12 validator covering the subset that the
 * framework's validation middlewares need. Pure function, no dependencies.
 *
 * Supported keywords:
 *   Generic     : type (single or [..., 'null']), enum, const, nullable
 *   Combinators : oneOf, anyOf, allOf, not
 *   String      : minLength, maxLength, pattern, format
 *                 (email, uuid, date-time, date, time, uri, ipv4, ipv6, hostname)
 *   Number      : minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf
 *   Array       : items (single schema), minItems, maxItems, uniqueItems
 *   Object      : properties, required, additionalProperties (boolean),
 *                 minProperties, maxProperties
 *
 * Explicitly NOT supported in v1 (callers needing these should plug in a
 * full validator via `defineConfig({ schemaValidator })`):
 *   $ref / $defs, patternProperties, dependentRequired, contentMediaType,
 *   if/then/else.
 */

import type { JsonSchema } from '../core/superman-controller';

export interface ValidationError {
  /** JSON-pointer-ish location of the failing value, e.g. '' for root, '/email', '/items/2/id'. */
  path: string;
  keyword: string;
  message: string;
}

export interface ValidateOptions {
  /**
   * Coerce stringâ†’number/boolean/integer/null when the schema expects those
   * types. Useful for query/header/cookie/path params where everything
   * arrives as a string. Default `false`.
   */
  coerce?: boolean;
}

export interface ValidationResult<T = unknown> {
  valid: boolean;
  /** Coerced output when `coerce: true`; otherwise the original value. */
  value: T;
  errors: ValidationError[];
}

const FORMAT_PATTERNS: Record<string, RegExp> = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  time: /^\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/,
  uri: /^[a-zA-Z][a-zA-Z0-9+.-]*:\S+$/,
  ipv4: /^(25[0-5]|2[0-4]\d|[01]?\d\d?)(\.(25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/,
  ipv6: /^([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$|^::1$|^::$/i,
  hostname: /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i,
};

const TYPE_OF: Record<string, (v: unknown) => boolean> = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => typeof v === 'number' && Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  null: (v) => v === null,
  array: (v) => Array.isArray(v),
  object: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asArray = <T>(v: T | ReadonlyArray<T> | undefined): ReadonlyArray<T> => {
  if (v === undefined) return [];
  if (Array.isArray(v)) return v as ReadonlyArray<T>;
  return [v as T];
};

const joinPath = (parent: string, segment: string | number): string =>
  `${parent}/${String(segment).replace(/~/g, '~0').replace(/\//g, '~1')}`;

const coerceValue = (value: unknown, schema: JsonSchema): unknown => {
  if (typeof value !== 'string') return value;

  const types = asArray(schema.type as string | string[] | undefined);
  for (const t of types) {
    if (t === 'integer') {
      if (/^-?\d+$/.test(value)) return Number(value);
    }
    if (t === 'number') {
      const n = Number(value);
      if (!Number.isNaN(n) && value.trim() !== '') return n;
    }
    if (t === 'boolean') {
      if (value === 'true') return true;
      if (value === 'false') return false;
    }
    if (t === 'null') {
      if (value === 'null' || value === '') return null;
    }
  }
  return value;
};

const matchesType = (value: unknown, type: string): boolean => TYPE_OF[type]?.(value) ?? false;

const checkType = (value: unknown, schema: JsonSchema, path: string, errors: ValidationError[]): void => {
  const rawType = schema.type as string | string[] | undefined;
  if (rawType === undefined) return;
  const types = asArray(rawType);
  if (schema.nullable === true && !types.includes('null')) {
    if (value === null) return;
  }
  if (types.some((t) => matchesType(value, t))) return;
  errors.push({
    path,
    keyword: 'type',
    message: `Expected type ${types.join(' | ')}, got ${value === null ? 'null' : typeof value}.`,
  });
};

const checkEnum = (value: unknown, schema: JsonSchema, path: string, errors: ValidationError[]): void => {
  if (!Array.isArray(schema.enum)) return;
  const hit = schema.enum.some((candidate) => deepEqual(candidate, value));
  if (!hit) {
    errors.push({ path, keyword: 'enum', message: `Value is not one of the allowed values.` });
  }
};

const checkConst = (value: unknown, schema: JsonSchema, path: string, errors: ValidationError[]): void => {
  if (!('const' in schema)) return;
  if (!deepEqual(schema.const, value)) {
    errors.push({ path, keyword: 'const', message: `Value must equal const.` });
  }
};

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const aKeys = Object.keys(ao);
    const bKeys = Object.keys(bo);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => deepEqual(ao[k], bo[k]));
  }
  return false;
};

const checkString = (value: unknown, schema: JsonSchema, path: string, errors: ValidationError[]): void => {
  if (typeof value !== 'string') return;
  const minLength = schema.minLength as number | undefined;
  if (typeof minLength === 'number' && value.length < minLength) {
    errors.push({ path, keyword: 'minLength', message: `String shorter than ${minLength} characters.` });
  }
  const maxLength = schema.maxLength as number | undefined;
  if (typeof maxLength === 'number' && value.length > maxLength) {
    errors.push({ path, keyword: 'maxLength', message: `String longer than ${maxLength} characters.` });
  }
  const pattern = schema.pattern as string | undefined;
  if (typeof pattern === 'string') {
    try {
      if (!new RegExp(pattern).test(value)) {
        errors.push({ path, keyword: 'pattern', message: `String does not match pattern ${pattern}.` });
      }
    } catch {
      errors.push({ path, keyword: 'pattern', message: `Invalid pattern in schema: ${pattern}.` });
    }
  }
  const format = schema.format as string | undefined;
  if (typeof format === 'string') {
    const re = FORMAT_PATTERNS[format];
    if (re && !re.test(value)) {
      errors.push({ path, keyword: 'format', message: `String does not match format ${format}.` });
    }
  }
};

const checkNumber = (value: unknown, schema: JsonSchema, path: string, errors: ValidationError[]): void => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  const minimum = schema.minimum as number | undefined;
  if (typeof minimum === 'number' && value < minimum) {
    errors.push({ path, keyword: 'minimum', message: `Value less than ${minimum}.` });
  }
  const maximum = schema.maximum as number | undefined;
  if (typeof maximum === 'number' && value > maximum) {
    errors.push({ path, keyword: 'maximum', message: `Value greater than ${maximum}.` });
  }
  const exMin = schema.exclusiveMinimum as number | undefined;
  if (typeof exMin === 'number' && value <= exMin) {
    errors.push({ path, keyword: 'exclusiveMinimum', message: `Value must be greater than ${exMin}.` });
  }
  const exMax = schema.exclusiveMaximum as number | undefined;
  if (typeof exMax === 'number' && value >= exMax) {
    errors.push({ path, keyword: 'exclusiveMaximum', message: `Value must be less than ${exMax}.` });
  }
  const multipleOf = schema.multipleOf as number | undefined;
  if (typeof multipleOf === 'number' && multipleOf > 0) {
    const ratio = value / multipleOf;
    if (Math.abs(ratio - Math.round(ratio)) > 1e-9) {
      errors.push({ path, keyword: 'multipleOf', message: `Value is not a multiple of ${multipleOf}.` });
    }
  }
};

const checkArray = (
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: ValidationError[],
  options: ValidateOptions,
): unknown => {
  if (!Array.isArray(value)) return value;
  let output: unknown[] = value;

  const minItems = schema.minItems as number | undefined;
  if (typeof minItems === 'number' && value.length < minItems) {
    errors.push({ path, keyword: 'minItems', message: `Array has fewer than ${minItems} items.` });
  }
  const maxItems = schema.maxItems as number | undefined;
  if (typeof maxItems === 'number' && value.length > maxItems) {
    errors.push({ path, keyword: 'maxItems', message: `Array has more than ${maxItems} items.` });
  }
  if (schema.uniqueItems === true) {
    const seen: unknown[] = [];
    for (const item of value) {
      if (seen.some((s) => deepEqual(s, item))) {
        errors.push({ path, keyword: 'uniqueItems', message: `Array items are not unique.` });
        break;
      }
      seen.push(item);
    }
  }
  const itemsSchema = schema.items as JsonSchema | undefined;
  if (isPlainObject(itemsSchema)) {
    output = value.map((item, i) =>
      validateRecursive(item, itemsSchema, joinPath(path, i), errors, options),
    );
  }
  return output;
};

const checkObject = (
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: ValidationError[],
  options: ValidateOptions,
): unknown => {
  if (!isPlainObject(value)) return value;
  const output: Record<string, unknown> = { ...value };

  const requiredList = Array.isArray(schema.required)
    ? schema.required.filter((v): v is string => typeof v === 'string')
    : [];
  for (const key of requiredList) {
    if (!(key in value)) {
      errors.push({ path: joinPath(path, key), keyword: 'required', message: `Missing required property "${key}".` });
    }
  }

  const minProperties = schema.minProperties as number | undefined;
  if (typeof minProperties === 'number' && Object.keys(value).length < minProperties) {
    errors.push({ path, keyword: 'minProperties', message: `Object has fewer than ${minProperties} properties.` });
  }
  const maxProperties = schema.maxProperties as number | undefined;
  if (typeof maxProperties === 'number' && Object.keys(value).length > maxProperties) {
    errors.push({ path, keyword: 'maxProperties', message: `Object has more than ${maxProperties} properties.` });
  }

  const properties = isPlainObject(schema.properties) ? schema.properties as Record<string, JsonSchema> : undefined;
  if (properties) {
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in value && isPlainObject(propSchema)) {
        output[key] = validateRecursive(value[key], propSchema, joinPath(path, key), errors, options);
      }
    }
  }

  if (schema.additionalProperties === false && properties) {
    const known = new Set(Object.keys(properties));
    for (const key of Object.keys(value)) {
      if (!known.has(key)) {
        errors.push({
          path: joinPath(path, key),
          keyword: 'additionalProperties',
          message: `Unexpected property "${key}".`,
        });
      }
    }
  }
  return output;
};

const tryBranch = (value: unknown, schema: JsonSchema, options: ValidateOptions): ValidationResult => {
  const branchErrors: ValidationError[] = [];
  const out = validateRecursive(value, schema, '', branchErrors, options);
  return { valid: branchErrors.length === 0, value: out, errors: branchErrors };
};

const checkCombinators = (
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: ValidationError[],
  options: ValidateOptions,
): unknown => {
  let current = value;

  const allOf = schema.allOf as JsonSchema[] | undefined;
  if (Array.isArray(allOf)) {
    for (const sub of allOf) {
      if (isPlainObject(sub)) {
        current = validateRecursive(current, sub, path, errors, options);
      }
    }
  }

  const anyOf = schema.anyOf as JsonSchema[] | undefined;
  if (Array.isArray(anyOf) && anyOf.length > 0) {
    const results = anyOf.map((sub) => tryBranch(current, sub, options));
    if (!results.some((r) => r.valid)) {
      errors.push({ path, keyword: 'anyOf', message: 'Value did not match any allowed schema.' });
    } else {
      const winner = results.find((r) => r.valid);
      if (winner) current = winner.value;
    }
  }

  const oneOf = schema.oneOf as JsonSchema[] | undefined;
  if (Array.isArray(oneOf) && oneOf.length > 0) {
    const results = oneOf.map((sub) => tryBranch(current, sub, options));
    const matched = results.filter((r) => r.valid);
    if (matched.length !== 1) {
      errors.push({
        path,
        keyword: 'oneOf',
        message: `Value matched ${matched.length} of ${oneOf.length} schemas; exactly one required.`,
      });
    } else {
      current = matched[0].value;
    }
  }

  const notSchema = schema.not as JsonSchema | undefined;
  if (isPlainObject(notSchema)) {
    const result = tryBranch(current, notSchema, options);
    if (result.valid) {
      errors.push({ path, keyword: 'not', message: 'Value must not match the schema.' });
    }
  }

  return current;
};

const validateRecursive = (
  rawValue: unknown,
  schema: JsonSchema,
  path: string,
  errors: ValidationError[],
  options: ValidateOptions,
): unknown => {
  let value = options.coerce ? coerceValue(rawValue, schema) : rawValue;

  checkType(value, schema, path, errors);
  checkEnum(value, schema, path, errors);
  checkConst(value, schema, path, errors);
  checkString(value, schema, path, errors);
  checkNumber(value, schema, path, errors);
  value = checkArray(value, schema, path, errors, options);
  value = checkObject(value, schema, path, errors, options);
  value = checkCombinators(value, schema, path, errors, options);

  return value;
};

export const validateJsonSchema = <T = unknown>(
  value: unknown,
  schema: JsonSchema,
  options: ValidateOptions = {},
): ValidationResult<T> => {
  const errors: ValidationError[] = [];
  const out = validateRecursive(value, schema, '', errors, options);
  return { valid: errors.length === 0, value: out as T, errors };
};

