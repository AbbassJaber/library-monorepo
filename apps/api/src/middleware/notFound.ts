import type { RequestHandler } from 'express';
import { notFound as notFoundError } from '../lib/errors.js';

export const notFound: RequestHandler = (req, _res, next) => {
  next(notFoundError(`Route ${req.method} ${req.originalUrl.split('?')[0]} not found`));
};
