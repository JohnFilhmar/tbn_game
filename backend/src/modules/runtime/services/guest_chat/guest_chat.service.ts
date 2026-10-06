import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { GuestChatMessage } from '@tbn/contracts';
import type { AuthenticatedGuest } from '@/lib/auth/authenticated_owner';
import { QueueService } from '@/lib/queue/queue.service';
import { AgentService, is_live } from '@/modules/company/services/agent.service';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import {
  GUEST_CHAT_REPOSITORY,
  type GuestChatRepository,
} from '@/modules/runtime/repositories/interface/guest_chat_repository.interface';
import type { GuestChatRecord } from '@/modules/runtime/types/guest_chat_record';

/** How many lines a conversation shows. */
const SHOWN_LINES = 100;

/** Maps a guest chat row to the API shape. */
export function to_guest_chat_view(record: GuestChatRecord): GuestChatMessage {
  return {
    id: record.id,
    guest_id: record.guest_id,
    agent_id: record.agent_id,
    role: record.role,
    text: record.text,
    is_error: record.is_error,
    created_at: record.created_at.toISOString(),
  };
}

/**
 * Guests' conversations with agents. A guest talks only with an idle agent, and the worker answers
 * on the guest model, apart from the agent's own transcript and tools.
 */
@Injectable()
export class GuestChatService {
  constructor(
    @Inject(GUEST_CHAT_REPOSITORY) private readonly lines: GuestChatRepository,
    private readonly agents: AgentService,
    private readonly preferences: PreferenceService,
    private readonly queue: QueueService,
  ) {}

  /**
   * Stores a guest's message and asks the worker for the reply.
   *
   * @throws ConflictException when the guest has no name yet, guest conversations are off, or the
   * agent is gone or busy with a task.
   */
  async send(guest: AuthenticatedGuest, agent_id: string, text: string): Promise<GuestChatMessage> {
    const owner_id = guest.owner_id;
    if (guest.name === null) throw new ConflictException('Pick a guest name first');
    const { guest_model } = await this.preferences.get(owner_id);
    if (guest_model === null) {
      throw new ConflictException(`${guest.owner_username} has not set up guest conversations yet`);
    }
    const entry = (await this.agents.roster(owner_id)).find((item) => item.agent.id === agent_id);
    if (entry === undefined || !is_live(entry.agent.status)) {
      throw new ConflictException('That agent is not here');
    }
    if (entry.agent.status !== 'idle' || entry.current_task !== null) {
      throw new ConflictException(
        `${entry.agent.name} is busy with a task; only ${guest.owner_username} can talk with them now`,
      );
    }
    const record = await this.lines.create(owner_id, {
      guest_id: guest.id,
      agent_id,
      role: 'guest',
      text,
      is_error: false,
    });
    await this.queue.send_guest_reply({ owner_id, guest_id: guest.id, agent_id });
    return to_guest_chat_view(record);
  }

  /** A conversation with an agent: one guest's, or every guest's when `guest_id` is null. */
  async list(
    owner_id: string,
    agent_id: string,
    guest_id: string | null,
  ): Promise<GuestChatMessage[]> {
    return (await this.lines.recent(owner_id, agent_id, guest_id, SHOWN_LINES)).map(
      to_guest_chat_view,
    );
  }

  /** The views of some lines, for the event log. */
  async views_by_ids(owner_id: string, ids: string[]): Promise<GuestChatMessage[]> {
    return (await this.lines.by_ids(owner_id, ids)).map(to_guest_chat_view);
  }
}
