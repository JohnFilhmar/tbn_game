import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RunSourceSchema, type Approval, type ApprovalListQuery } from '@tbn/contracts';
import { z } from 'zod';
import type { TaskRecord } from '@/modules/company/types/company_records';
import {
  APPROVAL_REPOSITORY,
  type ApprovalRepository,
} from '@/modules/runtime/repositories/interface/approval_repository.interface';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import { RunSourceService } from '@/modules/runtime/services/taint/run_source.service';
import type { ToolContext } from '@/modules/runtime/tools/tool.interface';
import type { ApprovalRecord } from '@/modules/runtime/types/approval_record';
import type { ToolUseBlock } from '@/modules/runtime/types/model_request';
import type { RunRecord } from '@/modules/runtime/types/run_record';
import { RunControlService } from './run_control.service';
import { NotificationService } from '@/modules/integrations/services/notification.service';
import { AgentService } from '@/modules/company/services/agent.service';

const SourcesSchema = z.array(RunSourceSchema.pick({ kind: true, reference: true, cached: true }));

/** Maps an approval row to the API shape. */
export function to_approval_view(record: ApprovalRecord): Approval {
  const sources = SourcesSchema.safeParse(record.sources);
  const payload = z.json().safeParse(record.payload);
  return {
    id: record.id,
    run_id: record.run_id,
    agent_id: record.agent_id,
    task_id: record.task_id,
    kind: record.kind,
    tool_name: record.tool_name,
    tool_use_id: record.tool_use_id,
    payload: payload.success ? payload.data : null,
    preview: record.preview,
    sources: sources.success ? sources.data : [],
    status: record.status,
    note: record.note,
    created_at: record.created_at.toISOString(),
    decided_at: record.decided_at?.toISOString() ?? null,
  };
}

/** The owner's answer to one tool call, as the executor reads it. */
export type CallDecision =
  { status: 'approved' | 'denied'; note: string | null } | 'pending' | null;

/**
 * The approval inbox: tool calls the owner must allow, and the runaway guard's question. A run
 * with a pending approval is paused; the decision records the owner's note, and for a tool call
 * the executor reads the decision when the run resumes.
 */
@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    @Inject(APPROVAL_REPOSITORY) private readonly approvals: ApprovalRepository,
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    private readonly sources: RunSourceService,
    private readonly control: RunControlService,
    private readonly notifications: NotificationService,
    private readonly agents: AgentService,
  ) {}

  async list(owner_id: string, query: ApprovalListQuery): Promise<Approval[]> {
    return (await this.approvals.list(owner_id, query)).map(to_approval_view);
  }

  async get(owner_id: string, id: string): Promise<Approval> {
    return to_approval_view(await this.require(owner_id, id));
  }

  /** Asks the owner about a tool call, once per call: a pending request is not repeated. */
  async request_for_call(
    context: ToolContext,
    call: ToolUseBlock,
    preview: string | null,
  ): Promise<ApprovalRecord> {
    const existing = await this.approvals.latest_for_call(
      context.owner_id,
      context.run_id,
      call.id,
    );
    if (existing?.status === 'pending') return existing;
    const sources = await this.sources.list(context.owner_id, context.run_id);
    const created = await this.approvals.create(context.owner_id, {
      run_id: context.run_id,
      agent_id: context.agent_id,
      task_id: context.task_id,
      kind: 'tool_call',
      tool_name: call.name,
      tool_use_id: call.id,
      payload: call.input,
      preview,
      sources: sources.map((source) => ({
        kind: source.kind,
        reference: source.reference,
        cached: source.cached,
      })),
    });
    this.logger.log(
      `Approval ${created.id} waits for the owner: ${call.name} in run ${context.run_id}`,
    );
    await this.notifications.emit(context.owner_id, {
      event_type: 'approval_waiting',
      title: `${context.agent.name} asks to call ${call.name}`,
      message: `${context.agent.name} wants to call ${call.name}. Approve or deny it in the inbox.`,
      priority: 'high',
      values: { agent_name: context.agent.name, tool_name: call.name, approval_id: created.id },
    });
    return created;
  }

  /** Asks the owner whether a looping run goes on, once per pause. */
  async request_for_guard(run: RunRecord, task: TaskRecord | null): Promise<ApprovalRecord> {
    const pending = await this.approvals.pending_for_run(run.owner_id, run.id, 'runaway_guard');
    if (pending[0] !== undefined) return pending[0];
    // The loop counts turns on its copy of the run; the row has the count it stored.
    const guard_turns =
      (await this.runs.find(run.owner_id, run.id))?.guard_turns ?? run.guard_turns;
    const created = await this.approvals.create(run.owner_id, {
      run_id: run.id,
      agent_id: run.agent_id,
      task_id: task?.id ?? null,
      kind: 'runaway_guard',
      tool_name: null,
      tool_use_id: null,
      payload: { guard_turns, task_title: task?.title ?? null },
      preview: null,
      sources: [],
    });
    const agent = await this.agents.require(run.owner_id, run.agent_id);
    await this.notifications.emit(run.owner_id, {
      event_type: 'approval_waiting',
      title: `${agent.name} hit the runaway guard`,
      message: `${agent.name} took ${guard_turns} turns without its task changing status. Continue or stop it in the inbox.`,
      priority: 'high',
      values: { agent_name: agent.name, tool_name: 'runaway_guard', approval_id: created.id },
    });
    return created;
  }

  /** The owner's decision on a call, `pending` while it waits, null when it was never asked. */
  async decision_for_call(
    owner_id: string,
    run_id: string,
    tool_use_id: string,
  ): Promise<CallDecision> {
    const latest = await this.approvals.latest_for_call(owner_id, run_id, tool_use_id);
    if (latest === null) return null;
    if (latest.status === 'pending') return 'pending';
    return { status: latest.status, note: latest.note };
  }

  /** True while the run has an approval the owner has not decided. */
  async has_pending(owner_id: string, run_id: string): Promise<boolean> {
    return (await this.approvals.pending_for_run(owner_id, run_id)).length > 0;
  }

  /** Approves: a tool call runs when the run resumes; a guarded run goes on. */
  async approve(owner_id: string, id: string, note: string | null): Promise<Approval> {
    const decided = await this.decide(owner_id, id, 'approved', note);
    const run = await this.require_run(decided);
    if (decided.kind === 'runaway_guard') {
      await this.control.continue_after_guard(run);
    } else if (!(await this.has_pending(owner_id, run.id))) {
      await this.control.wake_after_approvals(run);
    }
    return to_approval_view(decided);
  }

  /** Denies: the model reads the denial when the run resumes; a guarded run stops. */
  async deny(owner_id: string, id: string, note: string | null): Promise<Approval> {
    const decided = await this.decide(owner_id, id, 'denied', note);
    const run = await this.require_run(decided);
    if (decided.kind === 'runaway_guard') {
      await this.control.stop(run);
    } else if (!(await this.has_pending(owner_id, run.id))) {
      await this.control.wake_after_approvals(run);
    }
    return to_approval_view(decided);
  }

  /** `POST /runs/:id/continue`: approves the guard's pending question for the run. */
  async continue_run(run: RunRecord): Promise<void> {
    const [pending] = await this.approvals.pending_for_run(run.owner_id, run.id, 'runaway_guard');
    if (pending !== undefined)
      await this.approvals.decide(run.owner_id, pending.id, 'approved', null);
    await this.control.continue_after_guard(run);
  }

  /** `POST /runs/:id/stop`: denies whatever the run was waiting for and stops it. */
  async stop_run(run: RunRecord): Promise<void> {
    for (const pending of await this.approvals.pending_for_run(run.owner_id, run.id)) {
      await this.approvals.decide(run.owner_id, pending.id, 'denied', 'The owner stopped the run');
    }
    await this.control.stop(run);
  }

  private async decide(
    owner_id: string,
    id: string,
    status: 'approved' | 'denied',
    note: string | null,
  ): Promise<ApprovalRecord> {
    await this.require(owner_id, id);
    const decided = await this.approvals.decide(owner_id, id, status, note);
    if (decided === null) throw new ConflictException('The approval is already decided');
    return decided;
  }

  private async require(owner_id: string, id: string): Promise<ApprovalRecord> {
    const record = await this.approvals.find(owner_id, id);
    if (record === null) throw new NotFoundException('Approval not found');
    return record;
  }

  private async require_run(approval: ApprovalRecord): Promise<RunRecord> {
    const run = await this.runs.find(approval.owner_id, approval.run_id);
    if (run === null) throw new NotFoundException('The run of the approval is gone');
    return run;
  }
}
