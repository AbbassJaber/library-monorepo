import { loadDotenv } from '../config/env.js';

export const testDatabaseUrl = (): string => {
  loadDotenv();
  const url = process.env['DATABASE_URL_TEST'];
  if (!url) {
    throw new Error('DATABASE_URL_TEST is not set (see apps/api/.env.example)');
  }
  return url;
};
