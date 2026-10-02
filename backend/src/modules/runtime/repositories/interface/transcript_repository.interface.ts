import type { TranscriptEntryWrite, TranscriptQuery } from '@tbn/contracts';
import type { TranscriptEntryRecord } from '@/modules/runtime/types/run_record';

/** Injection token for `TranscriptRepository`. */
export const TRANSCRIPT_REPOSITORY = Symbol('TRANSCRIPT_REPOSITORY');

/** Entry kinds that bring something new for the agent to read: messages and subtask results. */
export const INBOUND_KINDS: ReadonlyArray<TranscriptEntryWrite['kind']> = [
  'owner_message',
  'agent_message',
  'subtask_result',
];

/** Transcript rows, scoped by owner. `seq` increases by one per agent without gaps. */
export interface TranscriptRepository {
  /**
   * Appends an entry. With a `dedupe_key`, an entry already stored under that key for the agent
   * is returned instead, so a delivery that two workers race to make lands once.
   */
  append(
    owner_id: string,
    agent_id: string,
    run_id: string | null,
    entry: TranscriptEntryWrite,
    dedupe_key?: string,
  ): Promise<TranscriptEntryRecord>;
  list(
    owner_id: string,
    agent_id: string,
    query: TranscriptQuery,
  ): Promise<TranscriptEntryRecord[]>;
  /** Every entry of the agent in order. The run loop rebuilds its request from this. */
  list_all(owner_id: string, agent_id: string): Promise<TranscriptEntryRecord[]>;
  /** The entries with these ids, oldest first. Ids of another owner are left out. */
  list_by_ids(owner_id: string, ids: string[]): Promise<TranscriptEntryRecord[]>;
  /** True when a message or a subtask result came after the agent's last answer. */
  has_unread(owner_id: string, agent_id: string): Promise<boolean>;
}
