import { render_report } from './report_builder';

const usage = {
  requests: 3,
  input_tokens: 1_200,
  output_tokens: 400,
  cache_read_tokens: 900,
  cache_write_tokens: 100,
  cost: 0.01234,
};

describe('render_report', () => {
  it('puts the outcome first and the tokens and cost last', () => {
    const report = render_report(
      { task_title: 'Write a haiku', agent_name: 'ada', report_style: 'concise' },
      {
        outcome: 'Wrote it.',
        what_was_done: 'Saved poems/autumn.md',
        decisions: '',
        open_questions: '',
      },
      usage,
    );

    expect(report).toBe(
      [
        '# Write a haiku',
        'By ada.',
        '## Outcome\n\nWrote it.',
        '## What was done\n\nSaved poems/autumn.md',
        '## Tokens and cost\n\n- Requests: 3\n- Input tokens: 1200 (cache reads 900, cache writes 100)\n- Output tokens: 400\n- Cost: $0.0123',
      ].join('\n\n') + '\n',
    );
  });

  it('keeps empty sections in the detailed style', () => {
    const report = render_report(
      { task_title: 'T', agent_name: 'a', report_style: 'detailed' },
      { outcome: 'Done.', what_was_done: '', decisions: '', open_questions: '' },
      usage,
    );

    expect(report).toContain('## What was decided\n\n(none)');
    expect(report).toContain('## Open questions\n\n(none)');
  });
});
