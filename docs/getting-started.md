# Getting Started

## Installation

First, install the package using your preferred package manager:

```bash
npm install @supersec-ai/superman
```

> **Note:** The framework uses Fastify under the hood and integrates with the Model Context Protocol. Make sure to install the required peer dependencies in your application:
> ```bash
> npm install fastify @modelcontextprotocol/sdk
> ```

## Step 1 — Define your config

> **Tip:** To automatically load your local `.env` file variables into `process.env`, install the `dotenv` package (`npm install dotenv`) and add `import 'dotenv/config';` at the very top of your config file.

```typescript
// src/server.config.ts
import 'dotenv/config'; // side-effect — loads .env into process.env
import { defineConfig } from '@supersec-ai/superman';

defineConfig({
  port: { env: 'PORT', default: 3000 },
  prefix: '/api',
  jsonLimit: '10mb',

  environments: {
    development: {
      endpoints: {
        usersApi: 'https://dev.api.example.com/users',
      },
    },
    staging: {
      endpoints: {
        usersApi: 'https://staging.api.example.com/users',
      },
    },
    production: {
      endpoints: {
        usersApi: 'https://api.example.com/users',
      },
    },
  },

  env: {
    DATABASE_URL: { required: true },
    JWT_SECRET: { required: true },
    MY_CUSTOM_ENV_VAR: { default: 'my_custom_env_var' },
  },

  // Automatically expose a /spec route with OpenAPI 3.1 docs and a Scalar UI
  openapi: {
    docs: { enabled: true },
  },

  // Automatically start an MCP (Model Context Protocol) Server for AI Agents
  mcp: {
    enabled: true,
  },
});
```

The framework validates required env vars on startup, resolves endpoints for the active environment (via `NODE_ENV` or simply `ENV`), and makes everything available through the `config` singleton. The `prefix` is prepended to all module routes automatically.

## Step 2 — Define a service

Define an interface for the contract and implement it with a plain class. Controllers depend on the interface, never on the implementation.

```typescript
// src/modules/users/services/users.services.ts
import { NotFoundException } from '@supersec-ai/superman';

export interface IUsersService {
  findAll(params: PaginationParams): Promise<PaginatedResult<User>>;
  findById(id: string): Promise<User>;
  create(data: Partial<User>): Promise<User>;
}

class UsersService implements IUsersService {
  constructor(private readonly repository: IUsersRepository) {}

  async findAll(params: PaginationParams) {
    return this.repository.findAll(params);
  }

  async findById(id: string) {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(data: Partial<User>) {
    return this.repository.create(data);
  }
}
```

## Step 3 — Define schemas and controllers

Schemas are written with the framework's chainable builder (`s.*`) — no Zod or other dep required. One declaration drives runtime validation, the OpenAPI spec, and TypeScript types (via `Infer<typeof Schema>`).

```typescript
// src/modules/users/user.schemas.ts
import { s, type Infer } from '@supersec-ai/superman';

export const UserResponse = s.object({
  id:    s.string().uuid(),
  name:  s.string(),
  email: s.string().email(),
}).describe('A user record.');

export const CreateUserBody = s.object({
  name:  s.string().min(1),
  email: s.string().email(),
});

export type CreateUserDto = Infer<typeof CreateUserBody>;

export const ListUsersQuery = s.object({
  page:  s.integer().min(1).default(1),
  limit: s.integer().min(1).max(100).default(20),
});

export type ListUsersDto = Infer<typeof ListUsersQuery>;
```

```typescript
// src/modules/users/controllers/users.controllers.ts
import {
  defineController,
  validateBody, validateQuery,
  requireAuth, requireRoles,
} from '@supersec-ai/superman';
import type { IUsersService } from '../services/users.service';
import { UserResponse, CreateUserBody, ListUsersQuery } from '../user.schemas';

export const listUsersController = defineController<IUsersService>({
  middlewares: [requireAuth('bearerAuth'), validateQuery(ListUsersQuery)],
  responses: { 200: { schema: UserResponse, description: 'Paginated list of users.' } },
  operationId: 'listUsers',
  handler: async ({ query, service }) => service.findAll(query),
  //                ^^^^^ ListUsersDto (inferred from validateQuery)
});

export const findUserController = defineController<IUsersService>({
  middlewares: [requireAuth('bearerAuth')],
  responses: { 200: { schema: UserResponse } },
  errors: [{ status: 404, description: 'User not found.' }],
  operationId: 'findUser',
  throttleConfig: { limit: 50, ttl: 60_000 },
  handler: async ({ req, service }) => service.findById(req.params.id),
});

export const createUserController = defineController<IUsersService>({
  middlewares: [
    requireAuth('bearerAuth'),
    requireRoles('admin'),
    validateBody(CreateUserBody),
  ],
  responses: { 201: { schema: UserResponse, description: 'User created.' } },
  operationId: 'createUser',
  throttleConfig: 'STRICT',
  handler: async ({ body, service }) => service.create(body),
  //                ^^^^ CreateUserDto (inferred from validateBody)
  // ➡️ framework picks the single declared 2xx status (201) for the response
});
```

The middleware list is the single source of truth: each `validate*` / `require*` middleware validates at runtime *and* contributes its piece to the OpenAPI doc — schemas can't drift from guards because they're the same object. The framework also auto-injects `400`/`401`/`403`/`415`/`429`/`500`/`default` responses based on which middlewares are present, plus the `X-RateLimit-Remaining` / `Retry-After` response headers on every operation.

`defineController` is generic and returns a factory. Call the factory with your service implementation to get a `SupermanController`.

## Step 4 — Define a module

The module file is the **composition root** — you instantiate implementations, wire dependencies, and declare routes.

```typescript
// src/modules/users/users.module.ts
import { defineModule } from '@supersec-ai/superman';
import { listUsersController, findUserController, createUserController } from './controllers/users.controllers';

const usersDb = new UsersPostgresDb();
const usersRepository = new UsersRepository(usersDb);
const usersService = new UsersService(usersRepository);

defineModule({
  name: 'UsersModule',
  prefix: '/users',
  routes: [
    { method: 'GET',  path: '/',    controller: listUsersController(usersService) },
    { method: 'GET',  path: '/:id', controller: findUserController(usersService) },
    { method: 'POST', path: '/',    controller: createUserController(usersService) },
  ],
});
```

Each controller factory is called with the service — you can see exactly which implementations are being used. Swap a database or service implementation by changing one line.

With `prefix: '/api'` in `defineConfig` and `prefix: '/users'` in the module, the framework generates these routes:

```
GET  /api/users
GET  /api/users/:id
POST /api/users
```

## Step 5 — Register an MCP Tool (Optional)

Instantly expose any capability to AI agents by wrapping your service logic in a Model Context Protocol tool. The framework automatically wires up the endpoints and schema translations.

```typescript
// src/modules/users/mcp/users.tools.ts
import { mcpServer } from '@supersec-ai/superman';
import { z } from 'zod';
import type { IUsersService } from '../services/users.services';

export const registerUsersTools = (service: IUsersService) => {
  mcpServer.registerTool(
    'list-users',
    {
      title: 'List users',
      description: 'List all registered users.',
      inputSchema: { 
        page: z.number().optional().describe('Page number') 
      },
    },
    async ({ page }) => {
      const result = await service.findAll({ page: page || 1, limit: 10, q: '' });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      };
    }
  );
};
```

Call this registration function in your module's composition root before calling `defineModule`.

## Step 6 — Main

```typescript
// src/server.ts
import './server.config'; // side-effect — runs defineConfig()
import { app, config, logger } from '@supersec-ai/superman';

const log = logger.child('Server');

const main = async () => {
  // Add any db connection or any other logic you need here...

  app.listen(() => {
    log.info(`🚀 Server started successfully!`);
    log.info(`🌍 API URL: http://localhost:${config.port}${config.prefix}`);
    log.info(`📚 Swagger Docs: http://localhost:${config.port}${config.prefix}/docs`);
    log.info(`🤖 MCP Server: http://localhost:${config.port}${config.prefix}/mcp`);
  });
};

main();
```

That's it. Config, logging, rate limiting, exception handling, and graceful shutdown — all automatic.

