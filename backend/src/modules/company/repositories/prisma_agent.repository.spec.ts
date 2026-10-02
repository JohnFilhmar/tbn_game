import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Agent } from '@tbn/contracts';
import { AgentService } from '@/modules/company/services/agent.service';
import { TaskService } from '@/modules/company/services/task.service';
import type { AgentRecord } from '@/modules/company/types/company_records';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import {
  create_test_provider,
  recruit_test_agent,
  TEST_INTERN_MODEL,
} from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { AGENT_REPOSITORY, type AgentRepository } from './interface/agent_repository.interface';

describe('interns in the agent repository', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let other: TestOwner;
  let agents: AgentService;
  let repository: AgentRepository;
  let provider_id: string;
  let manager: AgentRecord;
  let rival: AgentRecord;

  async function intern(of: AgentRecord, role = 'Researcher'): Promise<AgentRecord> {
    return agents.spawn_intern(owner.owner_id, of, {
      role,
      job_description: `${role} for ${of.name}`,
      provider_id,
      primary_model: TEST_INTERN_MODEL,
    });
  }

  async function record_of(agent: Agent): Promise<AgentRecord> {
    return agents.require(owner.owner_id, agent.id);
  }

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    other = await create_test_owner(app);
    agents = app.get(AgentService);
    repository = app.get<AgentRepository>(AGENT_REPOSITORY);
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    provider_id = provider.id;
    manager = await record_of(
      await recruit_test_agent(app, owner.owner_id, provider_id, {
        role: 'Research lead',
        tool_policy: { write_file: 'deny' },
      }),
    );
    rival = await record_of(await recruit_test_agent(app, owner.owner_id, provider_id));
  });

  afterAll(async () => {
    await app.close();
  });

  it('spawns interns named after their manager, in its department, with its tool policy', async () => {
    const first = await intern(manager);
    const second = await intern(manager, 'Writer');
    expect(first).toMatchObject({
      name: `${manager.name} intern 1`,
      level: 2,
      role: 'Researcher',
      department_id: manager.department_id,
      provider_id,
      primary_model: TEST_INTERN_MODEL,
      intern_model: TEST_INTERN_MODEL,
      tool_policy: { write_file: 'deny' },
      status: 'idle',
    });
    expect(first.idle_since).not.toBeNull();
    expect(second.name).toBe(`${manager.name} intern 2`);

    const racing = await Promise.all([intern(manager), intern(manager), intern(manager)]);
    expect(new Set(racing.map((agent) => agent.name)).size).toBe(3);

    await expect(intern(first)).rejects.toThrow(ConflictException);
    await expect(
      agents.spawn_intern(owner.owner_id, manager, {
        role: 'Researcher',
        job_description: 'x',
        provider_id,
        primary_model: 'not-offered',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('finds idle interns of one department: no active run and no open task', async () => {
    const idle = await intern(rival, 'Analyst');
    const busy = await intern(rival, 'Analyst');
    const queued = await intern(rival, 'Analyst');
    await intern(manager, 'Analyst');
    expect(await repository.claim_run(owner.owner_id, busy.id, randomUUID())).toBe(true);
    await app.get(TaskService).delegate(owner.owner_id, {
      title: 'Look',
      instructions: 'Look around.',
      assignee_agent_id: queued.id,
      delegator_agent_id: rival.id,
      parent_task_id: null,
    });

    const found = await agents.idle_interns(owner.owner_id, rival.department_id);
    expect(found.map((agent) => agent.id)).toEqual([idle.id]);
    expect(await agents.idle_interns(other.owner_id, rival.department_id)).toEqual([]);
  });

  it('records idle time and terminates only idle interns past the cutoff', async () => {
    const worker = await intern(manager, 'Tester');
    const run_id = randomUUID();
    expect(await repository.claim_run(owner.owner_id, worker.id, run_id)).toBe(true);
    expect((await agents.require(owner.owner_id, worker.id)).idle_since).toBeNull();
    expect(await agents.terminate_idle_intern(owner.owner_id, worker.id, null)).toBe(false);
    await repository.release_run(owner.owner_id, worker.id, run_id);
    const released = await agents.require(owner.owner_id, worker.id);
    expect(released.idle_since).not.toBeNull();

    const live_before = await agents.count_live(owner.owner_id, {
      department_id: manager.department_id,
      level: 2,
    });
    const long_ago = new Date(Date.now() - 60_000);
    expect(await agents.terminate_idle_intern(owner.owner_id, worker.id, long_ago)).toBe(false);
    expect(await agents.terminate_idle_intern(other.owner_id, worker.id, null)).toBe(false);
    expect(await agents.terminate_idle_intern(owner.owner_id, manager.id, null)).toBe(false);
    expect(
      await agents.terminate_idle_intern(owner.owner_id, worker.id, new Date(Date.now() + 1_000)),
    ).toBe(true);
    expect((await agents.require(owner.owner_id, worker.id)).status).toBe('terminated');
    expect(
      await agents.count_live(owner.owner_id, { department_id: manager.department_id, level: 2 }),
    ).toBe(live_before - 1);
  });

  it("lists idle interns of every owner with their manager's status", async () => {
    const lead = await record_of(await recruit_test_agent(app, owner.owner_id, provider_id));
    const orphan = await intern(lead, 'Helper');
    const before = (await agents.find_idle_interns()).find((item) => item.id === orphan.id);
    expect(before).toMatchObject({ owner_id: owner.owner_id, manager_status: 'idle' });
    await agents.dismiss(owner.owner_id, lead.id);
    const after = (await agents.find_idle_interns()).find((item) => item.id === orphan.id);
    expect(after?.manager_status).toBe('dismissed');
  });

  it('builds the roster with the task each live agent holds', async () => {
    const tasks = app.get(TaskService);
    const lead = await record_of(await recruit_test_agent(app, owner.owner_id, provider_id));
    const held = await tasks.create(owner.owner_id, {
      title: 'Held',
      instructions: 'x',
      assignee_agent_id: lead.id,
    });
    await tasks.start(owner.owner_id, held.id);
    await tasks.create(owner.owner_id, {
      title: 'Next',
      instructions: 'x',
      assignee_agent_id: lead.id,
    });
    const gone = await intern(lead, 'Temp');
    await agents.terminate_idle_intern(owner.owner_id, gone.id, null);

    const roster = await agents.roster(owner.owner_id);
    const entry = roster.find((item) => item.agent.id === lead.id);
    expect(entry).toMatchObject({ department_name: lead.role, queued_task_count: 1 });
    expect(entry?.current_task?.id).toBe(held.id);
    expect(roster.some((item) => item.agent.id === gone.id)).toBe(false);
    expect(await agents.roster(other.owner_id)).toEqual([]);
  });

  it('lists the live agents on a provider', async () => {
    const on_key = await agents.list_on_provider(owner.owner_id, provider_id);
    expect(on_key.map((agent) => agent.id)).toContain(manager.id);
    expect(on_key.every((agent) => agent.status !== 'terminated')).toBe(true);
    expect(await agents.list_on_provider(other.owner_id, provider_id)).toEqual([]);
  });
});
