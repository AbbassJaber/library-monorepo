import type { AddressInfo } from 'node:net';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { serve } from './client.js';

describe('serve()', () => {
  it('resolves only once the server is bound to 127.0.0.1, so a request built immediately uses it', async () => {
    const server = await serve(express().get('/ping', (_req, res) => res.send('pong')));
    const address = server.address() as AddressInfo | null;
    expect(address?.address).toBe('127.0.0.1');
    const res = await request(server).get('/ping');
    expect(res.text).toBe('pong');
    expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
  });
});
