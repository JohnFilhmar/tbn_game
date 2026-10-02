import type { EventOp } from '@tbn/contracts';

/** One row of the event log, as the trigger wrote it. */
export interface EventRecord {
  owner_id: string;
  seq: number;
  entity: string;
  entity_id: string;
  op: EventOp;
  /** The columns an update changed, or null for an insert, a delete or a change of a part. */
  changed: string[] | null;
  created_at: Date;
}

/** Where an owner's log stands: the last sequence given out and the oldest still kept. */
export interface EventBounds {
  head_seq: number;
  /** The oldest sequence kept, or null when nothing is kept. */
  oldest_seq: number | null;
}
