import { request as http_request } from 'node:http';
import { connect } from 'node:net';
import type { AppConfig } from '@/config/config.schema';
import { LogCapture } from '@/testing/log_capture';
import { load_test_config } from '@/testing/test_app';
import {
  ALLOWED_HOST,
  PRIVATE_HOST,
  start_test_proxy,
  start_test_upstream,
  type TestProxy,
  type TestUpstream,
} from '@/testing/test_proxy';
import { EgressRefusedError, request_through_proxy } from './proxied_request';

const MAX_BYTES = 100_000;
const identity = { run_id: 'run_1', agent_id: 'agent_1' };

/** Sends raw bytes to the proxy and returns everything it answered. */
function raw(proxy_url: string, text: string): Promise<string> {
  const { hostname, port } = new URL(proxy_url);
  return new Promise((resolve, reject) => {
    const socket = connect({ host: hostname, port: Number(port) });
    const chunks: Buffer[] = [];
    socket.on('connect', () => socket.write(text));
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')));
    socket.on('error', reject);
  });
}

async function refused(options: { url: string; run_id?: string }): Promise<EgressRefusedError> {
  try {
    await request_through_proxy({
      proxy_url: proxy.url,
      identity: { ...identity, run_id: options.run_id ?? identity.run_id },
      url: options.url,
      max_bytes: MAX_BYTES,
      timeout_ms: 5_000,
      ca: upstream.ca,
    });
  } catch (error: unknown) {
    if (error instanceof EgressRefusedError) return error;
    throw error;
  }
  throw new Error(`${options.url} was not refused`);
}

let config: AppConfig;
let upstream: TestUpstream;
let proxy: TestProxy;
let logs: LogCapture;

beforeAll(async () => {
  const base = load_test_config();
  config = {
    ...base,
    log_level: 'info',
    egress: { ...base.egress, max_response_bytes: MAX_BYTES, max_requests_per_minute: 50 },
  };
  upstream = await start_test_upstream();
  logs = new LogCapture();
  proxy = await start_test_proxy(config, upstream, logs);
});

afterAll(async () => {
  await proxy.close();
  await upstream.close();
});

describe('the egress proxy', () => {
  it('wants a run identity on plain requests and on tunnels', async () => {
    const plain = await new Promise<{ status: number; authenticate: string | undefined }>(
      (resolve, reject) => {
        const { hostname, port } = new URL(proxy.url);
        const request = http_request({
          host: hostname,
          port: Number(port),
          method: 'GET',
          path: `http://${ALLOWED_HOST}/page`,
          headers: { host: ALLOWED_HOST },
        });
        request.on('response', (response) => {
          response.resume();
          resolve({
            status: response.statusCode ?? 0,
            authenticate: response.headers['proxy-authenticate'],
          });
        });
        request.on('error', reject);
        request.end();
      },
    );
    expect(plain).toEqual({ status: 407, authenticate: 'Basic realm="tbn egress"' });
    const tunnel = await raw(
      proxy.url,
      `CONNECT ${ALLOWED_HOST}:443 HTTP/1.1\r\nHost: ${ALLOWED_HOST}:443\r\n\r\n`,
    );
    expect(tunnel.startsWith('HTTP/1.1 407 ')).toBe(true);
    expect(tunnel).toContain('X-Tbn-Egress: unauthenticated');
  });

  it('forwards plain HTTP to a public host without the proxy headers', async () => {
    const response = await request_through_proxy({
      proxy_url: proxy.url,
      identity,
      url: `http://${ALLOWED_HOST}/page?x=1`,
      headers: { 'x-custom': 'kept' },
      max_bytes: MAX_BYTES,
      timeout_ms: 5_000,
    });
    expect(response.status).toBe(200);
    expect(response.body.toString('utf8')).toBe('hello from /page?x=1');
    expect(response.headers['x-upstream']).toBe('yes');
    expect(response.truncated).toBe(false);
    const seen = upstream.requests.at(-1);
    expect(seen?.url).toBe('/page?x=1');
    expect(seen?.headers['host']).toBe(ALLOWED_HOST);
    expect(seen?.headers['x-custom']).toBe('kept');
    expect(seen?.headers['proxy-authorization']).toBeUndefined();
  });

  it('forwards a POST body', async () => {
    const response = await request_through_proxy({
      proxy_url: proxy.url,
      identity,
      url: `http://${ALLOWED_HOST}/echo`,
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'payload',
      max_bytes: MAX_BYTES,
      timeout_ms: 5_000,
    });
    expect(response.body.toString('utf8')).toBe('POST payload');
  });

  it('tunnels HTTPS with TLS ending at the destination', async () => {
    const response = await request_through_proxy({
      proxy_url: proxy.url,
      identity,
      url: `https://${ALLOWED_HOST}/secure`,
      max_bytes: MAX_BYTES,
      timeout_ms: 5_000,
      ca: upstream.ca,
    });
    expect(response.status).toBe(200);
    expect(response.body.toString('utf8')).toBe('hello from /secure');
  });

  it('cuts a response at the byte cap, plain and tunnelled', async () => {
    const plain = await request_through_proxy({
      proxy_url: proxy.url,
      identity,
      url: `http://${ALLOWED_HOST}/big`,
      max_bytes: 1_000_000,
      timeout_ms: 5_000,
    });
    expect(plain.truncated).toBe(true);
    expect(plain.body.length).toBeLessThanOrEqual(MAX_BYTES);
    const tunnelled = await request_through_proxy({
      proxy_url: proxy.url,
      identity,
      url: `https://${ALLOWED_HOST}/big`,
      max_bytes: 1_000_000,
      timeout_ms: 5_000,
      ca: upstream.ca,
    });
    expect(tunnelled.truncated).toBe(true);
    expect(tunnelled.body.length).toBeLessThanOrEqual(MAX_BYTES);
    const client_cap = await request_through_proxy({
      proxy_url: proxy.url,
      identity,
      url: `http://${ALLOWED_HOST}/big`,
      max_bytes: 10,
      timeout_ms: 5_000,
    });
    expect(client_cap).toMatchObject({ truncated: true });
    expect(client_cap.body.length).toBe(10);
  });

  it.each([
    'http://127.0.0.1/',
    'http://10.1.2.3/',
    'http://172.17.0.1/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://100.64.0.1/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[fe80::1]/',
    'http://localhost/',
    'http://postgres/',
    'http://web:80/',
    'http://host.docker.internal/',
    `http://${PRIVATE_HOST}/`,
    `https://${PRIVATE_HOST}/`,
    'https://169.254.169.254/',
    'https://localhost/',
  ])('refuses %s', async (url) => {
    const error = await refused({ url });
    expect(error.status).toBe(403);
    expect(error.kind).toBe('refused');
  });

  it('refuses ports other than 80 and 443, other schemes and git pushes', async () => {
    expect((await refused({ url: `http://${ALLOWED_HOST}:8080/` })).message).toContain('Port 8080');
    expect((await refused({ url: `https://${ALLOWED_HOST}:8443/` })).message).toContain(
      'Port 8443',
    );
    const ftp = await raw(
      proxy.url,
      `GET ftp://${ALLOWED_HOST}/ HTTP/1.1\r\nHost: ${ALLOWED_HOST}\r\nProxy-Authorization: Basic ${Buffer.from('r:a').toString('base64')}\r\n\r\n`,
    );
    expect(ftp.startsWith('HTTP/1.1 403 ')).toBe(true);
    const push = await refused({ url: `http://${ALLOWED_HOST}/repo.git/git-receive-pack` });
    expect(push.message).toContain('Git pushes');
    const push_query = await refused({
      url: `http://${ALLOWED_HOST}/repo.git/info/refs?service=git-receive-pack`,
    });
    expect(push_query.status).toBe(403);
    const pull = await request_through_proxy({
      proxy_url: proxy.url,
      identity,
      url: `http://${ALLOWED_HOST}/repo.git/info/refs?service=git-upload-pack`,
      max_bytes: MAX_BYTES,
      timeout_ms: 5_000,
    });
    expect(pull.status).toBe(200);
  });

  it('rate limits each run on its own', async () => {
    const limited = await start_test_proxy(
      { ...config, egress: { ...config.egress, max_requests_per_minute: 2 } },
      upstream,
    );
    try {
      const fetch_page = (run_id: string): Promise<unknown> =>
        request_through_proxy({
          proxy_url: limited.url,
          identity: { ...identity, run_id },
          url: `http://${ALLOWED_HOST}/page`,
          max_bytes: MAX_BYTES,
          timeout_ms: 5_000,
        });
      await fetch_page('run_x');
      await fetch_page('run_x');
      await expect(fetch_page('run_x')).rejects.toMatchObject({
        status: 429,
        kind: 'rate_limited',
      });
      await expect(fetch_page('run_y')).resolves.toBeDefined();
    } finally {
      await limited.close();
    }
  });

  it('allows only the listed hosts when the owner set a list', async () => {
    const listed = await start_test_proxy(
      { ...config, egress: { ...config.egress, allowed_hosts: ['example.org'] } },
      upstream,
    );
    try {
      const outcome: unknown = await request_through_proxy({
        proxy_url: listed.url,
        identity,
        url: `http://${ALLOWED_HOST}/page`,
        max_bytes: MAX_BYTES,
        timeout_ms: 5_000,
      }).then(
        () => null,
        (error: unknown) => error,
      );
      if (!(outcome instanceof EgressRefusedError)) throw new Error('The host was not refused');
      expect(outcome.status).toBe(403);
      expect(outcome.message).toContain('allowed hosts');
    } finally {
      await listed.close();
    }
  });

  it('serves health and metrics on its ops port, and logs each request with the run identity', async () => {
    const health: unknown = await (await fetch(`http://127.0.0.1:${proxy.ops_port}/health`)).json();
    expect(health).toMatchObject({
      status: 'ok',
      process_type: 'egress_proxy',
      checks: { proxy: 'ok' },
    });
    const metrics = await (await fetch(`http://127.0.0.1:${proxy.ops_port}/metrics`)).text();
    expect(metrics).toMatch(
      /tbn_egress_requests_total\{outcome="ok",process_type="egress_proxy"\} \d+/,
    );
    expect(metrics).toMatch(
      /tbn_egress_requests_total\{outcome="refused",process_type="egress_proxy"\} \d+/,
    );
    expect(metrics).toMatch(/tbn_egress_response_bytes_total\{process_type="egress_proxy"\} \d+/);

    const lines = logs.text
      .split('\n')
      .filter((line) => line.includes('"egress"'))
      .map((line): unknown => JSON.parse(line));
    expect(lines).toContainEqual(
      expect.objectContaining({
        run_id: 'run_1',
        agent_id: 'agent_1',
        method: 'GET',
        target: `http://${ALLOWED_HOST}/page?x=1`,
        status: 200,
        outcome: 'ok',
      }),
    );
    expect(lines).toContainEqual(
      expect.objectContaining({ method: 'CONNECT', target: `${ALLOWED_HOST}:443`, outcome: 'ok' }),
    );
    expect(logs.text).not.toContain('Basic ');
  });
});
