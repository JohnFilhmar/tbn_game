import { IDEMPOTENCY_KEY_HEADER } from '@tbn/contracts';
import type { z } from 'zod';
import { ApiError, apiErrorFrom } from './apiError';

/** A value of a query parameter. Undefined leaves the parameter out. */
export type QueryValue = string | number | boolean | undefined;

/** The methods that change something, which every command uses. */
export type CommandMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** How the client reaches the server and as whom. */
export interface ApiClientOptions {
  /** The server's address, or an empty string for the page's own origin. */
  baseUrl: string;
  /** The session token, or null before sign in. */
  getToken: () => string | null;
  /** Called when the server no longer accepts the token, with its reason. */
  onUnauthorized: (message: string) => void;
  /** The fetch to use; tests pass their own. */
  fetchImpl?: typeof fetch;
}

/** A command's body and its id, which makes a retry of the same submission run it once. */
export interface CommandInit {
  body?: unknown;
  commandId: string;
}

/** The owner's API: reads parsed with the contracts schemas, and idempotent commands. */
export interface ApiClient {
  get<T>(path: string, schema: z.ZodType<T>, query?: Record<string, QueryValue>): Promise<T>;
  send<T>(method: CommandMethod, path: string, schema: z.ZodType<T>, init: CommandInit): Promise<T>;
  /** A command whose answer has no body worth reading, such as a 204. */
  sendNoContent(method: CommandMethod, path: string, init: CommandInit): Promise<void>;
  /** A file the server sends, such as a report's Markdown. */
  getBlob(path: string): Promise<Blob>;
}

function withQuery(path: string, query: Record<string, QueryValue> = {}): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined) params.set(name, String(value));
  }
  const text = params.toString();
  return text.length > 0 ? `${path}?${text}` : path;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return text;
  }
}

/** Creates the client every screen talks to the server through. */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));

  async function call(
    method: string,
    path: string,
    init: { body?: unknown; commandId?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = options.getToken();
    if (token !== null) headers['Authorization'] = `Bearer ${token}`;
    if (init.commandId !== undefined) headers[IDEMPOTENCY_KEY_HEADER] = init.commandId;
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    let response: Response;
    try {
      response = await fetchImpl(`${options.baseUrl}${path}`, {
        method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch {
      throw new ApiError(0, 'The server could not be reached.');
    }
    if (response.ok) return response;
    const error = apiErrorFrom(response.status, await readBody(response));
    if (response.status === 401) options.onUnauthorized(error.message);
    throw error;
  }

  function parse<T>(schema: z.ZodType<T>, body: unknown, path: string): T {
    const parsed = schema.safeParse(body);
    if (parsed.success) return parsed.data;
    throw new ApiError(200, `The server answered ${path} in a shape this client does not know.`);
  }

  return {
    async get(path, schema, query) {
      const target = withQuery(path, query);
      return parse(schema, await readBody(await call('GET', target)), target);
    },
    async send(method, path, schema, init) {
      return parse(schema, await readBody(await call(method, path, init)), path);
    },
    async sendNoContent(method, path, init) {
      await call(method, path, init);
    },
    async getBlob(path) {
      return (await call('GET', path)).blob();
    },
  };
}

/** A fresh command id for one submission. A retry of the same submission reuses it. */
export function newCommandId(): string {
  return crypto.randomUUID();
}
