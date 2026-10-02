import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  Inject,
  Injectable,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { HealthCheckStatus } from '@tbn/contracts';
import type { Counter } from '@prometheus-io/client';
import { PinoLogger } from 'nestjs-pino';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';
import { MetricsService } from '@/lib/metrics/metrics.service';
import { host_allowed, refused_address, refused_host } from './address_policy';
import { EGRESS_DIALER, type EgressDialer } from './egress_dialer';
import { forward_http, pipe_tunnel } from './egress_forward';
import { RequestWindow } from './request_window';

/** The run and agent a request is made for, from the proxy credentials. */
export interface EgressIdentity {
  run_id: string;
  agent_id: string;
}

/** Why the proxy did not forward a request. */
type Refusal = { status: 403 | 407 | 429 | 503; kind: string; message: string };

/** A destination the policy accepts: the first public address of a public name. */
interface Destination {
  host: string;
  port: number;
  address: string;
}

const IDENTITY_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const UPSTREAM_TIMEOUT_MS = 60_000;
const STATUS_TEXT: Record<number, string> = {
  403: 'Forbidden',
  407: 'Proxy Authentication Required',
  429: 'Too Many Requests',
  503: 'Service Unavailable',
};

function refusal(status: Refusal['status'], kind: string, message: string): Refusal {
  return { status, kind, message };
}

function is_refusal<T extends object>(value: T | Refusal): value is Refusal {
  return 'status' in value && 'kind' in value;
}

/** Reads `run_id:agent_id` from a Basic proxy credential. */
export function identity_of(header: string | undefined): EgressIdentity | null {
  const [scheme, value] = (header ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'basic' || value === undefined) return null;
  const decoded = Buffer.from(value, 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon <= 0) return null;
  const run_id = decoded.slice(0, colon);
  const agent_id = decoded.slice(colon + 1);
  if (!IDENTITY_PATTERN.test(run_id) || !IDENTITY_PATTERN.test(agent_id)) return null;
  return { run_id, agent_id };
}

/** True for the Git smart HTTP push endpoint, which the proxy never forwards. */
export function is_git_push(url: URL): boolean {
  return (
    url.pathname.endsWith('/git-receive-pack') ||
    url.searchParams.get('service') === 'git-receive-pack'
  );
}

/**
 * The forward proxy every outbound request of an agent goes through: plain HTTP on port 80 and
 * CONNECT tunnels to port 443, for a run that identifies itself, to public addresses only, under
 * a per-run rate limit and a byte cap per response. It holds no credential and no database.
 *
 * Ceiling: one proxy process. Every sandbox and the worker's fetch tool share its connection and
 * rate limits.
 */
@Injectable()
export class EgressProxyService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private server: Server | undefined;
  /** Open CONNECT tunnels, which the HTTP server no longer tracks once they are established. */
  private readonly tunnels = new Set<Duplex>();
  private active = 0;
  private readonly window: RequestWindow;
  private readonly requests: Counter<'outcome'>;
  private readonly bytes: Counter<string>;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EGRESS_DIALER) private readonly dialer: EgressDialer,
    private readonly logger: PinoLogger,
    metrics: MetricsService,
  ) {
    this.logger.setContext(EgressProxyService.name);
    this.window = new RequestWindow(config.egress.max_requests_per_minute);
    this.requests = metrics.counter(
      'tbn_egress_requests_total',
      'Requests the egress proxy handled, by outcome.',
      ['outcome'],
    );
    this.bytes = metrics.counter(
      'tbn_egress_response_bytes_total',
      'Bytes destinations sent back through the egress proxy.',
      [],
    );
  }

  /** Starts listening on the proxy port. */
  async onApplicationBootstrap(): Promise<void> {
    const server = createServer((request, response) => {
      void this.handle_request(request, response);
    });
    server.on('connect', (request, socket, head) => {
      void this.handle_connect(request, socket, head);
    });
    server.on('clientError', (_error, socket) => {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    });
    server.keepAliveTimeout = 5_000;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.config.egress.port, '0.0.0.0', () => {
        server.off('error', reject);
        resolve();
      });
    });
    this.server = server;
    this.logger.info(`Egress proxy listening on port ${this.port}`);
  }

  /** Stops accepting connections and cuts the open ones. */
  async beforeApplicationShutdown(): Promise<void> {
    const server = this.server;
    if (server === undefined) return;
    this.server = undefined;
    for (const tunnel of this.tunnels) tunnel.destroy();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }

  /** The bound port, which differs from the configured one when that is 0. */
  get port(): number {
    const address = this.server?.address();
    return typeof address === 'object' && address !== null ? address.port : 0;
  }

  /** The proxy's own health: it is listening. */
  async health_checks(): Promise<Record<string, HealthCheckStatus>> {
    return Promise.resolve({ proxy: this.server?.listening === true ? 'ok' : 'unavailable' });
  }

  private async handle_request(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const started = Date.now();
    const identity = identity_of(request.headers['proxy-authorization']);
    const admitted = this.admit(identity);
    const target = admitted ?? this.plain_target(request);
    if (is_refusal(target)) {
      this.refuse_request(response, target);
      this.record(identity, request.method ?? '', request.url ?? '', target.status, 0, target.kind);
      return;
    }
    const destination = await this.destination(target.hostname, target.port === '' ? 80 : 0);
    if (is_refusal(destination)) {
      this.refuse_request(response, destination);
      this.record(
        identity,
        request.method ?? '',
        target.href,
        destination.status,
        0,
        destination.kind,
      );
      return;
    }
    this.active += 1;
    try {
      const upstream = await this.dialer.open(destination.address, destination.port);
      const outcome = await forward_http({
        request,
        response,
        upstream,
        url: target,
        max_bytes: this.config.egress.max_response_bytes,
        timeout_ms: UPSTREAM_TIMEOUT_MS,
      });
      this.bytes.inc(outcome.bytes);
      this.record(
        identity,
        request.method ?? '',
        target.href,
        outcome.status,
        outcome.bytes,
        outcome.capped ? 'capped' : outcome.error === null ? 'ok' : 'error',
        Date.now() - started,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown error';
      if (!response.headersSent) {
        this.refuse_request(response, { status: 503, kind: 'error', message });
      }
      this.record(identity, request.method ?? '', target.href, 503, 0, 'error');
    } finally {
      this.active -= 1;
    }
  }

  private async handle_connect(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): Promise<void> {
    const started = Date.now();
    const identity = identity_of(request.headers['proxy-authorization']);
    const admitted = this.admit(identity);
    const [host = '', port_text = ''] = split_host_port(request.url ?? '');
    const port = Number(port_text);
    const refused =
      admitted ??
      (port === 443 ? null : refusal(403, 'refused', `Port ${port_text} is not open; only 443 is`));
    const destination = refused ?? (await this.destination(host, 443));
    if (is_refusal(destination)) {
      socket.end(connect_reply(destination));
      this.record(identity, 'CONNECT', request.url ?? '', destination.status, 0, destination.kind);
      return;
    }
    this.active += 1;
    try {
      const upstream = await this.dialer.open(destination.address, destination.port);
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      this.tunnels.add(socket);
      const outcome = await pipe_tunnel(
        socket,
        upstream,
        head,
        this.config.egress.max_response_bytes,
      ).finally(() => this.tunnels.delete(socket));
      this.bytes.inc(outcome.bytes);
      this.record(
        identity,
        'CONNECT',
        request.url ?? '',
        200,
        outcome.bytes,
        outcome.capped ? 'capped' : 'ok',
        Date.now() - started,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown error';
      socket.end(connect_reply({ status: 503, kind: 'error', message }));
      this.record(identity, 'CONNECT', request.url ?? '', 503, 0, 'error');
    } finally {
      this.active -= 1;
    }
  }

  /** The identity and rate checks every request passes first. */
  private admit(identity: EgressIdentity | null): Refusal | null {
    if (identity === null) {
      return refusal(407, 'unauthenticated', 'Proxy credentials must carry the run and agent ids');
    }
    if (this.active >= this.config.egress.max_connections) {
      return refusal(503, 'busy', 'The proxy has no free connection');
    }
    if (!this.window.admit(identity.run_id)) {
      return refusal(429, 'rate_limited', 'This run has made too many requests this minute');
    }
    return null;
  }

  /** The absolute URL of a plain request, when it is a plain HTTP request the proxy forwards. */
  private plain_target(request: IncomingMessage): URL | Refusal {
    let url: URL;
    try {
      url = new URL(request.url ?? '');
    } catch {
      return refusal(403, 'refused', 'A proxy request names an absolute http:// URL');
    }
    if (url.protocol !== 'http:') {
      return refusal(403, 'refused', `${url.protocol} is not forwarded; use http:// or CONNECT`);
    }
    if (url.port !== '' && url.port !== '80') {
      return refusal(403, 'refused', `Port ${url.port} is not open; only 80 is`);
    }
    if (is_git_push(url)) return refusal(403, 'refused', 'Git pushes do not leave the sandbox');
    return url;
  }

  /** Applies the host rules, the allowlist and the address policy to every resolved address. */
  private async destination(host: string, port: number): Promise<Destination | Refusal> {
    const name = host.replace(/^\[|\]$/g, '');
    const by_name = refused_host(name);
    if (by_name !== null) return refusal(403, 'refused', by_name);
    if (!host_allowed(name, this.config.egress.allowed_hosts)) {
      return refusal(403, 'refused', `${name} is not on the allowed hosts list`);
    }
    let addresses: string[];
    try {
      addresses = refused_address(name) === null ? [name] : await this.dialer.resolve(name);
    } catch {
      return refusal(403, 'refused', `${name} does not resolve`);
    }
    if (addresses.length === 0) return refusal(403, 'refused', `${name} does not resolve`);
    for (const address of addresses) {
      const reason = refused_address(address);
      if (reason !== null) return refusal(403, 'refused', `${name} is refused: ${reason}`);
    }
    return { host: name, port: port === 0 ? 80 : port, address: addresses[0] ?? name };
  }

  private refuse_request(response: ServerResponse, refused: Refusal): void {
    const headers: Record<string, string> = {
      'content-type': 'text/plain',
      'x-tbn-egress': refused.kind,
      connection: 'close',
    };
    if (refused.status === 407) headers['proxy-authenticate'] = 'Basic realm="tbn egress"';
    response.writeHead(refused.status, headers);
    response.end(`${refused.message}\n`);
  }

  private record(
    identity: EgressIdentity | null,
    method: string,
    target: string,
    status: number,
    bytes: number,
    outcome: string,
    duration_ms?: number,
  ): void {
    this.requests.inc({ outcome });
    const line = {
      run_id: identity?.run_id ?? null,
      agent_id: identity?.agent_id ?? null,
      method,
      target: target.length > 500 ? `${target.slice(0, 500)}...` : target,
      status,
      bytes,
      outcome,
      duration_ms,
    };
    if (outcome === 'ok' || outcome === 'capped') this.logger.info(line, 'egress');
    else this.logger.warn(line, 'egress');
  }
}

function split_host_port(target: string): [string, string] {
  const colon = target.lastIndexOf(':');
  if (colon === -1) return [target, ''];
  return [target.slice(0, colon), target.slice(colon + 1)];
}

function connect_reply(refused: Refusal): string {
  const body = `${refused.message}\n`;
  const extra = refused.status === 407 ? 'Proxy-Authenticate: Basic realm="tbn egress"\r\n' : '';
  return (
    `HTTP/1.1 ${refused.status} ${STATUS_TEXT[refused.status] ?? ''}\r\n` +
    `Content-Type: text/plain\r\nX-Tbn-Egress: ${refused.kind}\r\n${extra}` +
    `Content-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`
  );
}
