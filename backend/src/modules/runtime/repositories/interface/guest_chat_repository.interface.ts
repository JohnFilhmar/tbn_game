import type { GuestChatRecord, GuestChatWrite } from '@/modules/runtime/types/guest_chat_record';

/** Injection token for `GuestChatRepository`. */
export const GUEST_CHAT_REPOSITORY = Symbol('GUEST_CHAT_REPOSITORY');

/** Guests' conversations with agents' personas. */
export interface GuestChatRepository {
  create(owner_id: string, write: GuestChatWrite): Promise<GuestChatRecord>;
  /**
   * The newest `limit` lines with an agent, oldest first: one guest's when `guest_id` is given,
   * every guest's otherwise.
   */
  recent(
    owner_id: string,
    agent_id: string,
    guest_id: string | null,
    limit: number,
  ): Promise<GuestChatRecord[]>;
  by_ids(owner_id: string, ids: string[]): Promise<GuestChatRecord[]>;
}
