import { API_RESOURCES, ForYourShelvesResponse } from '@library/contracts';
import { createModuleRouter } from '../../lib/route.js';
import type { ModuleRouter, RouteGuards } from '../../lib/route.js';
import type { RecommendationsService } from './recommendations.service.js';

export const recommendationsRoutes = (
  service: RecommendationsService,
  guards: RouteGuards
): ModuleRouter => {
  const mod = createModuleRouter(API_RESOURCES.recommendations, { guards });

  mod.define(
    {
      method: 'get',
      path: '/',
      access: 'user',
      response: ForYourShelvesResponse,
      summary: '"For your shelves"',
      description:
        'Up to six active books from your favourite genres that are not on your reading list.',
      tags: ['recommendations'],
    },
    async ({ actor }) => service.forYourShelves(actor)
  );

  return mod;
};
