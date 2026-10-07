import { Inject, Injectable, Logger } from '@nestjs/common';
import type { RunPauseReason } from '@tbn/contracts';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';
import { QueueService } from '@/lib/queue/queue.service';
import { TaskService } from '@/modules/company/services/task.service';
import type { AgentRecord, TaskRecord } from '@/modules/company/types/company_records';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import { CapService } from '@/modules/runtime/services/caps/cap.service';
import { ApprovalService } from '@/modules/runtime/services/approvals/approval.service';
import { ProviderService } from '@/modules/runtime/services/provider.service';
import type { ProviderError } from '@/modules/runtime/types/provider_error';
import type { ProviderRecord } from '@/modules/runtime/types/provider_record';
import type { RunRecord } from '@/modules/runtime/types/run_record';
import { RunLeaseService } from './run_lease.service';

/** Why a run pauses, until when, and the reason its task shows. */
export interface PauseDecision {
  reason: RunPauseReason;
  resume_at: Date | null;
  status_reason: string | null;
}

function out_of_credit(provider: ProviderRecord): PauseDecision {
  return {
    reason: 'out_of_credit',
    resume_at: null,
    status_reason: `The key of ${provider.name} is out of credit. Top it up or change it, then resume the provider.`,
  };
}

/**
 * Decides before every model call whether a run may go on: the runaway guard, the key's credit,
 * the provider's circuit breaker and the enforced cap windows at their limit, in that order. After
 * a failed call it decides how long the run waits. It also applies a pause to the run and its task.
 */
@Injectable()
export class RunGateService {
  private readonly logger = new Logger(RunGateService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    private readonly providers: ProviderService,
    private readonly caps: CapService,
    private readonly preferences: PreferenceService,
    private readonly tasks: TaskService,
    private readonly queue: QueueService,
    private readonly lease: RunLeaseService,
    private readonly approvals: ApprovalService,
  ) {}

  /** A pause the run must take before its next model call, or null when it may call. */
  async check(run: RunRecord, agent: AgentRecord, now = new Date()): Promise<PauseDecision | null> {
    const preferences = await this.preferences.get(run.owner_id);
    if (run.guard_turns >= preferences.runaway_guard_turns) {
      return {
        reason: 'runaway_guard',
        resume_at: null,
        status_reason: `The run took ${run.guard_turns} model turns without its task changing status. Continue it or stop it.`,
      };
    }
    const provider = await this.providers.require(run.owner_id, agent.provider_id);
    if (provider.out_of_credit_since !== null) return out_of_credit(provider);
    if (provider.breaker_open_until !== null && provider.breaker_open_until > now) {
      return {
        reason: 'breaker_open',
        resume_at: provider.breaker_open_until,
        status_reason: `${provider.name} is on hold after a rate limit or repeated failures. Its runs wait until ${provider.breaker_open_until.toISOString()}.`,
      };
    }
    return this.limit_pause(provider, agent.primary_model, now);
  }

  /**
   * The pause a call to `model_id` on the agent's key must take while an enforced cap window that
   * counts the model is at its limit, or null when it may call. The compaction summary, which uses
   * the intern model, checks it too.
   */
  async check_model(
    agent: AgentRecord,
    model_id: string,
    now = new Date(),
  ): Promise<PauseDecision | null> {
    const provider = await this.providers.require(agent.owner_id, agent.provider_id);
    return this.limit_pause(provider, model_id, now);
  }

  private async limit_pause(
    provider: ProviderRecord,
    model_id: string,
    now: Date,
  ): Promise<PauseDecision | null> {
    const block = await this.caps.limit_block(provider.owner_id, provider.id, model_id, now);
    if (block === null) return null;
    return {
      reason: 'cap_limit',
      resume_at: block.resume_at,
      status_reason: `Cap window ${block.window_names.join(', ')} on ${provider.name} reached its limit. Resumes at ${block.resume_at.toISOString()}.`,
    };
  }

  /**
   * The pause after a provider error: an out-of-credit key waits for the owner, and a provider
   * that failed after its retries waits for its breaker or a cooldown. Null for errors that fail
   * the run.
   */
  async after_error(
    run: RunRecord,
    agent: AgentRecord,
    error: ProviderError,
    now = new Date(),
  ): Promise<PauseDecision | null> {
    if (error.kind !== 'out_of_credit' && !error.retryable) return null;
    const provider = await this.providers.require(run.owner_id, agent.provider_id);
    if (error.kind === 'out_of_credit') return out_of_credit(provider);
    const held_until = provider.breaker_open_until?.getTime() ?? 0;
    if (error.kind === 'rate_limited' && error.retry_after_ms !== undefined) {
      const resume_at = new Date(Math.max(now.getTime() + error.retry_after_ms, held_until));
      return {
        reason: 'breaker_open',
        resume_at,
        status_reason: `${provider.name} hit its rate limit. Resumes at ${resume_at.toISOString()}.`,
      };
    }
    const cooldown_until = now.getTime() + this.config.providers.breaker_cooldown_seconds * 1_000;
    const resume_at = new Date(Math.max(cooldown_until, held_until));
    return {
      reason: 'breaker_open',
      resume_at,
      status_reason: `${provider.name} failed after its retries (${error.kind}). Retrying at ${resume_at.toISOString()}.`,
    };
  }

  /**
   * Pauses a run this process holds and moves its task: blocked behind a key, awaiting the owner
   * after the runaway guard, or in progress with a reason while it waits for its subtasks. A
   * time-based pause also sends the wake that resumes it.
   */
  async pause(run: RunRecord, task: TaskRecord | null, decision: PauseDecision): Promise<void> {
    if (task !== null) {
      const reason = decision.status_reason ?? decision.reason;
      if (decision.reason === 'runaway_guard' || decision.reason === 'awaiting_approval') {
        await this.tasks.await_approval(run.owner_id, task.id, reason);
      } else if (decision.reason === 'waiting_on_subtasks') {
        await this.tasks.set_reason(run.owner_id, task.id, reason);
      } else {
        await this.tasks.block(run.owner_id, task.id, reason);
      }
    }
    const paused = await this.runs.pause(
      run.owner_id,
      run.id,
      this.lease.worker_id,
      decision.reason,
      decision.resume_at,
    );
    if (!paused) {
      this.logger.warn(`Run ${run.id} lost its lease before it could pause`);
      return;
    }
    if (decision.reason === 'runaway_guard') await this.approvals.request_for_guard(run, task);
    if (decision.resume_at !== null) {
      const delay_seconds = Math.max(
        1,
        Math.ceil((decision.resume_at.getTime() - Date.now()) / 1_000),
      );
      await this.queue.send_agent_wake(
        { owner_id: run.owner_id, agent_id: run.agent_id },
        delay_seconds,
      );
    }
    this.logger.log(
      `Run ${run.id} paused: ${decision.reason}${decision.resume_at === null ? '' : ` until ${decision.resume_at.toISOString()}`}`,
    );
  }

  /** A task that waited or was blocked is back in progress once its run may call the model. */
  async mark_in_progress(task: TaskRecord): Promise<void> {
    if (task.status === 'blocked') {
      await this.tasks.unblock(task.owner_id, task.id);
    } else if (task.status === 'in_progress' && task.status_reason !== null) {
      await this.tasks.set_reason(task.owner_id, task.id, null);
    }
  }
}
