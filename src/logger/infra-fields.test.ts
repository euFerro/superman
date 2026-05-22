import { EventType } from './superman-logger.types';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

const ORIGINAL_ENV = process.env;

interface FsMock {
  existsSync: jest.Mock;
  readFileSync: jest.Mock;
}

interface ScenarioOptions {
  cwd?: string;
  existsSync?: (path: string) => boolean;
  readFileSync?: () => string;
}

const runScenario = (options: ScenarioOptions) => {
  let result: import('./infra-fields').InfraFields | undefined;

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as FsMock;
    fs.existsSync.mockReset();
    fs.readFileSync.mockReset();

    if (options.existsSync) {
      fs.existsSync.mockImplementation(options.existsSync);
    } else {
      fs.existsSync.mockReturnValue(false);
    }
    if (options.readFileSync) {
      fs.readFileSync.mockImplementation(options.readFileSync);
    }

    if (options.cwd) {
      jest.spyOn(process, 'cwd').mockReturnValue(options.cwd);
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { resolveInfraFields } = require('./infra-fields') as typeof import('./infra-fields');
    result = resolveInfraFields('Test', EventType.SYSTEM);
  });

  return result!;
};

describe('infra-fields app metadata resolution', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.npm_package_name;
    delete process.env.npm_package_version;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('should use process.env.npm_package_* when both env vars are set', () => {
    // Arrange
    process.env.npm_package_name = 'env-app';
    process.env.npm_package_version = '9.9.9';

    // Act
    const fields = runScenario({});

    // Assert
    expect(fields).toHaveProperty('appName', 'env-app');
    expect(fields).toHaveProperty('appVersion', '9.9.9');
  });

  it('should read name and version from package.json at cwd when env vars are absent', () => {
    // Arrange & Act
    const fields = runScenario({
      cwd: '/fake/project',
      existsSync: (p) => p.replace(/\\/g, '/').endsWith('/fake/project/package.json'),
      readFileSync: () => JSON.stringify({ name: 'pkg-app', version: '1.2.3' }),
    });

    // Assert
    expect(fields).toHaveProperty('appName', 'pkg-app');
    expect(fields).toHaveProperty('appVersion', '1.2.3');
  });

  it('should walk up to a parent directory when cwd has no package.json', () => {
    // Arrange & Act
    const fields = runScenario({
      cwd: '/fake/project/nested/sub',
      existsSync: (p) => p.replace(/\\/g, '/').endsWith('/fake/project/package.json'),
      readFileSync: () => JSON.stringify({ name: 'parent-app', version: '2.0.0' }),
    });

    // Assert
    expect(fields).toHaveProperty('appName', 'parent-app');
    expect(fields).toHaveProperty('appVersion', '2.0.0');
  });

  it('should fall back to defaults when no package.json is found', () => {
    // Arrange & Act
    const fields = runScenario({
      cwd: '/nowhere',
      existsSync: () => false,
    });

    // Assert
    expect(fields).toHaveProperty('appName', 'unknown-app');
    expect(fields).toHaveProperty('appVersion', '0.0.0');
  });

  it('should fall back to defaults when package.json cannot be parsed', () => {
    // Arrange & Act
    const fields = runScenario({
      cwd: '/fake/project',
      existsSync: () => true,
      readFileSync: () => {
        throw new Error('boom');
      },
    });

    // Assert
    expect(fields).toHaveProperty('appName', 'unknown-app');
    expect(fields).toHaveProperty('appVersion', '0.0.0');
  });

  it('should use fallback version when package.json has name but no version', () => {
    // Arrange & Act
    const fields = runScenario({
      cwd: '/fake/project',
      existsSync: () => true,
      readFileSync: () => JSON.stringify({ name: 'no-version-app' }),
    });

    // Assert
    expect(fields).toHaveProperty('appName', 'no-version-app');
    expect(fields).toHaveProperty('appVersion', '0.0.0');
  });
});

