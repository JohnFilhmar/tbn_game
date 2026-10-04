import { TranscriptContentSchemas } from '@tbn/contracts';
import type { TranscriptEntryRecord } from '@/modules/runtime/types/run_record';

/** An agent whose question a run still owes an answer. */
export interface Asker {
  agent_id: string;
  name: string;
}

/**
 * The agents that asked this run a question it has not answered with `send_message` itself: the
 * questions that reached the agent since its previous run, and during this one. Answers, findings
 * and handoffs ask for nothing, so two agents never answer each other back and forth.
 */
export function questions_to_answer(entries: TranscriptEntryRecord[], run_id: string): Asker[] {
  const askers = new Map<string, Asker>();
  const answered = new Set<string>();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry === undefined) break;
    // An entry of an earlier run ends what this run owes; messages that arrived while the agent
    // was idle carry no run.
    if (entry.run_id !== null && entry.run_id !== run_id) break;
    if (entry.kind === 'assistant') {
      const content = TranscriptContentSchemas.assistant.safeParse(entry.content);
      if (!content.success) continue;
      for (const block of content.data.blocks) {
        if (block.type !== 'tool_use' || block.name !== 'send_message') continue;
        const to = block.input['to'];
        if (typeof to === 'string') answered.add(to.trim().toLowerCase());
      }
      continue;
    }
    if (entry.kind !== 'agent_message') continue;
    const content = TranscriptContentSchemas.agent_message.safeParse(entry.content);
    if (!content.success || content.data.kind !== 'question') continue;
    askers.set(content.data.from_agent_id, {
      agent_id: content.data.from_agent_id,
      name: content.data.from_name,
    });
  }
  return [...askers.values()].filter((asker) => !answered.has(asker.name.toLowerCase())).reverse();
}
