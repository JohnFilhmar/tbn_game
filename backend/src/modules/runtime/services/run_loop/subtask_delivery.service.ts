import { Inject, Injectable } from '@nestjs/common';
import { SubtaskOutcomeSchema } from '@tbn/contracts';
import { AgentService, is_live } from '@/modules/company/services/agent.service';
import { ReportService } from '@/modules/company/services/report.service';
import { TaskService } from '@/modules/company/services/task.service';
import type { AgentRecord } from '@/modules/company/types/company_records';
import {
  TRANSCRIPT_REPOSITORY,
  type TranscriptRepository,
} from '@/modules/runtime/repositories/interface/transcript_repository.interface';

/** A subtask report longer than this reaches the manager shortened; the report keeps it whole. */
const REPORT_EXCERPT_CHARS = 8_000;

/**
 * Puts the results of finished subtasks into their delegator's transcript. Each result lands once,
 * even when two wakes race to deliver it, because the entry carries a dedupe key.
 */
@Injectable()
export class SubtaskDeliveryService {
  constructor(
    private readonly tasks: TaskService,
    private readonly agents: AgentService,
    private readonly reports: ReportService,
    @Inject(TRANSCRIPT_REPOSITORY) private readonly transcripts: TranscriptRepository,
  ) {}

  /**
   * Delivers every finished subtask `delegator` has not been given yet. A delegator that was
   * dismissed or terminated has nobody to tell, so its results are only marked as delivered.
   *
   * @returns How many results it delivered.
   */
  async deliver(delegator: AgentRecord): Promise<number> {
    const owner_id = delegator.owner_id;
    const finished = await this.tasks.finished_unnotified(owner_id, delegator.id);
    if (!is_live(delegator.status)) {
      for (const task of finished) await this.tasks.mark_delegator_notified(owner_id, task.id);
      return 0;
    }
    for (const task of finished) {
      const status = SubtaskOutcomeSchema.safeParse(task.status);
      if (!status.success) continue;
      const assignee = await this.agents.require(owner_id, task.assignee_agent_id);
      const report =
        task.report_id === null ? null : await this.reports.get(owner_id, task.report_id);
      const report_md =
        report === null
          ? null
          : report.body_md.length > REPORT_EXCERPT_CHARS
            ? `${report.body_md.slice(0, REPORT_EXCERPT_CHARS)}\n... the full report is ${report.id}`
            : report.body_md;
      await this.transcripts.append(
        owner_id,
        delegator.id,
        delegator.active_run_id,
        {
          kind: 'subtask_result',
          content: {
            task_id: task.id,
            title: task.title,
            assignee_agent_id: assignee.id,
            assignee_name: assignee.name,
            status: status.data,
            result: task.result,
            report_id: task.report_id,
            report_md,
          },
        },
        `subtask_result:${task.id}`,
      );
      await this.tasks.mark_delegator_notified(owner_id, task.id);
    }
    return finished.length;
  }
}
