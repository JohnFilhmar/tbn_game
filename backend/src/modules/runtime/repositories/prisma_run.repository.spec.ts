import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@/lib/database/prisma.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { RUN_REPOSITORY, type RunRepository } from './interface/run_repository.interface';

const SECOND = 1_000;

describe('PrismaRunRepository leases and pauses', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let owner: TestOwner;
  let other: TestOwner;
  let runs: RunRepository;
  let agent_id: string;
  const later = (seconds: number): Date => new Date(Date.now() + seconds * SECOND);

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    prisma = app.get(PrismaService);
    owner = await create_test_owner(app);
    other = await create_test_owner(app);
    runs = app.get<RunRepository>(RUN_REPOSITORY);
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    agent_id = (await recruit_test_agent(app, owner.owner_id, provider.id)).id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function held_run(lease_owner: string): Promise<string> {
    const run = await runs.create(owner.owner_id, agent_id, null);
    await runs.acquire_lease(owner.owner_id, run.id, lease_owner, later(10));
    return run.id;
  }

  async function create_task(title: string): Promise<string> {
    const task = await prisma.task.create({
      data: { owner_id: owner.owner_id, title, instructions: 'Test.', assignee_agent_id: agent_id },
    });
    return task.id;
  }

  it('gives a live lease to one holder only, its own holder included, and takes over an expired one', async () => {
    const run = await runs.create(owner.owner_id, agent_id, null);
    expect(await runs.acquire_lease(other.owner_id, run.id, 'worker_a', later(10))).toBeNull();
    expect(await runs.acquire_lease(owner.owner_id, run.id, 'worker_a', later(10))).toMatchObject({
      lease_owner: 'worker_a',
    });
    expect(await runs.acquire_lease(owner.owner_id, run.id, 'worker_a', later(10))).toBeNull();
    expect(await runs.acquire_lease(owner.owner_id, run.id, 'worker_b', later(10))).toBeNull();
    expect(await runs.extend_lease(owner.owner_id, run.id, 'worker_b', later(10))).toBe(false);
    expect(await runs.extend_lease(owner.owner_id, run.id, 'worker_a', later(20))).toBe(true);
    expect((await runs.find_orphaned(new Date())).map((found) => found.id)).not.toContain(run.id);

    await prisma.run.update({
      where: { id: run.id },
      data: { lease_expires_at: new Date(Date.now() - SECOND) },
    });
    expect((await runs.find_orphaned(new Date())).map((found) => found.id)).toContain(run.id);
    expect(await runs.acquire_lease(owner.owner_id, run.id, 'worker_b', later(10))).toMatchObject({
      lease_owner: 'worker_b',
    });
    await runs.release_lease(owner.owner_id, run.id, 'worker_a');
    expect(await runs.find(owner.owner_id, run.id)).toMatchObject({ lease_owner: 'worker_b' });
    await runs.release_lease(owner.owner_id, run.id, 'worker_b');
    expect(await runs.find(owner.owner_id, run.id)).toMatchObject({
      lease_owner: null,
      lease_expires_at: null,
    });
  });

  it('pauses a run only under its own lease and resumes it once, resetting the guard when asked', async () => {
    const id = await held_run('worker_a');
    expect(await runs.increment_turn(owner.owner_id, id)).toEqual({
      turn_count: 1,
      guard_turns: 1,
    });
    expect(await runs.increment_turn(owner.owner_id, id)).toEqual({
      turn_count: 2,
      guard_turns: 2,
    });
    const resume_at = later(30);
    expect(await runs.pause(owner.owner_id, id, 'worker_b', 'cap_limit', resume_at)).toBe(false);
    expect(await runs.pause(owner.owner_id, id, 'worker_a', 'cap_limit', resume_at)).toBe(true);
    expect(await runs.find(owner.owner_id, id)).toMatchObject({
      status: 'paused',
      pause_reason: 'cap_limit',
      resume_at,
      lease_owner: null,
      lease_expires_at: null,
    });
    expect(await runs.acquire_lease(owner.owner_id, id, 'worker_a', later(10))).toBeNull();

    expect(await runs.resume(other.owner_id, id, 'worker_b', later(10), false)).toBeNull();
    expect(await runs.resume(owner.owner_id, id, 'worker_b', later(10), false)).toMatchObject({
      status: 'running',
      pause_reason: null,
      resume_at: null,
      lease_owner: 'worker_b',
      turn_count: 2,
      guard_turns: 2,
    });
    expect(await runs.resume(owner.owner_id, id, 'worker_c', later(10), false)).toBeNull();

    await runs.pause(owner.owner_id, id, 'worker_b', 'breaker_open', later(5));
    expect(await runs.resume(owner.owner_id, id, 'worker_b', later(10), true)).toMatchObject({
      turn_count: 2,
      guard_turns: 0,
    });
  });

  it('lets the owner continue only a run the runaway guard paused', async () => {
    const id = await held_run('worker_a');
    await runs.increment_turn(owner.owner_id, id);
    expect(await runs.continue_after_guard(owner.owner_id, id)).toBeNull();
    await runs.pause(owner.owner_id, id, 'worker_a', 'waiting_on_subtasks', null);
    expect(await runs.continue_after_guard(owner.owner_id, id)).toBeNull();

    await runs.resume(owner.owner_id, id, 'worker_a', later(10), false);
    await runs.pause(owner.owner_id, id, 'worker_a', 'runaway_guard', null);
    expect(await runs.continue_after_guard(other.owner_id, id)).toBeNull();
    expect(await runs.continue_after_guard(owner.owner_id, id)).toMatchObject({
      status: 'running',
      pause_reason: null,
      lease_owner: null,
      turn_count: 1,
      guard_turns: 0,
    });
  });

  it('finishes a running or a paused run once, clearing its pause and its lease', async () => {
    const running = await held_run('worker_a');
    expect(await runs.finish(owner.owner_id, running, 'done', null)).toMatchObject({
      status: 'done',
      lease_owner: null,
    });
    expect(await runs.finish(owner.owner_id, running, 'cancelled', 'Again')).toBeNull();

    const paused = await held_run('worker_a');
    await runs.pause(owner.owner_id, paused, 'worker_a', 'cap_limit', later(30));
    expect(await runs.finish(other.owner_id, paused, 'cancelled', 'Not yours')).toBeNull();
    const cancelled = await runs.finish(owner.owner_id, paused, 'cancelled', 'Task is cancelled');
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      error: 'Task is cancelled',
      pause_reason: null,
      resume_at: null,
    });
    expect(cancelled?.finished_at).toBeInstanceOf(Date);
  });

  it('finds paused runs by reason and due time, and the runs of given tasks', async () => {
    const due = await held_run('worker_a');
    await runs.pause(owner.owner_id, due, 'worker_a', 'cap_limit', new Date(Date.now() - SECOND));
    const not_due = await held_run('worker_a');
    await runs.pause(owner.owner_id, not_due, 'worker_a', 'breaker_open', later(60));
    const no_credit = await held_run('worker_a');
    await runs.pause(owner.owner_id, no_credit, 'worker_a', 'out_of_credit', null);

    const timed = (await runs.find_paused(['cap_limit', 'breaker_open'], new Date())).map(
      (run) => run.id,
    );
    expect(timed).toContain(due);
    expect(timed).not.toContain(not_due);
    expect(timed).not.toContain(no_credit);
    const credit = (await runs.find_paused(['out_of_credit'], null)).map((run) => run.id);
    expect(credit).toContain(no_credit);
    expect(credit).not.toContain(due);

    const first = await create_task('First');
    const second = await create_task('Second');
    const first_run = await runs.create(owner.owner_id, agent_id, first);
    const second_run = await runs.create(owner.owner_id, agent_id, second);
    expect(new Set(await runs.ids_for_tasks(owner.owner_id, [first, second]))).toEqual(
      new Set([first_run.id, second_run.id]),
    );
    expect(await runs.ids_for_tasks(owner.owner_id, [])).toEqual([]);
    expect(await runs.ids_for_tasks(other.owner_id, [first])).toEqual([]);
  });
});
