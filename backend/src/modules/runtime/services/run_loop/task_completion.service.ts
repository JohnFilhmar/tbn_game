import { ConflictException, Inject, Injectable } from '@nestjs/common';
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
  USAGE_REPOSITORY,
  type UsageRepository,
} from '@/modules/runtime/repositories/interface/usage_repository.interface';
import { render_report, type SubtaskLine } from '@/modules/runtime/services/report_builder';
import type { FinishedTask } from '@/modules/runtime/tools/tool.interface';
import type { RunRecord } from '@/modules/runtime/types/run_record';
import { NotificationService } from '@/modules/integrations/services/notification.service';

/**
 * Writes the report of a finished task and marks it done. The report of a task with subtasks
 * lists them one line each, and its tokens and cost cover the task and every task beneath it.
 */
@Injectable()
export class TaskCompletionService {
  constructor(
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(USAGE_REPOSITORY) private readonly usage: UsageRepository,
    private readonly tasks: TaskService,
    private readonly agents: AgentService,
    private readonly reports: ReportService,
    private readonly preferences: PreferenceService,
    private readonly notifications: NotificationService,
  ) {}

  /** Stores the report of `task` from what the agent wrote and marks the task done. */
  async complete(
    run: RunRecord,
    agent: AgentRecord,
    task: TaskRecord,
    finished: FinishedTask,
  ): Promise<void> {
    const owner_id = run.owner_id;
    const [preferences, children, tree] = await Promise.all([
      this.preferences.get(owner_id),
      this.tasks.children(owner_id, task.id),
      this.tasks.tree_ids(owner_id, task.id),
    ]);
    const run_ids = await this.runs.ids_for_tasks(owner_id, tree);
    const usage = await this.usage.summarize_for_runs(
      owner_id,
      run_ids.includes(run.id) ? run_ids : [...run_ids, run.id],
    );
    const subtasks: SubtaskLine[] = [];
    for (const child of children) {
      const assignee = await this.agents.require(owner_id, child.assignee_agent_id);
      subtasks.push({
        title: child.title,
        assignee_name: assignee.name,
        status: child.status,
        report_id: child.report_id,
      });
    }
    const body_md = render_report(
      { task_title: task.title, agent_name: agent.name, report_style: preferences.report_style },
      finished,
      usage,
      subtasks,
    );
    try {
      const report = await this.reports.create_for_task(owner_id, task.id, agent.id, body_md);
      if (task.delegator_agent_id === null) {
        await this.notifications.emit(owner_id, {
          event_type: 'report_finished',
          title: `${agent.name} finished "${task.title}"`,
          message: finished.outcome.trim().slice(0, 500),
          priority: 'normal',
          values: { agent_name: agent.name, task_title: task.title, report_id: report.id },
        });
      }
    } catch (error: unknown) {
      if (!(error instanceof ConflictException)) throw error;
    }
    await this.tasks.complete(owner_id, task.id, finished.outcome.trim());
  }
}
