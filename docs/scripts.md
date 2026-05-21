# NPM Scripts for Consumer Projects

This page describes the minimum set of scripts a project consuming `superman` should have in its `package.json`, 
why they are enough to cover **development**, **staging**, and **production**, and how to add **unit tests** with Jest.

## Minimum scripts

```jsonc
{
  "scripts": {
    "dev":   "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test":  "jest"
  }
}
```

| Script | Command | When to run |
|--------|---------|-------------|
| `dev`   | `tsx watch src/server.ts` | Local development loop â€” executes TypeScript directly, reloads on save. No build step. |
| `build` | `tsc`                     | Compile to `dist/` before deploying to staging / production. |
| `start` | `node dist/server.js`     | Run the compiled artifact. Inherits `NODE_ENV` from the shell / env file / orchestrator. |
| `test`  | `jest`                    | Unit tests (colocation, `*.test.ts` next to source). |

These four scripts are **all you need**. No `start:staging`, no `start:prod`, no environment-specific commands.

## One build, three environments

The framework resolves per-environment behaviour **at runtime** â€” the same compiled artifact works for dev, staging, and prod. You only change the env variable.

```ts
// src/server.config.ts
defineConfig({
  port: { env: 'PORT', default: 3000 },
  prefix: '/api',

  environments: {
    development: { endpoints: { myApi: 'https://dev.api.example.com' } },
    staging:     { endpoints: { myApi: 'https://staging.api.example.com' } },
    production:  { endpoints: { myApi: 'https://api.example.com' } },
  },
});
```

At boot, the framework:

1. Reads `process.env.NODE_ENV` (default: `development`).
2. Picks the matching `environments[...]` block â€” `config.endpoints.myApi` returns the right URL for that env.
3. Adjusts defaults based on the env: `LOG_LEVEL` falls back to `info` in production and `debug` otherwise; file sink paths / console colouring behave consistently; `config.isProduction()` is available anywhere.

So the single `start` script covers every environment â€” the orchestrator (Docker, k8s, PM2, systemd, GitHub Actions) injects `NODE_ENV` and secrets, and `node dist/server.js` does the right thing:

```bash
# Development (live reload, no build needed)
npm run dev

# Build once
npm run build

# Staging â€” loads environments.staging.endpoints
NODE_ENV=staging npm start

# Production â€” loads environments.production.endpoints, logger defaults to info
NODE_ENV=production LOG_LEVEL=info npm start
```

### Why not separate `start:dev` / `start:staging` / `start:prod` scripts?

Because they would just bake `NODE_ENV` into the `package.json`, which is exactly what orchestrators already manage. Keeping a single `start` avoids drift between local scripts and the actual deploy command. If you need an env-file convention for local overrides, rely on `dotenv/config` â€” do not hard-code the environment in the script.

## Why `tsc` (and not `tsup` / `esbuild`) for production

The framework itself ships a single pre-bundled file via `tsup`, so consumer apps don't need to re-bundle. Plain `tsc` is:

- **Simpler** â€” one file (`tsconfig.json`) already drives the whole project.
- **Debuggable** â€” source maps land next to the emitted JS; stack traces in prod point to your own files, not a bundle.
- **Fast enough** â€” `tsc` on a typical module-based app is sub-second.

The `dist/` folder produced by `tsc` can be copied directly into a Docker image or tarball. The entry point in production is always `node dist/server.js`.

## Unit tests with Jest

Keep tests simple: colocate them with the source, use the `.test.ts` suffix, rely on `ts-jest` to run TypeScript without an intermediate build.

### Install

```bash
npm install --save-dev jest@^30 ts-jest@^29 @types/jest@^30
```

### `jest.config.ts`

```ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
};

export default config;
```

### `tsconfig.json` tweak

If `tsconfig.json` uses `"module": "nodenext"` (recommended), add `"isolatedModules": true` to silence the ts-jest hybrid-module warning â€” both `tsc` and Jest will be happy.

### Example test

Colocate next to the service. NODE_ENV is `test` inside Jest, so the framework logger is silent automatically.

```ts
// src/modules/example/services/example.service.test.ts
import { BadRequestException, NotFoundException } from 'superman';
import { ExampleService } from './example.service';

describe('ExampleService', () => {
  it('should return a greeting for a valid name', () => {
    // Arrange
    const service = new ExampleService();

    // Act
    const result = service.generatePersonalizedGreeting('Bruno');

    // Assert
    expect(result).toEqual({ message: 'Hello, Bruno!' });
  });

  it('should throw BadRequestException when the name is only whitespace', () => {
    const service = new ExampleService();
    expect(() => service.generatePersonalizedGreeting('   ')).toThrow(BadRequestException);
  });

  it('should throw NotFoundException when the id is unknown', () => {
    const service = new ExampleService();
    expect(() => service.findUser('999')).toThrow(NotFoundException);
  });
});
```

### Run

```bash
npm test
```

ts-jest compiles `.ts` files on the fly â€” no pre-build required. Jest's `NODE_ENV=test` already flips the framework logger to `silent`, so your test output stays clean.

## What this setup does NOT include (on purpose)

- **Linter** â€” add your own ESLint config when you need it; not every app needs it from day one.
- **Watch mode for tests** â€” `npm test -- --watch` works out of the box.
- **Integration tests with supertest** â€” add only when you have HTTP-layer behaviour specific to your app. The framework already covers its own HTTP semantics with 200+ internal tests.
- **Separate staging / prod scripts** â€” see the "One build, three environments" section above.

