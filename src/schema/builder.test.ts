import { s, Schema, type Infer, toJsonSchemaInput } from './builder';
import { BadRequestException } from '../exceptions/http.exception';

describe('schema builder (s.*)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('s.string()', () => {
    it('should emit type:string with no constraints by default', () => {
      // Arrange / Act
      const json = s.string().toJsonSchema();

      // Assert
      expect(json).toEqual({ type: 'string' });
    }, 1000);

    it('should add minLength/maxLength via .min()/.max()', () => {
      // Arrange / Act
      const json = s.string().min(2).max(10).toJsonSchema();

      // Assert
      expect(json).toMatchObject({ type: 'string', minLength: 2, maxLength: 10 });
    }, 1000);

    it('should set both bounds via .length()', () => {
      // Arrange / Act
      const json = s.string().length(8).toJsonSchema();

      // Assert
      expect(json).toMatchObject({ minLength: 8, maxLength: 8 });
    }, 1000);

    it('should set the format keyword for each format helper', () => {
      // Arrange / Act / Assert
      expect(s.string().email().toJsonSchema()).toHaveProperty('format', 'email');
      expect(s.string().uuid().toJsonSchema()).toHaveProperty('format', 'uuid');
      expect(s.string().url().toJsonSchema()).toHaveProperty('format', 'uri');
      expect(s.string().datetime().toJsonSchema()).toHaveProperty('format', 'date-time');
      expect(s.string().date().toJsonSchema()).toHaveProperty('format', 'date');
      expect(s.string().time().toJsonSchema()).toHaveProperty('format', 'time');
      expect(s.string().ipv4().toJsonSchema()).toHaveProperty('format', 'ipv4');
      expect(s.string().ipv6().toJsonSchema()).toHaveProperty('format', 'ipv6');
      expect(s.string().hostname().toJsonSchema()).toHaveProperty('format', 'hostname');
    }, 1000);

    it('should serialise a RegExp pattern to its source string', () => {
      // Arrange / Act
      const json = s.string().regex(/^foo/).toJsonSchema();

      // Assert
      expect(json).toHaveProperty('pattern', '^foo');
    }, 1000);
  });

  describe('s.number() / s.integer()', () => {
    it('should emit type:number with no constraints by default', () => {
      // Arrange / Act
      const json = s.number().toJsonSchema();

      // Assert
      expect(json).toEqual({ type: 'number' });
    }, 1000);

    it('should map .min/.max/.gt/.lt to JSON Schema keywords', () => {
      // Arrange / Act
      const json = s.number().min(0).max(100).gt(-1).lt(101).toJsonSchema();

      // Assert
      expect(json).toMatchObject({
        minimum: 0,
        maximum: 100,
        exclusiveMinimum: -1,
        exclusiveMaximum: 101,
      });
    }, 1000);

    it('should switch type to integer via .int()', () => {
      // Arrange / Act
      const json = s.number().int().toJsonSchema();

      // Assert
      expect(json).toHaveProperty('type', 'integer');
    }, 1000);

    it('should emit type:integer from s.integer() factory', () => {
      // Arrange / Act
      const json = s.integer().toJsonSchema();

      // Assert
      expect(json).toEqual({ type: 'integer' });
    }, 1000);

    it('should map .positive/.negative/.nonnegative/.nonpositive', () => {
      // Arrange / Act / Assert
      expect(s.number().positive().toJsonSchema()).toHaveProperty('exclusiveMinimum', 0);
      expect(s.number().negative().toJsonSchema()).toHaveProperty('exclusiveMaximum', 0);
      expect(s.number().nonnegative().toJsonSchema()).toHaveProperty('minimum', 0);
      expect(s.number().nonpositive().toJsonSchema()).toHaveProperty('maximum', 0);
    }, 1000);
  });

  describe('s.boolean() / s.null() / s.any()', () => {
    it('should emit type:boolean', () => {
      // Arrange / Act / Assert
      expect(s.boolean().toJsonSchema()).toEqual({ type: 'boolean' });
    }, 1000);

    it('should emit type:null', () => {
      // Arrange / Act / Assert
      expect(s.null().toJsonSchema()).toEqual({ type: 'null' });
    }, 1000);

    it('should emit an empty schema for s.any()', () => {
      // Arrange / Act / Assert
      expect(s.any().toJsonSchema()).toEqual({});
    }, 1000);
  });

  describe('s.literal() / s.enum()', () => {
    it('should emit const for a literal value', () => {
      // Arrange / Act
      const json = s.literal('admin').toJsonSchema();

      // Assert
      expect(json).toEqual({ const: 'admin' });
    }, 1000);

    it('should emit enum for a value tuple', () => {
      // Arrange / Act
      const json = s.enum(['admin', 'editor', 'viewer'] as const).toJsonSchema();

      // Assert
      expect(json).toEqual({ enum: ['admin', 'editor', 'viewer'] });
    }, 1000);
  });

  describe('s.array()', () => {
    it('should emit type:array with the child schema in items', () => {
      // Arrange / Act
      const json = s.array(s.string()).toJsonSchema();

      // Assert
      expect(json).toEqual({ type: 'array', items: { type: 'string' } });
    }, 1000);

    it('should map .min/.max/.length to minItems/maxItems', () => {
      // Arrange / Act
      const json = s.array(s.number()).min(1).max(5).toJsonSchema();

      // Assert
      expect(json).toMatchObject({ minItems: 1, maxItems: 5 });
    }, 1000);

    it('should set uniqueItems via .unique()', () => {
      // Arrange / Act
      const json = s.array(s.string()).unique().toJsonSchema();

      // Assert
      expect(json).toHaveProperty('uniqueItems', true);
    }, 1000);
  });

  describe('s.object()', () => {
    it('should compose properties and auto-compute required', () => {
      // Arrange
      const schema = s.object({
        name: s.string(),
        age: s.number().optional(),
      });

      // Act
      const json = schema.toJsonSchema();

      // Assert
      expect(json).toMatchObject({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
        additionalProperties: false,
      });
    }, 1000);

    it('should not list keys that have a default in required', () => {
      // Arrange
      const schema = s.object({
        name: s.string(),
        role: s.string().default('viewer'),
      });

      // Act
      const json = schema.toJsonSchema();

      // Assert
      expect(json.required).toEqual(['name']);
    }, 1000);

    it('should default to strict (additionalProperties:false)', () => {
      // Arrange / Act
      const json = s.object({ x: s.string() }).toJsonSchema();

      // Assert
      expect(json).toHaveProperty('additionalProperties', false);
    }, 1000);

    it('should allow extra keys after .passthrough()', () => {
      // Arrange / Act
      const json = s.object({ x: s.string() }).passthrough().toJsonSchema();

      // Assert
      expect(json.additionalProperties).toBeUndefined();
    }, 1000);

    it('should make all keys optional via .partial()', () => {
      // Arrange / Act
      const json = s.object({ a: s.string(), b: s.number() }).partial().toJsonSchema();

      // Assert
      expect(json.required).toBeUndefined();
    }, 1000);

    it('should pick a subset of keys', () => {
      // Arrange
      const base = s.object({ a: s.string(), b: s.number(), c: s.boolean() });

      // Act
      const json = base.pick('a', 'c').toJsonSchema();

      // Assert
      expect(Object.keys(json.properties as object)).toEqual(['a', 'c']);
    }, 1000);

    it('should omit specific keys', () => {
      // Arrange
      const base = s.object({ a: s.string(), b: s.number(), c: s.boolean() });

      // Act
      const json = base.omit('b').toJsonSchema();

      // Assert
      expect(Object.keys(json.properties as object)).toEqual(['a', 'c']);
    }, 1000);

    it('should merge another shape via .extend()', () => {
      // Arrange
      const a = s.object({ a: s.string() });
      const b = { b: s.number() };

      // Act
      const json = a.extend(b).toJsonSchema();

      // Assert
      expect(Object.keys(json.properties as object)).toEqual(['a', 'b']);
    }, 1000);
  });

  describe('s.union / s.intersection / s.discriminatedUnion / s.record / s.raw', () => {
    it('should emit anyOf for a union', () => {
      // Arrange / Act
      const json = s.union([s.string(), s.number()]).toJsonSchema();

      // Assert
      expect(json).toHaveProperty('anyOf');
      expect((json.anyOf as unknown[])).toHaveLength(2);
    }, 1000);

    it('should emit allOf for an intersection', () => {
      // Arrange / Act
      const json = s.intersection(s.object({ a: s.string() }), s.object({ b: s.number() })).toJsonSchema();

      // Assert
      expect(json).toHaveProperty('allOf');
    }, 1000);

    it('should emit oneOf + discriminator for a discriminated union', () => {
      // Arrange
      const cat = s.object({ kind: s.literal('cat'), meow: s.boolean() });
      const dog = s.object({ kind: s.literal('dog'), bark: s.boolean() });

      // Act
      const json = s.discriminatedUnion('kind', [cat, dog]).toJsonSchema();

      // Assert
      expect(json).toHaveProperty('oneOf');
      expect(json).toHaveProperty('discriminator', { propertyName: 'kind' });
    }, 1000);

    it('should emit additionalProperties:<child> for a record', () => {
      // Arrange / Act
      const json = s.record(s.number()).toJsonSchema();

      // Assert
      expect(json).toMatchObject({ type: 'object', additionalProperties: { type: 'number' } });
    }, 1000);

    it('should pass through a raw JSON schema', () => {
      // Arrange
      const raw = { type: 'object', patternProperties: { '^x': { type: 'string' } } };

      // Act
      const json = s.raw(raw).toJsonSchema();

      // Assert
      expect(json).toEqual(raw);
    }, 1000);
  });

  describe('chain metadata methods', () => {
    it('should attach description / example / examples / deprecated / default', () => {
      // Arrange / Act
      const json = s.string()
        .describe('A name')
        .example('Ada')
        .examples(['Ada', 'Bob'])
        .deprecated()
        .default('Anon')
        .toJsonSchema();

      // Assert
      expect(json).toMatchObject({
        description: 'A name',
        example: 'Ada',
        examples: ['Ada', 'Bob'],
        deprecated: true,
        default: 'Anon',
      });
    }, 1000);

    it('should add null to type when .nullable()', () => {
      // Arrange / Act
      const json = s.string().nullable().toJsonSchema();

      // Assert
      expect(json.type).toEqual(['string', 'null']);
      expect(json).toHaveProperty('nullable', true);
    }, 1000);

    it('should flag optional via the _isOptional marker', () => {
      // Arrange / Act
      const schema = s.string().optional();

      // Assert
      expect(schema._isOptional).toBe(true);
    }, 1000);
  });

  describe('Schema.parse / safeParse', () => {
    it('should return the value on a successful parse', () => {
      // Arrange
      const schema = s.object({ name: s.string() });

      // Act
      const result = schema.parse({ name: 'Ada' });

      // Assert
      expect(result).toEqual({ name: 'Ada' });
    }, 1000);

    it('should throw BadRequestException with metadata.errors on a failed parse', () => {
      // Arrange
      const schema = s.object({ name: s.string() });

      // Act / Assert
      expect(() => schema.parse({})).toThrow(BadRequestException);
    }, 1000);

    it('should carry the validator errors on the thrown exception metadata', () => {
      // Arrange
      const schema = s.object({ name: s.string() });
      let thrown: unknown;

      // Act
      try {
        schema.parse({});
      } catch (e) {
        thrown = e;
      }

      // Assert
      const ex = thrown as BadRequestException;
      expect(ex.metadata).toHaveProperty('errors');
      const errors = (ex.metadata as { errors: { path: string }[] }).errors;
      expect(errors[0].path).toBe('/name');
    }, 1000);

    it('should return success:true on safeParse with a valid payload', () => {
      // Arrange
      const schema = s.string().email();

      // Act
      const result = schema.safeParse('ada@example.com');

      // Assert
      expect(result).toEqual({ success: true, data: 'ada@example.com' });
    }, 1000);

    it('should return success:false with errors on safeParse with an invalid payload', () => {
      // Arrange
      const schema = s.string().email();

      // Act
      const result = schema.safeParse('not-an-email');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) expect(result.errors[0].keyword).toBe('format');
    }, 1000);
  });

  describe('Infer<typeof schema>', () => {
    it('should compile to the expected TypeScript shape', () => {
      // Arrange
      const Schema = s.object({
        name: s.string(),
        age: s.number().optional(),
        role: s.enum(['admin', 'viewer'] as const).default('viewer'),
      });
      type Dto = Infer<typeof Schema>;

      // Act
      const dto: Dto = { name: 'Ada', role: 'admin' };

      // Assert — compile-time check. Runtime assertion keeps Jest happy.
      expect(dto.name).toBe('Ada');
    }, 1000);
  });

  describe('toJsonSchemaInput / Schema instanceof', () => {
    it('should pass a Schema instance through toJsonSchemaInput', () => {
      // Arrange
      const schema = s.string().min(2);

      // Act
      const json = toJsonSchemaInput(schema);

      // Assert
      expect(json).toMatchObject({ type: 'string', minLength: 2 });
    }, 1000);

    it('should return a plain JsonSchema unchanged', () => {
      // Arrange
      const raw = { type: 'string', minLength: 1 };

      // Act
      const json = toJsonSchemaInput(raw);

      // Assert
      expect(json).toBe(raw);
    }, 1000);

    it('should produce instances that extend Schema', () => {
      // Arrange / Act / Assert
      expect(s.string()).toBeInstanceOf(Schema);
      expect(s.object({ x: s.string() })).toBeInstanceOf(Schema);
    }, 1000);
  });
});
