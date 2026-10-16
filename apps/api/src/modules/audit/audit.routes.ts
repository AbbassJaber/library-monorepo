import { API_RESOURCES, AuditListResponse, AuditQuery } from '@library/contracts';
import { createModuleRouter } from '../../lib/route.js';
import type { ModuleRouter, RouteGuards } from '../../lib/route.js';
import type { AuditService } from './audit.service.js';

export const auditRoutes = (service: AuditService, guards: RouteGuards): ModuleRouter => {
  const mod = createModuleRouter(API_RESOURCES.auditLogs, { guards });
  mod.define(
    {
      method: 'get',
      path: '/',
      access: 'librarian',
      query: AuditQuery,
      response: AuditListResponse,
      summary: 'Audit log',
      description:
        'Every catalog and account mutation, newest first, with who did it and what it was about. Filter by one or more entityType values (comma-separated or repeated).',
      tags: ['audit'],
    },
    async ({ query, actor }) => service.list(actor, query)
  );
  return mod;
};
