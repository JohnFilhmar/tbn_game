import {
  PREFERENCE_DEFAULTS,
  type Agent,
  type CapWindowStatus,
  type ChangeEvent,
  type EventOp,
  type Preferences,
  type StreamChunk,
  type Task,
  type TranscriptEntry,
} from '@tbn/contracts';

const AT = '2026-10-02T12:00:00.000Z';
let counter = 0;

/** A fresh UUID-shaped id, so fixtures never collide. */
export function fixtureId(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

/** An agent with every field set; `overrides` win. */
export function agentFixture(overrides: Partial<Agent> = {}): Agent {
  return {
    id: fixtureId(),
    name: 'ada',
    role: 'Researcher',
    job_description: 'Finds sources.',
    level: 1,
    department_id: fixtureId(),
    provider_id: fixtureId(),
    primary_model: 'model-a',
    intern_model: 'model-b',
    appearance: {},
    tool_policy: {},
    status: 'idle',
    active_run_id: null,
    created_at: AT,
    updated_at: AT,
    ...overrides,
  };
}

/** A queued task with every field set; `overrides` win. */
export function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: fixtureId(),
    title: 'Write the notes',
    instructions: 'Short ones.',
    assignee_agent_id: fixtureId(),
    delegator_agent_id: null,
    parent_task_id: null,
    repository_id: null,
    feature_branch: null,
    status: 'queued',
    status_reason: null,
    result: null,
    report_id: null,
    started_at: null,
    finished_at: null,
    created_at: AT,
    updated_at: AT,
    ...overrides,
  };
}

/** An assistant entry of `agentId`'s transcript at `seq`, saying `text`. */
export function assistantEntry(agentId: string, seq: number, text: string): TranscriptEntry {
  return {
    id: fixtureId(),
    agent_id: agentId,
    run_id: null,
    seq,
    created_at: AT,
    kind: 'assistant',
    content: { blocks: [{ type: 'text', text }] },
  };
}

/** The owner's message in `agentId`'s transcript at `seq`. */
export function ownerMessage(agentId: string, seq: number, text: string): TranscriptEntry {
  return {
    id: fixtureId(),
    agent_id: agentId,
    run_id: null,
    seq,
    created_at: AT,
    kind: 'owner_message',
    content: { text },
  };
}

/** The defaults, with `overrides`. */
export function preferencesFixture(overrides: Partial<Preferences> = {}): Preferences {
  return { ...PREFERENCE_DEFAULTS, ...overrides };
}

/** A stream chunk of a call; `overrides` win. */
export function chunkFixture(overrides: Partial<StreamChunk> = {}): StreamChunk {
  return {
    agent_id: 'agent-1',
    run_id: 'run-1',
    call_id: 'call-1',
    after_seq: 3,
    attempt: 1,
    index: 0,
    text: '',
    done: false,
    ...overrides,
  };
}

/** An event about an agent: its view, or null once it is gone. */
export function agentChange(id: string, op: EventOp, data: Agent | null, seq = 1): ChangeEvent {
  return { seq, entity: 'agent', id, op, changed: null, data, at: AT };
}

/** An event about a transcript entry. */
export function entryChange(entry: TranscriptEntry, seq = 1): ChangeEvent {
  return {
    seq,
    entity: 'transcript_entry',
    id: entry.id,
    op: 'insert',
    changed: null,
    data: entry,
    at: AT,
  };
}

/** An event carrying a provider's cap windows. */
export function capWindowsChange(
  providerId: string,
  data: CapWindowStatus[],
  seq = 1,
): ChangeEvent {
  return { seq, entity: 'cap_windows', id: providerId, op: 'update', changed: null, data, at: AT };
}

/** An event carrying the preferences. */
export function preferencesChange(ownerId: string, data: Preferences, seq = 1): ChangeEvent {
  return { seq, entity: 'preferences', id: ownerId, op: 'update', changed: null, data, at: AT };
}
