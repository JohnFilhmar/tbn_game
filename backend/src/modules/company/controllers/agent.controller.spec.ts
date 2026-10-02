import type { NestExpressApplication } from '@nestjs/platform-express';
import { AgentSchema, DepartmentSchema, TaskSchema, type Provider } from '@tbn/contracts';
import request from 'supertest';
import { AgentService } from '@/modules/company/services/agent.service';
import { ValidationErrorBodySchema } from '@/testing/http';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import {
  TEST_INTERN_MODEL,
  TEST_PRIMARY_MODEL,
  create_test_provider,
  recruit_test_agent,
} from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';

describe('agent and department routes', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let provider: Provider;

  function api(): ReturnType<typeof request> {
    return request(app.getHttpServer());
  }

  function recruit_body(name: string): Record<string, unknown> {
    return {
      name,
      role: 'Researcher',
      job_description: 'Finds and summarises sources.',
      provider_id: provider.id,
      primary_model: TEST_PRIMARY_MODEL,
      intern_model: TEST_INTERN_MODEL,
      tool_policy: { write_file: 'deny' },
      appearance: { hair: 'short', colors: { shirt: '#336699' } },
    };
  }

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a token', async () => {
    await api().get('/agents').expect(401);
    await api().post('/agents').send(recruit_body('nobody')).expect(401);
    await api().get('/departments').expect(401);
  });

  it('recruits a manager who heads a department named after the role', async () => {
    const created = await api()
      .post('/agents')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(recruit_body('ada'))
      .expect(201);
    const agent = AgentSchema.parse(created.body);
    expect(agent).toMatchObject({
      name: 'ada',
      role: 'Researcher',
      level: 1,
      status: 'idle',
      active_run_id: null,
      tool_policy: { write_file: 'deny' },
      appearance: { hair: 'short', colors: { shirt: '#336699' } },
    });

    const departments = await api()
      .get('/departments')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const department = DepartmentSchema.array()
      .parse(departments.body)
      .find((item) => item.id === agent.department_id);
    expect(department).toMatchObject({
      name: 'Researcher',
      manager_agent_id: agent.id,
      member_count: 1,
    });

    const listed = await api()
      .get('/agents')
      .query({ department_id: agent.department_id })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(
      AgentSchema.array()
        .parse(listed.body)
        .map((item) => item.id),
    ).toEqual([agent.id]);

    const read = await api()
      .get(`/agents/${agent.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(AgentSchema.parse(read.body).id).toBe(agent.id);
  });

  it('lists interns by level and counts only live members of a department', async () => {
    const created = await api()
      .post('/agents')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(recruit_body('lead_with_interns'))
      .expect(201);
    const lead = AgentSchema.parse(created.body);
    const agents = app.get(AgentService);
    const record = await agents.require(owner.owner_id, lead.id);
    const spec = {
      role: 'Helper',
      job_description: 'Helps.',
      provider_id: lead.provider_id,
      primary_model: lead.intern_model,
    };
    const kept = await agents.spawn_intern(owner.owner_id, record, spec);
    const gone = await agents.spawn_intern(owner.owner_id, record, spec);
    await agents.terminate_idle_intern(owner.owner_id, gone.id, null);

    const interns = await api()
      .get('/agents')
      .query({ department_id: lead.department_id, level: 2 })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(
      AgentSchema.array()
        .parse(interns.body)
        .map((item) => [item.id, item.level, item.status]),
    ).toEqual([
      [kept.id, 2, 'idle'],
      [gone.id, 2, 'terminated'],
    ]);

    const departments = await api()
      .get('/departments')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(
      DepartmentSchema.array()
        .parse(departments.body)
        .find((item) => item.id === lead.department_id)?.member_count,
    ).toBe(2);

    await api()
      .get('/agents')
      .query({ level: 3 })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(400);
  });

  it('edits an agent and validates the models on the provider', async () => {
    const agent = await recruit_test_agent(app, owner.owner_id, provider.id);

    const updated = await api()
      .patch(`/agents/${agent.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ job_description: 'Writes long pieces.', tool_policy: { read_file: 'ask' } })
      .expect(200);
    expect(AgentSchema.parse(updated.body)).toMatchObject({
      job_description: 'Writes long pieces.',
      tool_policy: { read_file: 'ask' },
    });

    await api()
      .patch(`/agents/${agent.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ primary_model: 'not-on-this-provider' })
      .expect(404);
    await api()
      .post('/agents')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ...recruit_body('bad-model'), intern_model: 'missing' })
      .expect(404);
  });

  it('rejects a duplicate name, an unknown field and a bad query', async () => {
    await api()
      .post('/agents')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(recruit_body('ada'))
      .expect(409);

    const unknown = await api()
      .post('/agents')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ...recruit_body('extra'), salary: 100 })
      .expect(400);
    expect(ValidationErrorBodySchema.parse(unknown.body).issues).not.toHaveLength(0);

    await api()
      .get('/agents')
      .query({ status: 'sleeping' })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(400);
  });

  it('dismisses an agent, cancels its queued tasks and refuses further edits', async () => {
    const agent = await recruit_test_agent(app, owner.owner_id, provider.id);
    const task = await api()
      .post('/tasks')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Pending', instructions: 'Wait.', assignee_agent_id: agent.id })
      .expect(201);

    const dismissed = await api()
      .post(`/agents/${agent.id}/dismiss`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(AgentSchema.parse(dismissed.body).status).toBe('dismissed');

    const after = await api()
      .get(`/tasks/${TaskSchema.parse(task.body).id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(TaskSchema.parse(after.body).status).toBe('cancelled');

    await api()
      .patch(`/agents/${agent.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ role: 'Ghost' })
      .expect(409);
    await api()
      .post('/tasks')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Too late', instructions: 'No.', assignee_agent_id: agent.id })
      .expect(409);
  });

  it("hides another owner's agent", async () => {
    const other = await create_test_owner(app);
    const other_provider = await create_test_provider(
      app,
      other.owner_id,
      'openai_chat_completions',
    );
    const agent = await recruit_test_agent(app, other.owner_id, other_provider.id);

    await api()
      .get(`/agents/${agent.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
    await api()
      .post(`/agents/${agent.id}/dismiss`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
    await api()
      .post('/agents')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ...recruit_body('borrowed-provider'), provider_id: other_provider.id })
      .expect(404);
  });
});
