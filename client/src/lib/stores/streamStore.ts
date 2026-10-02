import type { StreamChunk, TranscriptEntry } from '@tbn/contracts';
import { create } from 'zustand';

/** The reply an agent is writing right now, as far as the chunks have come. */
export interface StreamingReply {
  callId: string;
  runId: string;
  /** The transcript entry the reply will follow. */
  afterSeq: number;
  attempt: number;
  text: string;
  /** True once the attempt's last chunk arrived; the stored entry follows. */
  done: boolean;
}

/** The streaming reply of each agent that has one. */
export type StreamingReplies = Record<string, StreamingReply>;

/**
 * Adds a chunk to its agent's reply. A chunk of a new call or a later attempt starts the reply
 * over, so a failed attempt's text disappears when its retry begins; a chunk of an older attempt is
 * dropped.
 */
export function receiveChunk(replies: StreamingReplies, chunk: StreamChunk): StreamingReplies {
  const current = replies[chunk.agent_id];
  const startsOver =
    current === undefined || current.callId !== chunk.call_id || chunk.attempt > current.attempt;
  if (!startsOver && chunk.attempt < current.attempt) return replies;
  const base: StreamingReply = startsOver
    ? {
        callId: chunk.call_id,
        runId: chunk.run_id,
        afterSeq: chunk.after_seq,
        attempt: chunk.attempt,
        text: '',
        done: false,
      }
    : current;
  return {
    ...replies,
    [chunk.agent_id]: { ...base, text: base.text + chunk.text, done: chunk.done },
  };
}

/**
 * Drops an agent's streaming reply once the stored reply arrives: its next assistant entry after
 * the transcript entry the call began after.
 */
export function settleReply(replies: StreamingReplies, entry: TranscriptEntry): StreamingReplies {
  const current = replies[entry.agent_id];
  if (current === undefined || entry.kind !== 'assistant' || entry.seq <= current.afterSeq) {
    return replies;
  }
  const next = { ...replies };
  delete next[entry.agent_id];
  return next;
}

interface StreamState {
  replies: StreamingReplies;
  receive: (chunk: StreamChunk) => void;
  settle: (entry: TranscriptEntry) => void;
  clear: () => void;
}

/** The streaming replies of the owner's agents, fed by the realtime connection. */
export const useStreamStore = create<StreamState>((set) => ({
  replies: {},
  receive: (chunk) => set((state) => ({ replies: receiveChunk(state.replies, chunk) })),
  settle: (entry) => set((state) => ({ replies: settleReply(state.replies, entry) })),
  clear: () => set({ replies: {} }),
}));
