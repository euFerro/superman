import { resolveEnvironment } from './resolve-environment';

describe('resolveEnvironment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.ENV;
    delete process.env.NODE_ENV;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return ENV when set', () => {
    // Arrange
    process.env.ENV = 'production';
    process.env.NODE_ENV = 'development';

    // Act
    const resolved = resolveEnvironment();

    // Assert
    expect(resolved).toBe('production');
  });

  it('should fall back to NODE_ENV when ENV is unset', () => {
    // Arrange
    process.env.NODE_ENV = 'production';

    // Act
    const resolved = resolveEnvironment();

    // Assert
    expect(resolved).toBe('production');
  });

  it('should default to "development" when neither is set', () => {
    // Arrange — both unset (cleared in beforeEach)

    // Act
    const resolved = resolveEnvironment();

    // Assert
    expect(resolved).toBe('development');
  });

  it('should prefer ENV over NODE_ENV even when ENV is empty string', () => {
    // Arrange — empty ENV is treated as "set" (?? semantics)
    process.env.ENV = '';
    process.env.NODE_ENV = 'production';

    // Act
    const resolved = resolveEnvironment();

    // Assert
    expect(resolved).toBe('');
  });
});