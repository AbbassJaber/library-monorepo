import express, { Router } from 'express';
import type { Request } from 'express';
import { join } from 'node:path';
import { API_ROOT } from '@library/contracts';
import { notFound } from '../middleware/notFound.js';

const ASSETS = '/assets';
const INDEX = 'index.html';
const REVALIDATE = 'no-cache';
const READS = new Set(['GET', 'HEAD']);

const isApi = (req: Request) => req.path === API_ROOT || req.path.startsWith(`${API_ROOT}/`);

export const webApp = (root: string): Router => {
  const router = Router();
  router.use(ASSETS, express.static(join(root, ASSETS), { immutable: true, maxAge: '1y' }));
  router.use(ASSETS, notFound);
  router.use(
    express.static(root, {
      index: false,
      setHeaders: res => res.setHeader('Cache-Control', REVALIDATE),
    })
  );
  router.use((req, res, next) => {
    if (!READS.has(req.method) || isApi(req)) return next();
    res.setHeader('Cache-Control', REVALIDATE);
    res.sendFile(join(root, INDEX));
  });
  return router;
};
