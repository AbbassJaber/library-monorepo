import { SERVICE_PATHS } from '@library/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/client.js';

describe('openapi.json', () => {
  it('matches the committed snapshot', async () => {
    const res = await request(await createTestApp()).get(SERVICE_PATHS.docsJson);
    expect(res.status).toBe(200);
    const document = res.body as { info: { version: string } };
    document.info.version = '0.0.0';
    await expect(`${JSON.stringify(document, null, 2)}\n`).toMatchFileSnapshot(
      '../../openapi.json'
    );
  });
});
