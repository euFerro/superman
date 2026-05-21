import { Router } from 'express';
import type { RequestHandler } from 'express';

export type RegisterFn = (router: Router) => Promise<void> | void;

export interface ModuleOptions {
  /** Display name for startup banner logs */
  name?: string;
  /** Called on graceful shutdown. Clean up intervals, connections, etc. */
  destroy?: () => Promise<void> | void;
  /** Express middlewares applied to all routes in this module. */
  middlewares?: ReadonlyArray<RequestHandler>;
}

export class SupermanModule {
  public readonly router: Router = Router();
  public readonly name: string;
  private readonly registerFn: RegisterFn;
  private readonly destroyFn?: () => Promise<void> | void;
  private readonly middlewares: ReadonlyArray<RequestHandler>;

  constructor(register: RegisterFn, options?: ModuleOptions) {
    this.registerFn = register;
    this.name = options?.name ?? 'SupermanModule';
    this.destroyFn = options?.destroy;
    this.middlewares = options?.middlewares ?? [];
  }

  /** Called by SupermanExpressApp during startup. */
  async register(): Promise<void> {
    this.middlewares.forEach((mw) => this.router.use(mw));
    await this.registerFn(this.router);
  }

  /** Called on graceful shutdown. */
  async destroy(): Promise<void> {
    if (this.destroyFn) await this.destroyFn();
  }
}

