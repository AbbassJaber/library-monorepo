import { Router } from 'express';
import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
  Router as ExpressRouter,
} from 'express';
import { Role } from '@library/contracts';
import type { z } from 'zod';
import { unauthenticated, validationError } from './errors.js';

export type Access = 'public' | 'user' | 'librarian';
export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface Actor {
  id: number;
  role: Role;
}

export interface RouteGuards {
  authenticate: RequestHandler;
  requireRole: (role: Role) => RequestHandler;
}

export type ActorFor<A extends Access> = A extends 'public' ? Actor | null : Actor;

export interface RouteSpec<
  P extends z.ZodType | undefined,
  Q extends z.ZodType | undefined,
  B extends z.ZodType | undefined,
  R extends z.ZodType,
  A extends Access = Access,
> {
  method: Method;
  path: string;
  access: A;
  summary: string;
  description?: string;
  params?: P;
  query?: Q;
  body?: B;
  response: R;
  status?: number;
  tags?: string[];
}

type Parsed<S extends z.ZodType | undefined> = S extends z.ZodType ? z.output<S> : undefined;

export interface RouteInput<
  P extends z.ZodType | undefined,
  Q extends z.ZodType | undefined,
  B extends z.ZodType | undefined,
  A extends Access = Access,
> {
  params: Parsed<P>;
  query: Parsed<Q>;
  body: Parsed<B>;
  actor: ActorFor<A>;
  req: Request;
  res: Response;
}

export type RouteHandler<
  P extends z.ZodType | undefined,
  Q extends z.ZodType | undefined,
  B extends z.ZodType | undefined,
  R extends z.ZodType,
  A extends Access = Access,
> = (input: RouteInput<P, Q, B, A>) => Promise<z.input<R>>;

export interface RegisteredRoute {
  method: Method;
  path: string;
  access: Access;
  summary: string;
  description?: string;
  tags: string[];
  status: number;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
}

const publicOnlyGuards: RouteGuards = {
  authenticate: () => {
    throw new Error('authenticate guard not configured (Phase 4)');
  },
  requireRole: () => () => {
    throw new Error('requireRole guard not configured (Phase 4)');
  },
};

const parsePart = <S extends z.ZodType | undefined>(
  schema: S | undefined,
  value: unknown,
  part: 'params' | 'query' | 'body',
  issues: Array<{ path: string; message: string }>
): Parsed<S> => {
  if (schema === undefined) return undefined as Parsed<S>;
  const result = schema.safeParse(value ?? {});
  if (!result.success) {
    for (const issue of result.error.issues) {
      issues.push({ path: [part, ...issue.path].join('.'), message: issue.message });
    }
    return undefined as Parsed<S>;
  }
  return result.data as Parsed<S>;
};

export interface ModuleRouter {
  router: ExpressRouter;
  prefix: string;
  registry: RegisteredRoute[];
  define<
    P extends z.ZodType | undefined = undefined,
    Q extends z.ZodType | undefined = undefined,
    B extends z.ZodType | undefined = undefined,
    R extends z.ZodType = z.ZodType,
    A extends Access = Access,
  >(
    spec: RouteSpec<P, Q, B, R, A>,
    handler: NoInfer<RouteHandler<P, Q, B, R, A>>
  ): void;
}

export const createModuleRouter = (
  prefix: string,
  options: { guards?: RouteGuards; publicOnly?: boolean } = {}
): ModuleRouter => {
  const router = Router();
  const registry: RegisteredRoute[] = [];
  const guards = options.guards ?? publicOnlyGuards;

  const define = <
    P extends z.ZodType | undefined = undefined,
    Q extends z.ZodType | undefined = undefined,
    B extends z.ZodType | undefined = undefined,
    R extends z.ZodType = z.ZodType,
    A extends Access = Access,
  >(
    spec: RouteSpec<P, Q, B, R, A>,
    handler: NoInfer<RouteHandler<P, Q, B, R, A>>
  ): void => {
    if (options.publicOnly && spec.access !== 'public') {
      throw new Error(`Route ${spec.method.toUpperCase()} ${prefix}${spec.path} needs guards`);
    }
    const middlewares: RequestHandler[] = [];
    if (spec.access !== 'public') middlewares.push(guards.authenticate);
    if (spec.access === 'librarian') middlewares.push(guards.requireRole(Role.enum.LIBRARIAN));

    const status = spec.status ?? 200;
    const run = async (req: Request, res: Response, _next: NextFunction) => {
      const issues: Array<{ path: string; message: string }> = [];
      const params = parsePart<P>(spec.params, req.params, 'params', issues);
      const query = parsePart<Q>(spec.query, req.query, 'query', issues);
      const body = parsePart<B>(spec.body, req.body, 'body', issues);
      if (issues.length > 0) throw validationError('Invalid request', { issues });

      const actor = (res.locals as { actor?: Actor }).actor ?? null;
      if (spec.access !== 'public' && actor === null) throw unauthenticated();
      const result = await handler({ params, query, body, actor: actor as ActorFor<A>, req, res });
      const data = spec.response.parse(result);
      const meta = (res.locals as { meta?: Record<string, unknown> }).meta;
      res.status(status).json(meta === undefined ? { data } : { data, meta });
    };

    router[spec.method](spec.path, ...middlewares, run);
    registry.push({
      method: spec.method,
      path: spec.path === '/' ? prefix : `${prefix}${spec.path}`,
      access: spec.access,
      summary: spec.summary,
      ...(spec.description !== undefined ? { description: spec.description } : {}),
      tags: spec.tags ?? [],
      status,
      ...(spec.params !== undefined ? { params: spec.params } : {}),
      ...(spec.query !== undefined ? { query: spec.query } : {}),
      ...(spec.body !== undefined ? { body: spec.body } : {}),
      response: spec.response,
    });
  };

  return { router, prefix, registry, define };
};
