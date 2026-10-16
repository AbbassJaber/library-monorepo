import { createPrismaClient } from '../lib/prisma.js';
import type { PrismaClient } from '../lib/prisma.js';
import { testDatabaseUrl } from './env.js';

let client: PrismaClient | undefined;

export const testPrisma = (): PrismaClient => {
  client ??= createPrismaClient(testDatabaseUrl());
  return client;
};

const TABLES = [
  'pending_actions',
  'audit_logs',
  'ai_runs',
  'book_embeddings',
  'reading_list_entries',
  'favorite_genres',
  'refresh_tokens',
  'book_genres',
  'books',
  'genres',
  'users',
];

export const truncateAll = async (): Promise<void> => {
  await testPrisma().$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`
  );
};

export const disconnectTestDb = async (): Promise<void> => {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
};
