import type { KnnHit, VectorStorePort, VectorUpsert } from '@library/ai';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../lib/prisma.js';

const toVectorLiteral = (vector: number[]): string => `[${vector.join(',')}]`;

export const createVectorStoreAdapter = (prisma: PrismaClient): VectorStorePort => ({
  async upsert(items: VectorUpsert[]) {
    for (const item of items) {
      await prisma.$executeRaw`
        INSERT INTO "book_embeddings" ("bookId", "embedding", "dimensions", "contentHash", "model", "updatedAt")
        VALUES (${item.bookId}, ${toVectorLiteral(item.vector)}::vector, ${item.dimensions}, ${item.contentHash}, ${item.model}, now())
        ON CONFLICT ("bookId") DO UPDATE SET
          "embedding" = EXCLUDED."embedding",
          "dimensions" = EXCLUDED."dimensions",
          "contentHash" = EXCLUDED."contentHash",
          "model" = EXCLUDED."model",
          "updatedAt" = now()`;
    }
  },
  async knn(vector, opts): Promise<KnnHit[]> {
    const literal = toVectorLiteral(vector);
    const rows = await prisma.$queryRaw<Array<{ bookId: number; distance: number }>>`
      SELECT e."bookId", (e."embedding" <=> ${literal}::vector)::float8 AS "distance"
      FROM "book_embeddings" e
      JOIN "books" b ON b."id" = e."bookId"
      WHERE b."archivedAt" IS NULL
        AND e."dimensions" = ${vector.length}
        AND e."model" = ${opts.model}
        ${opts.excludeBookId === undefined ? Prisma.empty : Prisma.sql`AND e."bookId" <> ${opts.excludeBookId}`}
        ${
          opts.genreSlug === undefined
            ? Prisma.empty
            : Prisma.sql`AND EXISTS (SELECT 1 FROM "book_genres" bg JOIN "genres" g ON g."id" = bg."genreId" WHERE bg."bookId" = b."id" AND g."slug" = ${opts.genreSlug})`
        }
      ORDER BY e."embedding" <=> ${literal}::vector, e."bookId"
      LIMIT ${opts.limit}`;
    return rows.map(row => ({ bookId: row.bookId, score: Math.max(0, 1 - row.distance) }));
  },
  async hashes() {
    const rows = await prisma.bookEmbedding.findMany({
      select: { bookId: true, contentHash: true, model: true, dimensions: true },
    });
    return new Map(
      rows.map(row => [
        row.bookId,
        { contentHash: row.contentHash, model: row.model, dimensions: row.dimensions },
      ])
    );
  },
  async vectorOf(bookId) {
    const rows = await prisma.$queryRaw<Array<{ embedding: string }>>`
      SELECT "embedding"::text AS "embedding" FROM "book_embeddings" WHERE "bookId" = ${bookId}`;
    const text = rows[0]?.embedding;
    return text ? (JSON.parse(text) as number[]) : null;
  },
});
