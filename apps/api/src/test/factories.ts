import bcrypt from 'bcryptjs';
import { Role, ReadingState } from '@library/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { testPrisma } from './db.js';

let counter = 0;
const next = () => ++counter;

export const TEST_PASSWORD = 'Password123!';
const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);

export const createUser = async (
  overrides: { role?: Role; email?: string; displayName?: string } = {}
) =>
  testPrisma().user.create({
    data: {
      email: overrides.email ?? `user${next()}@test.local`,
      passwordHash,
      displayName: overrides.displayName ?? 'Test User',
      role: overrides.role ?? Role.enum.READER,
    },
  });

export const createReader = () => createUser({ role: Role.enum.READER });
export const createLibrarian = () => createUser({ role: Role.enum.LIBRARIAN });

export const createGenre = async (
  overrides: { name?: string; slug?: string; archivedAt?: Date | null } = {}
) => {
  const n = next();
  const name = overrides.name ?? `Genre ${n}`;
  return testPrisma().genre.create({
    data: {
      name,
      slug: overrides.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      archivedAt: overrides.archivedAt ?? null,
    },
  });
};

export const createBook = async (
  overrides: {
    title?: string;
    author?: string;
    publishedYear?: number;
    synopsis?: string;
    isbn?: string | null;
    language?: string | null;
    rating?: number;
    genreIds?: number[];
    archivedAt?: Date | null;
    createdAt?: Date;
    version?: number;
  } = {}
) => {
  const n = next();
  const genreIds = overrides.genreIds ?? [(await createGenre()).id];
  return testPrisma().book.create({
    data: {
      title: overrides.title ?? `Book ${n}`,
      author: overrides.author ?? `Author ${n}`,
      publishedYear: overrides.publishedYear ?? 2000,
      synopsis: overrides.synopsis ?? `Synopsis of book ${n}.`,
      isbn: overrides.isbn ?? null,
      language: overrides.language ?? null,
      rating: new Prisma.Decimal(overrides.rating ?? 4),
      archivedAt: overrides.archivedAt ?? null,
      ...(overrides.createdAt !== undefined ? { createdAt: overrides.createdAt } : {}),
      ...(overrides.version !== undefined ? { version: overrides.version } : {}),
      genres: { create: genreIds.map(genreId => ({ genreId })) },
    },
  });
};

export const createEntry = async (
  userId: number,
  bookId: number,
  state: 'WANT_TO_READ' | 'READING' | 'FINISHED' = ReadingState.enum.WANT_TO_READ
) => testPrisma().readingListEntry.create({ data: { userId, bookId, state } });
