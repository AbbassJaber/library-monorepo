import {
  API_RESOURCES,
  AddToShelfBody,
  ReadingListBatchBody,
  ReadingListBatchResponse,
  ReadingListEntry,
  ShelfResponse,
  UpdateReadingStateBody,
} from '@library/contracts';
import { z } from 'zod';
import { createModuleRouter } from '../../lib/route.js';
import type { ModuleRouter, RouteGuards } from '../../lib/route.js';
import type { ShelfService } from './shelf.service.js';

const BookIdParams = z.object({ bookId: z.coerce.number().int().positive() });
export const shelfRoutes = (service: ShelfService, guards: RouteGuards): ModuleRouter => {
  const mod = createModuleRouter(API_RESOURCES.readingList, { guards });
  const tags = ['reading list'];

  mod.define(
    {
      method: 'get',
      path: '/',
      access: 'user',
      response: ShelfResponse,
      summary: 'My reading list',
      description: 'Archived books appear with available=false: state locked, removal allowed.',
      tags,
    },
    async ({ actor }) => service.list(actor)
  );

  mod.define(
    {
      method: 'post',
      path: '/',
      access: 'user',
      body: AddToShelfBody,
      response: ReadingListEntry,
      status: 201,
      summary: 'Add a book to my reading list',
      description: 'Idempotent; re-adding a removed book reactivates its entry.',
      tags,
    },
    async ({ body, actor }) => service.add(actor, body)
  );

  mod.define(
    {
      method: 'post',
      path: '/batch',
      access: 'user',
      body: ReadingListBatchBody,
      response: ReadingListBatchResponse,
      summary: 'Remove or re-state several books on my reading list at once',
      description:
        'At most 10 changes, each book once, only books already on the list (adding is one book at a time). All or nothing: 404 if one book is not on the list, 409 BOOK_ARCHIVED for a state change on an archived book, and then nothing changes.',
      tags,
    },
    async ({ body, actor }) => service.applyBatch(actor, body.changes)
  );

  mod.define(
    {
      method: 'patch',
      path: '/:bookId',
      access: 'user',
      params: BookIdParams,
      body: UpdateReadingStateBody,
      response: ReadingListEntry,
      summary: 'Change the reading state',
      description: '409 BOOK_ARCHIVED when the book has been archived.',
      tags,
    },
    async ({ params, body, actor }) => service.updateState(actor, params.bookId, body.state)
  );

  mod.define(
    {
      method: 'delete',
      path: '/:bookId',
      access: 'user',
      params: BookIdParams,
      response: z.object({ removed: z.literal(true) }),
      summary: 'Remove a book from my reading list',
      tags,
    },
    async ({ params, actor }) => {
      await service.remove(actor, params.bookId);
      return { removed: true };
    }
  );

  return mod;
};
