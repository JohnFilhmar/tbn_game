import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { ToolPoliciesSchema } from '@tbn/contracts';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';
import { QueueService } from '@/lib/queue/queue.service';
import { AgentService } from '@/modules/company/services/agent.service';
import { ReportService } from '@/modules/company/services/report.service';
import { TaskService } from '@/modules/company/services/task.service';
import type { AgentRecord, TaskRecord } from '@/modules/company/types/company_records';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import {
  TRANSCRIPT_REPOSITORY,
  type TranscriptRepository,
} from '@/modules/runtime/repositories/interface/transcript_repository.interface';
import {
  USAGE_REPOSITORY,
  type UsageRepository,
} from '@/modules/runtime/repositories/interface/usage_repository.interface';
import type { FinishedTask } from '@/modules/runtime/tools/tool.interface';
import { ToolExecutorService } from '@/modules/runtime/tools/tool_executor.service';
import type { ModelResponse, ToolUseBlock } from '@/modules/runtime/types/model_request';
import { ProviderError } from '@/modules/runtime/types/provider_error';
import type { RunRecord, TranscriptEntryRecord } from '@/modules/runtime/types/run_record';
import { PromptBuilderService } from './prompt_builder.service';
import { ProviderClientService } from './provider_client.service';
import { render_report } from './report_builder';
import { last_assistant_text, pending_tool_calls } from './transcript_messages';

/** Hard stop for a run that never finishes. Phase 1b replaces it with the runaway guard. */
const MAX_TURNS = 100;

const NUDGE_TEXT = 'The task is still open. Call finish_task with the report when it is complete.';
const CONTINUE_TEXT = 'Your reply was cut off at the output limit. Continue where you stopped.';

type Outcome = 'finished' | 'stopped' | 'lost';

/**
 * The tool-use loop of one run. The transcript is the checkpoint: every model turn and every tool
 * result is written before the loop goes on, and a worker that picks the run up later continues
 * from the last entry. The loop holds a lease on the run and extends it while a model call is in
 * flight, so two workers never drive the same run.
 */
@Injectable()
export class RunLoopService {
  private readonly logger = new Logger(RunLoopService.name);

  /** Identifies this process in run leases. */
  readonly worker_id = `${hostname()}:${process.pid}:${randomBytes(3).toString('hex')}`;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(TRANSCRIPT_REPOSITORY) private readonly transcripts: TranscriptRepository,
    @Inject(USAGE_REPOSITORY) private readonly usage: UsageRepository,
    private readonly agents: AgentService,
    private readonly tasks: TaskService,
    private readonly reports: ReportService,
    private readonly preferences: PreferenceService,
    private readonly provider_client: ProviderClientService,
    private readonly prompt_builder: PromptBuilderService,
    private readonly tool_executor: ToolExecutorService,
    private readonly queue: QueueService,
  ) {}

  /** Drives the run until it finishes, the worker stops, or another worker takes it over. */
  async execute(owner_id: string, run_id: string): Promise<void> {
    const run = await this.runs.acquire_lease(owner_id, run_id, this.worker_id, this.lease_until());
    if (run === null) return;
    this.logger.log(`Run ${run.id} started on ${this.worker_id} (agent ${run.agent_id})`);
    try {
      const outcome = await this.drive(run);
      this.logger.log(`Run ${run.id} ${outcome}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Run ${run.id} failed: ${message}`);
      await this.finish(run, 'failed', message);
    } finally {
      await this.runs.release_lease(owner_id, run_id, this.worker_id);
    }
  }

  private async drive(run: RunRecord): Promise<Outcome> {
    let turn_count = run.turn_count;
    for (;;) {
      if (this.queue.stopping) {
        await this.queue.send_agent_wake({ owner_id: run.owner_id, agent_id: run.agent_id }, 1);
        return 'stopped';
      }
      const agent = await this.agents.require(run.owner_id, run.agent_id);
      if (agent.status === 'dismissed') {
        await this.finish(run, 'cancelled', 'Agent was dismissed');
        return 'finished';
      }
      const task = await this.current_task(run);
      if (task !== null && task.status !== 'in_progress') {
        await this.finish(run, 'cancelled', `Task is ${task.status}`);
        return 'finished';
      }
      const entries = await this.transcripts.list_all(run.owner_id, run.agent_id);

      const pending = pending_tool_calls(entries);
      if (pending.length > 0) {
        const finished = await this.run_tools(run, agent, pending);
        if (finished !== null && task !== null) {
          await this.finish_task(run, agent, task, entries, finished);
          return 'finished';
        }
        continue;
      }

      if (turn_count >= MAX_TURNS) {
        await this.finish(run, 'failed', `Run exceeded ${MAX_TURNS} model turns`);
        return 'finished';
      }
      const last = entries[entries.length - 1];
      const waiting_on_model = last === undefined || last.kind !== 'assistant';
      if (!waiting_on_model) {
        if (task === null) {
          await this.finish(run, 'done', null);
          return 'finished';
        }
        if (this.was_nudged(entries)) {
          await this.finish_task(run, agent, task, entries, this.fallback_report(entries));
          return 'finished';
        }
        await this.note(run, NUDGE_TEXT);
        continue;
      }

      const response = await this.call_model(run, agent, entries);
      if (response === null) return 'lost';
      turn_count = await this.runs.increment_turn(run.owner_id, run.id);
      if (response.stop_reason === 'max_tokens') await this.note(run, CONTINUE_TEXT);
    }
  }

  private async call_model(
    run: RunRecord,
    agent: AgentRecord,
    entries: TranscriptEntryRecord[],
  ): Promise<ModelResponse | null> {
    const request = await this.prompt_builder.build(agent, entries);
    const { result, lost } = await this.with_heartbeat(run, () =>
      this.provider_client.complete(
        {
          owner_id: run.owner_id,
          provider_id: agent.provider_id,
          model_id: agent.primary_model,
          agent_id: agent.id,
          run_id: run.id,
        },
        request,
      ),
    );
    if (lost) {
      this.logger.warn(`Run ${run.id} lost its lease during a model call, discarding the answer`);
      return null;
    }
    const blocks =
      result.content.length > 0 ? result.content : [{ type: 'text' as const, text: '(no output)' }];
    await this.transcripts.append(run.owner_id, run.agent_id, run.id, {
      kind: 'assistant',
      content: { blocks },
    });
    return result;
  }

  private async run_tools(
    run: RunRecord,
    agent: AgentRecord,
    calls: ToolUseBlock[],
  ): Promise<FinishedTask | null> {
    const policies = ToolPoliciesSchema.safeParse(agent.tool_policy);
    const workspace_dir = join(this.config.workspace.dir, 'owners', run.owner_id);
    await mkdir(workspace_dir, { recursive: true });
    const { result: results } = await this.with_heartbeat(run, () =>
      this.tool_executor.execute_all(calls, policies.success ? policies.data : {}, {
        owner_id: run.owner_id,
        agent_id: run.agent_id,
        run_id: run.id,
        task_id: run.task_id,
        workspace_dir,
      }),
    );
    await this.transcripts.append(run.owner_id, run.agent_id, run.id, {
      kind: 'tool_result',
      content: {
        results: results.map((item) => ({
          tool_use_id: item.tool_use_id,
          name: item.name,
          content: item.content,
          is_error: item.is_error,
        })),
      },
    });
    return results.find((item) => item.finished !== undefined)?.finished ?? null;
  }

  private async finish_task(
    run: RunRecord,
    agent: AgentRecord,
    task: TaskRecord,
    entries: TranscriptEntryRecord[],
    finished: FinishedTask,
  ): Promise<void> {
    const [usage, preferences] = await Promise.all([
      this.usage.summarize_for_run(run.owner_id, run.id),
      this.preferences.get(run.owner_id),
    ]);
    const body_md = render_report(
      { task_title: task.title, agent_name: agent.name, report_style: preferences.report_style },
      finished,
      usage,
    );
    try {
      await this.reports.create_for_task(run.owner_id, task.id, agent.id, body_md);
    } catch (error: unknown) {
      if (!(error instanceof ConflictException)) throw error;
    }
    await this.tasks.complete(run.owner_id, task.id, finished.outcome.trim());
    await this.finish(run, 'done', null);
    this.logger.log(
      `Run ${run.id} finished task ${task.id} after ${entries.length} transcript entries`,
    );
  }

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

  /** Runs `work` while extending the lease, and reports whether the lease was lost meanwhile. */
  private async with_heartbeat<T>(
    run: RunRecord,
    work: () => Promise<T>,
  ): Promise<{ result: T; lost: boolean }> {
    let lost = false;
    const interval_ms = Math.max(1_000, (this.config.worker.run_lease_seconds * 1_000) / 3);
    const timer = setInterval(() => {
      this.runs
        .extend_lease(run.owner_id, run.id, this.worker_id, this.lease_until())
        .then((held) => {
          if (!held) lost = true;
        })
        .catch((error: unknown) => {
          this.logger.warn(
            `Lease heartbeat failed: ${error instanceof Error ? error.message : 'unknown'}`,
          );
        });
    }, interval_ms);
    try {
      const result = await work();
      return { result, lost };
    } finally {
      clearInterval(timer);
    }
  }

  private lease_until(): Date {
    return new Date(Date.now() + this.config.worker.run_lease_seconds * 1_000);
  }

  /** Marks a run failed when a provider gives up. Exposed for the provider error path. */
  describe_provider_error(error: unknown): string {
    if (error instanceof ProviderError) return `Provider error (${error.kind}): ${error.message}`;
    return error instanceof Error ? error.message : 'Unknown error';
  }
}
