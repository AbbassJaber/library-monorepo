import { AUDIT_ACTIONS, AuditEntityType } from '@library/contracts';
import type { FavoriteGenre } from '@library/contracts';
import { writeAudit } from '../../lib/audit.js';
import { validationError } from '../../lib/errors.js';
import type { PrismaClient } from '../../lib/prisma.js';
import type { Actor } from '../../lib/route.js';

const genreSelect = { id: true, name: true, slug: true, archivedAt: true } as const;

export const createFavoritesService = (prisma: PrismaClient) => {
  const list = async (actor: Actor): Promise<FavoriteGenre[]> => {
    const rows = await prisma.favoriteGenre.findMany({
      where: { userId: actor.id, removedAt: null, genre: { archivedAt: null } },
      include: { genre: { select: genreSelect } },
      orderBy: { position: 'asc' },
    });
    return rows.map(row => ({
      genre: { id: row.genre.id, name: row.genre.name, slug: row.genre.slug },
      position: row.position,
    }));
  };

  return {
    list,

    async set(actor: Actor, genreIds: number[]): Promise<FavoriteGenre[]> {
      const active = await prisma.genre.findMany({
        where: { id: { in: genreIds }, archivedAt: null },
        select: { id: true },
      });
      const found = new Set(active.map(genre => genre.id));
      const missing = genreIds.filter(id => !found.has(id));
      if (missing.length > 0) {
        throw validationError('Unknown or archived genre ids', {
          issues: missing.map(id => ({
            path: 'body.genreIds',
            message: `genre ${id} is unknown or archived`,
          })),
        });
      }

      await prisma.$transaction(async tx => {
        const existing = await tx.favoriteGenre.findMany({ where: { userId: actor.id } });
        const byGenre = new Map(existing.map(row => [row.genreId, row]));
        const submitted = new Set(genreIds);

        for (const [position, genreId] of genreIds.entries()) {
          const row = byGenre.get(genreId);
          if (row) {
            await tx.favoriteGenre.update({
              where: { id: row.id },
              data: { position, removedAt: null },
            });
          } else {
            await tx.favoriteGenre.create({ data: { userId: actor.id, genreId, position } });
          }
        }
        for (const row of existing) {
          if (!submitted.has(row.genreId) && row.removedAt === null) {
            await tx.favoriteGenre.update({
              where: { id: row.id },
              data: { removedAt: new Date() },
            });
          }
        }
        await writeAudit(tx, {
          action: AUDIT_ACTIONS.favoritesSet,
          entityType: AuditEntityType.enum.favorite_genre,
          entityId: actor.id,
          before: {
            genreIds: existing
              .filter(row => row.removedAt === null)
              .sort((a, b) => a.position - b.position)
              .map(row => row.genreId),
          },
          after: { genreIds },
        });
      });
      return list(actor);
    },
  };
};

export type FavoritesService = ReturnType<typeof createFavoritesService>;
