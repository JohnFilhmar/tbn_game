import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/** One request the fake search server received. */
export interface SearchRequest {
  path: string;
  query: string | null;
  headers: IncomingMessage['headers'];
}

/** A server that answers like Brave Search on `/res/v1/web/search` and like SearXNG on `/search`. */
export interface FakeSearchServer {
  base_url: string;
  requests: SearchRequest[];
  /**
   * Answer requests with this status instead of results, all of them or those under `path`.
   * Status 0 restores results.
   */
  fail_with(status: number, path?: string): void;
  close(): Promise<void>;
}

/** Starts the server. Results name the query so a test can tell which answer it got. */
export async function start_fake_search_server(): Promise<FakeSearchServer> {
  const requests: SearchRequest[] = [];
  let failure = 0;
  let failing_path = '';
  const server: Server = createServer((request, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const query = url.searchParams.get('q');
    requests.push({ path: url.pathname, query, headers: request.headers });
    if (failure !== 0 && url.pathname.startsWith(failing_path)) {
      response.writeHead(failure, { 'content-type': 'text/plain' });
      response.end('failing on purpose');
      return;
    }
    const label = `${new URL(request.url ?? '/', 'http://localhost').host}`;
    if (url.pathname === '/res/v1/web/search') {
      if (request.headers['x-subscription-token'] === undefined) {
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end('{"message":"no token"}');
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          web: {
            results: [
              {
                title: `Brave result for ${query ?? ''}`,
                url: `https://example.com/brave/${encodeURIComponent(query ?? '')}`,
                description: `<strong>${query ?? ''}</strong> explained by ${label}`,
              },
              { title: 'Second', url: 'https://example.org/second', description: 'more' },
            ],
          },
        }),
      );
      return;
    }
    if (url.pathname === '/search' && url.searchParams.get('format') === 'json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          results: [
            {
              title: `SearXNG result for ${query ?? ''}`,
              url: `https://example.net/searxng/${encodeURIComponent(query ?? '')}`,
              content: `${query ?? ''} according to searxng`,
            },
            { title: 'Not a URL', url: 'nope', content: 'dropped' },
          ],
        }),
      );
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not here');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const bound = server.address();
  if (bound === null || typeof bound === 'string') throw new Error('No port bound');
  const port = bound.port;
  return {
    base_url: `http://127.0.0.1:${port}`,
    requests,
    fail_with: (status, path = '') => {
      failure = status;
      failing_path = path;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
