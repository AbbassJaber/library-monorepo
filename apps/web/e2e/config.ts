import { DEMO_ACCOUNTS } from '@library/domain-config/seed';

export const E2E_BASE_URL = process.env['E2E_BASE_URL'] ?? 'http://localhost:8080';
export const E2E_API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:4000';

const password = process.env['E2E_PASSWORD'] ?? DEMO_ACCOUNTS.password;
export const DEMO = {
  reader: { email: process.env['E2E_READER_EMAIL'] ?? DEMO_ACCOUNTS.reader.email, password },
  librarian: {
    email: process.env['E2E_LIBRARIAN_EMAIL'] ?? DEMO_ACCOUNTS.librarian.email,
    password,
  },
};
