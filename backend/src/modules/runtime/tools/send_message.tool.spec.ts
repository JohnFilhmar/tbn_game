import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AgentService } from '@/modules/company/services/agent.service';
import type { AgentRecord } from '@/modules/company/types/company_records';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import {
  TRANSCRIPT_REPOSITORY,
  type TranscriptRepository,
} from '@/modules/runtime/repositories/interface/transcript_repository.interface';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import {
  create_test_provider,
  recruit_test_agent,
  TEST_INTERN_MODEL,
} from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { count_wakes } from '@/testing/test_wakes';
import { SendMessageTool } from './send_message.tool';
import type { ToolOutcome } from './tool.interface';

describe('send_message', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let tool: SendMessageTool;
  let agents: AgentService;
  let transcripts: TranscriptRepository;
  let provider_id: string;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    tool = app.get(SendMessageTool);
    agents = app.get(AgentService);
    transcripts = app.get<TranscriptRepository>(TRANSCRIPT_REPOSITORY);
    provider_id = (await create_test_provider(app, owner.owner_id, 'anthropic_messages')).id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function manager(): Promise<AgentRecord> {
    const recruited = await recruit_test_agent(app, owner.owner_id, provider_id);
    return agents.require(owner.owner_id, recruited.id);
  }

  function intern_of(lead: AgentRecord): Promise<AgentRecord> {
    return agents.spawn_intern(owner.owner_id, lead, {
      role: 'Researcher',
      job_description: 'Looks things up.',
      provider_id,
      primary_model: TEST_INTERN_MODEL,
    });
  }

  function send(
    from: AgentRecord,
    to: string,
    text = 'Can you check the sources?',
  ): Promise<ToolOutcome> {
    return tool.execute(
      { to, kind: 'question', text },
      {
        owner_id: owner.owner_id,
        agent_id: from.id,
        agent: from,
        run_id: randomUUID(),
        task_id: null,
        workspace_dir: '/tmp',
      },
    );
  }

  it('lets a manager message every manager and its own interns, and an intern its own department', async () => {
    const lead = await manager();
    const peer = await manager();
    const own_intern = await intern_of(lead);
    const second_intern = await intern_of(lead);
    const peer_intern = await intern_of(peer);

    expect((await send(lead, peer.name)).is_error).toBeFalsy();
    expect((await send(lead, own_intern.name)).is_error).toBeFalsy();
    expect((await send(own_intern, lead.name)).is_error).toBeFalsy();
    expect((await send(own_intern, second_intern.name)).is_error).toBeFalsy();

    const to_peer_intern = await send(lead, peer_intern.name);
    expect(to_peer_intern).toMatchObject({ is_error: true });
    expect(to_peer_intern.content).toContain('Message its manager instead');
    const intern_to_peer = await send(own_intern, peer.name);
    expect(intern_to_peer).toMatchObject({ is_error: true });
    expect(intern_to_peer.content).toContain('Interns message their own manager');
    expect((await send(own_intern, peer_intern.name)).is_error).toBe(true);
    expect((await send(lead, lead.name)).content).toBe('You cannot message yourself.');
  });

  it('refuses a name that is unknown or belongs to an agent who left', async () => {
    const lead = await manager();
    const gone = await manager();
    await agents.dismiss(owner.owner_id, gone.id);
    expect(await send(lead, 'Nobody at all')).toEqual({
      content:
        'No live agent is named Nobody at all. send_message reaches other agents only; to answer the owner, reply in plain text.',
      is_error: true,
    });
    // A small model tried to answer the owner this way; the error tells it how to.
    expect((await send(lead, 'owner')).content).toContain(
      'to answer the owner, reply in plain text',
    );
    expect((await send(lead, gone.name)).is_error).toBe(true);
    expect(await transcripts.has_unread(owner.owner_id, gone.id)).toBe(false);
  });

  it('puts the message in the recipient session, in its running run, and wakes it', async () => {
    const lead = await manager();
    const idle = await manager();
    const working = await manager();
    const runs = app.get<RunRepository>(RUN_REPOSITORY);
    const run = await runs.create(owner.owner_id, working.id, null);
    expect(await agents.claim_run(owner.owner_id, working.id, run.id)).toBe(true);

    expect(await send(lead, idle.name, 'Is the draft ready?')).toEqual({
      content: `Delivered your question to ${idle.name}.`,
    });
    await send(lead, working.name, 'Use the new figures.');

    const [entry] = await transcripts.list_all(owner.owner_id, idle.id);
    expect(entry).toMatchObject({
      kind: 'agent_message',
      run_id: null,
      content: {
        from_agent_id: lead.id,
        from_name: lead.name,
        kind: 'question',
        text: 'Is the draft ready?',
      },
    });
    expect(await transcripts.has_unread(owner.owner_id, idle.id)).toBe(true);
    const [held] = await transcripts.list_all(owner.owner_id, working.id);
    expect(held?.run_id).toBe(run.id);
    expect(await count_wakes(app, idle.id)).toBe(1);
    expect(await count_wakes(app, working.id)).toBe(1);
  });
});
