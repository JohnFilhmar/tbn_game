import type { NestExpressApplication } from '@nestjs/platform-express';
import { TaskSchema, type Agent } from '@tbn/contracts';
import request from 'supertest';
import { PrismaService } from '@/lib/database/prisma.service';
import { AgentService } from '@/modules/company/services/agent.service';
import { TaskService } from '@/modules/company/services/task.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';

describe('task routes', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let agent: Agent;

  function api(): ReturnType<typeof request> {
    return request(app.getHttpServer());
  }

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    agent = await recruit_test_agent(app, owner.owner_id, provider.id);
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a token', async () => {
    await api().get('/tasks').expect(401);
    await api().post('/tasks').send({}).expect(401);
  });

  it('queues a task and wakes the agent', async () => {
    const created = await api()
      .post('/tasks')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Write a haiku', instructions: 'About autumn.', assignee_agent_id: agent.id })
      .expect(201);
    const task = TaskSchema.parse(created.body);
    expect(task).toMatchObject({
      status: 'queued',
      assignee_agent_id: agent.id,
      delegator_agent_id: null,
      result: null,
      report_id: null,
    });

    const wakes = await app.get(PrismaService).$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM pgboss.job
      WHERE name = 'agent_wake' AND data->>'agent_id' = ${agent.id}`;
    expect(Number(wakes[0]?.count ?? 0)).toBeGreaterThanOrEqual(1);

    const listed = await api()
      .get('/tasks')
      .query({ agent_id: agent.id, status: 'queued' })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(
      TaskSchema.array()
        .parse(listed.body)
        .map((item) => item.id),
    ).toContain(task.id);

    const read = await api()
      .get(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(TaskSchema.parse(read.body).title).toBe('Write a haiku');
  });

  it('cancels an open task once', async () => {
    const created = await api()
      .post('/tasks')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Cancel me', instructions: 'Never mind.', assignee_agent_id: agent.id })
      .expect(201);
    const task = TaskSchema.parse(created.body);

    const cancelled = await api()
      .post(`/tasks/${task.id}/cancel`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(TaskSchema.parse(cancelled.body)).toMatchObject({ status: 'cancelled' });
    expect(TaskSchema.parse(cancelled.body).finished_at).not.toBeNull();

    await api()
      .post(`/tasks/${task.id}/cancel`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(409);
  });

  it('lists subtasks by parent and cancels them with it', async () => {
    const created = await api()
      .post('/tasks')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Goal', instructions: 'Split it.', assignee_agent_id: agent.id })
      .expect(201);
    const goal = TaskSchema.parse(created.body);
    const agents = app.get(AgentService);
    const manager = await agents.require(owner.owner_id, agent.id);
    const helper = await agents.spawn_intern(owner.owner_id, manager, {
      role: 'Helper',
      job_description: 'Helps.',
      provider_id: agent.provider_id,
      primary_model: agent.intern_model,
    });
    const subtask = await app.get(TaskService).delegate(owner.owner_id, {
      title: 'Part',
      instructions: 'One part.',
      assignee_agent_id: helper.id,
      delegator_agent_id: agent.id,
      parent_task_id: goal.id,
    });

    const listed = await api()
      .get('/tasks')
      .query({ parent_task_id: goal.id })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(TaskSchema.array().parse(listed.body)).toEqual([
      expect.objectContaining({ id: subtask.id, delegator_agent_id: agent.id, status: 'queued' }),
    ]);

    await api()
      .post(`/tasks/${goal.id}/cancel`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const after = await api()
      .get(`/tasks/${subtask.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(TaskSchema.parse(after.body)).toMatchObject({
      status: 'cancelled',
      status_reason: 'Its parent task was cancelled',
    });
  });

  it('rejects an unknown agent, an unknown field and a foreign task', async () => {
    await api()
      .post('/tasks')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Orphan', instructions: 'x', assignee_agent_id: owner.owner_id })
      .expect(404);
    await api()
      .post('/tasks')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Extra', instructions: 'x', assignee_agent_id: agent.id, priority: 1 })
      .expect(400);

    const other = await create_test_owner(app);
    const created = await api()
      .post('/tasks')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Mine', instructions: 'x', assignee_agent_id: agent.id })
      .expect(201);
    await api()
      .get(`/tasks/${TaskSchema.parse(created.body).id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);
  });
});
