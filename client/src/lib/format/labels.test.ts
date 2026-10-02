import { describe, expect, it } from 'vitest';
import { humanize, toneOf } from './labels';

describe('status labels', () => {
  it('turns machine names into words', () => {
    expect(humanize('awaiting_approval')).toBe('Awaiting approval');
    expect(humanize('done')).toBe('Done');
    expect(humanize('')).toBe('');
  });

  it('gives each status the tone of what it means, and unknown ones a neutral one', () => {
    expect(toneOf('failed')).toBe('danger');
    expect(toneOf('awaiting_approval')).toBe('warning');
    expect(toneOf('done')).toBe('success');
    expect(toneOf('running')).toBe('info');
    expect(toneOf('something_new')).toBe('neutral');
  });
});
