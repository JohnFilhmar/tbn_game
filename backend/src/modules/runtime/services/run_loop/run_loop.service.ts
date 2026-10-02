import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { OPEN_TASK_STATUSES } from '@tbn/contracts';
import { QueueService } from '@/lib/queue/queue.service';
import { AgentService, is_live } from '@/modules/company/services/agent.service';
import { TaskService } from '@/modules/company/services/task.service';
import type { TaskRecord } from '@/modules/company/types/company_records';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import {
  TRANSCRIPT_REPOSITORY,
  type TranscriptRepository,
} from '@/modules/runtime/repositories/interface/transcript_repository.interface';
import {
  last_assistant_text,
  pending_tool_calls,
} from '@/modules/runtime/services/transcript/transcript_messages';
import type { FinishedTask } from '@/modules/runtime/tools/tool.interface';
import type { RunRecord, TranscriptEntryRecord } from '@/modules/runtime/types/run_record';
import { RunGateService } from './run_gate.service';
import { RunLeaseService } from './run_lease.service';
import { SubtaskDeliveryService } from './subtask_delivery.service';
import { TaskCompletionService } from './task_completion.service';
import { TurnService } from './turn.service';

const NUDGE_TEXT = 'The task is still open. Call finish_task with the report when it is complete.';
const CONTINUE_TEXT = 'Your reply was cut off at the output limit. Continue where you stopped.';

type Outcome = 'finished' | 'stopped' | 'lost' | 'paused';

function is_open(task: TaskRecord): boolean {
  return OPEN_TASK_STATUSES.includes(task.status);
}

/**
 * The tool-use loop of one run. The transcript is the checkpoint: every model turn and every tool
 * result is written before the loop goes on, and a worker that picks the run up later continues
 * from the last entry. The loop holds a lease on the run and extends it while a turn is in flight,
 * so no two wake handlers, in one process or in several, drive the same run. A run that cannot go
 * on pauses instead of failing: while it waits for its subtasks, behind a cap window at its limit,
 * an open breaker or a key out of credit, or for the owner after the runaway guard.
 */
@Injectable()
export class RunLoopService {
  private readonly logger = new Logger(RunLoopService.name);

  constructor(
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(TRANSCRIPT_REPOSITORY) private readonly transcripts: TranscriptRepository,
    private readonly agents: AgentService,
    private readonly tasks: TaskService,
    private readonly queue: QueueService,
    private readonly lease: RunLeaseService,
    private readonly turns: TurnService,
    private readonly gate: RunGateService,
    private readonly completion: TaskCompletionService,
    private readonly deliveries: SubtaskDeliveryService,
  ) {}

  /** Drives a running run until it finishes, pauses, or the worker stops. */
  async execute(owner_id: string, run_id: string): Promise<void> {
    const run = await this.runs.acquire_lease(
      owner_id,
      run_id,
      this.lease.worker_id,
      this.lease.until(),
    );
    if (run === null) return;
    this.logger.log(`Run ${run.id} started on ${this.lease.worker_id} (agent ${run.agent_id})`);
    await this.drive_held(run);
  }

  /**
   * Resumes a paused run and drives it.
   *
   * @param reset_guard - True when the run's task changed status while it was paused.
   */
  async resume(owner_id: string, run_id: string, reset_guard: boolean): Promise<void> {
    const run = await this.runs.resume(
      owner_id,
      run_id,
      this.lease.worker_id,
      this.lease.until(),
      reset_guard,
    );
    if (run === null) return;
    this.logger.log(`Run ${run.id} resumed on ${this.lease.worker_id}`);
    await this.drive_held(run);
  }

  private async drive_held(run: RunRecord): Promise<void> {
    let current: RunRecord | null = run;
    try {
      while (current !== null) {
        const outcome = await this.drive(current);
        this.logger.log(`Run ${current.id} ${outcome}`);
        current = outcome === 'paused' ? await this.resume_if_unread(current) : null;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Run ${run.id} failed: ${message}`);
      await this.finish(run, 'failed', message);
    } finally {
      await this.runs.release_lease(run.owner_id, run.id, this.lease.worker_id);
    }
  }

  /**
   * A run that paused to wait for its subtasks checks once more for an entry that arrived while it
   * paused. A wake that delivers one later finds the run paused with no lease and resumes it.
   */
  private async resume_if_unread(run: RunRecord): Promise<RunRecord | null> {
    const fresh = await this.runs.find(run.owner_id, run.id);
    if (fresh?.status !== 'paused' || fresh.pause_reason !== 'waiting_on_subtasks') return null;
    if (!(await this.transcripts.has_unread(run.owner_id, run.agent_id))) return null;
    return this.runs.resume(run.owner_id, run.id, this.lease.worker_id, this.lease.until(), false);
  }

  private async drive(run: RunRecord): Promise<Outcome> {
    let guard_turns = run.guard_turns;
    for (;;) {
      if (this.queue.stopping) {
        await this.queue.send_agent_wake({ owner_id: run.owner_id, agent_id: run.agent_id }, 1);
        return 'stopped';
      }
      const agent = await this.agents.require(run.owner_id, run.agent_id);
      if (!is_live(agent.status)) {
        if (run.task_id !== null) {
          const held = await this.tasks.require(run.owner_id, run.task_id);
          if (is_open(held)) await this.cancel_task(held);
        }
        await this.finish(run, 'cancelled', `Agent was ${agent.status}`);
        return 'finished';
      }
      const task = await this.current_task(run);
      if (task !== null && !is_open(task)) {
        await this.finish(run, 'cancelled', `Task is ${task.status}`);
        return 'finished';
      }
      const entries = await this.transcripts.list_all(run.owner_id, run.agent_id);

      const pending = pending_tool_calls(entries);
      if (pending.length > 0) {
        const finished = await this.turns.run_tools(run, agent, pending);
        if (finished !== null && task !== null) {
          await this.completion.complete(run, agent, task, finished);
          await this.finish(run, 'done', null);
          return 'finished';
        }
        continue;
      }

      const last = entries[entries.length - 1];
      if (last !== undefined && last.kind === 'assistant') {
        if (task === null) {
          await this.finish(run, 'done', null);
          return 'finished';
        }
        if ((await this.deliveries.deliver(agent)) > 0) continue;
        const open_children = await this.tasks.open_children(run.owner_id, task.id);
        if (open_children.length > 0) {
          await this.gate.pause(run, task, {
            reason: 'waiting_on_subtasks',
            resume_at: null,
            status_reason: `Waiting for ${open_children.length} subtask${open_children.length === 1 ? '' : 's'}.`,
          });
          return 'paused';
        }
        if (this.was_nudged(entries)) {
          await this.completion.complete(run, agent, task, this.fallback_report(entries));
          await this.finish(run, 'done', null);
          return 'finished';
        }
        await this.note(run, NUDGE_TEXT);
        continue;
      }

      const decision = await this.gate.check({ ...run, guard_turns }, agent);
      if (decision !== null) {
        await this.gate.pause(run, task, decision);
        return 'paused';
      }
      if (task !== null) await this.gate.mark_in_progress(task);
      const result = await this.turns.call_model(run, agent, entries);
      if (result === 'lost') return 'lost';
      if ('pause' in result) {
        await this.gate.pause(run, task, result.pause);
        return 'paused';
      }
      guard_turns = (await this.runs.increment_turn(run.owner_id, run.id)).guard_turns;
      if (result.response.stop_reason === 'max_tokens') await this.note(run, CONTINUE_TEXT);
    }
  }

  /** Ends the run, frees its agent, and wakes the agent and the task's delegator. */
  private async finish(
    run: RunRecord,
    status: 'done' | 'failed' | 'cancelled',
    error: string | null,
  ): Promise<void> {
    if (status === 'failed' && run.task_id !== null) {
      await this.tasks.fail(run.owner_id, run.task_id, error ?? 'Run failed');
    }
    await this.runs.finish(run.owner_id, run.id, status, error);
    await this.agents.release_run(run.owner_id, run.agent_id, run.id);
    await this.queue.send_agent_wake({ owner_id: run.owner_id, agent_id: run.agent_id });
    if (run.task_id !== null) {
      const task = await this.tasks.require(run.owner_id, run.task_id);
      if (task.delegator_agent_id !== null) {
        await this.queue.send_agent_wake({
          owner_id: run.owner_id,
          agent_id: task.delegator_agent_id,
        });
      }
    }
  }

  private async cancel_task(task: TaskRecord): Promise<void> {
    try {
      await this.tasks.cancel(task.owner_id, task.id);
    } catch (error: unknown) {
      if (!(error instanceof ConflictException)) throw error;
    }
  }

  private async current_task(run: RunRecord): Promise<TaskRecord | null> {
    if (run.task_id === null) return null;
    const task = await this.tasks.require(run.owner_id, run.task_id);
    if (task.status !== 'queued') return task;
    return (await this.tasks.start(run.owner_id, task.id)) ?? task;
  }

  private async note(run: RunRecord, text: string): Promise<void> {
    await this.transcripts.append(run.owner_id, run.agent_id, run.id, {
      kind: 'system_note',
      content: { text },
    });
  }

  private was_nudged(entries: TranscriptEntryRecord[]): boolean {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry?.kind === 'task_assignment') return false;
      if (entry?.kind === 'system_note') {
        const content = entry.content;
        if (
          typeof content === 'object' &&
          content !== null &&
          'text' in content &&
          content.text === NUDGE_TEXT
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private fallback_report(entries: TranscriptEntryRecord[]): FinishedTask {
    const text = last_assistant_text(entries);
    return {
      outcome: text.length > 0 ? text : 'The agent ended without a report.',
      what_was_done: '',
      decisions: '',
      open_questions: 'The agent did not call finish_task, so this report is its last message.',
    };
  }
}
