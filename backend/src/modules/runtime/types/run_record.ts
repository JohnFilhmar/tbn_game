import type { RunStatus, TranscriptEntryWrite } from '@tbn/contracts';

/** A run row. */
export interface RunRecord {
  id: string;
  owner_id: string;
  agent_id: string;
  task_id: string | null;
  status: RunStatus;
  turn_count: number;
  lease_owner: string | null;
  lease_expires_at: Date | null;
  error: string | null;
  started_at: Date;
  finished_at: Date | null;
  updated_at: Date;
}

/** A transcript entry row. `content` is JSON, parsed with the contract schema when read. */
export interface TranscriptEntryRecord {
  id: string;
  owner_id: string;
  agent_id: string;
  run_id: string | null;
  seq: number;
  kind: TranscriptEntryWrite['kind'];
  content: unknown;
  created_at: Date;
}
