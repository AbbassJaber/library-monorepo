import request from 'supertest';
import { serve } from '../test/client.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { API_PREFIX, BooksQuery, Book, CreateBookBody } from '@library/contracts';
import { createApp } from '../app.js';
import { silentLogger } from '../test/logger.js';
import { mountApi } from './apiMount.js';
import { buildOpenApiDocument } from './openapi.js';
import { createModuleRouter } from './route.js';

const demoModule = () => {
  const mod = createModuleRouter('/demo', { publicOnly: true });
  mod.define(
    {
      method: 'get',
      path: '/books/:id',
      access: 'public',
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: BooksQuery,
      response: Book,
      summary: 'Demo book',
      tags: ['demo'],
    },
    async () => {
      throw new Error('not called');
    }
  );
  mod.define(
    {
      method: 'post',
      path: '/books',
      access: 'public',
      body: CreateBookBody,
      response: Book,
      status: 201,
      summary: 'Create demo book',
      tags: ['demo'],
    },
    async () => {
      throw new Error('not called');
    }
  );
  return mod;
};

describe('buildOpenApiDocument', () => {
  const doc = buildOpenApiDocument([{ prefix: API_PREFIX, modules: [demoModule()] }], {
    title: 'Test',
    version: '0.0.1',
  });

  it('is an OpenAPI 3.1 document with absolute paths in OpenAPI syntax', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toEqual(['/api/v1/demo/books/{id}', '/api/v1/demo/books']);
  });

  it('lists the component schemas by name, whatever order the contracts load in', () => {
    const names = Object.keys(doc.components.schemas);
    expect(names).toEqual([...names].sort());
  });

  it('documents path and query parameters from the Zod schemas (input form)', () => {
    const op = doc.paths['/api/v1/demo/books/{id}']?.get;
    const names = op?.parameters.map(p => `${p.in}:${p.name}${p.required ? '!' : ''}`);
    expect(names).toContain('path:id!');
    expect(names).toContain('query:pageSize');
    const pageSize = op?.parameters.find(p => p.name === 'pageSize');
    expect(pageSize?.schema).toMatchObject({ type: 'integer', maximum: 48, default: 24 });
  });

  it('documents the request body, the envelope response and the shared error responses', () => {
    const op = doc.paths['/api/v1/demo/books']?.post;
    expect(op?.requestBody?.content['application/json']?.schema).toMatchObject({
      $ref: '#/components/schemas/CreateBookBody',
    });
    expect(op?.responses['201']?.content['application/json']?.schema).toMatchObject({
      type: 'object',
      properties: { data: { $ref: '#/components/schemas/Book' } },
    });
    expect(op?.responses['400']?.content['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/ErrorEnvelope',
    });
  });

  it('publishes registered contract schemas as components and leaves no $defs behind', () => {
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(['Book', 'BookSummary', 'CreateBookBody', 'ErrorEnvelope', 'GenreRef'])
    );
    expect(JSON.stringify(doc)).not.toContain('$defs');
  });
});

describe('docs endpoints', () => {
  const app = () =>
    createApp({
      ping: async () => undefined,
      logger: silentLogger,
      apis: [mountApi(API_PREFIX, [demoModule()])],
    });

  it('serves the JSON document at /api/docs.json including /health', async () => {
    const res = await request(await serve(app())).get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.paths['/health']).toBeDefined();
    expect(res.body.paths['/api/v1/demo/books']).toBeDefined();
  });

  it('serves Swagger UI at /api/docs', async () => {
    const res = await request(await serve(app())).get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});
