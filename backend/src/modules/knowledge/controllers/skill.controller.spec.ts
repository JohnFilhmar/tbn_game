import type { NestExpressApplication } from '@nestjs/platform-express';
import { SkillSchema, type Agent } from '@tbn/contracts';
import request from 'supertest';
import { SkillService } from '@/modules/knowledge/services/skill.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';

const SKILL_MD = '---\nname: haiku\ndescription: Write a haiku\n---\n\nCount 5-7-5 syllables.\n';

describe('skill routes', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let agent: Agent;

  function api(): ReturnType<typeof request> {
    return request(app.getHttpServer());
  }

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    const provider = await create_test_provider(app, owner.owner_id, 'openai_chat_completions');
    agent = await recruit_test_agent(app, owner.owner_id, provider.id, { role: 'Poet' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a token', async () => {
    await api().get('/skills').expect(401);
    await api().post('/skills/import').send({ markdown: SKILL_MD }).expect(401);
  });

  it('creates, edits, exports and deletes a skill', async () => {
    const created = await api()
      .post('/skills')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'review', description: 'Review a draft', body: 'Read it twice.' })
      .expect(201);
    const skill = SkillSchema.parse(created.body);
    expect(skill.attachments).toEqual([]);

    const updated = await api()
      .patch(`/skills/${skill.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ body: 'Read it three times.' })
      .expect(200);
    expect(SkillSchema.parse(updated.body).body).toBe('Read it three times.');

    const exported = await api()
      .get(`/skills/${skill.id}/export`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(exported.headers['content-type']).toMatch(/^text\/markdown/);
    expect(exported.headers['content-disposition']).toBe('attachment; filename="review.SKILL.md"');
    expect(exported.text).toBe(
      '---\nname: review\ndescription: Review a draft\n---\n\nRead it three times.\n',
    );

    await api()
      .delete(`/skills/${skill.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204);
    await api()
      .get(`/skills/${skill.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
  });

  it('imports a SKILL.md file and attaches the skill to a role and an agent', async () => {
    const imported = await api()
      .post('/skills/import')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ markdown: SKILL_MD })
      .expect(201);
    const skill = SkillSchema.parse(imported.body);
    expect(skill).toMatchObject({
      name: 'haiku',
      description: 'Write a haiku',
      body: 'Count 5-7-5 syllables.',
    });

    const attached = await api()
      .put(`/skills/${skill.id}/attachments`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        attachments: [
          { target_type: 'role', role: 'Poet' },
          { target_type: 'agent', agent_id: agent.id },
        ],
      })
      .expect(200);
    expect(SkillSchema.parse(attached.body).attachments).toEqual([
      { target_type: 'role', role: 'Poet' },
      { target_type: 'agent', agent_id: agent.id },
    ]);

    const skills = app.get(SkillService);
    await expect(skills.attached_to(owner.owner_id, 'Poet', owner.owner_id)).resolves.toEqual([
      { name: 'haiku', description: 'Write a haiku' },
    ]);
    await expect(skills.attached_to(owner.owner_id, 'Nobody', agent.id)).resolves.toEqual([
      { name: 'haiku', description: 'Write a haiku' },
    ]);
    await expect(skills.attached_to(owner.owner_id, 'Nobody', owner.owner_id)).resolves.toEqual([]);
    await expect(skills.body_by_name(owner.owner_id, 'haiku')).resolves.toBe(
      'Count 5-7-5 syllables.',
    );
    await expect(skills.body_by_name(owner.owner_id, 'missing')).resolves.toBeNull();

    const listed = await api()
      .get('/skills')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(
      SkillSchema.array()
        .parse(listed.body)
        .map((item) => item.name),
    ).toContain('haiku');
  });

  it('rejects a duplicate name, a file without frontmatter, an unknown field and a foreign agent', async () => {
    await api()
      .post('/skills/import')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ markdown: SKILL_MD })
      .expect(409);
    await api()
      .post('/skills/import')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ markdown: '# just a heading' })
      .expect(400);
    await api()
      .post('/skills')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'extra', description: 'x', body: 'x', tags: [] })
      .expect(400);

    const other = await create_test_owner(app);
    const theirs = await api()
      .post('/skills')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ name: 'theirs', description: 'x', body: 'x' })
      .expect(201);
    await api()
      .put(`/skills/${SkillSchema.parse(theirs.body).id}/attachments`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ attachments: [{ target_type: 'agent', agent_id: agent.id }] })
      .expect(404);
  });
});
