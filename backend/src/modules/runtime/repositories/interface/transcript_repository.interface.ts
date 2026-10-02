import type { TranscriptEntryWrite, TranscriptQuery } from '@tbn/contracts';
import type { TranscriptEntryRecord } from '@/modules/runtime/types/run_record';

/** Injection token for `TranscriptRepository`. */
export const TRANSCRIPT_REPOSITORY = Symbol('TRANSCRIPT_REPOSITORY');

/** Transcript rows, scoped by owner. `seq` increases by one per agent without gaps. */
export interface TranscriptRepository {
  append(
    owner_id: string,
    agent_id: string,
    run_id: string | null,
    entry: TranscriptEntryWrite,
  ): Promise<TranscriptEntryRecord>;
  list(
    owner_id: string,
    agent_id: string,
    query: TranscriptQuery,
  ): Promise<TranscriptEntryRecord[]>;
  /** Every entry of the agent in order. The run loop rebuilds its request from this. */
  list_all(owner_id: string, agent_id: string): Promise<TranscriptEntryRecord[]>;
  /** True when an owner message came after the agent's last answer. */
  has_unanswered_owner_message(owner_id: string, agent_id: string): Promise<boolean>;
}
