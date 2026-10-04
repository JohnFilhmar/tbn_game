import { Inject, Injectable } from '@nestjs/common';
import { QueueService } from '@/lib/queue/queue.service';
import { AgentService, is_live } from '@/modules/company/services/agent.service';
import type { AgentRecord } from '@/modules/company/types/company_records';
import {
  TRANSCRIPT_REPOSITORY,
  type TranscriptRepository,
} from '@/modules/runtime/repositories/interface/transcript_repository.interface';
import { questions_to_answer } from '@/modules/runtime/services/transcript/questions';
import { last_assistant_text } from '@/modules/runtime/services/transcript/transcript_messages';
import type { RunRecord, TranscriptEntryRecord } from '@/modules/runtime/types/run_record';

/** An answer longer than this reaches the asker shortened; the answerer's transcript keeps it. */
const MOST_ANSWER_CHARS = 8_000;

/**
 * Sends an agent's answer back to the agents that asked it a question. An agent answers the owner
 * in plain text, and so it answers another agent's question; without this the answer stayed in
 * its own session and the asker never heard back.
 */
@Injectable()
export class QuestionReplyService {
  constructor(
    private readonly agents: AgentService,
    @Inject(TRANSCRIPT_REPOSITORY) private readonly transcripts: TranscriptRepository,
    private readonly queue: QueueService,
  ) {}

  /**
   * Delivers the run's last words as an answer to every agent whose question it still owes, and
   * wakes each so it can go on. An answer asks for nothing back.
   *
   * @returns How many answers it delivered.
   */
  async answer(
    run: RunRecord,
    agent: AgentRecord,
    entries: TranscriptEntryRecord[],
  ): Promise<number> {
    const text = last_assistant_text(entries);
    if (text === '') return 0;
    const body =
      text.length > MOST_ANSWER_CHARS ? `${text.slice(0, MOST_ANSWER_CHARS)}\n... shortened` : text;
    let delivered = 0;
    for (const asker of questions_to_answer(entries, run.id)) {
      const recipient = await this.agents.require(run.owner_id, asker.agent_id);
      if (!is_live(recipient.status)) continue;
      await this.transcripts.append(run.owner_id, recipient.id, recipient.active_run_id, {
        kind: 'agent_message',
        content: { from_agent_id: agent.id, from_name: agent.name, kind: 'answer', text: body },
      });
      await this.queue.send_agent_wake({ owner_id: run.owner_id, agent_id: recipient.id });
      delivered += 1;
    }
    return delivered;
  }
}
