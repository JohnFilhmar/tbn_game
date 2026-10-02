import type { NestExpressApplication } from '@nestjs/platform-express';
import { PREFERENCE_DEFAULTS, PreferencesSchema } from '@tbn/contracts';
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
      intern_idle_ttl_minutes: 30,
      runaway_guard_turns: 50,
      cap_threshold_longest_percent: 75,
      cap_threshold_shorter_percent: 85,
      max_interns_per_manager: null,
      max_live_agents: null,
      sandbox_timeout_seconds: 600,
      sandbox_cpus: 1,
      sandbox_memory_mb: 1024,
      sandbox_scratch_mb: 512,
      search_cache_ttl_minutes: 1440,
      fetch_cache_ttl_minutes: 1440,
      fetch_max_chars: 40_000,
      disk_alert_percent: 90,
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
      ...PREFERENCE_DEFAULTS,
      report_style: 'detailed',
      time_zone: 'Asia/Manila',
    });
  });

  it('sets and clears an optional limit, and takes a fraction of a minute', async () => {
    const limited = await api()
      .put('/preferences/max_live_agents')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ value: 12 })
      .expect(200);
    expect(PreferencesSchema.parse(limited.body).max_live_agents).toBe(12);

    const cleared = await api()
      .put('/preferences/max_live_agents')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ value: null })
      .expect(200);
    expect(PreferencesSchema.parse(cleared.body).max_live_agents).toBeNull();

    const ttl = await api()
      .put('/preferences/intern_idle_ttl_minutes')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ value: 0.5 })
      .expect(200);
    expect(PreferencesSchema.parse(ttl.body).intern_idle_ttl_minutes).toBe(0.5);

    await api()
      .put('/preferences/runaway_guard_turns')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ value: null })
      .expect(400);
    await api()
      .put('/preferences/runaway_guard_turns')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ value: 2.5 })
      .expect(400);
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
