import { request as http_request, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import type { Duplex } from 'node:stream';

/** Headers that belong to one hop and never cross the proxy. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'upgrade',
]);

/** How one forwarded exchange ended. */
export interface ForwardOutcome {
  /** The status the client got, or 0 when the client connection broke first. */
  status: number;
  /** Bytes the upstream sent back. */
  bytes: number;
  /** True when the response was cut at the byte cap. */
  capped: boolean;
  error: string | null;
}

/** The request headers to send upstream: everything but the hop-by-hop ones, on one connection. */
export function outbound_headers(
  headers: IncomingMessage['headers'],
  host: string,
): Record<string, string | string[]> {
  const outbound: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || HOP_BY_HOP.has(name)) continue;
    outbound[name] = value;
  }
  outbound['host'] = host;
  outbound['connection'] = 'close';
  return outbound;
}

/** Options for `forward_http`. */
export interface ForwardOptions {
  request: IncomingMessage;
  response: ServerResponse;
  /** The open connection to the destination. */
  upstream: Socket;
  url: URL;
  max_bytes: number;
  timeout_ms: number;
}

/**
 * Forwards one plain HTTP request over an open upstream connection and streams the response back,
 * cutting it at `max_bytes`. Resolves when the exchange is over, whichever way.
 */
export function forward_http(options: ForwardOptions): Promise<ForwardOutcome> {
  const { request, response, upstream, url, max_bytes, timeout_ms } = options;
  return new Promise((resolve) => {
    let settled = false;
    let bytes = 0;
    let status = 0;
    const finish = (capped: boolean, error: string | null): void => {
      if (settled) return;
      settled = true;
      resolve({ status, bytes, capped, error });
    };
    // No agent: with one, Node would resolve and connect by itself and ignore `createConnection`.
    const upstream_request = http_request({
      createConnection: () => upstream,
      method: request.method,
      host: url.hostname,
      port: url.port === '' ? 80 : Number(url.port),
      path: `${url.pathname}${url.search}`,
      headers: outbound_headers(request.headers, url.host),
      timeout: timeout_ms,
    });
    upstream_request.on('timeout', () => {
      upstream_request.destroy(new Error('The destination took too long to answer'));
    });
    upstream_request.on('error', (error) => {
      if (!response.headersSent) {
        status = 502;
        response.writeHead(502, { 'content-type': 'text/plain', 'x-tbn-egress': 'error' });
        response.end(`The destination could not be reached: ${error.message}\n`);
      } else {
        response.destroy();
      }
      finish(false, error.message);
    });
    upstream_request.on('response', (upstream_response) => {
      status = upstream_response.statusCode ?? 502;
      const headers = { ...upstream_response.headers };
      delete headers['connection'];
      delete headers['keep-alive'];
      response.writeHead(status, headers);
      upstream_response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > max_bytes) {
          upstream_response.destroy();
          response.destroy();
          finish(true, null);
          return;
        }
        if (!response.write(chunk)) upstream_response.pause();
      });
      response.on('drain', () => upstream_response.resume());
      upstream_response.on('end', () => {
        response.end();
        finish(false, null);
      });
      upstream_response.on('error', (error) => {
        response.destroy();
        finish(false, error.message);
      });
    });
    request.on('error', () => {
      upstream_request.destroy();
      finish(false, 'The client went away');
    });
    response.on('close', () => finish(false, null));
    request.pipe(upstream_request);
  });
}

/** How a tunnel ended. */
export interface TunnelOutcome {
  bytes: number;
  capped: boolean;
}

/**
 * Pipes a CONNECT tunnel both ways, counting the bytes the destination sends and cutting the
 * tunnel at `max_bytes`. Resolves once either side closes.
 */
export function pipe_tunnel(
  client: Duplex,
  upstream: Socket,
  head: Buffer,
  max_bytes: number,
): Promise<TunnelOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    let bytes = 0;
    const finish = (capped: boolean): void => {
      if (settled) return;
      settled = true;
      client.destroy();
      upstream.destroy();
      resolve({ bytes, capped });
    };
    if (head.length > 0) upstream.write(head);
    upstream.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > max_bytes) {
        finish(true);
        return;
      }
      if (!client.write(chunk)) upstream.pause();
    });
    client.on('drain', () => upstream.resume());
    client.on('data', (chunk: Buffer) => {
      if (!upstream.write(chunk)) client.pause();
    });
    upstream.on('drain', () => client.resume());
    for (const side of [client, upstream]) {
      side.on('end', () => finish(false));
      side.on('close', () => finish(false));
      side.on('error', () => finish(false));
    }
  });
}
