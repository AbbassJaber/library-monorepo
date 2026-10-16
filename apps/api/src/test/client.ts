import { createServer } from 'node:http';
import type { Server } from 'node:http';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { createV1 } from '../modules/v1.js';
import type { ModuleDeps, V1 } from '../modules/v1.js';
import { externalRecord } from '@library/ai/testing';
import type { AuthConfig } from '../modules/auth/auth.service.js';
import { testPrisma } from './db.js';
import { TEST_PASSWORD } from './factories.js';
import { silentLogger } from './logger.js';
import { LOOKUP_SOURCE } from '@library/domain-config';

export const TEST_ORIGIN = 'http://web.test';

export const testAiEnv: ModuleDeps['ai'] = {
  AI_PROVIDER: 'mock',
  EMBEDDING_PROVIDER: 'mock',
  EMBEDDING_DIMENSIONS: 32,
  AI_CONFIRM_SECRET: 'test-confirm-secret-test-confirm-secret',
  LOOKUP_PROVIDER: LOOKUP_SOURCE.fixture,
  OPEN_LIBRARY_BASE_URL: '',
  LOOKUP_TIMEOUT_MS: 1000,
};
export const testLookupFixtures = [externalRecord()];

export const testModuleDeps = (): ModuleDeps => ({
  prisma: testPrisma(),
  logger: silentLogger,
  auth: testAuthConfig,
  cookies: { secure: false, accessTtlSeconds: 900, refreshTtlSeconds: 3600 },
  ai: testAiEnv,
  lookupFixtures: testLookupFixtures,
});

export const createTestV1 = (): V1 => createV1(testModuleDeps());

export const testAuthConfig: AuthConfig = {
  accessSecret: 'test-secret-test-secret-test-secret-32',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 3600,
  bcryptRounds: 4,
};

const servers: Server[] = [];

export const serve = (app: Express): Promise<Server> =>
  new Promise((resolve, reject) => {
    const server = createServer(app);
    servers.push(server);
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });

export const closeTestServers = async (): Promise<void> => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
};

export const createTestApp = (): Promise<Server> =>
  serve(
    createApp({
      ping: async () => {
        await testPrisma().$queryRaw`SELECT 1`;
      },
      logger: silentLogger,
      corsOrigins: [TEST_ORIGIN],
      apis: [createV1(testModuleDeps()).api],
    })
  );

export type TestClient = ReturnType<typeof request.agent>;

export const api = (server?: Server | Promise<Server>) => {
  const ready = server ?? createTestApp();
  return {
    anonymous: async (): Promise<TestClient> => request.agent(await ready),
    as: async (
      user: { email: string },
      options: { via?: 'bearer' | 'cookie' } = {}
    ): Promise<TestClient> => {
      const agent = request.agent(await ready);
      if (options.via === 'cookie') {
        const res = await agent
          .post('/api/v1/auth/login')
          .set('Origin', TEST_ORIGIN)
          .send({ email: user.email, password: TEST_PASSWORD });
        if (res.status !== 200)
          throw new Error(`test login failed: ${res.status} ${JSON.stringify(res.body)}`);
        agent.set('Origin', TEST_ORIGIN);
        return agent;
      }
      const res = await agent
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD });
      if (res.status !== 200)
        throw new Error(`test login failed: ${res.status} ${JSON.stringify(res.body)}`);
      agent.set('Authorization', `Bearer ${res.body.data.accessToken as string}`);
      return agent;
    },
  };
};
