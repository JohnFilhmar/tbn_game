import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { TranscriptEntrySchema, type TranscriptEntry, type TranscriptQuery } from '@tbn/contracts';
import { QueueService } from '@/lib/queue/queue.service';
import { AgentService, is_live } from '@/modules/company/services/agent.service';
import {
  TRANSCRIPT_REPOSITORY,
  type TranscriptRepository,
} from '@/modules/runtime/repositories/interface/transcript_repository.interface';
import type { TranscriptEntryRecord } from '@/modules/runtime/types/run_record';

/** Maps a transcript row to the API shape, or null when its content no longer fits the contract. */
export function to_transcript_entry_view(record: TranscriptEntryRecord): TranscriptEntry | null {
  const parsed = TranscriptEntrySchema.safeParse({
    id: record.id,
    agent_id: record.agent_id,
    run_id: record.run_id,
    seq: record.seq,
    kind: record.kind,
    content: record.content,
    created_at: record.created_at.toISOString(),
  });
  return parsed.success ? parsed.data : null;
}

/** An agent's persistent session: its transcript, and the messages the owner sends into it. */
@Injectable()
export class TranscriptService {
  constructor(
    @Inject(TRANSCRIPT_REPOSITORY) private readonly transcripts: TranscriptRepository,
    private readonly agents: AgentService,
    private readonly queue: QueueService,
  ) {}

  /** Entries after `after_seq`, oldest first. */
  async list(
    owner_id: string,
    agent_id: string,
    query: TranscriptQuery,
  ): Promise<TranscriptEntry[]> {
    await this.agents.require(owner_id, agent_id);
    const records = await this.transcripts.list(owner_id, agent_id, query);
    return records
      .map(to_transcript_entry_view)
      .filter((entry): entry is TranscriptEntry => entry !== null);
  }

  /** The entries with these ids that still fit the contract, for the event log. */
  async views_by_ids(owner_id: string, ids: string[]): Promise<TranscriptEntry[]> {
    const records = await this.transcripts.list_by_ids(owner_id, ids);
    return records
      .map(to_transcript_entry_view)
      .filter((entry): entry is TranscriptEntry => entry !== null);
  }

  /**
   * Appends a message from the owner and wakes the agent. A working agent reads it at its next
   * model turn; an idle one starts a run to answer it.
   */
  async send_owner_message(
    owner_id: string,
    agent_id: string,
    text: string,
  ): Promise<TranscriptEntry> {
    const agent = await this.agents.require(owner_id, agent_id);
    if (!is_live(agent.status)) throw new ConflictException(`Agent is ${agent.status}`);
    const record = await this.transcripts.append(owner_id, agent_id, agent.active_run_id, {
      kind: 'owner_message',
      content: { text },
    });
    await this.queue.send_agent_wake({ owner_id, agent_id });
    const view = to_transcript_entry_view(record);
    if (view === null) throw new Error('Stored owner message does not match the contract');
    return view;
  }
}
