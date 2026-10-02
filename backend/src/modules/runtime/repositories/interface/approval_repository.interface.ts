import type { ApprovalKind, ApprovalListQuery, ApprovalStatus } from '@tbn/contracts';
import type { ApprovalRecord, ApprovalWrite } from '@/modules/runtime/types/approval_record';

/** Injection token for `ApprovalRepository`. */
export const APPROVAL_REPOSITORY = Symbol('APPROVAL_REPOSITORY');

/** Approval rows, scoped by owner. */
export interface ApprovalRepository {
  list(owner_id: string, query: ApprovalListQuery): Promise<ApprovalRecord[]>;
  find(owner_id: string, id: string): Promise<ApprovalRecord | null>;
  /** The newest approval of one tool call of a run, whatever its status. */
  latest_for_call(
    owner_id: string,
    run_id: string,
    tool_use_id: string,
  ): Promise<ApprovalRecord | null>;
  /** The pending approvals of a run, oldest first, of one kind or any. */
  pending_for_run(owner_id: string, run_id: string, kind?: ApprovalKind): Promise<ApprovalRecord[]>;
  create(owner_id: string, write: ApprovalWrite): Promise<ApprovalRecord>;
  /** Decides a pending approval. Null when it was not pending. */
  decide(
    owner_id: string,
    id: string,
    status: Exclude<ApprovalStatus, 'pending'>,
    note: string | null,
  ): Promise<ApprovalRecord | null>;
}
