import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';
import { disk_used_percent } from '@/lib/disk/disk_usage';
import { QueueService } from '@/lib/queue/queue.service';
import { AgentService, is_live } from '@/modules/company/services/agent.service';
import { TaskService } from '@/modules/company/services/task.service';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import { ProviderService } from '@/modules/runtime/services/provider.service';
import { ApprovalService } from '@/modules/runtime/services/approvals/approval.service';
import { NotificationService } from '@/modules/integrations/services/notification.service';

const MINUTE_MS = 60_000;

/**
 * The worker's periodic safety net, every `RUN_LEASE_SECONDS / 2`. It re-wakes runs whose lease
 * lapsed and paused runs whose pause is over, returns tasks blocked behind a key that has credit
 * again to the queue, wakes delegators with undelivered results, and terminates interns that
 * stayed idle past the owner's timeout or whose manager left.
 *
 * Ceiling: every worker process sweeps every owner. With more than one worker the sweeps overlap,
 * which is safe because each step is idempotent.
 */
@Injectable()
export class WorkerSweepService implements OnApplicationShutdown {
  private readonly logger = new Logger(WorkerSweepService.name);
  private timer: NodeJS.Timeout | undefined;
  private swept_once = false;
  private readonly disk_alerted = new Set<string>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    private readonly agents: AgentService,
    private readonly tasks: TaskService,
    private readonly providers: ProviderService,
    private readonly preferences: PreferenceService,
    private readonly queue: QueueService,
    private readonly approvals: ApprovalService,
    private readonly notifications: NotificationService,
  ) {}

  /** Sweeps now and then on a timer, until shutdown. */
  start(): void {
    if (this.timer !== undefined) return;
    const interval_ms = Math.max(1_000, (this.config.worker.run_lease_seconds * 1_000) / 2);
    this.timer = setInterval(() => void this.sweep(), interval_ms);
    this.timer.unref();
    void this.sweep();
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One sweep. Each step logs and swallows its own failure, so one cannot stop the others. */
  async sweep(now = new Date()): Promise<void> {
    const steps: Array<[string, () => Promise<void>]> = [
      ['orphan recovery', () => this.recover_orphans(now)],
      ['paused runs', () => this.wake_resumable(now)],
      ['blocked tasks', () => this.requeue_unblocked()],
      ['subtask results', () => this.wake_delegators()],
      ['idle interns', () => this.terminate_idle_interns(now)],
      ['disk space', () => this.check_disk()],
    ];
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (error: unknown) {
        this.logger.error(
          `Sweep step ${name} failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
  }

  /**
   * Re-sends a wake for every running run without a live lease. On the first sweep after boot
   * those are the runs of a worker that died, and the owner hears how many came back.
   */
  private async recover_orphans(now: Date): Promise<void> {
    const orphaned = await this.runs.find_orphaned(now);
    for (const run of orphaned) {
      this.logger.warn(`Run ${run.id} has no live lease, waking agent ${run.agent_id}`);
      await this.queue.send_agent_wake({ owner_id: run.owner_id, agent_id: run.agent_id });
    }
    const first = !this.swept_once;
    this.swept_once = true;
    if (!first || orphaned.length === 0) return;
    const by_owner = new Map<string, number>();
    for (const run of orphaned) by_owner.set(run.owner_id, (by_owner.get(run.owner_id) ?? 0) + 1);
    for (const [owner_id, count] of by_owner) {
      await this.notifications.emit(owner_id, {
        event_type: 'runs_resumed',
        title: `${count} run${count === 1 ? '' : 's'} resumed after a worker restart`,
        message: `The worker re-woke ${count} run${count === 1 ? '' : 's'} whose previous worker died.`,
        priority: 'normal',
        values: { count: String(count) },
      });
    }
  }

  /** Tells each listening owner once when the workspace volume passes their alert percentage. */
  private async check_disk(): Promise<void> {
    const owners = await this.notifications.owners_listening('disk_nearly_full');
    if (owners.length === 0) return;
    const used = await disk_used_percent(this.config.workspace.dir);
    for (const owner_id of owners) {
      const preferences = await this.preferences.get(owner_id);
      const over = used >= preferences.disk_alert_percent;
      const alerted = this.disk_alerted.has(owner_id);
      if (over && !alerted) {
        this.disk_alerted.add(owner_id);
        await this.notifications.emit(owner_id, {
          event_type: 'disk_nearly_full',
          title: `The workspace volume is ${used}% full`,
          message: `The volume holding the workspace passed ${preferences.disk_alert_percent}%. Free space before agents run out of room.`,
          priority: 'high',
          values: { used_percent: String(used) },
        });
      } else if (!over && alerted) {
        this.disk_alerted.delete(owner_id);
      }
    }
  }

  /** Wakes runs whose time-based pause is over and runs whose key has credit again. */
  private async wake_resumable(now: Date): Promise<void> {
    for (const run of await this.runs.find_paused(['cap_limit', 'breaker_open'], now)) {
      await this.queue.send_agent_wake({ owner_id: run.owner_id, agent_id: run.agent_id });
    }
    for (const run of await this.runs.find_paused(['out_of_credit'], null)) {
      const agent = await this.agents.require(run.owner_id, run.agent_id);
      const provider = await this.providers.require(run.owner_id, agent.provider_id);
      if (provider.out_of_credit_since === null) {
        await this.queue.send_agent_wake({ owner_id: run.owner_id, agent_id: run.agent_id });
      }
    }
    for (const run of await this.runs.find_paused(['awaiting_approval'], null)) {
      if (!(await this.approvals.has_pending(run.owner_id, run.id))) {
        await this.queue.send_agent_wake({ owner_id: run.owner_id, agent_id: run.agent_id });
      }
    }
  }

  /** Blocked tasks that never started go back to the queue once their key has credit again. */
  private async requeue_unblocked(): Promise<void> {
    for (const task of await this.tasks.find_blocked_unstarted()) {
      const agent = await this.agents.require(task.owner_id, task.assignee_agent_id);
      const provider = await this.providers.require(task.owner_id, agent.provider_id);
      if (provider.out_of_credit_since === null) {
        await this.tasks.requeue_unstarted(task.owner_id, task);
      }
    }
  }

  /** Wakes every delegator with a finished subtask it has not been given. */
  private async wake_delegators(): Promise<void> {
    const woken = new Set<string>();
    for (const task of await this.tasks.find_unnotified_delegations()) {
      const delegator = task.delegator_agent_id;
      if (delegator === null || woken.has(delegator)) continue;
      woken.add(delegator);
      await this.queue.send_agent_wake({ owner_id: task.owner_id, agent_id: delegator });
    }
  }

  /** Terminates interns idle past the owner's timeout, and idle interns whose manager left. */
  private async terminate_idle_interns(now: Date): Promise<void> {
    const ttl_minutes = new Map<string, number>();
    for (const intern of await this.agents.find_idle_interns()) {
      let ttl = ttl_minutes.get(intern.owner_id);
      if (ttl === undefined) {
        ttl = (await this.preferences.get(intern.owner_id)).intern_idle_ttl_minutes;
        ttl_minutes.set(intern.owner_id, ttl);
      }
      const manager_left = intern.manager_status === null || !is_live(intern.manager_status);
      const cutoff = new Date(now.getTime() - ttl * MINUTE_MS);
      const overdue = intern.idle_since !== null && intern.idle_since < cutoff;
      if (!manager_left && !overdue) continue;
      if (
        await this.agents.terminate_idle_intern(
          intern.owner_id,
          intern.id,
          manager_left ? null : cutoff,
        )
      ) {
        this.logger.log(
          `Terminated intern ${intern.id}: ${manager_left ? 'its manager left' : `idle for more than ${ttl} minute${ttl === 1 ? '' : 's'}`}`,
        );
      }
    }
  }
}
