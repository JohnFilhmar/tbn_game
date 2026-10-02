import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { z } from 'zod';
import { AgentService } from '@/modules/company/services/agent.service';
import { TaskService } from '@/modules/company/services/task.service';
import type { AgentRecord } from '@/modules/company/types/company_records';
import { ProviderService } from '@/modules/runtime/services/provider.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import {
  create_test_provider,
  recruit_test_agent,
  TEST_INTERN_MODEL,
} from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { ListRosterTool } from './list_roster.tool';

const RosterSchema = z.object({
  you: z.string(),
  agents: z.array(
    z.object({
      name: z.string(),
      level: z.enum(['manager', 'intern']),
      department: z.string(),
      your_department: z.boolean(),
      role: z.string(),
      job_description: z.string(),
      status: z.string(),
      current_task: z.object({ title: z.string(), status: z.string() }).nullable(),
      queued_tasks: z.number(),
      key: z.string().nullable(),
      local: z.boolean(),
    }),
  ),
});

describe('list_roster', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let agents: AgentService;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    agents = app.get(AgentService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists every live agent with its department, work and key, from the caller point of view', async () => {
    const cloud = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    const providers = app.get(ProviderService);
    const local = await providers.update(
      owner.owner_id,
      (await create_test_provider(app, owner.owner_id, 'openai_chat_completions')).id,
      { is_local: true },
    );
    const lead: AgentRecord = await agents.require(
      owner.owner_id,
      (await recruit_test_agent(app, owner.owner_id, cloud.id, { role: 'Research lead' })).id,
    );
    const peer = await recruit_test_agent(app, owner.owner_id, cloud.id, { role: 'Editor' });
    const intern = await agents.spawn_intern(owner.owner_id, lead, {
      role: 'Researcher',
      job_description: 'Looks things up.',
      provider_id: local.id,
      primary_model: TEST_INTERN_MODEL,
    });
    const gone = await recruit_test_agent(app, owner.owner_id, cloud.id);
    await agents.dismiss(owner.owner_id, gone.id);
    const tasks = app.get(TaskService);
    const held = await tasks.create(owner.owner_id, {
      title: 'Sources',
      instructions: 'Find them.',
      assignee_agent_id: intern.id,
    });
    await tasks.start(owner.owner_id, held.id);
    await tasks.create(owner.owner_id, {
      title: 'Later',
      instructions: 'After that.',
      assignee_agent_id: intern.id,
    });

    const outcome = await app.get(ListRosterTool).execute(
      {},
      {
        owner_id: owner.owner_id,
        agent_id: lead.id,
        agent: lead,
        run_id: randomUUID(),
        task_id: null,
        workspace_dir: '/tmp',
      },
    );
    const roster = RosterSchema.parse(JSON.parse(outcome.content));
    expect(roster.you).toBe(lead.name);
    expect(roster.agents.map((agent) => agent.name).sort()).toEqual(
      [lead.name, peer.name, intern.name].sort(),
    );
    expect(roster.agents.find((agent) => agent.name === intern.name)).toEqual({
      name: intern.name,
      level: 'intern',
      department: 'Research lead',
      your_department: true,
      role: 'Researcher',
      job_description: 'Looks things up.',
      status: 'idle',
      current_task: { title: 'Sources', status: 'in_progress' },
      queued_tasks: 1,
      key: local.name,
      local: true,
    });
    expect(roster.agents.find((agent) => agent.name === peer.name)).toMatchObject({
      level: 'manager',
      your_department: false,
      current_task: null,
      queued_tasks: 0,
      key: cloud.name,
      local: false,
    });
  });
});
