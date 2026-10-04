import { describe, expect, it } from 'vitest';
import { parseCommand } from './commands';

describe('chat commands', () => {
  it('reads a plain line as a message', () => {
    expect(parseCommand('Hello there')).toEqual({ kind: 'message' });
    expect(parseCommand('  what is 2/3?')).toEqual({ kind: 'message' });
  });

  it('makes a task of /task, titled by its first line', () => {
    expect(parseCommand('/task Write a haiku about tea')).toEqual({
      kind: 'task',
      title: 'Write a haiku about tea',
      instructions: 'Write a haiku about tea',
    });
    const long = `/task ${'Compare the three plans and say which costs least '.repeat(3)}\nThen list risks.`;
    const parsed = parseCommand(long);
    expect(parsed.kind).toBe('task');
    if (parsed.kind !== 'task') return;
    expect(parsed.title.length).toBeLessThanOrEqual(80);
    expect(parsed.title.endsWith('…')).toBe(true);
    expect(parsed.instructions).toContain('Then list risks.');
  });

  it('answers /help, a bare /task, and an unknown command', () => {
    expect(parseCommand('/help')).toEqual({ kind: 'help' });
    expect(parseCommand('/TASK  ')).toEqual({ kind: 'help' });
    expect(parseCommand('/dance now')).toEqual({ kind: 'unknown', name: 'dance' });
  });
});
