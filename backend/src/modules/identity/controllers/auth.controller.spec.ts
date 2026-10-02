import type { NestExpressApplication } from '@nestjs/platform-express';
import { OwnerSchema, SessionSchema } from '@tbn/contracts';
import request from 'supertest';
import { ValidationErrorBodySchema } from '@/testing/http';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';

describe('auth routes', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('returns a session for valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: owner.username, password: owner.password })
        .expect(200);

      const session = SessionSchema.parse(response.body);
      expect(session.token).toMatch(/^tbn_/);
      expect(new Date(session.expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    it('answers 401 without a hint for a wrong password', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: owner.username, password: 'wrong-password-value' })
        .expect(401);

      expect(response.text).not.toContain(owner.username);
      expect(response.text).not.toContain('password');
    });

    it('rejects an unknown field', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: owner.username, password: owner.password, remember: true })
        .expect(400);

      const body = ValidationErrorBodySchema.parse(response.body);
      expect(body.issues.map((issue) => issue.message).join(' ')).toContain('remember');
    });
  });

  describe('GET /auth/me', () => {
    it('needs a token', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer tbn_not_a_real_token')
        .expect(401);
    });

    it('returns the owner for a live token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);

      expect(OwnerSchema.pick({ id: true, username: true }).parse(response.body)).toEqual({
        id: owner.owner_id,
        username: owner.username,
      });
    });
  });

  describe('POST /auth/logout', () => {
    it('needs a token and then forgets it', async () => {
      await request(app.getHttpServer()).post('/auth/logout').expect(401);

      const fresh = await create_test_owner(app);
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${fresh.token}`)
        .expect(204);
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${fresh.token}`)
        .expect(401);
    });
  });
});
