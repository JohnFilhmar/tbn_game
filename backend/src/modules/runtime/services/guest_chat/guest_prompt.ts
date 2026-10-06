import type { ModelMessage, ModelRequest } from '@/modules/runtime/types/model_request';

/** How much of a finished task's result the digest quotes. */
const RESULT_CHARS = 240;

/** What a guest's conversation with an agent's persona is built from. */
export interface GuestPromptInput {
  agent: { name: string; role: string; job_description: string; department_name: string };
  owner_username: string;
  guest_name: string;
  /** Every live agent and what it is doing. */
  roster: Array<{ name: string; role: string; task_title: string | null }>;
  /** Recently finished tasks, newest first. */
  finished: Array<{ title: string; agent_name: string; result: string | null }>;
  /** The conversation so far, oldest first, ending with the guest's newest message. */
  history: Array<{ role: 'guest' | 'agent'; text: string }>;
}

function shorten(text: string, chars: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > chars ? `${flat.slice(0, chars)}...` : flat;
}

/** Joins lines in a row from the same side, since some model APIs want the roles to alternate. */
function to_messages(history: GuestPromptInput['history']): ModelMessage[] {
  const turns: Array<{ role: 'guest' | 'agent'; text: string }> = [];
  for (const line of history) {
    const last = turns.at(-1);
    if (last !== undefined && last.role === line.role) last.text = `${last.text}\n\n${line.text}`;
    else turns.push({ ...line });
  }
  while (turns[0]?.role === 'agent') turns.shift();
  return turns.map((turn) =>
    turn.role === 'guest'
      ? { role: 'user', content: [{ type: 'text', text: turn.text }] }
      : { role: 'assistant', content: [{ type: 'text', text: turn.text }] },
  );
}

/**
 * The request for a guest's conversation with an agent's persona: who the agent is, a short digest
 * of what the company is doing, and the conversation. It has no tools and never quotes the agent's
 * own transcript, so a guest can neither make the agent act nor read its private work.
 */
export function build_guest_prompt(input: GuestPromptInput): ModelRequest {
  const roster = input.roster.map(
    (entry) =>
      `- ${entry.name}, ${entry.role}: ${entry.task_title === null ? 'idle' : `working on "${entry.task_title}"`}`,
  );
  const finished = input.finished.map(
    (task) =>
      `- "${task.title}" by ${task.agent_name}${task.result === null ? '' : `: ${shorten(task.result, RESULT_CHARS)}`}`,
  );
  const system = [
    `You are ${input.agent.name}, ${input.agent.role} in the ${input.agent.department_name} department of ${input.owner_username}'s company.`,
    `Job description: ${input.agent.job_description}`,
    `You are chatting with ${input.guest_name}, a friend ${input.owner_username} invited to look around. Be friendly and keep replies short.`,
    'Your replies show in a chat that renders Markdown: write short paragraphs with a blank line between them, and use a list when you give several points.',
    `You cannot do work, use tools or take tasks here; only ${input.owner_username} gives you tasks. If asked to do something, say so kindly.`,
    'Answer from what is written below. If something is not there, say you do not know; never invent progress.',
    '# The company right now',
    roster.length > 0 ? roster.join('\n') : '(no agents)',
    '# Recently finished',
    finished.length > 0 ? finished.join('\n') : '(nothing yet)',
  ].join('\n\n');
  return { system, tools: [], messages: to_messages(input.history) };
}
