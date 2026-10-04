import type { ModelResponse } from '@/modules/runtime/types/model_request';
import { recover_text_tool_call } from './text_tool_call';

const usage = { input_tokens: 1, output_tokens: 1, cache_read_tokens: 0, cache_write_tokens: 0 };
const said = (text: string): ModelResponse => ({
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  usage,
});

describe('a tool call written as text', () => {
  it('becomes the call when the text is only that and names an offered tool', () => {
    const recovered = recover_text_tool_call(
      said(' {"name": "finish_task", "arguments": {"outcome": "Done."}} '),
      ['finish_task'],
    );
    expect(recovered).toMatchObject({
      content: [{ type: 'tool_use', name: 'finish_task', input: { outcome: 'Done.' } }],
      stop_reason: 'tool_use',
    });
  });

  it('stays text when it is prose, names a tool not offered, or is not JSON', () => {
    for (const text of [
      'Here is {"name": "finish_task"} in a sentence.',
      '{"name": "rm_rf", "parameters": {}}',
      '{"name": "finish_task", "parameters": ',
    ]) {
      expect(recover_text_tool_call(said(text), ['finish_task'])).toEqual(said(text));
    }
  });
});
