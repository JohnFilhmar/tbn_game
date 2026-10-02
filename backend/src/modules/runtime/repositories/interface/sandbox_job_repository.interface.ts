import type { SandboxJobListQuery } from '@tbn/contracts';
import type { SandboxJobRecord, SandboxJobWrite } from '@/modules/runtime/types/sandbox_job_record';

/** Injection token for `SandboxJobRepository`. */
export const SANDBOX_JOB_REPOSITORY = Symbol('SANDBOX_JOB_REPOSITORY');

/** Sandbox job rows as the worker and the owner read them. The launcher claims and finishes them. */
export interface SandboxJobRepository {
  create(owner_id: string, write: SandboxJobWrite): Promise<SandboxJobRecord>;
  find(owner_id: string, id: string): Promise<SandboxJobRecord | null>;
  list(owner_id: string, query: SandboxJobListQuery): Promise<SandboxJobRecord[]>;
  /** Marks a job the launcher never reported on, after the worker stopped waiting. */
  mark_lost(owner_id: string, id: string, error: string): Promise<SandboxJobRecord | null>;
}
