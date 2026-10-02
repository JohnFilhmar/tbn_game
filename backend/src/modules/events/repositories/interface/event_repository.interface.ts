import type { EventBounds, EventRecord } from '@/modules/events/types/event_record';

/** Injection token for `EventRepository`. */
export const EVENT_REPOSITORY = Symbol('EVENT_REPOSITORY');

/** The event log, read by owner. Only the database trigger writes it. */
export interface EventRepository {
  /** Events after `after_seq`, oldest first, at most `limit`. */
  list_after(owner_id: string, after_seq: number, limit: number): Promise<EventRecord[]>;
  /** The head and the oldest kept sequence of an owner's log. */
  bounds(owner_id: string): Promise<EventBounds>;
  /** Deletes every owner's events created before `before`, and returns how many. */
  prune(before: Date): Promise<number>;
}
