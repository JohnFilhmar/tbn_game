import { Injectable, NotFoundException } from '@nestjs/common';
import type { EventEntity } from '@tbn/contracts';
import { AgentService } from '@/modules/company/services/agent.service';
import { AgentAttachmentService } from '@/modules/company/services/agent_attachment.service';
import { DepartmentService } from '@/modules/company/services/department.service';
import {
  GitRecordsService,
  to_branch_review_view,
  to_merge_request_view,
  to_repository_view,
} from '@/modules/company/services/git_records.service';
import { ReportService } from '@/modules/company/services/report.service';
import { TaskService } from '@/modules/company/services/task.service';
import { IntegrationService } from '@/modules/integrations/services/integration.service';
import { NotificationService } from '@/modules/integrations/services/notification.service';
import { PluginService } from '@/modules/integrations/services/plugin.service';
import { InstructionService } from '@/modules/knowledge/services/instruction.service';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import { SkillService } from '@/modules/knowledge/services/skill.service';
import { ApprovalService } from '@/modules/runtime/services/approvals/approval.service';
import { CapWindowService } from '@/modules/runtime/services/caps/cap_window.service';
import { ProviderService } from '@/modules/runtime/services/provider.service';
import { RunService } from '@/modules/runtime/services/run.service';
import { SandboxJobService } from '@/modules/runtime/services/sandbox/sandbox_job.service';
import { SearchProviderService } from '@/modules/runtime/services/search/search_provider.service';
import { RunSourceService } from '@/modules/runtime/services/taint/run_source.service';
import { TranscriptService } from '@/modules/runtime/services/transcript.service';
import { WorldLayoutService } from '@/modules/world/services/world_layout.service';
import { WorldPropStateService } from '@/modules/world/services/world_prop_state.service';

/** Loads the current views of some entities of one kind, keyed by id. Missing ones are left out. */
type Loader = (owner_id: string, ids: string[]) => Promise<Map<string, unknown>>;

/** A loader that reads one entity at a time through a service getter that throws when it is gone. */
function each(get: (owner_id: string, id: string) => Promise<unknown>): Loader {
  return async (owner_id, ids) => {
    const views = new Map<string, unknown>();
    for (const id of ids) {
      try {
        views.set(id, await get(owner_id, id));
      } catch (error: unknown) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
    return views;
  };
}

/** A loader over a service that reads many entities at once. */
function many(list: (owner_id: string, ids: string[]) => Promise<Array<{ id: string }>>): Loader {
  return async (owner_id, ids) =>
    new Map((await list(owner_id, ids)).map((view) => [view.id, view]));
}

/**
 * Reads the current API view of the entities the event log names, through each module's exported
 * service, so an event carries the same shape as the entity's own route. The cap windows of a
 * provider load under the provider's id, and the preferences under the owner's.
 */
@Injectable()
export class EventHydratorService {
  private readonly loaders: Record<EventEntity, Loader>;

  constructor(
    agents: AgentService,
    attachments: AgentAttachmentService,
    departments: DepartmentService,
    tasks: TaskService,
    reports: ReportService,
    git: GitRecordsService,
    runs: RunService,
    run_sources: RunSourceService,
    transcripts: TranscriptService,
    approvals: ApprovalService,
    sandbox_jobs: SandboxJobService,
    providers: ProviderService,
    cap_windows: CapWindowService,
    search_providers: SearchProviderService,
    integrations: IntegrationService,
    plugins: PluginService,
    notifications: NotificationService,
    instructions: InstructionService,
    skills: SkillService,
    preferences: PreferenceService,
    world_layouts: WorldLayoutService,
    prop_states: WorldPropStateService,
  ) {
    this.loaders = {
      agent: each((owner_id, id) => agents.get(owner_id, id)),
      agent_attachments: each((owner_id, agent_id) => attachments.get(owner_id, agent_id)),
      department: each((owner_id, id) => departments.get(owner_id, id)),
      task: each((owner_id, id) => tasks.get(owner_id, id)),
      report: each((owner_id, id) => reports.get(owner_id, id)),
      run: each((owner_id, id) => runs.get(owner_id, id)),
      run_source: many((owner_id, ids) => run_sources.views_by_ids(owner_id, ids)),
      transcript_entry: many((owner_id, ids) => transcripts.views_by_ids(owner_id, ids)),
      approval: each((owner_id, id) => approvals.get(owner_id, id)),
      sandbox_job: each((owner_id, id) => sandbox_jobs.get(owner_id, id)),
      repository: each(async (owner_id, id) =>
        to_repository_view(await git.require_repository(owner_id, id)),
      ),
      merge_request: each(async (owner_id, id) =>
        to_merge_request_view(await git.require_merge_request(owner_id, id)),
      ),
      branch_review: each(async (owner_id, id) =>
        to_branch_review_view(await git.require_review(owner_id, id)),
      ),
      provider: each((owner_id, id) => providers.get(owner_id, id)),
      cap_windows: each((owner_id, provider_id) => cap_windows.list(owner_id, provider_id)),
      search_provider: each((owner_id, id) => search_providers.get(owner_id, id)),
      integration: each((owner_id, id) => integrations.get(owner_id, id)),
      plugin: each((owner_id, id) => plugins.get(owner_id, id)),
      notification_channel: each((owner_id, id) => notifications.get_channel(owner_id, id)),
      notification: each((owner_id, id) => notifications.get(owner_id, id)),
      instruction: each((owner_id, id) => instructions.get(owner_id, id)),
      skill: each((owner_id, id) => skills.get(owner_id, id)),
      preferences: each((owner_id) => preferences.get(owner_id)),
      world_layout: each((owner_id, id) => world_layouts.get_by_id(owner_id, id)),
      world_prop_state: each((owner_id, id) => prop_states.get_by_id(owner_id, id)),
    };
  }

  /** The current views of `ids`, all of kind `entity` and owned by `owner_id`. */
  load(owner_id: string, entity: EventEntity, ids: string[]): Promise<Map<string, unknown>> {
    return this.loaders[entity](owner_id, ids);
  }
}
