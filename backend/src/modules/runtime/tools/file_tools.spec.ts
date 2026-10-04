import { text_window } from './file_tools';

describe('read_file', () => {
  it('reads a window of a long file and says where to read on', () => {
    const text = 'abcdefghij';
    expect(text_window(text, 0, 4)).toBe(
      'abcd\n... 6 more characters; read_file with offset 4 reads on',
    );
    expect(text_window(text, 4, 4)).toBe(
      'efgh\n... 2 more characters; read_file with offset 8 reads on',
    );
    expect(text_window(text, 8, 4)).toBe('ij');
    expect(text_window(text, 0, 40)).toBe('abcdefghij');
  });
});
