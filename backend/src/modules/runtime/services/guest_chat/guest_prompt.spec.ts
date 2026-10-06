import { build_guest_prompt, type GuestPromptInput } from './guest_prompt';

const input: GuestPromptInput = {
  agent: {
    name: 'ada',
    role: 'Researcher',
    job_description: 'Finds sources.',
    department_name: 'Research',
  },
  owner_username: 'john',
  guest_name: 'Mika',
  roster: [
    { name: 'ada', role: 'Researcher', task_title: null },
    { name: 'bo', role: 'Writer', task_title: 'Draft the launch post' },
  ],
  finished: [
    { title: 'Find sources', agent_name: 'ada', result: `Three ${'very '.repeat(80)}good ones.` },
  ],
  history: [
    { role: 'agent', text: 'An old reply with nothing before it.' },
    { role: 'guest', text: 'Hi!' },
    { role: 'guest', text: 'What is bo doing?' },
  ],
};

describe('the guest prompt', () => {
  it('describes the persona and the company, offers no tools, and quotes results briefly', () => {
    const request = build_guest_prompt(input);
    expect(request.tools).toEqual([]);
    expect(request.system).toContain('You are ada, Researcher in the Research department');
    expect(request.system).toContain('chatting with Mika');
    expect(request.system).toContain('only john gives you tasks');
    expect(request.system).toContain('- bo, Writer: working on "Draft the launch post"');
    expect(request.system).toContain('- ada, Researcher: idle');
    expect(request.system).toContain('"Find sources" by ada: Three very');
    expect(request.system).toMatch(/\.\.\.$/m);
  });

  it('starts with the guest and joins lines in a row from the same side', () => {
    expect(build_guest_prompt(input).messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Hi!\n\nWhat is bo doing?' }] },
    ]);
  });
});
