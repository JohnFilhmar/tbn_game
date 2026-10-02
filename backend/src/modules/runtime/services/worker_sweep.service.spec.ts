import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@/lib/database/prisma.service';
import { AgentService } from '@/modules/company/services/agent.service';
import { TaskService } from '@/modules/company/services/task.service';
import type { AgentRecord } from '@/modules/company/types/company_records';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import { ProviderService } from '@/modules/runtime/services/provider.service';
import { WorkerSweepService } from '@/modules/runtime/services/worker_sweep.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import {
  create_test_provider,
  recruit_test_agent,
  TEST_INTERN_MODEL,
} from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { clear_wakes, count_wakes } from '@/testing/test_wakes';
import { reset_worker_state } from '@/testing/test_worker';

const MINUTE = 60_000;

/**
 * The sweep runs here in the web app with no worker, so the wakes it sends stay queued and the
 * tests count them per agent.
 */
describe('the worker sweep', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let owner: TestOwner;
  let agents: AgentService;
  let tasks: TaskService;
  let providers: ProviderService;
  let runs: RunRepository;
  let sweep: WorkerSweepService;
  let provider_id: string;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    await reset_worker_state(app);
    prisma = app.get(PrismaService);
    owner = await create_test_owner(app);
    agents = app.get(AgentService);
    tasks = app.get(TaskService);
    providers = app.get(ProviderService);
    runs = app.get<RunRepository>(RUN_REPOSITORY);
    sweep = app.get(WorkerSweepService);
    provider_id = (await create_test_provider(app, owner.owner_id, 'anthropic_messages')).id;
    await app.get(PreferenceService).set(owner.owner_id, 'intern_idle_ttl_minutes', 10);
  });

  afterAll(async () => {
    await app.close();
  });

  async function manager(on = provider_id): Promise<AgentRecord> {
    const recruited = await recruit_test_agent(app, owner.owner_id, on);
    return agents.require(owner.owner_id, recruited.id);
  }

  function intern_of(lead: AgentRecord): Promise<AgentRecord> {
    return agents.spawn_intern(owner.owner_id, lead, {
      role: 'Researcher',
      job_description: 'Looks things up.',
      provider_id: lead.provider_id,
      primary_model: TEST_INTERN_MODEL,
    });
  }

  async function status_of(agent: AgentRecord): Promise<string> {
    return (await agents.require(owner.owner_id, agent.id)).status;
  }

  async function paused_run(
    agent: AgentRecord,
    reason: 'cap_limit' | 'breaker_open' | 'out_of_credit',
    resume_at: Date | null,
  ): Promise<void> {
    const run = await runs.create(owner.owner_id, agent.id, null);
    await runs.acquire_lease(owner.owner_id, run.id, 'sweep_test', new Date(Date.now() + MINUTE));
    await runs.pause(owner.owner_id, run.id, 'sweep_test', reason, resume_at);
  }

  it('terminates an idle intern only once it stayed idle past the timeout', async () => {
    const lead = await manager();
    const intern = await intern_of(lead);
    await prisma.agent.update({
      where: { id: intern.id },
      data: { idle_since: new Date(Date.now() - 5 * MINUTE) },
    });

    await sweep.sweep(new Date());
    expect(await status_of(intern)).toBe('idle');
    await sweep.sweep(new Date(Date.now() + 6 * MINUTE));
    expect(await status_of(intern)).toBe('terminated');
    expect(await status_of(lead)).toBe('idle');
  });

  it('terminates the idle interns of a manager who was dismissed, without waiting', async () => {
    const lead = await manager();
    const intern = await intern_of(lead);
    await agents.dismiss(owner.owner_id, lead.id);

    await sweep.sweep(new Date());
    expect(await status_of(intern)).toBe('terminated');
  });

  it('wakes a paused run once its pause is over, and one on a key that has credit again', async () => {
    const due = await manager();
    const later = await manager();
    const spare_provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    const no_credit = await manager(spare_provider.id);
    await paused_run(due, 'cap_limit', new Date(Date.now() - 1_000));
    await paused_run(later, 'breaker_open', new Date(Date.now() + 10 * MINUTE));
    await paused_run(no_credit, 'out_of_credit', null);
    await providers.mark_out_of_credit(owner.owner_id, spare_provider.id);

    await sweep.sweep(new Date());
    expect(await count_wakes(app, due.id)).toBe(1);
    expect(await count_wakes(app, later.id)).toBe(0);
    expect(await count_wakes(app, no_credit.id)).toBe(0);

    await providers.resume(owner.owner_id, spare_provider.id);
    await sweep.sweep(new Date());
    expect(await count_wakes(app, no_credit.id)).toBe(1);
  });

  it('returns a task that never started to the queue once its key has credit again', async () => {
    const spare_provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    const agent = await manager(spare_provider.id);
    const task = await tasks.create(owner.owner_id, {
      title: 'Waits for credit',
      instructions: 'Do it.',
      assignee_agent_id: agent.id,
    });
    await providers.mark_out_of_credit(owner.owner_id, spare_provider.id);
    await tasks.block_open_for_agents(owner.owner_id, [agent.id], 'The key is out of credit');
    await clear_wakes(app, agent.id);

    await sweep.sweep(new Date());
    expect((await tasks.require(owner.owner_id, task.id)).status).toBe('blocked');
    expect(await count_wakes(app, agent.id)).toBe(0);

    await providers.resume(owner.owner_id, spare_provider.id);
    await sweep.sweep(new Date());
    expect(await tasks.require(owner.owner_id, task.id)).toMatchObject({
      status: 'queued',
      status_reason: null,
    });
    expect(await count_wakes(app, agent.id)).toBe(1);
  });

  it('wakes the manager of a finished subtask until the result was given to it', async () => {
    const lead = await manager();
    const intern = await intern_of(lead);
    const goal = await tasks.create(owner.owner_id, {
      title: 'Goal',
      instructions: 'Do it with help.',
      assignee_agent_id: lead.id,
    });
    const subtask = await tasks.delegate(owner.owner_id, {
      title: 'Part',
      instructions: 'Do a part.',
      assignee_agent_id: intern.id,
      delegator_agent_id: lead.id,
      parent_task_id: goal.id,
    });
    await tasks.start(owner.owner_id, subtask.id);
    await tasks.complete(owner.owner_id, subtask.id, 'Done.');
    await clear_wakes(app, lead.id);

    await sweep.sweep(new Date());
    expect(await count_wakes(app, lead.id)).toBe(1);

    await tasks.mark_delegator_notified(owner.owner_id, subtask.id);
    await clear_wakes(app, lead.id);
    await sweep.sweep(new Date());
    expect(await count_wakes(app, lead.id)).toBe(0);
  });

  it('wakes the agent of a running run whose lease lapsed, and not one whose lease is live', async () => {
    const lapsed = await manager();
    const live = await manager();
    const lapsed_run = await runs.create(owner.owner_id, lapsed.id, null);
    await runs.acquire_lease(owner.owner_id, lapsed_run.id, 'gone', new Date(Date.now() - 1_000));
    const live_run = await runs.create(owner.owner_id, live.id, null);
    await runs.acquire_lease(owner.owner_id, live_run.id, 'here', new Date(Date.now() + MINUTE));

    await sweep.sweep(new Date());
    expect(await count_wakes(app, lapsed.id)).toBe(1);
    expect(await count_wakes(app, live.id)).toBe(0);
  });
});
