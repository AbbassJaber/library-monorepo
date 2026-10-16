import { SERVICE_PATHS } from '@library/contracts';
import { z } from 'zod';
import type { Readiness } from '../../ai/readiness.js';
import { notReady, unavailable } from '../../lib/errors.js';
import { createModuleRouter } from '../../lib/route.js';
import type { ModuleRouter } from '../../lib/route.js';

const HealthResponse = z.object({ status: z.literal('ok'), service: z.string(), time: z.string() });
const ReadyResponse = z.object({
  status: z.literal('ready'),
  database: z.literal('up'),
  embeddings: z.enum(['current', 'not-checked']),
});

export const healthRoutes = (
  ping: () => Promise<void>,
  readiness?: () => Promise<Readiness>
): ModuleRouter => {
  const mod = createModuleRouter('', { publicOnly: true });

  mod.define(
    {
      method: 'get',
      path: SERVICE_PATHS.health,
      access: 'public',
      response: HealthResponse,
      summary: 'Liveness',
      tags: ['health'],
    },
    async () => ({ status: 'ok', service: 'library-api', time: new Date().toISOString() })
  );

  mod.define(
    {
      method: 'get',
      path: SERVICE_PATHS.ready,
      access: 'public',
      response: ReadyResponse,
      summary: 'Readiness (database ping, embeddings current)',
      tags: ['health'],
    },
    async () => {
      try {
        await ping();
      } catch (error) {
        throw unavailable(
          `Database unreachable: ${error instanceof Error ? error.message : 'unknown'}`
        );
      }
      if (!readiness) return { status: 'ready', database: 'up', embeddings: 'not-checked' };
      const state = await readiness();
      if (!state.ready) {
        const { ready: _ready, ...details } = state;
        throw notReady(
          `Embeddings pending: ${state.missing} active book(s) without a ${state.model} vector`,
          details
        );
      }
      return { status: 'ready', database: 'up', embeddings: 'current' };
    }
  );

  return mod;
};
