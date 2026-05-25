import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { requestInterceptorMiddleware } from './request-interceptor.middleware';
import { logger } from '../logger/superman-logger';
import { config } from '../config/superman-config';
import { resetLogRuntime } from '../logger/log-runtime';
import { EventType } from '../logger/superman-logger.types';

const hub = logger.child('HTTP');

describe('requestInterceptorMiddleware', () => {
  let fastify: FastifyInstance;
  let requestSpy: jest.SpyInstance;
  let responseSpy: jest.SpyInstance;
  let auditSpy: jest.SpyInstance;
  let securitySpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    config.reset();
    resetLogRuntime();

    const emitter = hub.events;
    requestSpy = jest.spyOn(emitter.constructor.prototype, 'request').mockImplementation(() => {});
    responseSpy = jest.spyOn(emitter.constructor.prototype, 'response').mockImplementation(() => {});
    auditSpy = jest.spyOn(emitter.constructor.prototype, 'audit').mockImplementation(() => {});
    securitySpy = jest.spyOn(emitter.constructor.prototype, 'security').mockImplementation(() => {});

    fastify = Fastify();
    await fastify.register(requestInterceptorMiddleware);
    
    fastify.get('/test', async () => ({ data: { id: 7 } }));
    fastify.post('/api/users', async (req, reply) => reply.status(201).send({ created: true }));
    fastify.get('/api/users', async (req, reply) => reply.status(401).send({ error: 'unauthorized' }));
    fastify.post('/api/login', async (req, reply) => reply.status(429).send({ error: 'rate limit' }));
    fastify.get('/binary', async (req, reply) => reply.send(Buffer.from('pdfdata')));
    fastify.get('/plain', async (req, reply) => reply.send('plain text'));
  });

  afterEach(async () => {
    await fastify.close();
    requestSpy.mockRestore();
    responseSpy.mockRestore();
    auditSpy.mockRestore();
    securitySpy.mockRestore();
  });

  it('should set X-Request-Id header with a generated UUID', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/test' });
    expect(res.headers['x-request-id']).toBeDefined();
    expect(typeof res.headers['x-request-id']).toBe('string');
  }, 1000);

  it('should honour an inbound X-Request-Id header', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/test', headers: { 'x-request-id': 'client-abc' } });
    expect(res.headers['x-request-id']).toBe('client-abc');
  }, 1000);

  it('should emit REQUEST', async () => {
    await fastify.inject({ method: 'GET', url: '/test' });
    expect(requestSpy).toHaveBeenCalledTimes(1);
  }, 1000);

  it('should emit RESPONSE', async () => {
    await fastify.inject({ method: 'GET', url: '/test' });
    expect(responseSpy).toHaveBeenCalledTimes(1);
  }, 1000);

  it('should emit AUDIT on POST with 2xx status', async () => {
    await fastify.inject({ method: 'POST', url: '/api/users' });
    expect(auditSpy).toHaveBeenCalledTimes(1);
  }, 1000);

  it('should NOT emit AUDIT on GET requests', async () => {
    await fastify.inject({ method: 'GET', url: '/test' });
    expect(auditSpy).not.toHaveBeenCalled();
  }, 1000);

  it('should emit SECURITY on 401 response', async () => {
    await fastify.inject({ method: 'GET', url: '/api/users' });
    expect(securitySpy).toHaveBeenCalledTimes(1);
  }, 1000);

  it('should emit SECURITY on 429 response', async () => {
    await fastify.inject({ method: 'POST', url: '/api/login' });
    expect(securitySpy).toHaveBeenCalledTimes(1);
  }, 1000);

  it('should NOT emit SECURITY on a plain 200 response', async () => {
    await fastify.inject({ method: 'GET', url: '/test' });
    expect(securitySpy).not.toHaveBeenCalled();
  }, 1000);

  it('should capture response body when handler sends JSON', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/test' });
    expect(res.json()).toEqual({ data: { id: 7 } });
  }, 1000);

  it('should mark response body as <binary> for Buffer payloads via res.send', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/binary' });
    expect(res.body).toEqual(Buffer.from('pdfdata').toString());
  }, 1000);

  it('should keep non-JSON strings passed to res.send as raw string', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/plain' });
    expect(res.body).toBe('plain text');
  }, 1000);
});
