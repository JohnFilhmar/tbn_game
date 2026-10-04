import { randomUUID } from 'node:crypto';
import type { TranscriptEntryRecord } from '@/modules/runtime/types/run_record';
import {
  compaction_cut,
  render_for_summary,
  select_context,
  task_fold_cut,
} from './transcript_context';

function entry(
  seq: number,
  kind: TranscriptEntryRecord['kind'],
  content: unknown,
): TranscriptEntryRecord {
  return {
    id: `entry-${seq}`,
    owner_id: 'owner',
    agent_id: 'agent',
    run_id: 'run',
    seq,
    kind,
    content,
    created_at: new Date(),
  };
}

const call = (id: string) => ({ type: 'tool_use', id, name: 'read_file', input: { path: 'a.md' } });
const result = (id: string, content: string) => ({
  results: [{ tool_use_id: id, name: 'read_file', content, is_error: false }],
});

describe('a new task', () => {
  const assignment = (title: string) => ({
    task_id: randomUUID(),
    title,
    instructions: 'Do it.',
  });

  it('folds the tasks before it once they are long, and leaves a first or short one alone', () => {
    const long_session = [
      entry(1, 'task_assignment', assignment('First')),
      entry(2, 'assistant', { blocks: [call('c1')] }),
      entry(3, 'tool_result', result('c1', 'z'.repeat(7_000))),
      entry(4, 'task_assignment', assignment('Second')),
    ];
    expect(task_fold_cut(long_session)).toBe(3);
    expect(task_fold_cut(long_session.slice(0, 3))).toBeNull();
    const short_session = [
      entry(1, 'task_assignment', assignment('First')),
      entry(2, 'tool_result', result('c1', 'short')),
      entry(3, 'task_assignment', assignment('Second')),
    ];
    expect(task_fold_cut(short_session)).toBeNull();
  });
});

describe('transcript context', () => {
  it('starts after the latest compaction and leaves compaction entries out', () => {
    const entries = [
      entry(1, 'owner_message', { text: 'one' }),
      entry(2, 'compaction', { summary: 'first', through_seq: 1 }),
      entry(3, 'owner_message', { text: 'two' }),
      entry(4, 'owner_message', { text: 'three' }),
      entry(5, 'compaction', { summary: 'second', through_seq: 3 }),
      entry(6, 'owner_message', { text: 'four' }),
    ];
    expect(select_context(entries)).toEqual({
      summary: 'second',
      through_seq: 3,
      live: [entries[3], entries[5]],
    });
    expect(select_context(entries.slice(0, 1))).toEqual({
      summary: null,
      through_seq: 0,
      live: [entries[0]],
    });
  });

  it('cuts where no tool result is separated from its call, keeping the last entry', () => {
    const live = [
      entry(1, 'task_assignment', { task_id: randomUUID(), title: 'T', instructions: 'Do it.' }),
      entry(2, 'assistant', { blocks: [call('a')] }),
      entry(3, 'tool_result', result('a', 'x'.repeat(400))),
      entry(4, 'assistant', { blocks: [call('b')] }),
      entry(5, 'tool_result', result('b', 'y'.repeat(400))),
      entry(6, 'assistant', { blocks: [{ type: 'text', text: 'Done.' }] }),
    ];
    expect(compaction_cut(live, 10)).toBe(5);
    expect(compaction_cut(live, 600)).toBe(5);
    expect(compaction_cut(live, 700)).toBe(3);
    expect(compaction_cut(live, 100_000)).toBe(0);

    const ends_with_result = live.slice(0, 5);
    expect(compaction_cut(ends_with_result, 10)).toBe(3);
    expect(live[compaction_cut(ends_with_result, 10)]?.kind).toBe('assistant');
  });

  it('renders what to summarise, dropping the oldest entries past the limit', () => {
    const entries = [
      entry(1, 'owner_message', { text: 'first message' }),
      entry(2, 'assistant', { blocks: [{ type: 'text', text: 'an answer' }, call('c')] }),
      entry(3, 'tool_result', result('c', 'file text')),
      entry(4, 'agent_message', {
        from_agent_id: randomUUID(),
        from_name: 'grace',
        kind: 'finding',
        text: 'a finding',
      }),
    ];
    const full = render_for_summary('earlier work', entries, 10_000);
    expect(full).toBe(
      [
        'Summary so far:\nearlier work\n',
        'Entries to fold into the summary:',
        '[owner] first message',
        '[you] an answer',
        '[you called read_file] {"path":"a.md"}',
        '[read_file returned] file text',
        '[finding from grace] a finding',
      ].join('\n'),
    );
    const short = render_for_summary(null, entries, 60);
    expect(short).toContain('(earlier entries left out)');
    expect(short).toContain('[finding from grace] a finding');
    expect(short).not.toContain('first message');
  });
});
