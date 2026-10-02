import { request as http_request, type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import { request as https_request } from 'node:https';
import { isIP } from 'node:net';
import { connect as tls_connect } from 'node:tls';
import type { EgressIdentity } from './egress_proxy.service';

/** Options for `request_through_proxy`. */
export interface ProxiedRequestOptions {
  /** The proxy, as `http://host:port`. */
  proxy_url: string;
  /** The run and agent the request is made for; the proxy logs and rate-limits by them. */
  identity: EgressIdentity;
  url: string;
  method?: 'GET' | 'HEAD' | 'POST';
  headers?: Record<string, string>;
  body?: string | Buffer;
  /** The body is cut here and `truncated` set. */
  max_bytes: number;
  timeout_ms: number;
  /** Extra trusted certificates, for tests against a local TLS server. */
  ca?: string | Buffer;
}

/** What came back. */
export interface ProxiedResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  truncated: boolean;
}

/** Raised when the proxy itself answered instead of the destination: refused, unauthenticated, rate limited. */
export class EgressRefusedError extends Error {
  constructor(
    readonly status: number,
    readonly kind: string,
    message: string,
  ) {
    super(message);
    this.name = 'EgressRefusedError';
  }
}

function proxy_credential(identity: EgressIdentity): string {
  return `Basic ${Buffer.from(`${identity.run_id}:${identity.agent_id}`).toString('base64')}`;
}

/** Collects a response body up to `max_bytes`. */
function read_body(
  response: IncomingMessage,
  max_bytes: number,
): Promise<{ body: Buffer; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    response.on('data', (chunk: Buffer) => {
      const room = max_bytes - size;
      if (chunk.length >= room) {
        chunks.push(chunk.subarray(0, room));
        size = max_bytes;
        response.destroy();
        resolve({ body: Buffer.concat(chunks), truncated: true });
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
    });
    response.on('end', () => resolve({ body: Buffer.concat(chunks), truncated: false }));
    // A body cut short, by the proxy's byte cap or the destination, is what arrived, truncated.
    response.on('error', (error) => {
      if (size > 0) resolve({ body: Buffer.concat(chunks), truncated: true });
      else reject(error);
    });
  });
}

async function finish(
  response: IncomingMessage,
  max_bytes: number,
  from_proxy: boolean,
): Promise<ProxiedResponse> {
  const { body, truncated } = await read_body(response, max_bytes);
  const kind = response.headers['x-tbn-egress'];
  if (typeof kind === 'string' && (from_proxy || response.statusCode === 407)) {
    throw new EgressRefusedError(response.statusCode ?? 502, kind, body.toString('utf8').trim());
  }
  return { status: response.statusCode ?? 502, headers: response.headers, body, truncated };
}

/**
 * Makes one HTTP request through the egress proxy with the run's identity: plain HTTP as a proxy
 * request, HTTPS through a CONNECT tunnel with TLS to the destination. Redirects are not
 * followed. The proxy's own refusals become `EgressRefusedError`.
 */
export function request_through_proxy(options: ProxiedRequestOptions): Promise<ProxiedResponse> {
  const proxy = new URL(options.proxy_url);
  const url = new URL(options.url);
  const method = options.method ?? 'GET';
  const headers = { ...options.headers, host: url.host };
  const credential = proxy_credential(options.identity);
  const common = {
    host: proxy.hostname,
    port: Number(proxy.port || 80),
    timeout: options.timeout_ms,
  };

  return new Promise((resolve, reject) => {
    const settle = (promise: Promise<ProxiedResponse>): void => {
      promise.then(resolve, reject);
    };
    if (url.protocol === 'http:') {
      const request = http_request({
        ...common,
        method,
        path: url.href,
        headers: { ...headers, 'proxy-authorization': credential },
      });
      request.on('timeout', () => request.destroy(new Error('The request timed out')));
      request.on('error', reject);
      request.on('response', (response) => {
        settle(finish(response, options.max_bytes, response.headers['x-tbn-egress'] !== undefined));
      });
      request.end(options.body);
      return;
    }
    if (url.protocol !== 'https:') {
      reject(new Error(`Only http and https URLs can be fetched, not ${url.protocol}`));
      return;
    }
    const port = url.port === '' ? 443 : Number(url.port);
    const tunnel = http_request({
      ...common,
      method: 'CONNECT',
      path: `${url.hostname}:${port}`,
      headers: { host: `${url.hostname}:${port}`, 'proxy-authorization': credential },
    });
    tunnel.on('timeout', () => tunnel.destroy(new Error('The tunnel timed out')));
    tunnel.on('error', reject);
    tunnel.on('response', (response) => {
      settle(finish(response, options.max_bytes, true));
    });
    tunnel.on('connect', (response, socket, head) => {
      // Node reports every answer to CONNECT here, a refusal included.
      if (response.statusCode !== 200) {
        socket.destroy();
        const kind = response.headers['x-tbn-egress'];
        reject(
          new EgressRefusedError(
            response.statusCode ?? 502,
            typeof kind === 'string' ? kind : 'error',
            head.toString('utf8').trim() || (response.statusMessage ?? 'The tunnel was refused'),
          ),
        );
        return;
      }
      const secure = tls_connect({
        socket,
        servername: isIP(url.hostname) ? undefined : url.hostname,
        ca: options.ca,
      });
      // No agent, so Node uses the tunnelled TLS socket instead of connecting by itself.
      const request = https_request({
        createConnection: () => secure,
        method,
        host: url.hostname,
        port,
        path: `${url.pathname}${url.search}`,
        headers,
        timeout: options.timeout_ms,
      });
      request.on('timeout', () => request.destroy(new Error('The request timed out')));
      request.on('error', reject);
      request.on('response', (response) => settle(finish(response, options.max_bytes, false)));
      request.end(options.body);
    });
    tunnel.end();
  });
}
