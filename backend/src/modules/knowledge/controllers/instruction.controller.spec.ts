import type { NestExpressApplication } from '@nestjs/platform-express';
import { InstructionSchema, type Agent } from '@tbn/contracts';
import request from 'supertest';
import { InstructionService } from '@/modules/knowledge/services/instruction.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';

describe('instruction routes', () => {
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
    agent = await recruit_test_agent(app, owner.owner_id, provider.id, { role: 'Editor' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a token', async () => {
    await api().get('/instructions').expect(401);
  });

  it('creates global, role and agent instructions and orders them for a prompt', async () => {
    const bodies = [
      { scope: 'agent', agent_id: agent.id, title: 'Personal', body: 'Sign as Ada.', position: 0 },
      { scope: 'global', title: 'House style', body: 'Plain prose.', position: 5 },
      { scope: 'role', role: 'Editor', title: 'Editors', body: 'Cut filler.', position: 1 },
      { scope: 'global', title: 'Disabled', body: 'Never seen.', enabled: false },
      { scope: 'role', role: 'Other role', title: 'Not mine', body: 'Skip.' },
    ];
    for (const body of bodies) {
      const response = await api()
        .post('/instructions')
        .set('Authorization', `Bearer ${owner.token}`)
        .send(body)
        .expect(201);
      expect(InstructionSchema.parse(response.body)).toMatchObject({ title: body.title });
    }

    const prompt = await app.get(InstructionService).for_prompt(owner.owner_id, 'Editor', agent.id);
    expect(prompt.map((item) => item.title)).toEqual(['House style', 'Editors', 'Personal']);

    const listed = await api()
      .get('/instructions')
      .query({ scope: 'role' })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(
      InstructionSchema.array()
        .parse(listed.body)
        .map((item) => item.title),
    ).toEqual(['Not mine', 'Editors']);
  });

  it('updates and deletes an instruction', async () => {
    const created = await api()
      .post('/instructions')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ scope: 'global', title: 'Temp', body: 'x' })
      .expect(201);
    const instruction = InstructionSchema.parse(created.body);

    const updated = await api()
      .patch(`/instructions/${instruction.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ scope: 'agent', agent_id: agent.id, enabled: false })
      .expect(200);
    expect(InstructionSchema.parse(updated.body)).toMatchObject({
      scope: 'agent',
      agent_id: agent.id,
      enabled: false,
    });

    await api()
      .delete(`/instructions/${instruction.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204);
    await api()
      .get(`/instructions/${instruction.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
  });

  it('rejects a scope that does not match its target and an unknown agent', async () => {
    await api()
      .post('/instructions')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ scope: 'global', role: 'Editor', title: 'Bad', body: 'x' })
      .expect(400);
    await api()
      .post('/instructions')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ scope: 'agent', title: 'Bad', body: 'x' })
      .expect(400);
    await api()
      .post('/instructions')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ scope: 'agent', agent_id: owner.owner_id, title: 'Bad', body: 'x' })
      .expect(404);

    const other = await create_test_owner(app);
    await api()
      .post('/instructions')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ scope: 'agent', agent_id: agent.id, title: 'Not yours', body: 'x' })
      .expect(404);
  });
});
