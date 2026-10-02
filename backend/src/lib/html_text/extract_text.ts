/** The readable text of a page, and its title when it had one. */
export interface ExtractedText {
  title: string | null;
  text: string;
}

/** Elements whose content is never text for a reader. */
const DROPPED_ELEMENTS = ['script', 'style', 'noscript', 'template', 'svg', 'head', 'iframe'];

/** Elements that start or end a line. */
const BLOCK_ELEMENTS = [
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'td',
  'th',
  'tr',
  'ul',
];

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  euro: '€',
  pound: '£',
  yen: '¥',
  deg: '°',
  times: '×',
  laquo: '«',
  raquo: '»',
};

/** Replaces HTML character references with their characters. Unknown names stay as they are. */
export function decode_entities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = parseInt(body.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    if (body.startsWith('#')) {
      const code = parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Collapses runs of blanks and trims every line; at most one empty line between paragraphs. */
export function collapse_whitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The text a reader sees on an HTML page: scripts, styles and markup dropped, block elements as
 * line breaks, character references decoded, whitespace collapsed. Good enough for a model to
 * read; it is not a layout engine.
 */
export function extract_html_text(html: string): ExtractedText {
  const title_match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title =
    title_match?.[1] === undefined
      ? null
      : collapse_whitespace(decode_entities(title_match[1].replace(/<[^>]+>/g, ''))) || null;
  let text = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const element of DROPPED_ELEMENTS) {
    text = text.replace(new RegExp(`<${element}\\b[^>]*>[\\s\\S]*?<\\/${element}\\s*>`, 'gi'), ' ');
  }
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(new RegExp(`<\\/?(?:${BLOCK_ELEMENTS.join('|')})\\b[^>]*>`, 'gi'), '\n');
  text = text.replace(/<[^>]+>/g, ' ');
  return { title, text: collapse_whitespace(decode_entities(text)) };
}
