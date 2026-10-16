import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

const envFile = path.join(import.meta.dirname, '.env');
if (!process.env['DATABASE_URL'] && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const generating = process.argv.includes('generate');
const GENERATE_PLACEHOLDER_URL = 'postgresql://generate:generate@localhost:5432/generate';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node dist/prisma/seed.js',
  },
  datasource: {
    url:
      generating && !process.env['DATABASE_URL'] ? GENERATE_PLACEHOLDER_URL : env('DATABASE_URL'),
    ...(process.env['SHADOW_DATABASE_URL']
      ? { shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'] }
      : {}),
  },
});
