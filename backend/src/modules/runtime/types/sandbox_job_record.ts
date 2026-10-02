import type { SandboxJobKind, SandboxJobSpec, SandboxJobStatus } from '@tbn/contracts';

/** A sandbox job row. `spec` is JSON, parsed with the contract schema when read. */
export interface SandboxJobRecord {
  id: string;
  owner_id: string;
  run_id: string | null;
  agent_id: string | null;
  kind: SandboxJobKind;
  status: SandboxJobStatus;
  spec: unknown;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  updated_at: Date;
}

/** Fields written when a job is created. */
export interface SandboxJobWrite {
  run_id: string | null;
  agent_id: string | null;
  kind: SandboxJobKind;
  spec: SandboxJobSpec;
}
