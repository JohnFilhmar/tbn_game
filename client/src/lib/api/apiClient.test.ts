import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError } from './apiError';
import { createApiClient } from './apiClient';

const ThingSchema = z.object({ id: z.string(), name: z.string() });

interface Sent {
  url: string;
  init: RequestInit;
}

function fakeServer(status: number, body: unknown) {
  const sent: Sent[] = [];
  const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    sent.push({ url, init: init ?? {} });
    const text = body === undefined ? '' : JSON.stringify(body);
    return Promise.resolve(new Response(text, { status }));
  });
  return { sent, fetchImpl };
}

function headersOf(sent: Sent | undefined): Record<string, string> {
  const headers = sent?.init.headers;
  return headers !== undefined && !Array.isArray(headers) && !(headers instanceof Headers)
    ? headers
    : {};
}

describe('the API client', () => {
  it('reads with the token, leaves out unset query values and parses with the schema', async () => {
    const server = fakeServer(200, [{ id: 'a1', name: 'Ada' }]);
    const api = createApiClient({
      baseUrl: 'http://server',
      getToken: () => 'tbn_token',
      onUnauthorized: vi.fn(),
      fetchImpl: server.fetchImpl,
    });
    const things = await api.get('/agents', ThingSchema.array(), {
      status: 'idle',
      level: undefined,
    });
    expect(things).toEqual([{ id: 'a1', name: 'Ada' }]);
    expect(server.sent[0]?.url).toBe('http://server/agents?status=idle');
    expect(headersOf(server.sent[0])['Authorization']).toBe('Bearer tbn_token');
  });

  it('sends a command with its id and a JSON body', async () => {
    const server = fakeServer(201, { id: 'a2', name: 'Bo' });
    const api = createApiClient({
      baseUrl: '',
      getToken: () => null,
      onUnauthorized: vi.fn(),
      fetchImpl: server.fetchImpl,
    });
    await api.send('POST', '/agents', ThingSchema, { body: { name: 'Bo' }, commandId: 'c-1' });
    const headers = headersOf(server.sent[0]);
    expect(server.sent[0]?.init.method).toBe('POST');
    expect(server.sent[0]?.init.body).toBe('{"name":"Bo"}');
    expect(headers['Idempotency-Key']).toBe('c-1');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toBeUndefined();
  });

  it('signs out on a 401 and turns an error body into an ApiError', async () => {
    const onUnauthorized = vi.fn();
    const unauthorized = createApiClient({
      baseUrl: '',
      getToken: () => 'expired',
      onUnauthorized,
      fetchImpl: fakeServer(401, { statusCode: 401, message: 'Invalid or expired session' })
        .fetchImpl,
    });
    await expect(unauthorized.get('/agents', ThingSchema)).rejects.toMatchObject({
      status: 401,
      message: 'Invalid or expired session',
    });
    expect(onUnauthorized).toHaveBeenCalledWith('Invalid or expired session');

    const invalid = createApiClient({
      baseUrl: '',
      getToken: () => 't',
      onUnauthorized: vi.fn(),
      fetchImpl: fakeServer(400, {
        statusCode: 400,
        message: 'Validation failed',
        issues: [{ path: 'name', message: 'Too short' }],
      }).fetchImpl,
    });
    const error = await invalid
      .send('POST', '/agents', ThingSchema, { body: {}, commandId: 'c-2' })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, issues: [{ path: 'name', message: 'Too short' }] });
  });

  it('reports an unreachable server and an answer of the wrong shape', async () => {
    const offline = createApiClient({
      baseUrl: '',
      getToken: () => 't',
      onUnauthorized: vi.fn(),
      fetchImpl: () => Promise.reject(new TypeError('fetch failed')),
    });
    const error = await offline.get('/agents', ThingSchema).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error instanceof ApiError && error.isNetwork).toBe(true);

    const odd = createApiClient({
      baseUrl: '',
      getToken: () => 't',
      onUnauthorized: vi.fn(),
      fetchImpl: fakeServer(200, { unexpected: true }).fetchImpl,
    });
    await expect(odd.get('/agents', ThingSchema)).rejects.toThrow('shape');
  });
});
