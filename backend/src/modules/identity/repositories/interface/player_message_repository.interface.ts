import type {
  PlayerMessageRecord,
  PlayerMessageWrite,
} from '@/modules/identity/types/player_message_record';

/** Injection token for `PlayerMessageRepository`. */
export const PLAYER_MESSAGE_REPOSITORY = Symbol('PLAYER_MESSAGE_REPOSITORY');

/** Messages between players. */
export interface PlayerMessageRepository {
  create(owner_id: string, write: PlayerMessageWrite): Promise<PlayerMessageRecord>;
  /** The newest `limit` messages a player sent or received, oldest first. */
  involving(owner_id: string, player_id: string, limit: number): Promise<PlayerMessageRecord[]>;
  /** Marks every unread message from `from_id` to `to_id` as read. Returns how many. */
  mark_read(owner_id: string, from_id: string, to_id: string, now: Date): Promise<number>;
  by_ids(owner_id: string, ids: string[]): Promise<PlayerMessageRecord[]>;
}
