import {
  body_content_type,
  body_escaping,
  escape_value,
  render_template,
} from './template_renderer';

describe('render_template', () => {
  const hostile = 'a"b\\c\nd&e=f#g {{token}} </script>';

  it('escapes values so they cannot break out of a JSON body', () => {
    const body = render_template(
      '{"text": "{{text}}", "n": "{{missing}}"}',
      { text: hostile },
      'json',
    );
    const parsed: unknown = JSON.parse(body);
    expect(parsed).toEqual({ text: hostile, n: '' });
  });

  it('percent-encodes values in form bodies and URLs', () => {
    const form = render_template('text={{text}}&other=1', { text: hostile }, 'form');
    expect(new URLSearchParams(form).get('text')).toBe(hostile);
    expect(new URLSearchParams(form).get('other')).toBe('1');
    const url = render_template(
      'https://api.example/items/{{id}}?q={{q}}',
      { id: 'a/b', q: 'x&y=z' },
      'url',
    );
    expect(url).toBe('https://api.example/items/a%2Fb?q=x%26y%3Dz');
    expect(new URL(url).searchParams.get('q')).toBe('x&y=z');
  });

  it('keeps text raw and strips line breaks from headers', () => {
    expect(render_template('Hello {{ name }}!', { name: 'a"b\n' }, 'raw')).toBe('Hello a"b\n!');
    expect(render_template('Bearer {{token}}', { token: 'abc\r\nX-Injected: yes' }, 'header')).toBe(
      'Bearer abc X-Injected: yes',
    );
  });

  it('maps body formats to escaping and content types', () => {
    expect(body_escaping('json')).toBe('json');
    expect(body_escaping('form')).toBe('form');
    expect(body_escaping('text')).toBe('raw');
    expect(body_content_type('json')).toBe('application/json');
    expect(body_content_type('none')).toBeNull();
    expect(escape_value('plain', 'raw')).toBe('plain');
  });
});
