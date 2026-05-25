import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { FastifyMiddleware } from '../middlewares/typed-handler';

export type RegisterFn = (fastify: FastifyInstance) => Promise<void> | void;

export interface ModuleOptions {
  /** Display name for startup banner logs */
  name?: string;
  /** Called on graceful shutdown. Clean up intervals, connections, etc. */
  destroy?: () => Promise<void> | void;
  /** Fastify middlewares applied to all routes in this module. */
  middlewares?: ReadonlyArray<FastifyMiddleware>;
}

export class SupermanModule {
  public readonly name: string;
  private readonly registerFn: RegisterFn;
  private readonly destroyFn?: () => Promise<void> | void;
  private readonly middlewares: ReadonlyArray<FastifyMiddleware>;

  constructor(register: RegisterFn, options?: ModuleOptions) {
    this.registerFn = register;
    this.name = options?.name ?? 'SupermanModule';
    this.destroyFn = options?.destroy;
    this.middlewares = options?.middlewares ?? [];
  }

  get plugin(): FastifyPluginAsync {
    return async (fastify: FastifyInstance) => {
      if (this.middlewares.length > 0) {
        fastify.addHook('preHandler', async (request, reply) => {
          for (const mw of this.middlewares) {
            const result = mw(request, reply);
            if (result instanceof Promise) {
              await result;
            }
            if (reply.sent) return reply;
          }
        });
      }
      await this.registerFn(fastify);
    };
  }

  /** Called on graceful shutdown. */
  async destroy(): Promise<void> {
    if (this.destroyFn) await this.destroyFn();
  }
}

