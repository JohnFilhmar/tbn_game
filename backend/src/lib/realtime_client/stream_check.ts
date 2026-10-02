import type { ChangeEvent, StreamChunk } from '@tbn/contracts';

/** One model call as a client saw it stream: the text of its last attempt. */
export interface StreamedReply {
  agent_id: string;
  run_id: string;
  call_id: string;
  after_seq: number;
  attempt: number;
  text: string;
  /** True when every chunk of the last attempt arrived, through the one marked `done`. */
  complete: boolean;
}

interface CallState {
  reply: StreamedReply;
  next_index: number;
  broken: boolean;
  done: boolean;
}

function fresh_call(chunk: StreamChunk): CallState {
  return {
    reply: {
      agent_id: chunk.agent_id,
      run_id: chunk.run_id,
      call_id: chunk.call_id,
      after_seq: chunk.after_seq,
      attempt: chunk.attempt,
      text: '',
      complete: false,
    },
    next_index: 0,
    broken: false,
    done: false,
  };
}

/**
 * Gathers stream chunks into one reply per model call, keeping the last attempt of each. Of the
 * calls that began after the same transcript entry of a run, only the last can have stored a
 * reply, so only that one is returned.
 */
export function streamed_replies(chunks: StreamChunk[]): StreamedReply[] {
  const calls = new Map<string, CallState>();
  for (const chunk of chunks) {
    let call = calls.get(chunk.call_id);
    if (call === undefined || chunk.attempt > call.reply.attempt) {
      call = fresh_call(chunk);
      calls.set(chunk.call_id, call);
    }
    if (chunk.attempt < call.reply.attempt) continue;
    if (chunk.index !== call.next_index) call.broken = true;
    call.reply.text += chunk.text;
    call.next_index = chunk.index + 1;
    if (chunk.done) call.done = true;
  }
  const last_per_entry = new Map<string, StreamedReply>();
  for (const call of calls.values()) {
    const reply = { ...call.reply, complete: call.done && !call.broken };
    last_per_entry.set(`${reply.run_id}:${reply.after_seq}`, reply);
  }
  return [...last_per_entry.values()];
}

/**
 * The text of the reply stored for a streamed call, from the events a client received: the
 * agent's first assistant entry in the run after `after_seq`, or null when none arrived.
 */
export function stored_reply_text(events: ChangeEvent[], reply: StreamedReply): string | null {
  let found: { seq: number; text: string } | null = null;
  for (const event of events) {
    if (event.entity !== 'transcript_entry' || event.data === null) continue;
    const entry = event.data;
    if (
      entry.kind !== 'assistant' ||
      entry.agent_id !== reply.agent_id ||
      entry.run_id !== reply.run_id ||
      entry.seq <= reply.after_seq ||
      (found !== null && found.seq <= entry.seq)
    ) {
      continue;
    }
    const text = entry.content.blocks
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    found = { seq: entry.seq, text };
  }
  return found?.text ?? null;
}
