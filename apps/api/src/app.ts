import cookieParser from 'cookie-parser';
import cors from 'cors';
import {
  API_RESOURCES,
  API_ROOT,
  API_VERSIONS,
  SERVICE_PATHS,
  apiPaths,
  apiPrefix,
} from '@library/contracts';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import type { Readiness } from './ai/readiness.js';
import type { Logger } from './lib/logger.js';
import { buildOpenApiDocument } from './lib/openapi.js';
import type { ApiMount } from './lib/apiMount.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { originCheck } from './middleware/originCheck.js';
import { rateLimit } from './middleware/rateLimit.js';
import type { RateLimitOptions } from './middleware/rateLimit.js';
import { POWERED_BY_SETTING } from './config/constants.js';
import { requestId } from './middleware/requestId.js';
import { requestLog } from './middleware/requestLog.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { webApp } from './lib/webApp.js';
import { OPEN_LIBRARY_COVERS_ORIGIN } from '@library/domain-config';

export interface AppDeps {
  ping: () => Promise<void>;
  readiness?: () => Promise<Readiness>;
  logger: Logger;
  exposeStack?: boolean;
  apis?: ApiMount[];
  corsOrigins?: string[];
  rateLimit?: RateLimitOptions;
  authRateLimit?: RateLimitOptions;
  aiRateLimit?: RateLimitOptions;
  version?: string;
  webRoot?: string;
}

export const createApp = (deps: AppDeps): Express => {
  const app = express();
  const apis = deps.apis ?? [];
  app.disable(POWERED_BY_SETTING);
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(requestLog(deps.logger));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', OPEN_LIBRARY_COVERS_ORIGIN],
        },
      },
    })
  );
  if (deps.corsOrigins !== undefined && deps.corsOrigins.length > 0) {
    app.use(cors({ origin: deps.corsOrigins, credentials: true }));
  }
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use(API_ROOT, originCheck(deps.corsOrigins ?? []));

  const health = healthRoutes(deps.ping, deps.readiness);
  app.use(health.router);

  if (deps.rateLimit !== undefined) app.use(API_ROOT, rateLimit(deps.rateLimit));
  const inEveryVersion = (path: string) =>
    Object.values(API_VERSIONS).map(version => `${apiPrefix(version)}${path}`);
  if (deps.authRateLimit !== undefined) {
    const limiter = rateLimit(deps.authRateLimit);
    app.use([apiPaths.auth.login, apiPaths.auth.register].flatMap(inEveryVersion), limiter);
  }

  if (deps.aiRateLimit !== undefined) {
    const aiLimiter = rateLimit(deps.aiRateLimit);
    const free = new Set(
      [
        apiPaths.ai.status,
        apiPaths.ai.runs,
        apiPaths.ai.confirmAction,
        apiPaths.ai.cancelAction,
      ].map(p => p.slice(API_RESOURCES.ai.length))
    );
    app.use(inEveryVersion(API_RESOURCES.ai), (req, res, next) =>
      free.has(req.path) ? next() : aiLimiter(req, res, next)
    );
  }

  for (const api of apis) app.use(api.prefix, api.router);

  const document = buildOpenApiDocument([{ prefix: '', modules: [health] }, ...apis], {
    title: 'Library API',
    version: deps.version ?? '0.1.0',
    description: 'Generated from the route registry and the shared Zod contracts.',
  });
  app.get(SERVICE_PATHS.docsJson, (_req, res) => {
    res.json(document);
  });
  app.use(
    SERVICE_PATHS.docs,
    swaggerUi.serve,
    swaggerUi.setup(document, { customSiteTitle: 'Library API' })
  );

  if (deps.webRoot !== undefined) app.use(webApp(deps.webRoot));

  app.use(notFound);
  app.use(errorHandler(deps.logger, deps.exposeStack ?? false));
  return app;
};
