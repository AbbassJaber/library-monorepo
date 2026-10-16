import type { PaginationMeta } from '@library/contracts';

export const paginationMeta = (total: number, page: number, pageSize: number): PaginationMeta => ({
  page,
  pageSize,
  total,
  totalPages: Math.ceil(total / pageSize),
});
