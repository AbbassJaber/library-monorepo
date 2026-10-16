import type { DomainFields } from '../types.js';

export const normalizeIsbn = (value: string): string => value.replace(/[\s-]/g, '').toUpperCase();

export const fields: DomainFields = {
  creator: { maxLength: 120 },
  year: { min: 1000, max: () => new Date().getFullYear() + 1 },
  summary: { maxLength: 4000 },
  externalId: {
    pattern: /^(?:\d{9}[\dX]|\d{13})$/,
    normalize: normalizeIsbn,
    example: '978-0-441-17271-9',
  },
};
