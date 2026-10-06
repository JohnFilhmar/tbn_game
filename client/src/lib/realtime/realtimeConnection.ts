import {
  ChangeEventSchema,
  PlayerGoneSchema,
  PlayerSchema,
  REALTIME_MESSAGES,
  RealtimeHelloSchema,
  ResyncRequiredSchema,
  SoundCueSchema,
  StreamChunkSchema,
  type ChangeEvent,
  type Player,
  type PlayerPose,
  type ResyncRequired,
  type SoundCue,
  type StreamChunk,
} from '@tbn/contracts';
import { io } from 'socket.io-client';

/** How the live connection is doing, for the status light in the desktop's bar. */
export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

/** What the connection hands to the rest of the client. */
export interface RealtimeHandlers {
  /** Changes not seen before, in order. */
  onChanges: (events: ChangeEvent[]) => void;
  onStream: (chunk: StreamChunk) => void;
  /** The log can no longer fill the gap since the cursor; reload every loaded query. */
  onResync: (resync: ResyncRequired) => void;
  onStatus: (status: ConnectionStatus) => void;
  /** The server refused the token. */
  onUnauthorized: () => void;
  /** Everyone already in the world, on each connect. */
  onPlayers: (players: Player[]) => void;
  /** A player moved, came online or went offline. */
  onPlayer: (player: Player) => void;
  /** A player who left long enough ago is gone. */
  onPlayerGone: (id: string) => void;
  /** Another player made a sound. */
  onCue: (cue: SoundCue) => void;
}

/** A live connection to the gateway. */
export interface RealtimeConnection {
  close: () => void;
  /** Sends this player's pose; dropped while disconnected. */
  sendPresence: (pose: PlayerPose) => void;
  /** Sends a sound this player made; dropped while disconnected. */
  sendCue: (cue: SoundCue) => void;
}

const ChangesSchema = ChangeEventSchema.array();

/**
 * Connects to the gateway with the owner's session token, or with none for a guest, whose cookie
 * signs them in, and keeps the last sequence applied, so every reconnect, automatic or not, resumes
 * exactly after it. A change at or before the cursor is a repeat and is dropped.
 */
export function connectRealtime(options: {
  baseUrl: string;
  token: string | null;
  handlers: RealtimeHandlers;
}): RealtimeConnection {
  const { handlers } = options;
  let cursor: number | null = null;
  let closed = false;
  const socket = io(options.baseUrl.length > 0 ? options.baseUrl : window.location.origin, {
    path: '/socket.io',
    transports: ['websocket'],
    reconnectionDelayMax: 10_000,
    auth: (callback) =>
      callback(options.token === null ? { cursor } : { token: options.token, cursor }),
  });
  handlers.onStatus('connecting');

  socket.on(REALTIME_MESSAGES.hello, (payload: unknown) => {
    const hello = RealtimeHelloSchema.safeParse(payload);
    if (!hello.success) return;
    cursor = hello.data.cursor;
    handlers.onStatus('live');
  });
  socket.on(REALTIME_MESSAGES.changes, (payload: unknown) => {
    const parsed = ChangesSchema.safeParse(payload);
    if (!parsed.success) return;
    const fresh = parsed.data.filter((event) => cursor === null || event.seq > cursor);
    const last = fresh.at(-1);
    if (last === undefined) return;
    cursor = last.seq;
    handlers.onChanges(fresh);
  });
  socket.on(REALTIME_MESSAGES.stream, (payload: unknown) => {
    const chunk = StreamChunkSchema.safeParse(payload);
    if (chunk.success) handlers.onStream(chunk.data);
  });
  socket.on(REALTIME_MESSAGES.resync_required, (payload: unknown) => {
    const resync = ResyncRequiredSchema.safeParse(payload);
    if (resync.success) handlers.onResync(resync.data);
  });
  socket.on(REALTIME_MESSAGES.players, (payload: unknown) => {
    const players = PlayerSchema.array().safeParse(payload);
    if (players.success) handlers.onPlayers(players.data);
  });
  socket.on(REALTIME_MESSAGES.player, (payload: unknown) => {
    const player = PlayerSchema.safeParse(payload);
    if (player.success) handlers.onPlayer(player.data);
  });
  socket.on(REALTIME_MESSAGES.player_gone, (payload: unknown) => {
    const gone = PlayerGoneSchema.safeParse(payload);
    if (gone.success) handlers.onPlayerGone(gone.data.id);
  });
  socket.on(REALTIME_MESSAGES.cue, (payload: unknown) => {
    const cue = SoundCueSchema.safeParse(payload);
    if (cue.success) handlers.onCue(cue.data);
  });
  socket.on('connect_error', (error: Error) => {
    if (closed) return;
    if (error.message === 'unauthorized') {
      closed = true;
      socket.close();
      handlers.onStatus('offline');
      handlers.onUnauthorized();
      return;
    }
    handlers.onStatus('reconnecting');
  });
  socket.on('disconnect', (reason: string) => {
    if (closed) return;
    handlers.onStatus('reconnecting');
    // The server closes a socket whose session ended; reconnecting finds out which it was.
    if (reason === 'io server disconnect') socket.connect();
  });

  return {
    close: () => {
      closed = true;
      socket.removeAllListeners();
      socket.close();
      handlers.onStatus('offline');
    },
    sendPresence: (pose) => {
      if (socket.connected) socket.volatile.emit(REALTIME_MESSAGES.presence, pose);
    },
    sendCue: (cue) => {
      if (socket.connected) socket.volatile.emit(REALTIME_MESSAGES.cue, cue);
    },
  };
}
