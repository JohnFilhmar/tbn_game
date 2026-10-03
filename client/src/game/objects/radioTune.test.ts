import { describe, expect, it } from 'vitest';
import { barNotes } from './radioTune';

describe('the radio', () => {
  it('plays the same bar the same way, four chords round, on the pentatonic scale', () => {
    expect(barNotes(5)).toEqual(barNotes(5));
    expect(barNotes(0).chord).toEqual(barNotes(4).chord);
    expect(barNotes(0).chord).not.toEqual(barNotes(1).chord);
    const scale = new Set([0, 2, 4, 7, 9]);
    for (let bar = 0; bar < 32; bar += 1) {
      const { melody } = barNotes(bar);
      expect(melody).toHaveLength(4);
      for (const note of melody) if (note !== null) expect(scale.has(note % 12)).toBe(true);
    }
  });
});
