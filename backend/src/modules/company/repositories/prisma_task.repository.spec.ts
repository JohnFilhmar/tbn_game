import { ConflictException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AgentService } from '@/modules/company/services/agent.service';
import { TaskService } from '@/modules/company/services/task.service';
import type { AgentRecord, TaskRecord } from '@/modules/company/types/company_records';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import {
  create_test_provider,
  recruit_test_agent,
  TEST_INTERN_MODEL,
} from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { clear_wakes, count_wakes } from '@/testing/test_wakes';

describe('delegation and blocking in the task repository', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let other: TestOwner;
  let tasks: TaskService;
  let agents: AgentService;
  let manager: AgentRecord;

  async function intern(): Promise<AgentRecord> {
    return agents.spawn_intern(owner.owner_id, manager, {
      role: 'Researcher',
      job_description: 'Finds sources.',
      provider_id: manager.provider_id,
      primary_model: TEST_INTERN_MODEL,
    });
  }

  async function owner_task(assignee: AgentRecord, title = 'Goal'): Promise<TaskRecord> {
    const task = await tasks.create(owner.owner_id, {
      title,
      instructions: 'Do it.',
      assignee_agent_id: assignee.id,
    });
    return tasks.require(owner.owner_id, task.id);
  }

  async function delegated(to: AgentRecord, parent: TaskRecord | null): Promise<TaskRecord> {
    return tasks.delegate(owner.owner_id, {
      title: 'Subtask',
      instructions: 'Part of it.',
      assignee_agent_id: to.id,
      delegator_agent_id: manager.id,
      parent_task_id: parent?.id ?? null,
    });
  }

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    other = await create_test_owner(app);
    tasks = app.get(TaskService);
    agents = app.get(AgentService);
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    const recruited = await recruit_test_agent(app, owner.owner_id, provider.id);
    manager = await agents.require(owner.owner_id, recruited.id);
  });

  afterAll(async () => {
    await app.close();
  });

  it('delegates to an intern, wakes it, and refuses a terminated one', async () => {
    const helper = await intern();
    const parent = await owner_task(manager);
    const before = await count_wakes(app, helper.id);
    const child = await delegated(helper, parent);
    expect(child).toMatchObject({
      status: 'queued',
      assignee_agent_id: helper.id,
      delegator_agent_id: manager.id,
      parent_task_id: parent.id,
    });
    expect(await count_wakes(app, helper.id)).toBe(before + 1);

    const gone = await intern();
    await agents.terminate_idle_intern(owner.owner_id, gone.id, null);
    await expect(delegated(gone, parent)).rejects.toThrow(ConflictException);
    await expect(
      tasks.create(owner.owner_id, { title: 'x', instructions: 'x', assignee_agent_id: gone.id }),
    ).rejects.toThrow(ConflictException);
  });

  it('moves a started task through blocked and awaiting approval', async () => {
    const task = await owner_task(manager);
    expect(await tasks.block(owner.owner_id, task.id, 'Not yet')).toBeNull();
    await tasks.start(owner.owner_id, task.id);

    expect(await tasks.block(owner.owner_id, task.id, 'Daily cap reached')).toMatchObject({
      status: 'blocked',
      status_reason: 'Daily cap reached',
    });
    expect(await tasks.unblock(owner.owner_id, task.id)).toMatchObject({
      status: 'in_progress',
      status_reason: null,
    });
    expect(await tasks.await_approval(owner.owner_id, task.id, 'Continue?')).toMatchObject({
      status: 'awaiting_approval',
      status_reason: 'Continue?',
    });
    expect(await tasks.unblock(owner.owner_id, task.id)).toBeNull();
    expect(await tasks.approve(other.owner_id, task.id)).toBeNull();
    expect(await tasks.approve(owner.owner_id, task.id)).toMatchObject({ status: 'in_progress' });
    expect(await tasks.complete(owner.owner_id, task.id, 'Done.')).toMatchObject({
      status: 'done',
      status_reason: null,
    });
  });

  it('blocks every open task of some agents and requeues those that never started', async () => {
    const first = await intern();
    const second = await intern();
    const queued = await delegated(first, null);
    const running = await delegated(first, null);
    await tasks.start(owner.owner_id, running.id);
    const elsewhere = await delegated(second, null);

    expect(
      await tasks.block_open_for_agents(owner.owner_id, [first.id], 'Key is out of credit'),
    ).toBe(2);
    expect(await tasks.block_open_for_agents(other.owner_id, [second.id], 'x')).toBe(0);
    expect((await tasks.require(owner.owner_id, elsewhere.id)).status).toBe('queued');
    const unstarted = (await tasks.find_blocked_unstarted()).map((task) => task.id);
    expect(unstarted).toContain(queued.id);
    expect(unstarted).not.toContain(running.id);

    await clear_wakes(app, first.id);
    await tasks.requeue_unstarted(owner.owner_id, await tasks.require(owner.owner_id, queued.id));
    await tasks.requeue_unstarted(owner.owner_id, await tasks.require(owner.owner_id, running.id));
    expect(await tasks.require(owner.owner_id, queued.id)).toMatchObject({
      status: 'queued',
      status_reason: null,
    });
    expect((await tasks.require(owner.owner_id, running.id)).status).toBe('blocked');
    expect(await count_wakes(app, first.id)).toBe(1);
  });

  it('finds open children, the tree, and finished results not yet given', async () => {
    const parent = await owner_task(manager);
    const first = await delegated(await intern(), parent);
    const second = await delegated(await intern(), parent);
    await tasks.start(owner.owner_id, first.id);
    await tasks.complete(owner.owner_id, first.id, 'Found three sources.');

    expect((await tasks.open_children(owner.owner_id, parent.id)).map((task) => task.id)).toEqual([
      second.id,
    ]);
    expect(await tasks.tree_ids(owner.owner_id, parent.id)).toEqual([
      parent.id,
      first.id,
      second.id,
    ]);
    expect(
      (await tasks.finished_unnotified(owner.owner_id, manager.id)).map((task) => task.id),
    ).toContain(first.id);
    expect((await tasks.find_unnotified_delegations()).map((task) => task.id)).toContain(first.id);
    expect(await tasks.mark_delegator_notified(owner.owner_id, first.id)).toBe(true);
    expect(await tasks.mark_delegator_notified(owner.owner_id, first.id)).toBe(false);
    expect(
      (await tasks.finished_unnotified(owner.owner_id, manager.id)).map((task) => task.id),
    ).not.toContain(first.id);
    expect(await tasks.finished_unnotified(other.owner_id, manager.id)).toEqual([]);

    const listed = await tasks.list(owner.owner_id, { parent_task_id: parent.id });
    expect(listed.map((task) => task.id)).toEqual([first.id, second.id]);
  });

  it('cancels a task with its open subtasks and wakes the agents concerned', async () => {
    const helper = await intern();
    const parent = await owner_task(manager);
    await tasks.start(owner.owner_id, parent.id);
    const open = await delegated(helper, parent);
    const finished = await delegated(await intern(), parent);
    await tasks.start(owner.owner_id, finished.id);
    await tasks.complete(owner.owner_id, finished.id, 'Done.');
    await clear_wakes(app, helper.id);
    await clear_wakes(app, manager.id);

    await tasks.cancel(owner.owner_id, parent.id);

    expect(await tasks.require(owner.owner_id, open.id)).toMatchObject({
      status: 'cancelled',
      status_reason: 'Its parent task was cancelled',
    });
    expect((await tasks.require(owner.owner_id, finished.id)).status).toBe('done');
    expect(await count_wakes(app, helper.id)).toBe(1);
    expect(await count_wakes(app, manager.id)).toBe(1);
    await expect(tasks.cancel(owner.owner_id, parent.id)).rejects.toThrow(ConflictException);
  });
});
