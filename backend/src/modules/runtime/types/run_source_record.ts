import type { RunSourceKind } from '@tbn/contracts';

/** A run source row: something a run read that taints it. */
export interface RunSourceRecord {
  id: string;
  owner_id: string;
  run_id: string;
  kind: RunSourceKind;
  reference: string;
  cached: boolean;
  read_at: Date;
}

/** Fields written when a source is recorded. */
export interface RunSourceWrite {
  run_id: string;
  kind: RunSourceKind;
  reference: string;
  cached: boolean;
}
