import type { ExpansionStorePort } from '@library/ai';
import type { PrismaClient } from '../../lib/prisma.js';

export const createExpansionAdapter = (prisma: PrismaClient): ExpansionStorePort => ({
  async all() {
    const rows = await prisma.bookExpansion.findMany();
    return new Map(
      rows.map(row => [
        row.bookId,
        { sourceHash: row.sourceHash, model: row.model, fr: row.fr, ar: row.ar },
      ])
    );
  },
  async upsert(bookId, expansion) {
    await prisma.bookExpansion.upsert({
      where: { bookId },
      create: { bookId, ...expansion },
      update: expansion,
    });
  },
});
