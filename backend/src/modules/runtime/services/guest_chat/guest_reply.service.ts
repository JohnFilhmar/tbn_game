import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { ProcessType } from '@tbn/contracts';
import { PROCESS_TYPE } from '@/config/config.tokens';
import type { GuestReplyJob } from '@/lib/queue/queues';
import { QueueService } from '@/lib/queue/queue.service';
import { AgentService } from '@/modules/company/services/agent.service';
import { TaskService } from '@/modules/company/services/task.service';
import { GuestService } from '@/modules/identity/services/guest.service';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import {
  GUEST_CHAT_REPOSITORY,
  type GuestChatRepository,
} from '@/modules/runtime/repositories/interface/guest_chat_repository.interface';
import { ProviderClientService } from '@/modules/runtime/services/provider_client.service';
import { build_guest_prompt } from './guest_prompt';

/** How much of the conversation the guest model reads back. */
const HISTORY_LINES = 20;
/** How many finished tasks the digest lists. */
const FINISHED_TASKS = 6;
/** Guest replies the worker answers at once. */
const CONCURRENCY = 2;

const FAILED_REPLY = 'I could not answer just now. Try again in a moment.';

/**
 * Answers guests on the worker, on the owner's guest model: a persona of the agent with a digest of
 * the company, no tools, and no run, so nothing a guest says reaches the agent's own work.
 */
@Injectable()
export class GuestReplyService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GuestReplyService.name);

  constructor(
    @Inject(PROCESS_TYPE) private readonly process_type: ProcessType,
    @Inject(GUEST_CHAT_REPOSITORY) private readonly lines: GuestChatRepository,
    private readonly agents: AgentService,
    private readonly tasks: TaskService,
    private readonly guests: GuestService,
    private readonly preferences: PreferenceService,
    private readonly client: ProviderClientService,
    private readonly queue: QueueService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.process_type !== 'worker') return;
    this.queue
      .work_guest_reply((job) => this.handle(job), CONCURRENCY)
      .catch((error: unknown) => {
        this.logger.error(
          `Guest replies did not start: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      });
  }

  /** Answers the newest guest message of one conversation, unless it was answered already. */
  async handle(job: GuestReplyJob): Promise<void> {
    const { owner_id, guest_id, agent_id } = job;
    const history = await this.lines.recent(owner_id, agent_id, guest_id, HISTORY_LINES);
    if (history.at(-1)?.role !== 'guest') return;
    let text: string;
    let is_error = false;
    try {
      text = await this.reply(job, history);
      if (text === '') {
        text = FAILED_REPLY;
        is_error = true;
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Guest reply for agent ${agent_id} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      text = FAILED_REPLY;
      is_error = true;
    }
    await this.lines.create(owner_id, { guest_id, agent_id, role: 'agent', text, is_error });
  }

  private async reply(
    { owner_id, guest_id, agent_id }: GuestReplyJob,
    history: Array<{ role: 'guest' | 'agent'; text: string; is_error: boolean }>,
  ): Promise<string> {
    const { guest_model } = await this.preferences.get(owner_id);
    if (guest_model === null) throw new Error('No guest model is set');
    const [guest, roster, done] = await Promise.all([
      this.guests.profile(owner_id, guest_id),
      this.agents.roster(owner_id),
      this.tasks.list(owner_id, { status: 'done' }),
    ]);
    const entry = roster.find((item) => item.agent.id === agent_id);
    if (entry === undefined) throw new Error('The agent left');
    const names = new Map(roster.map((item) => [item.agent.id, item.agent.name]));
    const request = build_guest_prompt({
      agent: {
        name: entry.agent.name,
        role: entry.agent.role,
        job_description: entry.agent.job_description,
        department_name: entry.department_name,
      },
      owner_username: guest.owner_username,
      guest_name: guest.name ?? 'a guest',
      roster: roster.map((item) => ({
        name: item.agent.name,
        role: item.agent.role,
        task_title: item.current_task?.title ?? null,
      })),
      finished: done
        .slice(-FINISHED_TASKS)
        .reverse()
        .map((task) => ({
          title: task.title,
          agent_name: names.get(task.assignee_agent_id) ?? 'a former agent',
          result: task.result,
        })),
      history: history.filter((line) => !line.is_error),
    });
    const response = await this.client.complete(
      {
        owner_id,
        provider_id: guest_model.provider_id,
        model_id: guest_model.model_id,
        agent_id,
        run_id: null,
      },
      request,
    );
    return response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
      .trim();
  }
}
