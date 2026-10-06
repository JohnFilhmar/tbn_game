import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedGuest } from '@/lib/auth/authenticated_owner';
import {
  GUEST_REPOSITORY,
  type GuestRepository,
} from '@/modules/identity/repositories/interface/guest_repository.interface';

/** The cookie that carries a guest's session token. */
export const GUEST_COOKIE = 'tbn_guest';

/** Prefix of an invite token, the secret part of an invite link. */
export const INVITE_TOKEN_PREFIX = 'tbi_';

const SESSION_TOKEN_PREFIX = 'tbg_';
const TOKEN_BYTES = 32;

/** How long a guest stays signed in after following a link. */
export const GUEST_SESSION_MS = 30 * 24 * 60 * 60_000;

/** How long a guest may go unseen before `last_seen_at` is written again. */
const TOUCH_INTERVAL_MS = 60_000;

/**
 * How long a checked session is trusted without asking the database. The gate checks every request
 * a guest's browser makes, assets included.
 * ponytail: a per-process cache, so a revoked guest keeps access for up to this long on another web
 * process; revoking clears it on this one.
 */
const CACHE_MS = 15_000;

/** The sha256 of a token, which is all the database keeps. */
export function hash_token(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A new random token with `prefix`. */
export function new_token(prefix: string): string {
  return `${prefix}${randomBytes(TOKEN_BYTES).toString('base64url')}`;
}

interface CachedGuest {
  guest: AuthenticatedGuest;
  until: number;
}

/** A session a redeemed invite opened. */
export interface OpenedGuestSession {
  token: string;
  expires_at: Date;
}

/** Turns invite links into guest sessions and resolves the `tbn_guest` cookie. */
@Injectable()
export class GuestSessionService {
  private readonly cache = new Map<string, CachedGuest>();

  constructor(@Inject(GUEST_REPOSITORY) private readonly guests: GuestRepository) {}

  /** Opens a session from an invite token, or null when the link no longer works. */
  async redeem(invite_token: string): Promise<OpenedGuestSession | null> {
    if (!invite_token.startsWith(INVITE_TOKEN_PREFIX)) return null;
    const now = new Date();
    const token = new_token(SESSION_TOKEN_PREFIX);
    const expires_at = new Date(now.getTime() + GUEST_SESSION_MS);
    const guest = await this.guests.redeem_invite(hash_token(invite_token), now, {
      token_hash: hash_token(token),
      expires_at,
    });
    return guest === null ? null : { token, expires_at };
  }

  /** The guest behind a session token, or null when it expired or the guest was revoked. */
  async authenticate(token: string): Promise<AuthenticatedGuest | null> {
    if (!token.startsWith(SESSION_TOKEN_PREFIX)) return null;
    const token_hash = hash_token(token);
    const now = Date.now();
    const cached = this.cache.get(token_hash);
    if (cached !== undefined && cached.until > now) return cached.guest;
    const session = await this.guests.find_session(token_hash, new Date(now));
    if (session === null) {
      this.cache.delete(token_hash);
      return null;
    }
    const seen = session.guest.last_seen_at?.getTime() ?? 0;
    if (now - seen > TOUCH_INTERVAL_MS) await this.guests.touch_guest(session.guest.id, new Date());
    const guest: AuthenticatedGuest = {
      id: session.guest.id,
      owner_id: session.guest.owner_id,
      name: session.guest.name,
      owner_username: session.owner_username,
    };
    this.cache.set(token_hash, { guest, until: now + CACHE_MS });
    return guest;
  }

  /** Drops what this process remembers of a guest, after a rename or a revocation. */
  forget(guest_id: string): void {
    for (const [token_hash, cached] of this.cache) {
      if (cached.guest.id === guest_id) this.cache.delete(token_hash);
    }
  }
}
