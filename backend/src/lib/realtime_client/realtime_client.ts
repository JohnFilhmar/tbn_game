import {
  ChangeEventSchema,
  REALTIME_MESSAGES,
  RealtimeHelloSchema,
  ResyncRequiredSchema,
  StreamChunkSchema,
  type ChangeEvent,
  type RealtimeHello,
  type ResyncRequired,
  type StreamChunk,
} from '@tbn/contracts';
import { io, type Socket } from 'socket.io-client';

/** Where and as whom a client connects. */
export interface RealtimeClientOptions {
  /** The web process's base URL, such as `http://127.0.0.1:3000`. */
  url: string;
  /** A session token from `POST /auth/login`. */
  token: string;
  /** The last sequence already applied, or null to start from the head. */
  cursor?: number | null;
}

/** A sequence the client received out of turn. */
export interface SequenceFault {
  kind: 'gap' | 'duplicate';
  /** The sequence the client expected next. */
  expected: number;
  received: number;
}

/**
 * A scripted Socket.IO client of the event log. It connects with its cursor, applies events in
 * order, keeps every event and stream chunk it received, records any sequence that came out of
 * turn, and can drop its connection and resume from where it stopped. The phase 2 exit test and
 * the demo both drive it.
 */
export class RealtimeClient {
  /** Every event applied, in the order received. */
  readonly events: ChangeEvent[] = [];
  /** Every stream chunk received. */
  readonly chunks: StreamChunk[] = [];
  /** Every `resync_required` received. */
  readonly resyncs: ResyncRequired[] = [];
  /** Sequences that arrived out of turn. Empty when delivery had no gap and no duplicate. */
  readonly faults: SequenceFault[] = [];
  /** How many times the client connected. */
  connections = 0;
  private cursor: number | null;
  private socket: Socket | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: RealtimeClientOptions) {
    this.cursor = options.cursor ?? null;
  }

  /** The last sequence applied, or null before the first `hello`. */
  get last_seq(): number | null {
    return this.cursor;
  }

  /** True while the socket is connected. */
  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Connects, or reconnects, with the current cursor.
   *
   * @returns The server's `hello`.
   * @throws Error with the server's reason when the handshake is refused.
   */
  connect(): Promise<RealtimeHello> {
    this.disconnect();
    const socket = io(this.options.url, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      auth: { token: this.options.token, cursor: this.cursor },
    });
    this.socket = socket;
    socket.on(REALTIME_MESSAGES.changes, (payload: unknown) => this.apply(payload));
    socket.on(REALTIME_MESSAGES.stream, (payload: unknown) => {
      const chunk = StreamChunkSchema.safeParse(payload);
      if (chunk.success) this.chunks.push(chunk.data);
      this.notify();
    });
    socket.on(REALTIME_MESSAGES.resync_required, (payload: unknown) => {
      const resync = ResyncRequiredSchema.safeParse(payload);
      if (resync.success) this.resyncs.push(resync.data);
      this.notify();
    });
    socket.on('disconnect', () => this.notify());
    return new Promise<RealtimeHello>((resolve, reject) => {
      socket.once(REALTIME_MESSAGES.hello, (payload: unknown) => {
        const hello = RealtimeHelloSchema.parse(payload);
        this.cursor = hello.cursor;
        this.connections += 1;
        this.notify();
        resolve(hello);
      });
      socket.once('connect_error', (error: Error) => {
        socket.close();
        reject(new Error(error.message));
      });
    });
  }

  /** Drops the connection. Events sent meanwhile wait in the log for the next `connect`. */
  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.close();
    this.socket = null;
  }

  /**
   * Waits until `done` holds, re-checking whenever something arrives.
   *
   * @throws Error naming `what` when `timeout_ms` passes first.
   */
  until(what: string, done: () => boolean, timeout_ms = 30_000): Promise<void> {
    if (done()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const check = (): void => {
        if (!done()) return;
        clearTimeout(timer);
        this.listeners.delete(check);
        resolve();
      };
      const timer = setTimeout(() => {
        this.listeners.delete(check);
        reject(new Error(`Timed out waiting for ${what}`));
      }, timeout_ms);
      this.listeners.add(check);
    });
  }

  private apply(payload: unknown): void {
    const events = ChangeEventSchema.array().safeParse(payload);
    if (!events.success) return;
    for (const event of events.data) {
      const expected = (this.cursor ?? 0) + 1;
      if (event.seq !== expected) {
        this.faults.push({
          kind: event.seq < expected ? 'duplicate' : 'gap',
          expected,
          received: event.seq,
        });
      }
      if (event.seq < expected) continue;
      this.events.push(event);
      this.cursor = event.seq;
    }
    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
