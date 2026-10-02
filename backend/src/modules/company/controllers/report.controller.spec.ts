import type { NestExpressApplication } from '@nestjs/platform-express';
import { ReportSchema, type Agent } from '@tbn/contracts';
import request from 'supertest';
import { ReportService } from '@/modules/company/services/report.service';
import { TaskService } from '@/modules/company/services/task.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';

const BODY = '## Outcome\n\nDone.\n\n## Tokens and cost\n\n12 tokens, $0.00\n';

describe('report routes', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let agent: Agent;
  let report_id: string;

  function api(): ReturnType<typeof request> {
    return request(app.getHttpServer());
  }

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    const provider = await create_test_provider(app, owner.owner_id, 'openai_chat_completions');
    agent = await recruit_test_agent(app, owner.owner_id, provider.id);
    const task = await app.get(TaskService).create(owner.owner_id, {
      title: 'Reported',
      instructions: 'x',
      assignee_agent_id: agent.id,
    });
    const report = await app
      .get(ReportService)
      .create_for_task(owner.owner_id, task.id, agent.id, BODY);
    report_id = report.id;
    await expect(
      app.get(ReportService).create_for_task(owner.owner_id, task.id, agent.id, BODY),
    ).rejects.toThrow('Task already has a report');
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a token', async () => {
    await api().get('/reports').expect(401);
    await api().get(`/reports/${report_id}/download`).expect(401);
  });

  it('lists and reads reports', async () => {
    const listed = await api()
      .get('/reports')
      .query({ agent_id: agent.id })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(
      ReportSchema.array()
        .parse(listed.body)
        .map((item) => item.id),
    ).toEqual([report_id]);

    const read = await api()
      .get(`/reports/${report_id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(ReportSchema.parse(read.body)).toMatchObject({ agent_id: agent.id, body_md: BODY });
  });

  it('downloads the Markdown as a file', async () => {
    const response = await api()
      .get(`/reports/${report_id}/download`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(response.headers['content-type']).toMatch(/^text\/markdown/);
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="report-${report_id}.md"`,
    );
    expect(response.text).toBe(BODY);
  });

  it('answers 404 for an unknown or foreign report', async () => {
    await api()
      .get(`/reports/${owner.owner_id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
    const other = await create_test_owner(app);
    await api()
      .get(`/reports/${report_id}/download`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);
  });
});
