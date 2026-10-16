import { API_PREFIX, ApiErrorCode, apiPaths } from '@library/contracts';
import type { ErrorEnvelope } from '@library/contracts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(status: number, error: ErrorEnvelope['error']) {
    super(error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = error.code;
    this.details = error.details;
    this.requestId = error.requestId;
  }
}

export interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

const BASE = (import.meta.env['VITE_API_BASE'] as string | undefined) ?? API_PREFIX;

const NO_REFRESH = [
  apiPaths.auth.login,
  apiPaths.auth.register,
  apiPaths.auth.refresh,
  apiPaths.auth.logout,
];

let refreshInFlight: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | undefined;

export const setSessionExpiredHandler = (handler: () => void): void => {
  onSessionExpired = handler;
};

const refreshOnce = (): Promise<boolean> => {
  if (refreshInFlight === null) {
    refreshInFlight = fetch(`${BASE}${apiPaths.auth.refresh}`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(res => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

const parse = async (res: Response): Promise<unknown> => {
  const text = await res.text();
  if (text.length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
};

const request = async <T>(
  path: string,
  options: RequestOptions,
  allowRefresh: boolean
): Promise<Envelope<T>> => {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });

  const body = (await parse(res)) as Partial<Envelope<T>> & Partial<ErrorEnvelope>;
  if (
    res.status === 401 &&
    allowRefresh &&
    body.error?.code !== ApiErrorCode.enum.CONFIRM_TOKEN_INVALID &&
    !NO_REFRESH.some(p => path.startsWith(p))
  ) {
    const refreshed = await refreshOnce();
    if (refreshed) return request<T>(path, options, false);
    onSessionExpired?.();
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body.error ?? { code: ApiErrorCode.enum.INTERNAL, message: `Request failed (${res.status})` }
    );
  }
  return { data: body.data as T, ...(body.meta !== undefined ? { meta: body.meta } : {}) };
};

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, signal ? { signal } : {}, true),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }, true),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }, true),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }, true),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }, true),
};

export const isApiError = (error: unknown, code?: ApiErrorCode): error is ApiError =>
  error instanceof ApiError && (code === undefined || error.code === code);
