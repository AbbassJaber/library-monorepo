import { API_RESOURCES, FavoritesResponse, SetFavoriteGenresBody } from '@library/contracts';
import { createModuleRouter } from '../../lib/route.js';
import type { ModuleRouter, RouteGuards } from '../../lib/route.js';
import type { FavoritesService } from './favorites.service.js';

export const favoritesRoutes = (service: FavoritesService, guards: RouteGuards): ModuleRouter => {
  const mod = createModuleRouter(API_RESOURCES.favoriteGenres, { guards });
  const tags = ['favourite genres'];

  mod.define(
    {
      method: 'get',
      path: '/',
      access: 'user',
      response: FavoritesResponse,
      summary: 'My favourite genres, in order',
      tags,
    },
    async ({ actor }) => service.list(actor)
  );

  mod.define(
    {
      method: 'put',
      path: '/',
      access: 'user',
      body: SetFavoriteGenresBody,
      response: FavoritesResponse,
      summary: 'Replace my favourite genres',
      description:
        'Ordered list of 0–5 active genre ids; position is the index. Dropped genres are soft-removed and reactivated if chosen again.',
      tags,
    },
    async ({ body, actor }) => service.set(actor, body.genreIds)
  );

  return mod;
};
