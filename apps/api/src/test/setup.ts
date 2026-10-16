import { afterAll, beforeEach } from 'vitest';
import { closeTestServers } from './client.js';
import { disconnectTestDb, truncateAll } from './db.js';

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestServers();
  await truncateAll();
  await disconnectTestDb();
});
