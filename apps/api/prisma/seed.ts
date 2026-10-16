import { existsSync } from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { AUDIT_ACTIONS, ReadingState, Role } from '@library/contracts';
import { DEMO_ACCOUNTS, seedBooks, seedGenres } from '@library/domain-config/seed';
import { createPrismaClient } from '../src/lib/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { SEED_MODE } from '../src/config/constants.js';
import type { SeedMode } from '../src/config/constants.js';

if (!process.env['DATABASE_URL']) {
  for (const candidate of ['..', '../..']) {
    const envFile = path.join(import.meta.dirname, candidate, '.env');
    if (existsSync(envFile)) {
      process.loadEnvFile(envFile);
      break;
    }
  }
}

export interface SeedSummary {
  skipped: boolean;
  genres: number;
  books: number;
  bookGenres: number;
  users: number;
  readingListEntries: number;
  favoriteGenres: number;
  auditLogs: number;
}

const CATALOG_EPOCH = Date.UTC(2026, 0, 1, 9, 0, 0);
const CATALOG_STEP_MS = 7 * 60 * 1000;

const TABLES = [
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
] as const;

const parseMode = (value: string | undefined): SeedMode => {
  if (value === undefined) return SEED_MODE.always;
  const mode = Object.values(SEED_MODE).find(known => known === value);
  if (mode) return mode;
  throw new Error(`Unknown seed mode "${value}" (expected always | if-empty | never)`);
};

export const runSeed = async (
  connectionString: string,
  mode: SeedMode,
  options: { bcryptRounds?: number } = {}
): Promise<SeedSummary> => {
  const prisma = createPrismaClient(connectionString);
  const rounds = options.bcryptRounds ?? Number(process.env['BCRYPT_ROUNDS'] ?? 12);
  try {
    if (mode === SEED_MODE.never) return await summarize(prisma, true);
    if (mode === SEED_MODE.ifEmpty && (await prisma.book.count()) > 0)
      return await summarize(prisma, true);

    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${TABLES.map(table => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`
    );

    const genreIdBySlug = new Map<string, number>();
    await prisma.genre.createMany({
      data: seedGenres.map((genre, index) => {
        genreIdBySlug.set(genre.slug, index + 1);
        return { id: index + 1, name: genre.name, slug: genre.slug };
      }),
    });

    await prisma.book.createMany({
      data: seedBooks.map((book, index) => {
        const addedAt = new Date(CATALOG_EPOCH + index * CATALOG_STEP_MS);
        return {
          id: index + 1,
          title: book.title,
          author: book.author,
          publishedYear: book.year,
          synopsis: book.synopsis,
          isbn: book.isbn ?? null,
          language: book.language,
          rating: new Prisma.Decimal(book.rating),
          createdAt: addedAt,
          updatedAt: addedAt,
        };
      }),
    });

    await prisma.bookGenre.createMany({
      data: seedBooks.flatMap((book, index) =>
        book.genres.map(slug => {
          const genreId = genreIdBySlug.get(slug);
          if (genreId === undefined) throw new Error(`Unknown genre slug in seed: ${slug}`);
          return { bookId: index + 1, genreId };
        })
      ),
    });

    const passwordHash = await bcrypt.hash(DEMO_ACCOUNTS.password, rounds);
    await prisma.user.createMany({
      data: [
        {
          id: 1,
          email: DEMO_ACCOUNTS.reader.email,
          passwordHash,
          displayName: DEMO_ACCOUNTS.reader.displayName,
          role: Role.enum.READER,
        },
        {
          id: 2,
          email: DEMO_ACCOUNTS.librarian.email,
          passwordHash,
          displayName: DEMO_ACCOUNTS.librarian.displayName,
          role: Role.enum.LIBRARIAN,
        },
      ],
    });

    const demoShelf: Array<{ title: string; state: 'WANT_TO_READ' | 'READING' | 'FINISHED' }> = [
      { title: 'Dune', state: ReadingState.enum.FINISHED },
      { title: 'The Left Hand of Darkness', state: ReadingState.enum.READING },
      { title: 'The Name of the Wind', state: ReadingState.enum.WANT_TO_READ },
      { title: 'موسم الهجرة إلى الشمال', state: ReadingState.enum.FINISHED },
    ];
    const bookIdByTitle = new Map(seedBooks.map((book, index) => [book.title, index + 1]));
    await prisma.readingListEntry.createMany({
      data: demoShelf.map((entry, index) => {
        const bookId = bookIdByTitle.get(entry.title);
        if (bookId === undefined) throw new Error(`Demo shelf title not in seed: ${entry.title}`);
        return { id: index + 1, userId: 1, bookId, state: entry.state };
      }),
    });

    const demoFavorites = ['science-fiction', 'fantasy', 'literary-fiction'];
    await prisma.favoriteGenre.createMany({
      data: demoFavorites.map((slug, position) => {
        const genreId = genreIdBySlug.get(slug);
        if (genreId === undefined) throw new Error(`Demo favourite not in seed: ${slug}`);
        return { id: position + 1, userId: 1, genreId, position };
      }),
    });

    await prisma.auditLog.create({
      data: {
        id: 1,
        action: AUDIT_ACTIONS.seedRun,
        entityType: 'user',
        entityId: 2,
        source: 'SEED',
        after: { books: seedBooks.length, genres: seedGenres.length, users: 2 },
      },
    });

    for (const table of [
      'genres',
      'books',
      'users',
      'reading_list_entries',
      'favorite_genres',
      'audit_logs',
    ]) {
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1, false)`
      );
    }

    return await summarize(prisma, false);
  } finally {
    await prisma.$disconnect();
  }
};

const summarize = async (
  prisma: ReturnType<typeof createPrismaClient>,
  skipped: boolean
): Promise<SeedSummary> => ({
  skipped,
  genres: await prisma.genre.count(),
  books: await prisma.book.count(),
  bookGenres: await prisma.bookGenre.count(),
  users: await prisma.user.count(),
  readingListEntries: await prisma.readingListEntry.count(),
  favoriteGenres: await prisma.favoriteGenre.count(),
  auditLogs: await prisma.auditLog.count(),
});

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.filename === path.resolve(process.argv[1]);

if (isEntrypoint) {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  const mode = parseMode(process.argv[2]);
  runSeed(connectionString, mode)
    .then(summary => {
      console.log(JSON.stringify({ seed: mode, ...summary }));
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
