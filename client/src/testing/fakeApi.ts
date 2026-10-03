import { PREFERENCE_DEFAULTS } from '@tbn/contracts';
import type { ApiClient } from '@/lib/api/apiClient';
import { ApiError } from '@/lib/api/apiError';

/** Answers one route: a value, a promise, or a thrown `ApiError`. */
export type FakeRoute = (body: unknown) => unknown;

/** A call the screen made. */
export interface FakeCall {
  method: string;
  path: string;
  body: unknown;
}

/** An API client answering from a route table, keyed `METHOD /path` without the query. */
export interface FakeApi extends ApiClient {
  calls: FakeCall[];
}

/** What the desktop itself reads on every screen: the owner, the approvals badge, the theme. */
const DESKTOP_ROUTES: Record<string, FakeRoute> = {
  'GET /auth/me': () => ({ id: '00000000-0000-4000-8000-0000000000aa', username: 'owner' }),
  'GET /approvals': () => [],
  'GET /preferences': () => PREFERENCE_DEFAULTS,
};

/** Builds a fake API; an unknown route answers 404. */
export function fakeApi(routes: Record<string, FakeRoute>): FakeApi {
  const table = { ...DESKTOP_ROUTES, ...routes };
  const calls: FakeCall[] = [];
  const answer = (method: string, path: string, body: unknown): Promise<unknown> => {
    calls.push({ method, path, body });
    const route = table[`${method} ${path}`];
    if (route === undefined) {
      return Promise.reject(new ApiError(404, `No fake route for ${method} ${path}`));
    }
    try {
      return Promise.resolve(route(body));
    } catch (error: unknown) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  };
  return {
    calls,
    get: async (path, schema) => schema.parse(await answer('GET', path, undefined)),
    send: async (method, path, schema, init) => schema.parse(await answer(method, path, init.body)),
    sendNoContent: async (method, path, init) => {
      await answer(method, path, init.body);
    },
    getBlob: async (path) => new Blob([String(await answer('GET', path, undefined))]),
  };
}
