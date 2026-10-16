import { API_PREFIX, apiPaths, ApiErrorCode, HEADERS } from '@library/contracts';

export interface HttpClientOptions {
  baseUrl: string;
  email: string;
  password: string;
  fetch?: typeof fetch;
}

export class HttpApiError extends Error {
  override readonly name = 'HttpApiError';
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export const createHttpClient = (options: HttpClientOptions) => {
  const fetchImpl = options.fetch ?? fetch;
  const root = `${options.baseUrl.replace(/\/$/, '')}${API_PREFIX}`;
  let token: Promise<string> | undefined;

  const raw = async <T>(
    method: string,
    path: string,
    body?: unknown,
    bearer?: string
  ): Promise<Envelope<T>> => {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (bearer) headers[HEADERS.authorization] = `Bearer ${bearer}`;
    const res = await fetchImpl(`${root}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const parsed = (await res.json().catch(() => ({}))) as Partial<Envelope<T>> & {
      error?: { code?: string; message?: string };
    };
    if (!res.ok)
      throw new HttpApiError(
        res.status,
        parsed.error?.code ?? ApiErrorCode.enum.INTERNAL,
        parsed.error?.message ?? `HTTP ${res.status}`
      );
    return { data: parsed.data as T, ...(parsed.meta ? { meta: parsed.meta } : {}) };
  };

  const login = () =>
    (token ??= raw<{ accessToken?: string }>('POST', apiPaths.auth.login, {
      email: options.email,
      password: options.password,
    }).then(envelope => {
      if (!envelope.data.accessToken)
        throw new HttpApiError(
          401,
          ApiErrorCode.enum.UNAUTHENTICATED,
          'login returned no access token'
        );
      return envelope.data.accessToken;
    }));

  const authed = async <T>(method: string, path: string, body?: unknown): Promise<Envelope<T>> => {
    try {
      return await raw<T>(method, path, body, await login());
    } catch (error) {
      if (!(error instanceof HttpApiError) || error.status !== 401) throw error;
      token = undefined;
      return raw<T>(method, path, body, await login());
    }
  };

  return {
    get: <T>(path: string) => authed<T>('GET', path),
    post: <T>(path: string, body?: unknown) => authed<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => authed<T>('PATCH', path, body),
    delete: <T>(path: string) => authed<T>('DELETE', path),
    public: <T>(path: string) => raw<T>('GET', path),
  };
};

export type HttpClient = ReturnType<typeof createHttpClient>;
