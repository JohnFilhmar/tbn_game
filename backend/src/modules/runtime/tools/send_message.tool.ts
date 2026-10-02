import { Inject, Injectable } from '@nestjs/common';
import { MessageKindSchema, type MessageKind } from '@tbn/contracts';
import { z } from 'zod';
import { QueueService } from '@/lib/queue/queue.service';
import { AgentService, is_live } from '@/modules/company/services/agent.service';
import type { AgentRecord } from '@/modules/company/types/company_records';
import {
  TRANSCRIPT_REPOSITORY,
  type TranscriptRepository,
} from '@/modules/runtime/repositories/interface/transcript_repository.interface';
import type { Tool, ToolContext, ToolOutcome } from './tool.interface';

const InputSchema = z.strictObject({
  to: z.string().trim().min(1).max(100).describe('The name of the agent, as list_roster shows it'),
  kind: MessageKindSchema.describe(
    'handoff: work you pass on; question: something you need answered; finding: something they should know',
  ),
  text: z.string().trim().min(1).max(20_000).describe('The message'),
});

type Input = z.infer<typeof InputSchema>;

/** Why `sender` may not message `recipient`, or null when it may. */
function refusal(sender: AgentRecord, recipient: AgentRecord): string | null {
  if (recipient.id === sender.id) return 'You cannot message yourself.';
  const same_department = recipient.department_id === sender.department_id;
  if (sender.level === 1) {
    if (recipient.level === 1 || same_department) return null;
    return `${recipient.name} is an intern of another department. Message its manager instead.`;
  }
  if (same_department) return null;
  return 'Interns message their own manager and the interns of their department only.';
}

/** Delivers a handoff, a question or a finding to another agent's session. */
@Injectable()
export class SendMessageTool implements Tool<Input> {
  readonly name = 'send_message';
  readonly description =
    'Send a handoff, a question or a finding to another agent. It reads the message at its next turn, or starts a turn to answer if it is idle. Managers can message every manager and their own interns; interns can message their manager and their own department.';
  readonly default_policy = 'auto';
  readonly input_schema = InputSchema;

  constructor(
    private readonly agents: AgentService,
    @Inject(TRANSCRIPT_REPOSITORY) private readonly transcripts: TranscriptRepository,
    private readonly queue: QueueService,
  ) {}

  async execute(input: Input, context: ToolContext): Promise<ToolOutcome> {
    const recipient = await this.agents.find_by_name(context.owner_id, input.to);
    if (recipient === null || !is_live(recipient.status)) {
      return { content: `No live agent is named ${input.to}.`, is_error: true };
    }
    const refused = refusal(context.agent, recipient);
    if (refused !== null) return { content: refused, is_error: true };
    const kind: MessageKind = input.kind;
    await this.transcripts.append(context.owner_id, recipient.id, recipient.active_run_id, {
      kind: 'agent_message',
      content: {
        from_agent_id: context.agent.id,
        from_name: context.agent.name,
        kind,
        text: input.text,
      },
    });
    await this.queue.send_agent_wake({ owner_id: context.owner_id, agent_id: recipient.id });
    return { content: `Delivered your ${kind} to ${recipient.name}.` };
  }
}
