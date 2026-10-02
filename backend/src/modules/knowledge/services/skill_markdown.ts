/** The parts of a `SKILL.md` file. */
export interface SkillMarkdown {
  name: string;
  description: string;
  body: string;
}

/** Raised when a `SKILL.md` file has no usable frontmatter. */
export class SkillMarkdownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillMarkdownError';
  }
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function unquote(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote) && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/\\(["'\\])/g, '$1');
  }
  return trimmed;
}

/**
 * Reads the `name` and `description` frontmatter and the body of a `SKILL.md` file. Only the
 * simple `key: value` form is supported; other keys are ignored.
 *
 * @throws SkillMarkdownError when the frontmatter or one of the two keys is missing.
 */
export function parse_skill_markdown(markdown: string): SkillMarkdown {
  const match = FRONTMATTER.exec(markdown.replace(/^\uFEFF/, ''));
  if (match === null) throw new SkillMarkdownError('SKILL.md must start with --- frontmatter ---');
  const fields = new Map<string, string>();
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    fields.set(line.slice(0, separator).trim(), unquote(line.slice(separator + 1)));
  }
  const name = fields.get('name');
  const description = fields.get('description');
  if (name === undefined || name.length === 0)
    throw new SkillMarkdownError('frontmatter needs a name');
  if (description === undefined || description.length === 0) {
    throw new SkillMarkdownError('frontmatter needs a description');
  }
  return { name, description, body: (match[2] ?? '').trim() };
}

function quote(value: string): string {
  return /[:#"'\n]/.test(value) ? `"${value.replace(/(["\\])/g, '\\$1')}"` : value;
}

/** Writes a skill as a `SKILL.md` file that `parse_skill_markdown` reads back. */
export function format_skill_markdown(skill: SkillMarkdown): string {
  return `---\nname: ${quote(skill.name)}\ndescription: ${quote(skill.description)}\n---\n\n${skill.body.trim()}\n`;
}
