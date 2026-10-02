import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ToolPoliciesSchema } from '@tbn/contracts';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';
import { StreamPublisherService } from '@/lib/realtime/stream_publisher.service';
import { AgentService } from '@/modules/company/services/agent.service';
import { TaskService } from '@/modules/company/services/task.service';
import type { AgentRecord } from '@/modules/company/types/company_records';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import {
  TRANSCRIPT_REPOSITORY,
  type TranscriptRepository,
} from '@/modules/runtime/repositories/interface/transcript_repository.interface';
import { PromptBuilderService } from '@/modules/runtime/services/prompt_builder.service';
import { ProviderClientService } from '@/modules/runtime/services/provider_client.service';
import { ProviderService } from '@/modules/runtime/services/provider.service';
import type { FinishedTask } from '@/modules/runtime/tools/tool.interface';
import { ToolExecutorService } from '@/modules/runtime/tools/tool_executor.service';
import { ToolRegistryService } from '@/modules/runtime/tools/tool_registry.service';
import { CapNotifierService } from '@/modules/runtime/services/caps/cap_notifier.service';
import type { ModelResponse, ToolUseBlock } from '@/modules/runtime/types/model_request';
import { ProviderError } from '@/modules/runtime/types/provider_error';
import type { RunRecord, TranscriptEntryRecord } from '@/modules/runtime/types/run_record';
import { CompactionService } from './compaction.service';
import { RunGateService, type PauseDecision } from './run_gate.service';
import { RunLeaseService } from './run_lease.service';

/** Used when a model's context window is unknown. */
const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000;

/** What a model turn ended with: the answer, a pause the run must take, or a lost lease. */
export type ModelTurn = { response: ModelResponse } | { pause: PauseDecision } | 'lost';

/** What a tool phase ended with: the report when `finish_task` accepted one, or a pause. */
export type ToolTurn = { finished: FinishedTask | null } | { pause: PauseDecision };

/**
 * One step of a run: a model call or the tool calls it asked for. Each step is written to the
 * transcript before the loop goes on, and the lease is extended while it runs.
 */
@Injectable()
export class TurnService {
  private readonly logger = new Logger(TurnService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(TRANSCRIPT_REPOSITORY) private readonly transcripts: TranscriptRepository,
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    private readonly agents: AgentService,
    private readonly tasks: TaskService,
    private readonly providers: ProviderService,
    private readonly provider_client: ProviderClientService,
    private readonly prompt_builder: PromptBuilderService,
    private readonly tool_executor: ToolExecutorService,
    private readonly gate: RunGateService,
    private readonly compaction: CompactionService,
    private readonly lease: RunLeaseService,
    private readonly registry: ToolRegistryService,
    private readonly cap_notifier: CapNotifierService,
    private readonly streams: StreamPublisherService,
  ) {}

  /** Plugin notes already written to a run's transcript, so each is written once. */
  private readonly noted = new Set<string>();

  /**
   * Calls the agent's model with its session, compacting the session first when it fills too
   * much of the context window, and stores the answer. A provider failure the gate can wait out
   * becomes a pause, and a key out of credit blocks every open task on it.
   */
  async call_model(
    run: RunRecord,
    agent: AgentRecord,
    entries: TranscriptEntryRecord[],
  ): Promise<ModelTurn> {
    const provider = await this.providers.require(run.owner_id, agent.provider_id);
    const context_window =
      provider.models.find((model) => model.model_id === agent.primary_model)
        ?.context_window_tokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS;
    let outcome: { result: ModelResponse | PauseDecision; lost: boolean };
    try {
      outcome = await this.lease.with_heartbeat(run, () =>
        this.request(run, agent, entries, context_window),
      );
    } catch (error: unknown) {
      if (!(error instanceof ProviderError)) throw error;
      const pause = await this.gate.after_error(run, agent, error);
      if (pause === null) throw error;
      if (pause.reason === 'out_of_credit') await this.block_key(agent, pause);
      return { pause };
    }
    if (outcome.lost) {
      this.logger.warn(`Run ${run.id} lost its lease during a model call, discarding the answer`);
      return 'lost';
    }
    if ('reason' in outcome.result) return { pause: outcome.result };
    await this.cap_notifier.after_usage(run.owner_id, agent.provider_id);
    const blocks =
      outcome.result.content.length > 0
        ? outcome.result.content
        : [{ type: 'text' as const, text: '(no output)' }];
    await this.transcripts.append(run.owner_id, run.agent_id, run.id, {
      kind: 'assistant',
      content: { blocks },
    });
    return { response: outcome.result };
  }

  /**
   * Builds the request and calls the model. A session past its share of the context window is
   * compacted first, unless a cap window at its limit forbids the summary call: the run then
   * pauses like any call the caps stop. The answer streams to the owner's sockets while it is
   * generated, and the stream is closed before the answer is stored, so its last chunk reaches a
   * client before the transcript entry does.
   */
  private async request(
    run: RunRecord,
    agent: AgentRecord,
    entries: TranscriptEntryRecord[],
    context_window: number,
  ): Promise<ModelResponse | PauseDecision> {
    const tool_set = await this.registry.for_agent(agent);
    let current = entries;
    for (const note of tool_set.notes) {
      const key = `${run.id}:${note}`;
      if (this.noted.has(key)) continue;
      this.noted.add(key);
      await this.transcripts.append(run.owner_id, run.agent_id, run.id, {
        kind: 'system_note',
        content: { text: note },
      });
      current = await this.transcripts.list_all(run.owner_id, agent.id);
    }
    let request = await this.prompt_builder.build(agent, current, context_window, tool_set);
    if (this.compaction.needs_compaction(request, context_window)) {
      const blocked = await this.gate.check_model(agent, agent.intern_model);
      if (blocked !== null) return blocked;
      if (await this.compaction.compact(run, agent, current, context_window)) {
        current = await this.transcripts.list_all(run.owner_id, agent.id);
        request = await this.prompt_builder.build(agent, current, context_window, tool_set);
      }
    }
    const stream = this.streams.open({
      owner_id: run.owner_id,
      agent_id: agent.id,
      run_id: run.id,
      after_seq: current.at(-1)?.seq ?? 0,
    });
    try {
      return await this.provider_client.complete(
        {
          owner_id: run.owner_id,
          provider_id: agent.provider_id,
          model_id: agent.primary_model,
          agent_id: agent.id,
          run_id: run.id,
        },
        request,
        { on_text: (text, attempt) => stream.text(text, attempt) },
      );
    } finally {
      await stream.close();
    }
  }

  /**
   * Runs the tool calls of the last answer under the agent's tool policy and stores their
   * results. A call that waits for the owner pauses the run instead, with nothing stored: the
   * whole phase runs again once the owner has decided.
   */
  async run_tools(run: RunRecord, agent: AgentRecord, calls: ToolUseBlock[]): Promise<ToolTurn> {
    const policies = ToolPoliciesSchema.safeParse(agent.tool_policy);
    const workspace_dir = join(this.config.workspace.dir, 'owners', run.owner_id);
    await mkdir(workspace_dir, { recursive: true });
    const current = (await this.runs.find(run.owner_id, run.id)) ?? run;
    const { result: phase } = await this.lease.with_heartbeat(run, () =>
      this.tool_executor.execute_all(
        calls,
        policies.success ? policies.data : {},
        {
          owner_id: run.owner_id,
          agent_id: run.agent_id,
          agent,
          run_id: run.id,
          task_id: run.task_id,
          workspace_dir,
        },
        current.tainted_at !== null,
      ),
    );
    if ('awaiting' in phase) {
      const names = [...new Set(phase.awaiting.map((call) => call.name))].join(', ');
      return {
        pause: {
          reason: 'awaiting_approval',
          resume_at: null,
          status_reason: `Waiting for your decision on ${names}. See the approval inbox.`,
        },
      };
    }
    const results = phase.results;
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
    return { finished: results.find((item) => item.finished !== undefined)?.finished ?? null };
  }

  /** A key out of credit blocks every open task of every agent on it, not only this run's. */
  private async block_key(agent: AgentRecord, pause: PauseDecision): Promise<void> {
    const on_key = await this.agents.list_on_provider(agent.owner_id, agent.provider_id);
    const blocked = await this.tasks.block_open_for_agents(
      agent.owner_id,
      on_key.map((item) => item.id),
      pause.status_reason ?? 'The key is out of credit.',
    );
    this.logger.warn(
      `Provider ${agent.provider_id} is out of credit: ${blocked} tasks blocked until the owner resumes it`,
    );
  }
}
