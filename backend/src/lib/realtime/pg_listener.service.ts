import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ProcessType } from '@tbn/contracts';
import { Client } from 'pg';
import { require_database_url, type AppConfig } from '@/config/config.schema';
import { APP_CONFIG, PROCESS_TYPE } from '@/config/config.tokens';

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 15_000;
const CONNECT_TIMEOUT_MS = 5_000;

/** Receives the payload of one notification. */
export type NotificationHandler = (payload: string) => void;

/**
 * The web process's own PostgreSQL connection, held open with `LISTEN` on `CHANGES_CHANNEL` and
 * `STREAM_CHANNEL`. It reconnects with backoff, and tells its subscribers when it is back, because
 * notifications sent while it was away are lost: they read what they missed from the log.
 *
 * Ceiling: `LISTEN` and `NOTIFY` assume one database, and every web process holds one more
 * connection than its pool.
 */
@Injectable()
export class PgListenerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PgListenerService.name);
  private readonly handlers = new Map<string, Set<NotificationHandler>>();
  private readonly reconnect_handlers = new Set<() => void>();
  private client: Client | null = null;
  private connected = false;
  private stopping = false;
  private retry: NodeJS.Timeout | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PROCESS_TYPE) private readonly process_type: ProcessType,
  ) {}

  /**
   * Listens on the web process only; the worker publishes and never listens. Startup waits for
   * the first attempt, so a healthy web process is already listening; a failed attempt retries in
   * the background.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (this.process_type !== 'web') return;
    await this.connect(0);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.retry !== null) clearTimeout(this.retry);
    const client = this.client;
    this.client = null;
    this.connected = false;
    await client?.end().catch(() => undefined);
  }

  /** True while the listening connection is up. */
  get is_connected(): boolean {
    return this.connected;
  }

  /**
   * Calls `handler` with the payload of every notification on `channel`.
   *
   * @returns A function that removes the handler.
   */
  subscribe(channel: string, handler: NotificationHandler): () => void {
    const handlers = this.handlers.get(channel) ?? new Set<NotificationHandler>();
    handlers.add(handler);
    this.handlers.set(channel, handlers);
    return () => handlers.delete(handler);
  }

  /**
   * Calls `handler` each time the connection comes back after it was lost.
   *
   * @returns A function that removes the handler.
   */
  on_reconnect(handler: () => void): () => void {
    this.reconnect_handlers.add(handler);
    return () => this.reconnect_handlers.delete(handler);
  }

  private async connect(attempt: number): Promise<void> {
    if (this.stopping) return;
    const client = new Client({
      connectionString: require_database_url(this.config),
      application_name: 'tbn_web_listener',
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    });
    client.on('notification', (message) => {
      if (message.payload === undefined) return;
      for (const handler of this.handlers.get(message.channel) ?? []) handler(message.payload);
    });
    client.on('error', (error) => {
      this.logger.warn(`Listener connection failed: ${error.message}`);
      this.lost(client);
    });
    client.on('end', () => this.lost(client));
    try {
      await client.connect();
      await client.query('LISTEN tbn_changes');
      await client.query('LISTEN tbn_stream');
    } catch (error: unknown) {
      await client.end().catch(() => undefined);
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
      this.logger.warn(
        `Cannot listen for changes (${error instanceof Error ? error.message : 'unknown'}), retrying in ${delay} ms`,
      );
      this.retry = setTimeout(() => void this.connect(attempt + 1), delay);
      this.retry.unref();
      return;
    }
    if (this.stopping) {
      await client.end().catch(() => undefined);
      return;
    }
    this.client = client;
    this.connected = true;
    if (attempt > 0) this.logger.log('Listening for changes again');
    for (const handler of this.reconnect_handlers) handler();
  }

  private lost(client: Client): void {
    if (this.client !== client) return;
    this.client = null;
    this.connected = false;
    if (this.stopping) return;
    void client.end().catch(() => undefined);
    void this.connect(1);
  }
}
