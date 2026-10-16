import type { ForYourShelvesItem } from '@library/contracts';
import { FAVORITE_GENRES_MAX, FOR_YOUR_SHELVES_MAX } from '@library/contracts';
import type { PrismaClient } from '../../lib/prisma.js';
import type { Actor } from '../../lib/route.js';
import { bookInclude, toBookSummary } from '../books/books.mapper.js';
import type { FavoritesService } from '../favorites/favorites.service.js';

export const createRecommendationsService = (
  prisma: PrismaClient,
  favorites: FavoritesService
) => ({
  async forYourShelves(actor: Actor): Promise<ForYourShelvesItem[]> {
    const faves = await favorites.list(actor);
    if (faves.length === 0) return [];
    const weight = new Map(faves.map(f => [f.genre.id, FAVORITE_GENRES_MAX - f.position]));

    const candidates = await prisma.book.findMany({
      where: {
        archivedAt: null,
        genres: { some: { genreId: { in: [...weight.keys()] } } },
        readingListEntries: { none: { userId: actor.id, removedAt: null } },
      },
      include: bookInclude,
    });

    const ranked = candidates
      .map(row => {
        const matched = faves.filter(f => row.genres.some(link => link.genreId === f.genre.id));
        const score = matched.reduce((sum, f) => sum + (weight.get(f.genre.id) ?? 0), 0);
        return { row, matched, score };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.row.rating.toNumber() - a.row.rating.toNumber() ||
          a.row.id - b.row.id
      )
      .slice(0, FOR_YOUR_SHELVES_MAX);

    return ranked.map(({ row, matched }) => ({
      book: toBookSummary(row),
      matchedGenres: matched.map(f => f.genre),
    }));
  },
});

export type RecommendationsService = ReturnType<typeof createRecommendationsService>;
