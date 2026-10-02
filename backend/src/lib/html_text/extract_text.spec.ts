import { collapse_whitespace, decode_entities, extract_html_text } from './extract_text';

describe('extract_html_text', () => {
  it('keeps the readable text, drops scripts, styles and markup, and finds the title', () => {
    const html = `<!doctype html><html><head><title> The &amp; Page </title>
      <style>body { color: red }</style><script>alert('x')</script></head>
      <body><!-- a comment --><nav><a href="/">Home</a> | <a href="/x">X</a></nav>
      <h1>Heading</h1><p>First   paragraph with <b>bold</b> and &lt;tags&gt;.<br>Second line.</p>
      <ul><li>one</li><li>two &#169; &#x263A;</li></ul>
      <script type="text/javascript">var hidden = "never shown";</script>
      <table><tr><td>a</td><td>b</td></tr></table>
      <p>&nbsp;Trailing&nbsp;&hellip;</p></body></html>`;
    const { title, text } = extract_html_text(html);
    expect(title).toBe('The & Page');
    expect(text).toBe(
      [
        'Home | X',
        '',
        'Heading',
        '',
        'First paragraph with bold and <tags>.',
        'Second line.',
        '',
        'one',
        '',
        'two © ☺',
        '',
        'a',
        '',
        'b',
        '',
        'Trailing …',
      ].join('\n'),
    );
    expect(text).not.toContain('hidden');
    expect(text).not.toContain('color: red');
  });

  it('has no title when the page has none and survives broken markup', () => {
    const { title, text } = extract_html_text('<p>unclosed <b>bold <i>text</p><div>next');
    expect(title).toBeNull();
    expect(text).toBe('unclosed bold text\n\nnext');
  });
});

describe('decode_entities and collapse_whitespace', () => {
  it('decodes named and numeric references and leaves unknown ones', () => {
    expect(
      decode_entities('&lt;a&gt; &quot;q&quot; &#39;s&#39; &#x41;&#66; &unknown; &mdash;'),
    ).toBe('<a> "q" \'s\' AB &unknown; —');
  });

  it('collapses blanks and blank lines', () => {
    expect(collapse_whitespace('  a   b \r\n\n\n\n  c\t d  \n')).toBe('a b\n\nc d');
  });
});
