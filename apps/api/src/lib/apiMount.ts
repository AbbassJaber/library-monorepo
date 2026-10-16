import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import type { ModuleRouter } from './route.js';

export interface ApiMount {
  prefix: string;
  router: ExpressRouter;
  modules: ModuleRouter[];
}

export const mountApi = (prefix: string, modules: ModuleRouter[]): ApiMount => {
  const router = Router();
  for (const mod of modules) router.use(mod.prefix, mod.router);
  return { prefix, router, modules };
};
