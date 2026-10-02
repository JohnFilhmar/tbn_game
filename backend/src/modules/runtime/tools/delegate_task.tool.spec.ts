import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@/lib/database/prisma.service';
import { AgentService } from '@/modules/company/services/agent.service';
import { TaskService } from '@/modules/company/services/task.service';
import type { AgentRecord } from '@/modules/company/types/company_records';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import { CapService } from '@/modules/runtime/services/caps/cap.service';
import { ProviderService } from '@/modules/runtime/services/provider.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import {
  create_test_provider,
  recruit_test_agent,
  TEST_INTERN_MODEL,
} from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { DelegateTaskTool } from './delegate_task.tool';
import type { ToolContext, ToolOutcome } from './tool.interface';

describe('delegate_task', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let tool: DelegateTaskTool;
  let agents: AgentService;
  let tasks: TaskService;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    tool = app.get(DelegateTaskTool);
    agents = app.get(AgentService);
    tasks = app.get(TaskService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function manager_on(provider_id?: string): Promise<AgentRecord> {
    const key =
      provider_id ?? (await create_test_provider(app, owner.owner_id, 'anthropic_messages')).id;
    const recruited = await recruit_test_agent(app, owner.owner_id, key, { role: 'Research lead' });
    return agents.require(owner.owner_id, recruited.id);
  }

  function context_of(agent: AgentRecord, task_id: string | null = null): ToolContext {
    return {
      owner_id: owner.owner_id,
      agent_id: agent.id,
      agent,
      run_id: randomUUID(),
      task_id,
      workspace_dir: '/tmp',
    };
  }

  function delegate(
    manager: AgentRecord,
    who: { intern_name: string } | { new_intern_role: string; new_intern_job_description?: string },
    task_id: string | null = null,
  ): Promise<ToolOutcome> {
    const input =
      'intern_name' in who
        ? { title: 'Part', instructions: 'Do one part.', intern_name: who.intern_name }
        : {
            title: 'Part',
            instructions: 'Do one part.',
            new_intern_role: who.new_intern_role,
            new_intern_job_description: who.new_intern_job_description ?? 'Helps.',
          };
    return tool.execute(input, context_of(manager, task_id));
  }

  /** The intern a successful delegation names, read back by name. */
  async function intern_of(outcome: ToolOutcome): Promise<AgentRecord> {
    expect(outcome.is_error).toBeFalsy();
    const name = /to (.+? intern \d+):/.exec(outcome.content)?.[1] ?? '';
    const intern = await agents.find_by_name(owner.owner_id, name);
    if (intern === null) throw new Error(`No intern in: ${outcome.content}`);
    return intern;
  }

  /** Finishes every open task of an intern, so it is idle again. */
  async function finish_work(intern: AgentRecord): Promise<void> {
    for (const task of await tasks.list(owner.owner_id, { agent_id: intern.id })) {
      if (task.status === 'queued') await tasks.start(owner.owner_id, task.id);
      if (task.status === 'queued' || task.status === 'in_progress') {
        await tasks.complete(owner.owner_id, task.id, 'Done.');
      }
    }
  }

  async function use_key(provider_id: string, agent_id: string, requests: number): Promise<void> {
    for (let index = 0; index < requests; index += 1) {
      await app.get(PrismaService).usageRecord.create({
        data: {
          owner_id: owner.owner_id,
          provider_id,
          agent_id,
          model_id: TEST_INTERN_MODEL,
          input_tokens: 10,
          output_tokens: 1,
        },
      });
    }
  }

  it('spawns a new intern on the manager key with its intern model and queues the subtask', async () => {
    const manager = await manager_on();
    const goal = await tasks.create(owner.owner_id, {
      title: 'Goal',
      instructions: 'All of it.',
      assignee_agent_id: manager.id,
    });
    const outcome = await delegate(manager, { new_intern_role: 'Researcher' }, goal.id);
    const intern = await intern_of(outcome);
    expect(outcome.content).toContain('a new intern');
    expect(intern).toMatchObject({
      name: `${manager.name} intern 1`,
      level: 2,
      department_id: manager.department_id,
      provider_id: manager.provider_id,
      primary_model: TEST_INTERN_MODEL,
    });
    expect(await tasks.list(owner.owner_id, { parent_task_id: goal.id })).toEqual([
      expect.objectContaining({
        assignee_agent_id: intern.id,
        delegator_agent_id: manager.id,
        status: 'queued',
      }),
    ]);
  });

  it('reuses an idle intern before a spawn: by role when asked for a new one, and by name', async () => {
    const manager = await manager_on();
    const researcher = await intern_of(await delegate(manager, { new_intern_role: 'Researcher' }));
    const busy_now = await intern_of(await delegate(manager, { new_intern_role: 'Researcher' }));
    expect(busy_now.id).not.toBe(researcher.id);

    await finish_work(researcher);
    const by_role = await delegate(manager, { new_intern_role: 'researcher' });
    expect((await intern_of(by_role)).id).toBe(researcher.id);
    expect(by_role.content).toContain('reused instead of spawning');

    const writer = await intern_of(await delegate(manager, { new_intern_role: 'Writer' }));
    await finish_work(writer);
    const by_name = await delegate(manager, { intern_name: writer.name });
    expect((await intern_of(by_name)).id).toBe(writer.id);
    expect(by_name.content).toContain('an idle intern you named');

    expect(
      await agents.count_live(owner.owner_id, { department_id: manager.department_id, level: 2 }),
    ).toBe(3);
  });

  it("refuses another department's intern, a busy or terminated one, and a caller that is not a manager", async () => {
    const manager = await manager_on();
    const rival = await manager_on();
    const theirs = await intern_of(await delegate(rival, { new_intern_role: 'Analyst' }));
    await finish_work(theirs);
    const foreign = await delegate(manager, { intern_name: theirs.name });
    expect(foreign).toMatchObject({ is_error: true });
    expect(foreign.content).toContain('belongs to another department');

    const mine = await intern_of(await delegate(manager, { new_intern_role: 'Analyst' }));
    const busy = await delegate(manager, { intern_name: mine.name });
    expect(busy.content).toContain('is busy');
    await finish_work(mine);
    await agents.terminate_idle_intern(owner.owner_id, mine.id, null);
    expect((await delegate(manager, { intern_name: mine.name })).content).toContain(
      'was terminated',
    );

    expect((await delegate(theirs, { new_intern_role: 'Analyst' })).content).toBe(
      'Only managers delegate.',
    );
    const both = await tool.execute(
      {
        title: 'x',
        instructions: 'x',
        intern_name: theirs.name,
        new_intern_role: 'Analyst',
        new_intern_job_description: 'x',
      },
      context_of(manager),
    );
    expect(both).toMatchObject({ is_error: true });
  });

  it('sends new interns to the local provider once an enforced window passes its threshold', async () => {
    const key = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    const manager = await manager_on(key.id);
    const early = await intern_of(await delegate(manager, { new_intern_role: 'Researcher' }));
    await finish_work(early);
    await app.get(CapService).create(owner.owner_id, key.id, {
      name: 'Hourly',
      length_count: 1,
      length_unit: 'hour',
      reset_mode: 'rolling',
      unit: 'requests',
      limit: 10,
      threshold_percent: 50,
      enforced: true,
    });
    await use_key(key.id, manager.id, 5);

    const no_local = await delegate(manager, { new_intern_role: 'Writer' });
    expect(no_local).toMatchObject({ is_error: true });
    expect(no_local.content).toContain('Do this subtask yourself');
    expect((await delegate(manager, { intern_name: early.name })).content).toContain(
      'past the threshold',
    );

    const local = await app.get(ProviderService).create(owner.owner_id, {
      name: `local-${randomUUID()}`,
      api_format: 'openai_chat_completions',
      base_url: 'http://127.0.0.1:9/v1',
      api_key: 'unused',
      is_local: true,
      models: [
        { model_id: 'llama-big', cost_tier: 'standard' },
        { model_id: 'llama-small', cost_tier: 'cheap' },
      ],
    });
    const switched = await delegate(manager, { new_intern_role: 'Researcher' });
    const local_intern = await intern_of(switched);
    expect(local_intern.id).not.toBe(early.id);
    expect(local_intern).toMatchObject({ provider_id: local.id, primary_model: 'llama-small' });
    expect(switched.content).toContain('local provider');
  });

  it('ignores a display-only window far past its limit', async () => {
    const key = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    const manager = await manager_on(key.id);
    await app.get(CapService).create(owner.owner_id, key.id, {
      name: 'Display only',
      length_count: 1,
      length_unit: 'day',
      reset_mode: 'rolling',
      unit: 'requests',
      limit: 1,
    });
    await use_key(key.id, manager.id, 10);
    const intern = await intern_of(await delegate(manager, { new_intern_role: 'Researcher' }));
    expect(intern.provider_id).toBe(key.id);
  });

  it("keeps to the owner's limits on interns and live agents", async () => {
    const preferences = app.get(PreferenceService);
    const manager = await manager_on();
    await preferences.set(owner.owner_id, 'max_interns_per_manager', 1);
    await intern_of(await delegate(manager, { new_intern_role: 'Researcher' }));
    const over = await delegate(manager, { new_intern_role: 'Writer' });
    expect(over.content).toContain("the owner's limit");
    await preferences.set(owner.owner_id, 'max_interns_per_manager', null);

    const live = await agents.count_live(owner.owner_id, {});
    await preferences.set(owner.owner_id, 'max_live_agents', live);
    expect((await delegate(manager, { new_intern_role: 'Writer' })).content).toContain(
      'live agents',
    );
    await preferences.set(owner.owner_id, 'max_live_agents', null);
    expect((await delegate(manager, { new_intern_role: 'Writer' })).is_error).toBeFalsy();
  });
});
