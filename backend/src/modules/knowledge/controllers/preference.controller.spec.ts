import type { NestExpressApplication } from '@nestjs/platform-express';
import { PreferencesSchema } from '@tbn/contracts';
import request from 'supertest';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';

describe('preference routes', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;

  function api(): ReturnType<typeof request> {
    return request(app.getHttpServer());
  }

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a token', async () => {
    await api().get('/preferences').expect(401);
  });

  it('returns defaults, then the values the owner set', async () => {
    const defaults = await api()
      .get('/preferences')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(PreferencesSchema.parse(defaults.body)).toEqual({
      report_style: 'concise',
      time_zone: 'UTC',
      theme: 'system',
    });

    const set = await api()
      .put('/preferences/time_zone')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ value: 'Asia/Manila' })
      .expect(200);
    expect(PreferencesSchema.parse(set.body)).toMatchObject({ time_zone: 'Asia/Manila' });

    const again = await api()
      .put('/preferences/report_style')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ value: 'detailed' })
      .expect(200);
    expect(PreferencesSchema.parse(again.body)).toEqual({
      report_style: 'detailed',
      time_zone: 'Asia/Manila',
      theme: 'system',
    });
  });

  it('rejects an unknown key, a wrong value and an unknown field', async () => {
    await api()
      .put('/preferences/font_size')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ value: 12 })
      .expect(400);
    await api()
      .put('/preferences/theme')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ value: 'sepia' })
      .expect(400);
    await api()
      .put('/preferences/time_zone')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ value: 'Mars/Olympus' })
      .expect(400);
    await api()
      .put('/preferences/theme')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ value: 'dark', force: true })
      .expect(400);
  });
});
