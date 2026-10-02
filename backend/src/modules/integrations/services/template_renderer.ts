import type { IntegrationBodyFormat, PlaceholderValues } from '@tbn/contracts';

/** How a value is escaped where it lands. */
export type Escaping = 'json' | 'form' | 'url' | 'header' | 'raw';

/** The placeholder syntax: `{{name}}`, blanks allowed inside the braces. */
const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** Escapes one value for the place it is inserted. No expressions, no code: replacement only. */
export function escape_value(value: string, escaping: Escaping): string {
  switch (escaping) {
    case 'json':
      // Inside a JSON string literal: the quotes belong to the template.
      return JSON.stringify(value).slice(1, -1);
    case 'form':
    case 'url':
      return encodeURIComponent(value);
    case 'header':
      return value.replace(/[\r\n]+/g, ' ');
    case 'raw':
      return value;
  }
}

/**
 * Replaces every `{{name}}` in a template with the escaped value. A placeholder without a value
 * becomes empty, which the integration service prevents for required ones before rendering.
 */
export function render_template(
  template: string,
  values: PlaceholderValues,
  escaping: Escaping,
): string {
  return template.replace(PLACEHOLDER, (_whole, name: string) =>
    escape_value(values[name] ?? '', escaping),
  );
}

/** The escaping a body format uses for the values in its body. */
export function body_escaping(format: IntegrationBodyFormat): Escaping {
  switch (format) {
    case 'json':
      return 'json';
    case 'form':
      return 'form';
    case 'text':
    case 'none':
      return 'raw';
  }
}

/** The content type a body format sends, or null when there is no body. */
export function body_content_type(format: IntegrationBodyFormat): string | null {
  switch (format) {
    case 'json':
      return 'application/json';
    case 'form':
      return 'application/x-www-form-urlencoded';
    case 'text':
      return 'text/plain; charset=utf-8';
    case 'none':
      return null;
  }
}
