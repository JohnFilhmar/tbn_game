import type { NestExpressApplication } from '@nestjs/platform-express';
import { CapWindowStatusSchema, type Provider } from '@tbn/contracts';
import request from 'supertest';
import { ValidationErrorBodySchema } from '@/testing/http';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, TEST_INTERN_MODEL } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';

describe('cap window routes', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let other: TestOwner;
  let provider: Provider;

  function api(): ReturnType<typeof request> {
    return request(app.getHttpServer());
  }

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    other = await create_test_owner(app);
    provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a token', async () => {
    const path = `/providers/${provider.id}/cap_windows`;
    await api().get(path).expect(401);
    await api().post(path).send({}).expect(401);
    await api().patch(`${path}/${provider.id}`).send({}).expect(401);
    await api().delete(`${path}/${provider.id}`).expect(401);
  });

  it('lists the example windows of a new key, display only, with the default thresholds', async () => {
    const response = await api()
      .get(`/providers/${provider.id}/cap_windows`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const windows = CapWindowStatusSchema.array().parse(response.body);
    expect(
      windows.map((window) => ({
        name: window.name,
        length_unit: window.length_unit,
        reset_mode: window.reset_mode,
        unit: window.unit,
        enforced: window.enforced,
        threshold_percent: window.threshold_percent,
        effective_threshold_percent: window.effective_threshold_percent,
        state: window.state,
      })),
    ).toEqual([
      {
        name: 'Monthly',
        length_unit: 'month',
        reset_mode: 'rolling',
        unit: 'tokens',
        enforced: false,
        threshold_percent: null,
        effective_threshold_percent: 75,
        state: 'ok',
      },
      expect.objectContaining({ name: 'Weekly', effective_threshold_percent: 85 }),
      expect.objectContaining({ name: 'Daily', effective_threshold_percent: 85 }),
    ]);

    await api()
      .put('/preferences/cap_threshold_shorter_percent')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ value: 60 })
      .expect(200);
    const again = await api()
      .get(`/providers/${provider.id}/cap_windows`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(
      CapWindowStatusSchema.array()
        .parse(again.body)
        .map((window) => window.effective_threshold_percent),
    ).toEqual([75, 60, 60]);
  });

  it('creates, edits and deletes a window', async () => {
    const anchor = '2026-01-01T00:00:00.000Z';
    const created = await api()
      .post(`/providers/${provider.id}/cap_windows`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Intern daily',
        length_count: 1,
        length_unit: 'day',
        reset_mode: 'fixed',
        anchor_at: anchor,
        unit: 'requests',
        limit: 500,
        threshold_percent: 90,
        enforced: true,
        model_id: TEST_INTERN_MODEL,
      })
      .expect(201);
    const window = CapWindowStatusSchema.parse(created.body);
    expect(window).toMatchObject({
      name: 'Intern daily',
      anchor_at: anchor,
      enforced: true,
      model_id: TEST_INTERN_MODEL,
      effective_threshold_percent: 90,
      used: 0,
      state: 'ok',
    });
    expect(window.resets_at).not.toBeNull();

    const edited = await api()
      .patch(`/providers/${provider.id}/cap_windows/${window.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ limit: 50, threshold_percent: null })
      .expect(200);
    expect(CapWindowStatusSchema.parse(edited.body)).toMatchObject({
      limit: 50,
      threshold_percent: null,
      effective_threshold_percent: 60,
    });

    await api()
      .delete(`/providers/${provider.id}/cap_windows/${window.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204);
    await api()
      .patch(`/providers/${provider.id}/cap_windows/${window.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ limit: 5 })
      .expect(404);
  });

  it('rejects a fixed window without an anchor, an unknown model or field, and other owners', async () => {
    const base = {
      name: 'Bad',
      length_count: 1,
      length_unit: 'week',
      unit: 'money',
      limit: 10,
    };
    const no_anchor = await api()
      .post(`/providers/${provider.id}/cap_windows`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ...base, reset_mode: 'fixed' })
      .expect(400);
    expect(JSON.stringify(no_anchor.body)).toContain('anchor_at');
    await api()
      .post(`/providers/${provider.id}/cap_windows`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ...base, reset_mode: 'rolling', model_id: 'not-offered' })
      .expect(400);
    const unknown = await api()
      .post(`/providers/${provider.id}/cap_windows`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ...base, reset_mode: 'rolling', currency: 'USD' })
      .expect(400);
    expect(ValidationErrorBodySchema.parse(unknown.body).issues.length).toBeGreaterThan(0);
    await api()
      .post(`/providers/${provider.id}/cap_windows`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ...base, reset_mode: 'rolling', limit: 0 })
      .expect(400);
    await api()
      .get(`/providers/${provider.id}/cap_windows`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);
    await api()
      .post(`/providers/${provider.id}/cap_windows`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ ...base, reset_mode: 'rolling' })
      .expect(404);
  });
});
