import { execFileSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { testDatabaseUrl } from './env.js';

export default async function globalSetup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const databaseName = url.pathname.slice(1);

  const adminUrl = new URL(url.toString());
  adminUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }

  const apiRoot = path.resolve(import.meta.dirname, '..', '..');
  execFileSync(path.join(apiRoot, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
}
