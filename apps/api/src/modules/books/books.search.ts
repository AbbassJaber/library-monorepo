import { BookStatus, BookSort, type BooksQuery } from '@library/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../lib/prisma.js';

export const WORD_SIMILARITY_THRESHOLD = 0.45;

const sql = Prisma.sql;
const join = Prisma.join;
const empty = Prisma.empty;

const statusCondition = (status: BooksQuery['status']): Prisma.Sql => {
  if (status === BookStatus.enum.active) return sql`b."archivedAt" IS NULL`;
  if (status === BookStatus.enum.archived) return sql`b."archivedAt" IS NOT NULL`;
  return sql`TRUE`;
};

const genreCondition = (slugs: string[] | undefined): Prisma.Sql =>
  slugs === undefined || slugs.length === 0
    ? empty
    : sql`AND EXISTS (
        SELECT 1 FROM book_genres bg
        JOIN genres g ON g.id = bg."genreId"
        WHERE bg."bookId" = b.id AND g."archivedAt" IS NULL AND g.slug IN (${join(slugs)})
      )`;

const yearCondition = (query: BooksQuery): Prisma.Sql =>
  sql`${query.yearFrom === undefined ? empty : sql`AND b."publishedYear" >= ${query.yearFrom}`}
      ${query.yearTo === undefined ? empty : sql`AND b."publishedYear" <= ${query.yearTo}`}`;

const languageCondition = (languages: string[] | undefined): Prisma.Sql =>
  languages === undefined || languages.length === 0
    ? empty
    : sql`AND b."language" IN (${join(languages)})`;

const matchesCte = (q: string): Prisma.Sql => sql`
  WITH matches AS MATERIALIZED (
    SELECT m.id, GREATEST(word_similarity(${q}, m.title), word_similarity(${q}, m.author)) AS score
    FROM books m
    WHERE m.title ILIKE ${`%${q}%`} OR m.author ILIKE ${`%${q}%`}
       OR ${q} <% m.title OR ${q} <% m.author
  )`;

const fromClause = (q: string | undefined): Prisma.Sql =>
  q === undefined ? sql`FROM books b` : sql`FROM books b JOIN matches ON matches.id = b.id`;

const RELEVANCE = 'relevance';
type SearchOrder = BookSort | typeof RELEVANCE;

const orderBy = (query: BooksQuery): Prisma.Sql => {
  const sort: SearchOrder =
    query.sort ?? (query.q === undefined ? BookSort.enum.newest : RELEVANCE);
  switch (sort) {
    case BookSort.enum.title:
      return sql`ORDER BY b.title ASC, b.id ASC`;
    case BookSort.enum.rating:
      return sql`ORDER BY b.rating DESC, b."createdAt" DESC, b.id DESC`;
    case RELEVANCE:
      return sql`ORDER BY matches.score DESC, b."createdAt" DESC, b.id DESC`;
    default:
      return sql`ORDER BY b."createdAt" DESC, b.id DESC`;
  }
};

export const buildSearchSql = (query: BooksQuery): Prisma.Sql => sql`
  ${query.q === undefined ? empty : matchesCte(query.q)}
  SELECT b.id, count(*) OVER() AS total
  ${fromClause(query.q)}
  WHERE ${statusCondition(query.status)}
  ${genreCondition(query.genre)}
  ${yearCondition(query)}
  ${languageCondition(query.language)}
  ${orderBy(query)}
  LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;

const buildCountSql = (query: BooksQuery): Prisma.Sql => sql`
  ${query.q === undefined ? empty : matchesCte(query.q)}
  SELECT count(*)::int AS total
  ${fromClause(query.q)}
  WHERE ${statusCondition(query.status)}
  ${genreCondition(query.genre)}
  ${yearCondition(query)}
  ${languageCondition(query.language)}`;

export interface SearchPage {
  ids: number[];
  total: number;
}

export const applySearchSettings = async (
  tx: { $executeRawUnsafe: (sql: string) => Promise<unknown> },
  query: Pick<BooksQuery, 'q'>
): Promise<void> => {
  await tx.$executeRawUnsafe(
    `SET LOCAL pg_trgm.word_similarity_threshold = ${WORD_SIMILARITY_THRESHOLD}`
  );
  if (query.q !== undefined) await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
};

export const searchBookIds = async (prisma: PrismaClient, query: BooksQuery): Promise<SearchPage> =>
  prisma.$transaction(async tx => {
    await applySearchSettings(tx, query);
    const rows = await tx.$queryRaw<Array<{ id: number; total: bigint | number }>>(
      buildSearchSql(query)
    );
    if (rows.length > 0)
      return { ids: rows.map(row => row.id), total: Number(rows[0]?.total ?? 0) };
    const counted = await tx.$queryRaw<Array<{ total: number }>>(buildCountSql(query));
    return { ids: [], total: counted[0]?.total ?? 0 };
  });
