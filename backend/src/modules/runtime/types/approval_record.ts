import type { ApprovalKind, ApprovalStatus, RunSourceKind } from '@tbn/contracts';

/** A source as an approval snapshots it: what the run had read when it asked. */
export interface ApprovalSource {
  kind: RunSourceKind;
  reference: string;
  cached: boolean;
}

/** An approval row. `payload` and `sources` are JSON columns, parsed when mapped. */
export interface ApprovalRecord {
  id: string;
  owner_id: string;
  run_id: string;
  agent_id: string;
  task_id: string | null;
  kind: ApprovalKind;
  tool_name: string | null;
  tool_use_id: string | null;
  payload: unknown;
  preview: string | null;
  sources: unknown;
  status: ApprovalStatus;
  note: string | null;
  created_at: Date;
  decided_at: Date | null;
}

/** Fields written when an approval is requested. */
export interface ApprovalWrite {
  run_id: string;
  agent_id: string;
  task_id: string | null;
  kind: ApprovalKind;
  tool_name: string | null;
  tool_use_id: string | null;
  payload: Record<string, unknown>;
  preview: string | null;
  sources: ApprovalSource[];
}
