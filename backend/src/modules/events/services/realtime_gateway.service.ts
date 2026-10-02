import { Server as HttpServer, type IncomingMessage } from 'node:http';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import {
  REALTIME_MESSAGES,
  RealtimeAuthSchema,
  type ChangeEvent,
  type ProcessType,
  type RealtimeHello,
  type ResyncRequired,
  type StreamChunk,
} from '@tbn/contracts';
import { Server, type Socket } from 'socket.io';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG, PROCESS_TYPE } from '@/config/config.tokens';
import { MetricsService } from '@/lib/metrics/metrics.service';
import { CHANGES_CHANNEL, STREAM_CHANNEL, StreamNoticeSchema } from '@/lib/realtime/channels';
import { PgListenerService } from '@/lib/realtime/pg_listener.service';
import { AuthService } from '@/modules/identity/services/auth.service';
import { cursor_kept, EventFeedService } from './event_feed.service';
import { SocketFeed } from './socket_feed';

/** The path Socket.IO answers on, on the web port. */
export const REALTIME_PATH = '/socket.io';

/** How often every socket's session is checked, so a logout or an expiry closes it. */
const SESSION_CHECK_MS = 60_000;

/** The largest message a client may send. Clients send none; this bounds the handshake. */
const MAX_CLIENT_MESSAGE_BYTES = 16_384;

interface ServerToClient {
  hello: (hello: RealtimeHello) => void;
  changes: (events: ChangeEvent[]) => void;
  stream: (chunk: StreamChunk) => void;
  resync_required: (resync: ResyncRequired) => void;
}

type ClientToServer = Record<never, never>;

interface SocketData {
  owner_id: string;
  token: string;
  cursor: number | null;
}

type RealtimeSocket = Socket<ClientToServer, ServerToClient, Record<never, never>, SocketData>;

/**
 * The Socket.IO gateway on the web port. A client connects with its session token and, to resume,
 * the last sequence it applied; it receives every event after that in order, then the live ones,
 * and the stream of its agents' output while it is generated. Clients send nothing: commands are
 * HTTP routes. Runs in the web process only.
 *
 * Ceiling: each socket reads the log on every change of its owner, which suits one owner with a
 * few devices.
 */
@Injectable()
export class RealtimeGatewayService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RealtimeGatewayService.name);
  private readonly feeds = new Map<string, Set<SocketFeed>>();
  private readonly sockets = new Map<SocketFeed, RealtimeSocket>();
  private io: Server<ClientToServer, ServerToClient, Record<never, never>, SocketData> | null =
    null;
  private session_check: NodeJS.Timeout | null = null;
  private readonly connections;
  private readonly changes_sent;
  private readonly stream_chunks;
  private readonly resyncs;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PROCESS_TYPE) private readonly process_type: ProcessType,
    private readonly adapter_host: HttpAdapterHost,
    private readonly listener: PgListenerService,
    private readonly feed: EventFeedService,
    private readonly auth: AuthService,
    metrics: MetricsService,
  ) {
    this.connections = metrics.gauge('tbn_realtime_connections', 'Open Socket.IO connections.', []);
    this.changes_sent = metrics.counter(
      'tbn_realtime_changes_sent_total',
      'Change events sent over Socket.IO.',
      [],
    );
    this.stream_chunks = metrics.counter(
      'tbn_realtime_stream_chunks_total',
      'Chunks of streamed model output sent over Socket.IO.',
      [],
    );
    this.resyncs = metrics.counter(
      'tbn_realtime_resyncs_total',
      'Clients told to reload because their cursor was no longer kept.',
      [],
    );
  }

  onApplicationBootstrap(): void {
    if (this.process_type !== 'web') return;
    const http_server: unknown = this.adapter_host.httpAdapter.getHttpServer();
    if (!(http_server instanceof HttpServer)) throw new Error('The web process has no HTTP server');
    const origins = new Set(this.config.web.cors_origins);
    const io = new Server<ClientToServer, ServerToClient, Record<never, never>, SocketData>(
      http_server,
      {
        path: REALTIME_PATH,
        serveClient: false,
        maxHttpBufferSize: MAX_CLIENT_MESSAGE_BYTES,
        cors: { origin: origins.size > 0 ? [...origins] : false, credentials: true },
        allowRequest: (request: IncomingMessage, callback) => {
          const origin = request.headers.origin;
          callback(null, origin === undefined || origins.has(origin));
        },
      },
    );
    io.use((socket, next) => {
      void this.authenticate(socket).then(
        (accepted) => next(accepted ? undefined : new Error('unauthorized')),
        () => next(new Error('unavailable')),
      );
    });
    io.on('connection', (socket) => {
      void this.open(socket);
    });
    this.io = io;
    this.listener.subscribe(CHANGES_CHANNEL, (owner_id) => this.wake(owner_id));
    this.listener.subscribe(STREAM_CHANNEL, (payload) => this.forward(payload));
    this.listener.on_reconnect(() => {
      for (const owner_id of this.feeds.keys()) this.wake(owner_id);
    });
    this.session_check = setInterval(() => void this.check_sessions(), SESSION_CHECK_MS);
    this.session_check.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.session_check !== null) clearInterval(this.session_check);
    const io = this.io;
    this.io = null;
    if (io === null) return;
    io.disconnectSockets(true);
    await new Promise<void>((resolve) => {
      void io.close(() => resolve());
    });
  }

  /** The number of open sockets of an owner. */
  open_sockets(owner_id: string): number {
    return this.feeds.get(owner_id)?.size ?? 0;
  }

  private async authenticate(socket: RealtimeSocket): Promise<boolean> {
    const handshake = RealtimeAuthSchema.safeParse(socket.handshake.auth);
    if (!handshake.success) return false;
    const owner = await this.auth.authenticate(handshake.data.token);
    if (owner === null) return false;
    socket.data = {
      owner_id: owner.id,
      token: handshake.data.token,
      cursor: handshake.data.cursor ?? null,
    };
    return true;
  }

  private async open(socket: RealtimeSocket): Promise<void> {
    const { owner_id, cursor } = socket.data;
    const bounds = await this.feed.bounds(owner_id);
    let start = cursor ?? bounds.head_seq;
    if (cursor !== null && !cursor_kept(bounds, cursor)) {
      this.resyncs.inc();
      socket.emit(REALTIME_MESSAGES.resync_required, {
        head_seq: bounds.head_seq,
        oldest_seq: bounds.oldest_seq ?? bounds.head_seq + 1,
      });
      start = bounds.head_seq;
    }
    if (!socket.connected) return;
    socket.emit(REALTIME_MESSAGES.hello, { head_seq: bounds.head_seq, cursor: start });
    const feed = new SocketFeed(owner_id, start, {
      read: (owner, after, limit) => this.feed.read(owner, after, limit),
      send: (events) => {
        socket.emit(REALTIME_MESSAGES.changes, events);
        this.changes_sent.inc(events.length);
      },
      connected: () => socket.connected,
    });
    const owned = this.feeds.get(owner_id) ?? new Set<SocketFeed>();
    owned.add(feed);
    this.feeds.set(owner_id, owned);
    this.sockets.set(feed, socket);
    this.connections.inc();
    socket.on('disconnect', () => {
      owned.delete(feed);
      if (owned.size === 0) this.feeds.delete(owner_id);
      this.sockets.delete(feed);
      this.connections.dec();
    });
    await feed.wake();
  }

  private wake(owner_id: string): void {
    for (const feed of this.feeds.get(owner_id) ?? []) void feed.wake();
  }

  private forward(payload: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    const notice = StreamNoticeSchema.safeParse(parsed);
    if (!notice.success) return;
    for (const feed of this.feeds.get(notice.data.owner_id) ?? []) {
      this.sockets.get(feed)?.emit(REALTIME_MESSAGES.stream, notice.data.chunk);
      this.stream_chunks.inc();
    }
  }

  /** Closes the sockets whose session ended: a logout, or its expiry. Runs every minute. */
  async check_sessions(): Promise<void> {
    for (const socket of this.sockets.values()) {
      try {
        if ((await this.auth.authenticate(socket.data.token)) === null) socket.disconnect(true);
      } catch (error: unknown) {
        this.logger.warn(
          `Session check failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
  }
}
