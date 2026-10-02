import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Session } from '@tbn/contracts';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import {
  OWNER_REPOSITORY,
  type OwnerRepository,
} from '@/modules/identity/repositories/interface/owner_repository.interface';
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from '@/modules/identity/repositories/interface/session_repository.interface';
import { PasswordService } from './password.service';

const TOKEN_PREFIX = 'tbn_';
const TOKEN_BYTES = 32;

/** Verified against when the username is unknown, so both failures take the same time. */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$1KPdd2hKLS6WXTOxQJnSK5jNeyhBXp0gzEZHoBpNkHU';

/** How long a session may go unused before `last_seen_at` is written again. */
const TOUCH_INTERVAL_MS = 60_000;

function hash_token(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Logs the owner in and out and resolves session tokens. */
@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(OWNER_REPOSITORY) private readonly owners: OwnerRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    private readonly passwords: PasswordService,
  ) {}

  /** Returns a new session when the credentials match, otherwise null. */
  async login(username: string, password: string): Promise<Session | null> {
    const owner = await this.owners.find_by_username(username);
    const matches = await this.passwords.verify(owner?.password_hash ?? DUMMY_HASH, password);
    if (owner === null || !matches) return null;

    const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`;
    const expires_at = new Date(Date.now() + this.config.auth.session_ttl_minutes * 60_000);
    await this.sessions.create(owner.id, hash_token(token), expires_at);
    return { token, expires_at: expires_at.toISOString() };
  }

  /** Forgets the session behind `token`. Unknown tokens are ignored. */
  async logout(token: string): Promise<void> {
    await this.sessions.delete_by_token_hash(hash_token(token));
  }

  /** The owner behind a live session token, or null. */
  async authenticate(token: string): Promise<AuthenticatedOwner | null> {
    if (!token.startsWith(TOKEN_PREFIX)) return null;
    const now = new Date();
    const session = await this.sessions.find_active_by_token_hash(hash_token(token), now);
    if (session === null) return null;
    if (now.getTime() - session.last_seen_at.getTime() > TOUCH_INTERVAL_MS) {
      await this.sessions.touch(session.id, now);
    }
    return { id: session.owner.id, username: session.owner.username };
  }
}
