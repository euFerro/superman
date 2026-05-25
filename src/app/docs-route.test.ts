import http from 'http';
import type { AddressInfo } from 'net';
import { SupermanApp } from './superman-app';
import { config } from '../config/superman-config';
import { flushPendingModules } from '../core/define-module';

const get = (port: number, path: string): Promise<{ status: number; type: string; body: string }> =>
  new Promise((resolve, reject) => {
    const req = http.get({ port, path, host: '127.0.0.1' }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        type: String(res.headers['content-type'] ?? ''),
        body,
      }));
    });
    req.on('error', reject);
  });

const startServer = (app: SupermanApp): Promise<{ port: number; close: () => Promise<void> }> =>
  new Promise(async (resolve, reject) => {
    const fastify = app.getFastifyApp();
    try {
      await fastify.listen({ port: 0, host: '127.0.0.1' });
      const port = (fastify.server.address() as AddressInfo).port;
      resolve({
        port,
        close: async () => { await fastify.close(); }
      });
    } catch (e) {
      reject(e);
    }
  });

describe('SupermanApp - /docs route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    config.reset();
    flushPendingModules();
  });

  afterEach(() => {
    config.reset();
    flushPendingModules();
  });

  it('should 404 on /docs when openapi.docs.enabled is false (default)', async () => {
    // Arrange
    config.init({});
    const app = new SupermanApp();
    app.installOpenApiRoutes();
    const server = await startServer(app);

    // Act
    const response = await get(server.port, '/docs');

    // Assert
    expect(response.status).toBe(404);

    await server.close();
  }, 3000);

  it('should serve HTML on /docs when openapi.docs.enabled is true', async () => {
    // Arrange
    config.init({ openapi: { docs: { enabled: true } } });
    const app = new SupermanApp();
    app.installOpenApiRoutes();
    const server = await startServer(app);

    // Act
    const response = await get(server.port, '/docs');

    // Assert
    expect(response.status).toBe(200);
    expect(response.type).toContain('text/html');
    expect(response.body).toContain('@scalar/api-reference');
    expect(response.body).toContain('data-url="/spec"');

    await server.close();
  }, 3000);

  it('should honor a custom docs path', async () => {
    // Arrange
    config.init({ openapi: { docs: { enabled: true, path: '/api-docs' } } });
    const app = new SupermanApp();
    app.installOpenApiRoutes();
    const server = await startServer(app);

    // Act
    const docsOnDefault = await get(server.port, '/docs');
    const docsOnCustom = await get(server.port, '/api-docs');

    // Assert
    expect(docsOnDefault.status).toBe(404);
    expect(docsOnCustom.status).toBe(200);
    expect(docsOnCustom.type).toContain('text/html');

    await server.close();
  }, 3000);

  it('should return 503 plain text in production when exposeInProduction is false', async () => {
    // Arrange
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    config.init({ openapi: { docs: { enabled: true } } });
    const app = new SupermanApp();
    app.installOpenApiRoutes();
    const server = await startServer(app);

    // Act
    const response = await get(server.port, '/docs');

    // Assert
    expect(response.status).toBe(503);
    expect(response.type).toContain('text/plain');
    expect(response.body).toBe('in production docs/ is disabled');

    await server.close();
    process.env.NODE_ENV = prevEnv;
  }, 3000);

  it('should serve the docs UI in production when exposeInProduction is true', async () => {
    // Arrange
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    config.init({ openapi: { docs: { enabled: true, exposeInProduction: true } } });
    const app = new SupermanApp();
    app.installOpenApiRoutes();
    const server = await startServer(app);

    // Act
    const response = await get(server.port, '/docs');

    // Assert
    expect(response.status).toBe(200);
    expect(response.type).toContain('text/html');

    await server.close();
    process.env.NODE_ENV = prevEnv;
  }, 3000);

  it('should let DOCS=true override openapi.docs.enabled=false', async () => {
    // Arrange
    const prevDocs = process.env.DOCS;
    process.env.DOCS = 'true';
    config.init({ openapi: { docs: { enabled: false } } });
    const app = new SupermanApp();
    app.installOpenApiRoutes();
    const server = await startServer(app);

    // Act
    const response = await get(server.port, '/docs');

    // Assert
    expect(response.status).toBe(200);
    expect(response.type).toContain('text/html');

    await server.close();
    process.env.DOCS = prevDocs;
  }, 3000);

  it('should let DOCS=false override openapi.docs.enabled=true', async () => {
    // Arrange
    const prevDocs = process.env.DOCS;
    process.env.DOCS = 'false';
    config.init({ openapi: { docs: { enabled: true } } });
    const app = new SupermanApp();
    app.installOpenApiRoutes();
    const server = await startServer(app);

    // Act
    const response = await get(server.port, '/docs');

    // Assert
    expect(response.status).toBe(404);

    await server.close();
    process.env.DOCS = prevDocs;
  }, 3000);

  it('should invoke a custom template function and return its HTML verbatim', async () => {
    // Arrange
    config.init({
      openapi: {
        docs: {
          enabled: true,
          template: (ctx) => `<h1>${ctx.title}</h1>`,
        },
      },
    });
    const app = new SupermanApp();
    app.installOpenApiRoutes();
    const server = await startServer(app);

    // Act
    const response = await get(server.port, '/docs');

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toMatch(/^<h1>.+<\/h1>$/);
    expect(response.body).not.toContain('@scalar');

    await server.close();
  }, 3000);

  it('should respect the global config.prefix when mounting docs', async () => {
    // Arrange
    config.init({ prefix: '/api', openapi: { docs: { enabled: true } } });
    const app = new SupermanApp();
    app.installOpenApiRoutes();
    const server = await startServer(app);

    // Act
    const onPrefixed = await get(server.port, '/api/docs');
    const onRoot = await get(server.port, '/docs');

    // Assert
    expect(onPrefixed.status).toBe(200);
    expect(onPrefixed.body).toContain('data-url="/api/spec"');
    expect(onRoot.status).toBe(404);

    await server.close();
  }, 3000);
});

