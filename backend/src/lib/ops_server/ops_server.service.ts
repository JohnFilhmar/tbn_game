import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';
import { HealthService } from '@/lib/health/health.service';
import { MetricsService } from '@/lib/metrics/metrics.service';

interface OpsReply {
  status: number;
  content_type: string;
  body: string;
}

function json_reply(status: number, payload: unknown): OpsReply {
  return { status, content_type: 'application/json', body: JSON.stringify(payload) };
}

/**
 * Small HTTP listener for processes without Nest HTTP routes, today the worker. It serves only
 * `GET /health` and `GET /metrics` on `WORKER_PORT`.
 */
@Injectable()
export class OpsServerService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(OpsServerService.name);
  private server: Server | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly health_service: HealthService,
    private readonly metrics_service: MetricsService,
  ) {}

  /** Starts listening once every module is initialised. */
  async onApplicationBootstrap(): Promise<void> {
    const server = createServer((request, response) => {
      void this.handle(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.config.worker.port, '0.0.0.0', () => {
        server.off('error', reject);
        resolve();
      });
    });
    this.server = server;
    this.logger.log(`Ops server listening on port ${this.port}`);
  }

  /** Stops accepting connections before the rest of the application shuts down. */
  async beforeApplicationShutdown(): Promise<void> {
    const server = this.server;
    if (server === undefined) return;
    this.server = undefined;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeIdleConnections();
    });
  }

  /** The bound port, which differs from the configured one when that is 0. */
  get port(): number {
    const address = this.server?.address();
    return typeof address === 'object' && address !== null ? address.port : 0;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let reply: OpsReply;
    try {
      reply = await this.route(request);
    } catch (error: unknown) {
      this.logger.error(error instanceof Error ? error.message : 'Unknown ops server error');
      reply = json_reply(500, { message: 'Internal error' });
    }
    response.writeHead(reply.status, {
      'Content-Type': reply.content_type,
      'Cache-Control': 'no-store',
    });
    response.end(reply.body);
  }

  private async route(request: IncomingMessage): Promise<OpsReply> {
    if (request.method !== 'GET') return json_reply(405, { message: 'Method not allowed' });
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path === '/health') {
      const health = await this.health_service.check();
      return json_reply(health.status === 'ok' ? 200 : 503, health);
    }
    if (path === '/metrics') {
      return {
        status: 200,
        content_type: this.metrics_service.content_type,
        body: await this.metrics_service.render(),
      };
    }
    return json_reply(404, { message: 'Not found' });
  }
}
