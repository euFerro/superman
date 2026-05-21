/**
 * Zod-like chainable schema builder. Each builder carries:
 *   - An internal JsonSchema fragment assembled by chain methods.
 *   - A phantom output type `T` consumed by `Infer<typeof schema>`.
 *
 * `toJsonSchema()` serialises the builder to a plain JSON Schema 2020-12
 * fragment â€” the exact shape consumed by the framework's middlewares and
 * OpenAPI emitter. `parse()` / `safeParse()` run the same JSON Schema
 * validator the middlewares use, so the error envelope is identical.
 */

import type { JsonSchema } from '../core/superman-controller';
import { BadRequestException } from '../exceptions/http.exception';
import {
  validateJsonSchema,
  type ValidationError,
} from '../validation/json-schema-validator';

export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] };

const cloneJson = (input: JsonSchema): JsonSchema =>
  JSON.parse(JSON.stringify(input)) as JsonSchema;

export abstract class Schema<T = unknown> {
  /** Phantom output type â€” consumed by {@link Infer}. */
  readonly _output!: T;
  /** True when {@link Schema.optional} was applied. */
  readonly _isOptional: boolean;
  /** True when {@link Schema.default} was applied. */
  readonly _hasDefault: boolean;

  protected readonly _def: JsonSchema;

  protected constructor(def: JsonSchema, isOptional = false, hasDefault = false) {
    this._def = def;
    this._isOptional = isOptional;
    this._hasDefault = hasDefault;
  }

  /** Internal: copy `_def` for chain methods that mutate. */
  protected _cloneDef(): JsonSchema {
    return cloneJson(this._def);
  }

  /**
   * Build a derived instance. Subclasses override so chain methods return
   * the concrete subclass type, preserving method availability.
   */
  protected abstract _withDef(def: JsonSchema, isOptional?: boolean, hasDefault?: boolean): Schema<T>;

  optional(): Schema<T | undefined> {
    return this._withDef(this._cloneDef(), true, this._hasDefault) as unknown as Schema<T | undefined>;
  }

  nullable(): Schema<T | null> {
    const def = this._cloneDef();
    const type = def.type;
    if (typeof type === 'string') {
      def.type = [type, 'null'];
    } else if (Array.isArray(type) && !type.includes('null')) {
      def.type = [...type, 'null'];
    }
    def.nullable = true;
    return this._withDef(def, this._isOptional, this._hasDefault) as unknown as Schema<T | null>;
  }

  default(value: T): this {
    const def = this._cloneDef();
    def.default = value as unknown;
    return this._withDef(def, this._isOptional, true) as this;
  }

  describe(text: string): this {
    const def = this._cloneDef();
    def.description = text;
    return this._withDef(def, this._isOptional, this._hasDefault) as this;
  }

  example(value: T): this {
    const def = this._cloneDef();
    def.example = value as unknown;
    return this._withDef(def, this._isOptional, this._hasDefault) as this;
  }

  examples(values: T[]): this {
    const def = this._cloneDef();
    def.examples = values as unknown as JsonSchema[keyof JsonSchema];
    return this._withDef(def, this._isOptional, this._hasDefault) as this;
  }

  deprecated(): this {
    const def = this._cloneDef();
    def.deprecated = true;
    return this._withDef(def, this._isOptional, this._hasDefault) as this;
  }

  /** Serialise to a plain JSON Schema 2020-12 fragment. */
  toJsonSchema(): JsonSchema {
    return cloneJson(this._def);
  }

  /**
   * Validates `value` against the schema. Throws {@link BadRequestException}
   * with `metadata: { errors }` on failure. The thrown envelope matches the
   * one produced by `validateBody` / `validateQuery` / etc. middlewares.
   */
  parse(value: unknown): T {
    const result = validateJsonSchema<T>(value, this.toJsonSchema());
    if (!result.valid) {
      throw new BadRequestException('Validation failed.', { errors: result.errors });
    }
    return result.value;
  }

  /** Non-throwing variant of {@link Schema.parse}. */
  safeParse(value: unknown): SafeParseResult<T> {
    const result = validateJsonSchema<T>(value, this.toJsonSchema());
    if (result.valid) return { success: true, data: result.value };
    return { success: false, errors: [...result.errors] };
  }
}

// ---------------------------------------------------------------------------
// String
// ---------------------------------------------------------------------------

export class StringSchema extends Schema<string> {
  constructor(def: JsonSchema = { type: 'string' }, isOptional = false, hasDefault = false) {
    super(def, isOptional, hasDefault);
  }

  protected _withDef(def: JsonSchema, isOptional = this._isOptional, hasDefault = this._hasDefault): StringSchema {
    return new StringSchema(def, isOptional, hasDefault);
  }

  private _set(key: keyof JsonSchema | string, value: unknown): StringSchema {
    const def = this._cloneDef();
    def[key as string] = value;
    return this._withDef(def);
  }

  min(n: number): StringSchema { return this._set('minLength', n); }
  max(n: number): StringSchema { return this._set('maxLength', n); }
  length(n: number): StringSchema {
    const def = this._cloneDef();
    def.minLength = n;
    def.maxLength = n;
    return this._withDef(def);
  }
  regex(pattern: RegExp | string): StringSchema {
    return this._set('pattern', pattern instanceof RegExp ? pattern.source : pattern);
  }
  pattern(pattern: RegExp | string): StringSchema { return this.regex(pattern); }
  email():    StringSchema { return this._set('format', 'email'); }
  uuid():     StringSchema { return this._set('format', 'uuid'); }
  url():      StringSchema { return this._set('format', 'uri'); }
  datetime(): StringSchema { return this._set('format', 'date-time'); }
  date():     StringSchema { return this._set('format', 'date'); }
  time():     StringSchema { return this._set('format', 'time'); }
  ipv4():     StringSchema { return this._set('format', 'ipv4'); }
  ipv6():     StringSchema { return this._set('format', 'ipv6'); }
  hostname(): StringSchema { return this._set('format', 'hostname'); }
}

// ---------------------------------------------------------------------------
// Number / Integer
// ---------------------------------------------------------------------------

export class NumberSchema extends Schema<number> {
  constructor(def: JsonSchema = { type: 'number' }, isOptional = false, hasDefault = false) {
    super(def, isOptional, hasDefault);
  }

  protected _withDef(def: JsonSchema, isOptional = this._isOptional, hasDefault = this._hasDefault): NumberSchema {
    return new NumberSchema(def, isOptional, hasDefault);
  }

  private _set(key: string, value: unknown): NumberSchema {
    const def = this._cloneDef();
    def[key] = value;
    return this._withDef(def);
  }

  min(n: number): NumberSchema { return this._set('minimum', n); }
  max(n: number): NumberSchema { return this._set('maximum', n); }
  gt(n: number):  NumberSchema { return this._set('exclusiveMinimum', n); }
  lt(n: number):  NumberSchema { return this._set('exclusiveMaximum', n); }
  gte(n: number): NumberSchema { return this.min(n); }
  lte(n: number): NumberSchema { return this.max(n); }
  int(): NumberSchema { return this._set('type', 'integer'); }
  multipleOf(n: number): NumberSchema { return this._set('multipleOf', n); }
  positive():    NumberSchema { return this.gt(0); }
  negative():    NumberSchema { return this.lt(0); }
  nonnegative(): NumberSchema { return this.min(0); }
  nonpositive(): NumberSchema { return this.max(0); }
}

// ---------------------------------------------------------------------------
// Boolean / Null / Any / Unknown
// ---------------------------------------------------------------------------

export class BooleanSchema extends Schema<boolean> {
  constructor(def: JsonSchema = { type: 'boolean' }, isOptional = false, hasDefault = false) {
    super(def, isOptional, hasDefault);
  }
  protected _withDef(def: JsonSchema, isOptional = this._isOptional, hasDefault = this._hasDefault): BooleanSchema {
    return new BooleanSchema(def, isOptional, hasDefault);
  }
}

export class NullSchema extends Schema<null> {
  constructor(def: JsonSchema = { type: 'null' }, isOptional = false, hasDefault = false) {
    super(def, isOptional, hasDefault);
  }
  protected _withDef(def: JsonSchema, isOptional = this._isOptional, hasDefault = this._hasDefault): NullSchema {
    return new NullSchema(def, isOptional, hasDefault);
  }
}

export class AnySchema extends Schema<unknown> {
  constructor(def: JsonSchema = {}, isOptional = false, hasDefault = false) {
    super(def, isOptional, hasDefault);
  }
  protected _withDef(def: JsonSchema, isOptional = this._isOptional, hasDefault = this._hasDefault): AnySchema {
    return new AnySchema(def, isOptional, hasDefault);
  }
}

// ---------------------------------------------------------------------------
// Literal / Enum
// ---------------------------------------------------------------------------

export class LiteralSchema<T extends string | number | boolean | null> extends Schema<T> {
  constructor(def: JsonSchema, isOptional = false, hasDefault = false) {
    super(def, isOptional, hasDefault);
  }
  protected _withDef(def: JsonSchema, isOptional = this._isOptional, hasDefault = this._hasDefault): LiteralSchema<T> {
    return new LiteralSchema<T>(def, isOptional, hasDefault);
  }
}

export class EnumSchema<T extends string | number> extends Schema<T> {
  constructor(def: JsonSchema, isOptional = false, hasDefault = false) {
    super(def, isOptional, hasDefault);
  }
  protected _withDef(def: JsonSchema, isOptional = this._isOptional, hasDefault = this._hasDefault): EnumSchema<T> {
    return new EnumSchema<T>(def, isOptional, hasDefault);
  }
}

// ---------------------------------------------------------------------------
// Array
// ---------------------------------------------------------------------------

export class ArraySchema<TItem extends Schema<unknown>> extends Schema<Infer<TItem>[]> {
  private readonly _item: TItem;

  constructor(item: TItem, def?: JsonSchema, isOptional = false, hasDefault = false) {
    super(def ?? { type: 'array', items: item.toJsonSchema() }, isOptional, hasDefault);
    this._item = item;
  }

  protected _withDef(def: JsonSchema, isOptional = this._isOptional, hasDefault = this._hasDefault): ArraySchema<TItem> {
    return new ArraySchema<TItem>(this._item, def, isOptional, hasDefault);
  }

  private _set(key: string, value: unknown): ArraySchema<TItem> {
    const def = this._cloneDef();
    def[key] = value;
    return this._withDef(def);
  }

  min(n: number):    ArraySchema<TItem> { return this._set('minItems', n); }
  max(n: number):    ArraySchema<TItem> { return this._set('maxItems', n); }
  length(n: number): ArraySchema<TItem> {
    const def = this._cloneDef();
    def.minItems = n;
    def.maxItems = n;
    return this._withDef(def);
  }
  unique(): ArraySchema<TItem> { return this._set('uniqueItems', true); }
}

// ---------------------------------------------------------------------------
// Object
// ---------------------------------------------------------------------------

export type ObjectShape = { [K: string]: Schema<unknown> };

type RequiredKeys<S extends ObjectShape> = {
  [K in keyof S]: undefined extends Infer<S[K]> ? never : K;
}[keyof S];

type OptionalKeys<S extends ObjectShape> = {
  [K in keyof S]: undefined extends Infer<S[K]> ? K : never;
}[keyof S];

export type ObjectOutput<S extends ObjectShape> =
  { [K in RequiredKeys<S>]: Infer<S[K]> } &
  { [K in OptionalKeys<S>]?: Infer<S[K]> };

export class ObjectSchema<S extends ObjectShape> extends Schema<ObjectOutput<S>> {
  private readonly _shape: S;
  private readonly _strict: boolean;

  constructor(shape: S, strict = true, def?: JsonSchema, isOptional = false, hasDefault = false) {
    super(def ?? ObjectSchema._build(shape, strict), isOptional, hasDefault);
    this._shape = shape;
    this._strict = strict;
  }

  private static _build(shape: ObjectShape, strict: boolean): JsonSchema {
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const [key, child] of Object.entries(shape)) {
      properties[key] = child.toJsonSchema();
      if (!child._isOptional && !child._hasDefault) required.push(key);
    }
    const def: JsonSchema = { type: 'object', properties };
    if (required.length > 0) def.required = required;
    if (strict) def.additionalProperties = false;
    return def;
  }

  protected _withDef(def: JsonSchema, isOptional = this._isOptional, hasDefault = this._hasDefault): ObjectSchema<S> {
    return new ObjectSchema<S>(this._shape, this._strict, def, isOptional, hasDefault);
  }

  /** Reject unknown keys (default). */
  strict(): ObjectSchema<S> {
    return new ObjectSchema<S>(this._shape, true);
  }

  /** Accept unknown keys. */
  passthrough(): ObjectSchema<S> {
    return new ObjectSchema<S>(this._shape, false);
  }

  /** All keys become optional. */
  partial(): ObjectSchema<S> {
    const next: ObjectShape = {};
    for (const [k, child] of Object.entries(this._shape)) {
      next[k] = child.optional() as Schema<unknown>;
    }
    return new ObjectSchema(next as S, this._strict);
  }

  /** Keep only the listed keys. */
  pick<K extends keyof S>(...keys: K[]): ObjectSchema<Pick<S, K>> {
    const next = {} as Pick<S, K>;
    for (const k of keys) next[k] = this._shape[k];
    return new ObjectSchema<Pick<S, K>>(next, this._strict);
  }

  /** Drop the listed keys. */
  omit<K extends keyof S>(...keys: K[]): ObjectSchema<Omit<S, K>> {
    const drop = new Set<keyof S>(keys);
    const next = {} as Record<string, Schema<unknown>>;
    for (const [k, v] of Object.entries(this._shape)) {
      if (!drop.has(k as keyof S)) next[k] = v;
    }
    return new ObjectSchema<Omit<S, K>>(next as Omit<S, K>, this._strict);
  }

  /** Merge another shape on top of this one. */
  extend<E extends ObjectShape>(extra: E): ObjectSchema<S & E> {
    return new ObjectSchema<S & E>({ ...this._shape, ...extra } as S & E, this._strict);
  }
}

// ---------------------------------------------------------------------------
// Union / Intersection / Discriminated Union / Record / Raw
// ---------------------------------------------------------------------------

export class UnionSchema<TArr extends ReadonlyArray<Schema<unknown>>> extends Schema<Infer<TArr[number]>> {
  private readonly _members: TArr;
  constructor(members: TArr, def?: JsonSchema, isOptional = false, hasDefault = false) {
    super(def ?? { anyOf: members.map((m) => m.toJsonSchema()) }, isOptional, hasDefault);
    this._members = members;
  }
  protected _withDef(def: JsonSchema, isOptional = this._isOptional, hasDefault = this._hasDefault): UnionSchema<TArr> {
    return new UnionSchema<TArr>(this._members, def, isOptional, hasDefault);
  }
}

export class IntersectionSchema<A extends Schema<unknown>, B extends Schema<unknown>>
  extends Schema<Infer<A> & Infer<B>>
{
  private readonly _a: A;
  private readonly _b: B;
  constructor(a: A, b: B, def?: JsonSchema, isOptional = false, hasDefault = false) {
    super(def ?? { allOf: [a.toJsonSchema(), b.toJsonSchema()] }, isOptional, hasDefault);
    this._a = a;
    this._b = b;
  }
  protected _withDef(def: JsonSchema, isOptional = this._isOptional, hasDefault = this._hasDefault): IntersectionSchema<A, B> {
    return new IntersectionSchema<A, B>(this._a, this._b, def, isOptional, hasDefault);
  }
}

export class DiscriminatedUnionSchema<TArr extends ReadonlyArray<Schema<unknown>>>
  extends Schema<Infer<TArr[number]>>
{
  private readonly _key: string;
  private readonly _members: TArr;
  constructor(key: string, members: TArr, def?: JsonSchema, isOptional = false, hasDefault = false) {
    super(def ?? {
      oneOf: members.map((m) => m.toJsonSchema()),
      discriminator: { propertyName: key },
    }, isOptional, hasDefault);
    this._key = key;
    this._members = members;
  }
  protected _withDef(def: JsonSchema, isOptional = this._isOptional, hasDefault = this._hasDefault): DiscriminatedUnionSchema<TArr> {
    return new DiscriminatedUnionSchema<TArr>(this._key, this._members, def, isOptional, hasDefault);
  }
}

export class RecordSchema<TValue extends Schema<unknown>> extends Schema<Record<string, Infer<TValue>>> {
  private readonly _value: TValue;
  constructor(value: TValue, def?: JsonSchema, isOptional = false, hasDefault = false) {
    super(def ?? { type: 'object', additionalProperties: value.toJsonSchema() }, isOptional, hasDefault);
    this._value = value;
  }
  protected _withDef(def: JsonSchema, isOptional = this._isOptional, hasDefault = this._hasDefault): RecordSchema<TValue> {
    return new RecordSchema<TValue>(this._value, def, isOptional, hasDefault);
  }
}

export class RawSchema<T = unknown> extends Schema<T> {
  constructor(def: JsonSchema, isOptional = false, hasDefault = false) {
    super(def, isOptional, hasDefault);
  }
  protected _withDef(def: JsonSchema, isOptional = this._isOptional, hasDefault = this._hasDefault): RawSchema<T> {
    return new RawSchema<T>(def, isOptional, hasDefault);
  }
}

// ---------------------------------------------------------------------------
// Public factory namespace + Infer helper
// ---------------------------------------------------------------------------

/**
 * Extract the inferred TypeScript type from a `Schema<T>` builder. Raw
 * `JsonSchema` inputs resolve to `unknown` â€” the framework's runtime
 * validator still runs, but TypeScript can't see the schema's shape.
 */
export type Infer<T> = T extends Schema<infer U> ? U : unknown;

export type SchemaInput = JsonSchema | Schema<unknown>;

const isSchemaBuilder = (value: unknown): value is Schema<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { toJsonSchema?: unknown }).toJsonSchema === 'function';

/** Normalise a SchemaInput to a plain JsonSchema fragment. */
export const toJsonSchemaInput = (input: SchemaInput): JsonSchema =>
  isSchemaBuilder(input) ? input.toJsonSchema() : input;

export const s = {
  string:    (): StringSchema  => new StringSchema(),
  number:    (): NumberSchema  => new NumberSchema(),
  integer:   (): NumberSchema  => new NumberSchema({ type: 'integer' }),
  boolean:   (): BooleanSchema => new BooleanSchema(),
  null:      (): NullSchema    => new NullSchema(),
  any:       (): AnySchema     => new AnySchema(),
  unknown:   (): AnySchema     => new AnySchema(),

  literal: <T extends string | number | boolean | null>(value: T): LiteralSchema<T> =>
    new LiteralSchema<T>({ const: value as unknown as JsonSchema[keyof JsonSchema] }),

  enum: <T extends readonly [string, ...string[]] | readonly [number, ...number[]]>(
    values: T,
  ): EnumSchema<T[number]> => new EnumSchema<T[number]>({ enum: [...values] }),

  array: <TItem extends Schema<unknown>>(item: TItem): ArraySchema<TItem> =>
    new ArraySchema<TItem>(item),

  object: <S extends ObjectShape>(shape: S): ObjectSchema<S> =>
    new ObjectSchema<S>(shape, true),

  union: <TArr extends readonly [Schema<unknown>, Schema<unknown>, ...Schema<unknown>[]]>(
    members: TArr,
  ): UnionSchema<TArr> => new UnionSchema<TArr>(members),

  intersection: <A extends Schema<unknown>, B extends Schema<unknown>>(
    a: A,
    b: B,
  ): IntersectionSchema<A, B> => new IntersectionSchema<A, B>(a, b),

  discriminatedUnion: <TArr extends readonly [Schema<unknown>, Schema<unknown>, ...Schema<unknown>[]]>(
    key: string,
    members: TArr,
  ): DiscriminatedUnionSchema<TArr> => new DiscriminatedUnionSchema<TArr>(key, members),

  record: <TValue extends Schema<unknown>>(value: TValue): RecordSchema<TValue> =>
    new RecordSchema<TValue>(value),

  raw: <T = unknown>(jsonSchema: JsonSchema): RawSchema<T> => new RawSchema<T>(jsonSchema),
};

