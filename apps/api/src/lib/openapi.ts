import { COOKIES } from '../config/constants.js';
import { z } from 'zod';
import '@library/contracts';
import type { ApiMount } from './apiMount.js';
import type { RegisteredRoute } from './route.js';

type JsonSchema = Record<string, unknown>;

export interface OpenApiParameter {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  schema: JsonSchema;
  description?: string;
}

export interface OpenApiOperation {
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  security: Array<Record<string, string[]>>;
  parameters: OpenApiParameter[];
  requestBody?: { required: true; content: Record<string, { schema: JsonSchema }> };
  responses: Record<
    string,
    { description: string; content: Record<string, { schema: JsonSchema }> }
  >;
}

export interface OpenApiDocument {
  openapi: '3.1.0';
  info: { title: string; version: string; description?: string };
  paths: Record<
    string,
    Partial<Record<'get' | 'post' | 'put' | 'patch' | 'delete', OpenApiOperation>>
  >;
  components: {
    schemas: Record<string, JsonSchema>;
    securitySchemes: Record<string, JsonSchema>;
  };
}

const stripMeta = (schema: JsonSchema): JsonSchema => {
  const {
    $schema: _schema,
    $id: _id,
    id: _legacyId,
    ...rest
  } = schema as JsonSchema & {
    $schema?: string;
    $id?: string;
    id?: string;
  };
  return rest;
};

const DEFS_PREFIX = '#/$defs/';
const COMPONENTS_PREFIX = '#/components/schemas/';

const convert = (
  schema: z.ZodType,
  io: 'input' | 'output',
  components: Record<string, JsonSchema>
): JsonSchema => {
  const raw = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
    unrepresentable: 'any',
    cycles: 'ref',
    reused: 'inline',
  }) as JsonSchema & {
    $defs?: Record<string, JsonSchema>;
    $schema?: string;
    $ref?: string;
    id?: string;
  };

  const defs = raw.$defs ?? {};
  for (const [name, def] of Object.entries(defs)) {
    if (components[name] === undefined) components[name] = stripMeta(def);
  }
  delete raw.$defs;
  delete raw.$schema;
  delete raw.id;

  const text = JSON.stringify(raw).split(DEFS_PREFIX).join(COMPONENTS_PREFIX);
  return JSON.parse(text) as JsonSchema;
};

const toOpenApiPath = (path: string): string => path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

const parametersFrom = (
  schema: z.ZodType | undefined,
  location: 'path' | 'query',
  components: Record<string, JsonSchema>
): OpenApiParameter[] => {
  if (schema === undefined) return [];
  const json = convert(schema, 'input', components) as {
    properties?: Record<string, JsonSchema>;
    required?: string[];
  };
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties ?? {}).map(([name, propertySchema]) => {
    const { description, ...rest } = propertySchema as JsonSchema & { description?: string };
    return {
      name,
      in: location,
      required: location === 'path' ? true : required.has(name),
      schema: rest,
      ...(description !== undefined ? { description } : {}),
    };
  });
};

const ERROR_RESPONSES: Record<string, string> = {
  '400': 'Validation error',
  '401': 'Authentication required',
  '403': 'Not allowed for this role',
  '404': 'Not found',
  '409': 'Conflict (version, uniqueness or business rule)',
  '429': 'Rate limited',
};

const operationFrom = (
  route: RegisteredRoute,
  components: Record<string, JsonSchema>
): OpenApiOperation => {
  const errorRef = { $ref: `${COMPONENTS_PREFIX}ErrorEnvelope` };
  const responses: OpenApiOperation['responses'] = {
    [String(route.status)]: {
      description: 'Success',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              data: convert(route.response, 'output', components),
              meta: { type: 'object', additionalProperties: true },
            },
            required: ['data'],
          },
        },
      },
    },
  };
  const applicable = Object.entries(ERROR_RESPONSES).filter(([status]) => {
    if (status === '401' || status === '403') return route.access !== 'public';
    if (status === '400')
      return route.params !== undefined || route.query !== undefined || route.body !== undefined;
    return true;
  });
  for (const [status, description] of applicable) {
    responses[status] = { description, content: { 'application/json': { schema: errorRef } } };
  }

  const operation: OpenApiOperation = {
    operationId: `${route.method}${route.path.replace(/[^A-Za-z0-9]+/g, '_')}`,
    summary: route.summary,
    ...(route.description !== undefined ? { description: route.description } : {}),
    tags: route.tags,
    security: route.access === 'public' ? [] : [{ cookieAuth: [] }, { bearerAuth: [] }],
    parameters: [
      ...parametersFrom(route.params, 'path', components),
      ...parametersFrom(route.query, 'query', components),
    ],
    responses,
  };
  if (route.body !== undefined) {
    operation.requestBody = {
      required: true,
      content: { 'application/json': { schema: convert(route.body, 'input', components) } },
    };
  }
  return operation;
};

export const buildOpenApiDocument = (
  mounts: Array<Pick<ApiMount, 'prefix' | 'modules'>>,
  info: { title: string; version: string; description?: string }
): OpenApiDocument => {
  const components: Record<string, JsonSchema> = {};

  const registry = z.toJSONSchema(z.globalRegistry, {
    target: 'draft-2020-12',
    unrepresentable: 'any',
    uri: id => `${COMPONENTS_PREFIX}${id}`,
  }) as { schemas: Record<string, JsonSchema & { $schema?: string; id?: string }> };
  for (const [name, schema] of Object.entries(registry.schemas)) {
    components[name] = stripMeta(schema);
  }

  const paths: OpenApiDocument['paths'] = {};
  for (const mount of mounts) {
    for (const registered of mount.modules.flatMap(mod => mod.registry)) {
      const route = { ...registered, path: `${mount.prefix}${registered.path}` };
      const path = toOpenApiPath(route.path);
      paths[path] = { ...(paths[path] ?? {}), [route.method]: operationFrom(route, components) };
    }
  }

  return {
    openapi: '3.1.0',
    info,
    paths,
    components: {
      schemas: Object.fromEntries(
        Object.entries(components).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      ),
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: COOKIES.access },
        bearerAuth: { type: 'http', scheme: 'bearer' },
      },
    },
  };
};
