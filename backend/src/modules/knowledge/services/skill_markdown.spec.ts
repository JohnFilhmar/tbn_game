import { SkillMarkdownError, format_skill_markdown, parse_skill_markdown } from './skill_markdown';

describe('skill markdown', () => {
  it('parses frontmatter with plain and quoted values', () => {
    const parsed = parse_skill_markdown(
      '---\nname: write-haiku\ndescription: "Write a haiku: three lines"\nversion: 2\n---\n\n# Steps\n\nCount syllables.\n',
    );

    expect(parsed).toEqual({
      name: 'write-haiku',
      description: 'Write a haiku: three lines',
      body: '# Steps\n\nCount syllables.',
    });
  });

  it('round-trips through format', () => {
    const skill = {
      name: 'review',
      description: 'Review: find bugs, "quietly"',
      body: 'Read the diff.',
    };

    expect(parse_skill_markdown(format_skill_markdown(skill))).toEqual(skill);
  });

  it('rejects missing frontmatter and missing keys', () => {
    expect(() => parse_skill_markdown('# No frontmatter')).toThrow(SkillMarkdownError);
    expect(() => parse_skill_markdown('---\ndescription: only\n---\nbody')).toThrow(/name/);
    expect(() => parse_skill_markdown('---\nname: only\n---\nbody')).toThrow(/description/);
  });
});
