import { randomUUID } from 'node:crypto';
import {
  EventsPageSchema,
  OPEN_TASK_STATUSES,
  TaskSchema,
  TranscriptEntrySchema,
  type ChangeEvent,
  type TaskStatus,
} from '@tbn/contracts';
import { error_message } from '@/utils/error_details';
import { compare_with_log, read_log_seqs, type LogComparison } from './log_check';
import { OwnerApi } from './owner_api';
import { RealtimeClient, type SequenceFault } from './realtime_client';
import { stored_reply_text, streamed_replies } from './stream_check';

/** What the scripted session does, and to whom. */
export interface ScriptedSessionOptions {
  /** The web process's base URL. */
  url: string;
  /** A session token of the owner. */
  token: string;
  /** The busy agent the owner chats with. */
  agent_id: string;
  /** The task whose end closes the session. */
  task_id: string;
  /** The last sequence the owner already has, or null to start from the head. */
  cursor: number | null;
  /** How many replies of the agent to see before the connection drops, so it drops mid-run. */
  drop_after_replies: number;
  /** How long to stay away before reconnecting. */
  away_ms: number;
  /** What the owner tells the agent while the client is away. */
  message: string;
  /** The longest wait for any one step. */
  timeout_ms: number;
  /** Receives each line of progress. */
  log: (line: string) => void;
}

/** The owner's message, sent twice under one command id. */
export interface MessageCheck {
  statuses: [number, number];
  /** True when the second answer was replayed. */
  replayed: boolean;
  /** True when both answers carry the same transcript entry. */
  same_entry: boolean;
  /** How many entries of the agent's transcript hold the message. */
  stored: number;
}

/** What the session saw, and whether it is what the exit criteria ask for. */
export interface ScriptedSessionResult {
  /** The sequence delivery started after. */
  start: number;
  /** The last sequence received. */
  last_seq: number;
  comparison: LogComparison;
  faults: SequenceFault[];
  resyncs: number;
  connections: number;
  message: MessageCheck;
  /** Complete streamed replies with text, and how many equal their stored entries. */
  replies: { checked: number; matching: number };
  task_status: TaskStatus;
  /**
   * True when the client received every sequence once and in order, the message ran once, the
   * task is done, and every complete streamed reply equals its stored entry.
   */
  passed: boolean;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function task_end(events: ChangeEvent[], task_id: string): TaskStatus | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.entity !== 'task' || event.id !== task_id || event.data === null) continue;
    return OPEN_TASK_STATUSES.includes(event.data.status) ? undefined : event.data.status;
  }
  return undefined;
}

function count_replies(events: ChangeEvent[], agent_id: string): number {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.entity !== 'transcript_entry' || event.data === null) continue;
    if (event.data.kind === 'assistant' && event.data.agent_id === agent_id) ids.add(event.id);
  }
  return ids.size;
}

function count_messages(events: ChangeEvent[], agent_id: string, text: string): number {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.entity !== 'transcript_entry' || event.data === null) continue;
    const entry = event.data;
    if (
      entry.kind === 'owner_message' &&
      entry.agent_id === agent_id &&
      entry.content.text === text
    ) {
      ids.add(entry.id);
    }
  }
  return ids.size;
}

async function send_twice(
  api: OwnerApi,
  options: ScriptedSessionOptions,
): Promise<Omit<MessageCheck, 'stored'>> {
  const command_id = randomUUID();
  const path = `/agents/${options.agent_id}/messages`;
  const first = await api.post(path, { text: options.message }, command_id);
  const second = await api.post(path, { text: options.message }, command_id);
  const first_entry = TranscriptEntrySchema.safeParse(first.body);
  const second_entry = TranscriptEntrySchema.safeParse(second.body);
  return {
    statuses: [first.status, second.status],
    replayed: second.replayed,
    same_entry:
      first_entry.success && second_entry.success && first_entry.data.id === second_entry.data.id,
  };
}

async function wait_for_task_end(
  api: OwnerApi,
  client: RealtimeClient,
  options: ScriptedSessionOptions,
): Promise<TaskStatus> {
  const current = await api.get(`/tasks/${options.task_id}`, TaskSchema);
  if (!OPEN_TASK_STATUSES.includes(current.status)) return current.status;
  await client.until(
    'the task to end',
    () => task_end(client.events, options.task_id) !== undefined,
    options.timeout_ms,
  );
  return task_end(client.events, options.task_id) ?? current.status;
}

/**
 * The scripted client of the phase 2 exit criteria. It connects from `cursor`, drops the
 * connection once the agent has replied `drop_after_replies` times, sends the owner's message to
 * the busy agent twice under one command id while away, reconnects from where it stopped, and
 * waits for the task to end. It then catches up with the head of the log and sets what it
 * received against `GET /events`, and each complete streamed reply against the transcript entry
 * stored for it.
 */
export async function run_scripted_session(
  options: ScriptedSessionOptions,
): Promise<ScriptedSessionResult> {
  const { log } = options;
  const api = new OwnerApi(options.url, options.token);
  const client = new RealtimeClient({
    url: options.url,
    token: options.token,
    cursor: options.cursor,
  });
  try {
    const hello = await client.connect().catch((error: unknown) => {
      throw new Error(`Cannot connect to ${options.url}: ${error_message(error)}`, {
        cause: error,
      });
    });
    const start = hello.cursor;
    log(`Connected: the log's head is ${hello.head_seq}, delivery starts after ${start}`);
    await client.until(
      `${options.drop_after_replies} replies of the agent`,
      () => count_replies(client.events, options.agent_id) >= options.drop_after_replies,
      options.timeout_ms,
    );
    client.disconnect();
    log(
      `Received ${client.events.length} events and ${client.chunks.length} stream chunks, ` +
        `dropping the connection at ${client.last_seq}`,
    );

    const sent = await send_twice(api, options);
    log(
      `Sent the message twice under one command id: ${sent.statuses.join(' then ')}` +
        `${sent.replayed ? ', the second replayed' : ''}`,
    );
    await pause(options.away_ms);
    const again = await client.connect();
    log(`Reconnected from ${again.cursor}, the log's head is now ${again.head_seq}`);

    const task_status = await wait_for_task_end(api, client, options);
    log(`The task ended as ${task_status}`);
    const page = await api.get(
      `/events?after=${client.last_seq ?? start}&limit=1`,
      EventsPageSchema,
    );
    await client.until(
      'the head of the log',
      () => (client.last_seq ?? start) >= page.head_seq,
      options.timeout_ms,
    );
    const last_seq = client.last_seq ?? start;
    const comparison = compare_with_log(
      client.events.map((event) => event.seq),
      await read_log_seqs(api, start, last_seq),
    );
    const replies = streamed_replies(client.chunks).filter(
      (reply) => reply.complete && reply.text.length > 0,
    );
    const matching = replies.filter(
      (reply) => stored_reply_text(client.events, reply) === reply.text,
    ).length;
    const message: MessageCheck = {
      ...sent,
      stored: count_messages(client.events, options.agent_id, options.message),
    };
    const passed =
      comparison.matches &&
      client.faults.length === 0 &&
      client.resyncs.length === 0 &&
      message.statuses.every((status) => status === 201) &&
      message.replayed &&
      message.same_entry &&
      message.stored === 1 &&
      task_status === 'done' &&
      replies.length > 0 &&
      matching === replies.length;
    return {
      start,
      last_seq,
      comparison,
      faults: [...client.faults],
      resyncs: client.resyncs.length,
      connections: client.connections,
      message,
      replies: { checked: replies.length, matching },
      task_status,
      passed,
    };
  } finally {
    client.disconnect();
  }
}
