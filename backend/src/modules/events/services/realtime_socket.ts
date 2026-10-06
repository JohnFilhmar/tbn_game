import {
  RealtimeAuthSchema,
  type ChangeEvent,
  type Player,
  type PlayerPose,
  type RealtimeHello,
  type ResyncRequired,
  type StreamChunk,
} from '@tbn/contracts';
import type { Socket } from 'socket.io';
import { read_cookie } from '@/lib/http/cookies';
import type { AuthService } from '@/modules/identity/services/auth.service';
import {
  GUEST_COOKIE,
  type GuestSessionService,
} from '@/modules/identity/services/guest_session.service';

/** What a guest is called in the world before they pick a name. */
export const UNNAMED_GUEST = 'Guest';

/** The messages the gateway sends. */
export interface ServerToClient {
  hello: (hello: RealtimeHello) => void;
  changes: (events: ChangeEvent[]) => void;
  stream: (chunk: StreamChunk) => void;
  resync_required: (resync: ResyncRequired) => void;
  players: (players: Player[]) => void;
  player: (player: Player) => void;
  player_gone: (gone: { id: string }) => void;
}

/** The messages a client sends. */
export interface ClientToServer {
  presence: (pose: PlayerPose) => void;
}

/** What the gateway keeps on each socket. */
export interface SocketData {
  owner_id: string;
  /** The owner's session token, or null for a guest. */
  token: string | null;
  /** A guest's session token from the cookie, or null for the owner. */
  guest_token: string | null;
  player: { id: string; kind: Player['kind']; name: string };
  cursor: number | null;
  last_pose_at: number;
}

/** A socket of the gateway. */
export type RealtimeSocket = Socket<
  ClientToServer,
  ServerToClient,
  Record<never, never>,
  SocketData
>;

/** The services a socket's session is checked against. */
export interface SessionCheckers {
  auth: AuthService;
  guest_sessions: GuestSessionService;
}

/**
 * The data of a socket whose handshake carries a live owner token, or no token and a live guest
 * cookie; null otherwise.
 */
export async function authenticate_handshake(
  auth: unknown,
  cookie_header: string | undefined,
  checkers: SessionCheckers,
): Promise<SocketData | null> {
  const handshake = RealtimeAuthSchema.safeParse(auth);
  if (!handshake.success) return null;
  const cursor = handshake.data.cursor ?? null;
  const token = handshake.data.token;
  if (token !== undefined) {
    const owner = await checkers.auth.authenticate(token);
    if (owner === null) return null;
    return {
      owner_id: owner.id,
      token,
      guest_token: null,
      player: { id: owner.id, kind: 'owner', name: owner.username },
      cursor,
      last_pose_at: 0,
    };
  }
  const guest_token = read_cookie(cookie_header, GUEST_COOKIE);
  const guest =
    guest_token === null ? null : await checkers.guest_sessions.authenticate(guest_token);
  if (guest === null) return null;
  return {
    owner_id: guest.owner_id,
    token: null,
    guest_token,
    player: { id: guest.id, kind: 'guest', name: guest.name ?? UNNAMED_GUEST },
    cursor,
    last_pose_at: 0,
  };
}

/** Whether a socket's session is still live: a logout, an expiry or a revocation ends it. */
export async function is_session_alive(
  data: SocketData,
  checkers: SessionCheckers,
): Promise<boolean> {
  if (data.token !== null) return (await checkers.auth.authenticate(data.token)) !== null;
  return (
    data.guest_token !== null &&
    (await checkers.guest_sessions.authenticate(data.guest_token)) !== null
  );
}
