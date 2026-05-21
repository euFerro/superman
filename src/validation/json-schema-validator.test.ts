import { validateJsonSchema } from './json-schema-validator';

describe('validateJsonSchema', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('type', () => {
    it('should accept matching primitive types', () => {
      // Arrange / Act
      const r = validateJsonSchema('hello', { type: 'string' });

      // Assert
      expect(r.valid).toBe(true);
    }, 1000);

    it('should reject mismatched primitive types', () => {
      // Arrange / Act
      const r = validateJsonSchema(123, { type: 'string' });

      // Assert
      expect(r.valid).toBe(false);
      expect(r.errors[0].keyword).toBe('type');
    }, 1000);

    it('should accept union types including null', () => {
      // Arrange / Act
      const r = validateJsonSchema(null, { type: ['string', 'null'] });

      // Assert
      expect(r.valid).toBe(true);
    }, 1000);

    it('should treat integer as a stricter number', () => {
      // Arrange / Act
      const r = validateJsonSchema(1.5, { type: 'integer' });

      // Assert
      expect(r.valid).toBe(false);
    }, 1000);
  });

  describe('object', () => {
    it('should report missing required properties', () => {
      // Arrange
      const schema = { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] };

      // Act
      const r = validateJsonSchema({}, schema);

      // Assert
      expect(r.valid).toBe(false);
      expect(r.errors[0]).toMatchObject({ keyword: 'required', path: '/name' });
    }, 1000);

    it('should reject additional properties when disallowed', () => {
      // Arrange
      const schema = { type: 'object', properties: { name: { type: 'string' } }, additionalProperties: false };

      // Act
      const r = validateJsonSchema({ name: 'a', other: 1 }, schema);

      // Assert
      expect(r.valid).toBe(false);
      expect(r.errors[0].keyword).toBe('additionalProperties');
    }, 1000);

    it('should validate nested properties recursively', () => {
      // Arrange
      const schema = {
        type: 'object',
        properties: { user: { type: 'object', properties: { age: { type: 'integer' } } } },
      };

      // Act
      const r = validateJsonSchema({ user: { age: 'oops' } }, schema);

      // Assert
      expect(r.valid).toBe(false);
      expect(r.errors[0].path).toBe('/user/age');
    }, 1000);
  });

  describe('array', () => {
    it('should validate item schema for every entry', () => {
      // Arrange
      const schema = { type: 'array', items: { type: 'string' } };

      // Act
      const r = validateJsonSchema(['a', 1, 'c'], schema);

      // Assert
      expect(r.valid).toBe(false);
      expect(r.errors[0].path).toBe('/1');
    }, 1000);

    it('should enforce uniqueItems', () => {
      // Arrange / Act
      const r = validateJsonSchema([1, 2, 2], { type: 'array', uniqueItems: true });

      // Assert
      expect(r.valid).toBe(false);
      expect(r.errors[0].keyword).toBe('uniqueItems');
    }, 1000);
  });

  describe('string formats', () => {
    it('should accept a valid email', () => {
      // Arrange / Act
      const r = validateJsonSchema('a@b.com', { type: 'string', format: 'email' });

      // Assert
      expect(r.valid).toBe(true);
    }, 1000);

    it('should reject an invalid uuid', () => {
      // Arrange / Act
      const r = validateJsonSchema('not-a-uuid', { type: 'string', format: 'uuid' });

      // Assert
      expect(r.valid).toBe(false);
      expect(r.errors[0].keyword).toBe('format');
    }, 1000);
  });

  describe('number constraints', () => {
    it('should enforce minimum/maximum', () => {
      // Arrange / Act
      const r = validateJsonSchema(150, { type: 'integer', minimum: 1, maximum: 100 });

      // Assert
      expect(r.valid).toBe(false);
      expect(r.errors[0].keyword).toBe('maximum');
    }, 1000);

    it('should enforce multipleOf', () => {
      // Arrange / Act
      const r = validateJsonSchema(7, { type: 'integer', multipleOf: 5 });

      // Assert
      expect(r.valid).toBe(false);
      expect(r.errors[0].keyword).toBe('multipleOf');
    }, 1000);
  });

  describe('enum / const', () => {
    it('should reject values outside enum', () => {
      // Arrange / Act
      const r = validateJsonSchema('purple', { type: 'string', enum: ['red', 'green', 'blue'] });

      // Assert
      expect(r.valid).toBe(false);
      expect(r.errors[0].keyword).toBe('enum');
    }, 1000);

    it('should reject values that do not equal const', () => {
      // Arrange / Act
      const r = validateJsonSchema({ kind: 'b' }, { const: { kind: 'a' } });

      // Assert
      expect(r.valid).toBe(false);
      expect(r.errors[0].keyword).toBe('const');
    }, 1000);
  });

  describe('combinators', () => {
    it('should pass anyOf when at least one branch matches', () => {
      // Arrange
      const schema = { anyOf: [{ type: 'string' }, { type: 'integer' }] };

      // Act
      const r = validateJsonSchema(42, schema);

      // Assert
      expect(r.valid).toBe(true);
    }, 1000);

    it('should fail oneOf when more than one branch matches', () => {
      // Arrange
      const schema = { oneOf: [{ type: 'integer' }, { type: 'number' }] };

      // Act
      const r = validateJsonSchema(7, schema);

      // Assert
      expect(r.valid).toBe(false);
      expect(r.errors[0].keyword).toBe('oneOf');
    }, 1000);

    it('should reject values that match a `not` schema', () => {
      // Arrange / Act
      const r = validateJsonSchema('admin', { not: { const: 'admin' } });

      // Assert
      expect(r.valid).toBe(false);
      expect(r.errors[0].keyword).toBe('not');
    }, 1000);
  });

  describe('coercion', () => {
    it('should coerce numeric strings to integers when enabled', () => {
      // Arrange / Act
      const r = validateJsonSchema('42', { type: 'integer' }, { coerce: true });

      // Assert
      expect(r.valid).toBe(true);
      expect(r.value).toBe(42);
    }, 1000);

    it('should coerce "true"/"false" to booleans when enabled', () => {
      // Arrange / Act
      const r = validateJsonSchema('false', { type: 'boolean' }, { coerce: true });

      // Assert
      expect(r.valid).toBe(true);
      expect(r.value).toBe(false);
    }, 1000);

    it('should coerce values inside object properties', () => {
      // Arrange
      const schema = { type: 'object', properties: { page: { type: 'integer' } } };

      // Act
      const r = validateJsonSchema({ page: '3' }, schema, { coerce: true });

      // Assert
      expect(r.valid).toBe(true);
      expect((r.value as { page: number }).page).toBe(3);
    }, 1000);

    it('should not coerce when option is false', () => {
      // Arrange / Act
      const r = validateJsonSchema('42', { type: 'integer' });

      // Assert
      expect(r.valid).toBe(false);
    }, 1000);
  });
});
