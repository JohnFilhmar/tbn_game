import type { SessionRecord } from '@/modules/identity/types/owner_record';

/** Injection token for `SessionRepository`. */
export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');

/** Session rows. Tokens are stored only as hashes. */
export interface SessionRepository {
  create(owner_id: string, token_hash: string, expires_at: Date): Promise<SessionRecord>;
  find_active_by_token_hash(token_hash: string, now: Date): Promise<SessionRecord | null>;
  touch(id: string, now: Date): Promise<void>;
  delete_by_token_hash(token_hash: string): Promise<void>;
  delete_expired(now: Date): Promise<number>;
}
