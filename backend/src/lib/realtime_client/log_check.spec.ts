import { compare_with_log } from './log_check';

describe('compare_with_log', () => {
  it('matches when every sequence arrived once and in order', () => {
    expect(compare_with_log([4, 5, 6], [4, 5, 6])).toEqual({
      expected: 3,
      received: 3,
      missing: [],
      repeated: [],
      in_order: true,
      matches: true,
    });
  });

  it('names the sequences that are missing or repeated', () => {
    expect(compare_with_log([4, 6, 6], [4, 5, 6])).toMatchObject({
      missing: [5],
      repeated: [6],
      in_order: false,
      matches: false,
    });
  });

  it('does not match when the sequences arrived out of order', () => {
    expect(compare_with_log([5, 4, 6], [4, 5, 6])).toMatchObject({
      missing: [],
      repeated: [],
      in_order: false,
      matches: false,
    });
  });
});
