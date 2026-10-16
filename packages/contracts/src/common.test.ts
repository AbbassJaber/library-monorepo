import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiErrorCode, ErrorEnvelope, PageQuery, envelope } from './common.js';

describe('envelope', () => {
  it('wraps a data schema and strips undeclared fields', () => {
    const Item = z.object({ id: z.number() });
    const parsed = envelope(Item).parse({ data: { id: 1, passwordHash: 'x' } });
    expect(parsed).toEqual({ data: { id: 1 } });
  });

  it('accepts optional meta', () => {
    const parsed = envelope(z.array(z.number())).parse({ data: [1], meta: { total: 1 } });
    expect(parsed.meta).toEqual({ total: 1 });
  });
});

describe('ErrorEnvelope', () => {
  it('requires a known error code', () => {
    expect(ErrorEnvelope.safeParse({ error: { code: 'NOPE', message: 'x' } }).success).toBe(false);
    expect(ApiErrorCode.options).toContain('ISBN_TAKEN');
  });
});

describe('PageQuery', () => {
  it('coerces and defaults page and pageSize', () => {
    expect(PageQuery.parse({})).toEqual({ page: 1, pageSize: 24 });
    expect(PageQuery.parse({ page: '3', pageSize: '48' })).toEqual({ page: 3, pageSize: 48 });
  });
});
