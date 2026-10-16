import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = 'prisma/migrations';
const local = readdirSync(MIGRATIONS_DIR).filter(name =>
  statSync(join(MIGRATIONS_DIR, name)).isDirectory()
);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const table = await client.query("SELECT to_regclass('_prisma_migrations') AS name");
  if (table.rows[0].name === null) {
    process.exitCode = 1;
  } else {
    const { rows } = await client.query(
      'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'
    );
    const applied = new Set(rows.map(row => row.migration_name));
    process.exitCode = local.every(name => applied.has(name)) ? 0 : 1;
  }
} finally {
  await client.end();
}
