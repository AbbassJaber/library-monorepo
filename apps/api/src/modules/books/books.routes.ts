import {
  API_RESOURCES,
  Book,
  BookListResponse,
  BooksQuery,
  CreateBookBody,
  NewestBooksResponse,
  UpdateBookBody,
  VersionBody,
} from '@library/contracts';
import { z } from 'zod';
import { createModuleRouter } from '../../lib/route.js';
import type { ModuleRouter, RouteGuards } from '../../lib/route.js';
import type { BooksService } from './books.service.js';

const IdParams = z.object({ id: z.coerce.number().int().positive() });
export const booksRoutes = (service: BooksService, guards: RouteGuards): ModuleRouter => {
  const mod = createModuleRouter(API_RESOURCES.books, { guards });
  const tags = ['books'];

  mod.define(
    {
      method: 'get',
      path: '/',
      access: 'user',
      query: BooksQuery,
      response: BookListResponse,
      summary: 'List and search books',
      description:
        'Typo-tolerant q over title/author (pg_trgm), genre slugs (any of), year range, sort newest|title|rating (relevance when q is set and sort is omitted), page/pageSize (max 48). A status other than active is librarian-only.',
      tags,
    },
    async ({ query, actor }) => service.list(actor, query)
  );

  mod.define(
    {
      method: 'get',
      path: '/newest',
      access: 'public',
      response: NewestBooksResponse,
      summary: 'The six newest active books',
      tags,
    },
    async () => service.newest()
  );

  mod.define(
    {
      method: 'get',
      path: '/:id',
      access: 'user',
      params: IdParams,
      response: Book,
      summary: 'Get a book',
      description: 'Archived books are 404 for readers and visible to librarians.',
      tags,
    },
    async ({ params, actor }) => service.get(actor, params.id)
  );

  mod.define(
    {
      method: 'post',
      path: '/',
      access: 'librarian',
      body: CreateBookBody,
      response: Book,
      status: 201,
      summary: 'Create a book',
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
      body: UpdateBookBody,
      response: Book,
      summary: 'Update a book',
      description:
        'Requires the current `version`; a stale version is refused with 409 VERSION_CONFLICT carrying the current book.',
      tags,
    },
    async ({ params, body, actor }) => service.update(actor, params.id, body)
  );

  mod.define(
    {
      method: 'post',
      path: '/:id/archive',
      access: 'librarian',
      params: IdParams,
      body: VersionBody,
      response: Book,
      summary: 'Archive a book',
      tags,
    },
    async ({ params, body, actor }) => service.archive(actor, params.id, body.version)
  );

  mod.define(
    {
      method: 'post',
      path: '/:id/restore',
      access: 'librarian',
      params: IdParams,
      body: VersionBody,
      response: Book,
      summary: 'Restore an archived book',
      tags,
    },
    async ({ params, body, actor }) => service.restore(actor, params.id, body.version)
  );

  return mod;
};
