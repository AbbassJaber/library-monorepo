import {
  API_RESOURCES,
  CreateGenreBody,
  Genre,
  GenreListQuery,
  GenreListResponse,
  UpdateGenreBody,
} from '@library/contracts';
import { z } from 'zod';
import { createModuleRouter } from '../../lib/route.js';
import type { ModuleRouter, RouteGuards } from '../../lib/route.js';
import type { GenresService } from './genres.service.js';

const IdParams = z.object({ id: z.coerce.number().int().positive() });
export const genresRoutes = (service: GenresService, guards: RouteGuards): ModuleRouter => {
  const mod = createModuleRouter(API_RESOURCES.genres, { guards });
  const tags = ['genres'];

  mod.define(
    {
      method: 'get',
      path: '/',
      access: 'user',
      query: GenreListQuery,
      response: GenreListResponse,
      summary: 'List genres',
      tags,
    },
    async ({ query, actor }) => service.list(actor, { includeArchived: query.includeArchived })
  );

  mod.define(
    {
      method: 'post',
      path: '/',
      access: 'librarian',
      body: CreateGenreBody,
      response: Genre,
      status: 201,
      summary: 'Create a genre',
      tags,
    },
    async ({ body, actor }) => service.create(actor, body)
  );

  mod.define(
    {
      method: 'patch',
      path: '/:id',
      access: 'librarian',
      params: IdParams,
      body: UpdateGenreBody,
      response: Genre,
      summary: 'Rename a genre',
      tags,
    },
    async ({ params, body, actor }) => service.rename(actor, params.id, body)
  );

  mod.define(
    {
      method: 'post',
      path: '/:id/archive',
      access: 'librarian',
      params: IdParams,
      response: Genre,
      summary: 'Archive a genre',
      description:
        'Refused with 409 GENRE_IN_USE while it is the only active genre of any active book.',
      tags,
    },
    async ({ params, actor }) => service.archive(actor, params.id)
  );

  mod.define(
    {
      method: 'post',
      path: '/:id/restore',
      access: 'librarian',
      params: IdParams,
      response: Genre,
      summary: 'Restore an archived genre',
      tags,
    },
    async ({ params, actor }) => service.restore(actor, params.id)
  );

  return mod;
};
