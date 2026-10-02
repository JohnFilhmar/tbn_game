import type { NestExpressApplication } from '@nestjs/platform-express';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_owner } from '@/testing/test_owner';
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from '../repositories/interface/session_repository.interface';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let app: NestExpressApplication;
  let auth: AuthService;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    auth = app.get(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs in with the right password and resolves the token to the owner', async () => {
    const owner = await create_test_owner(app);

    const session = await auth.login(owner.username, owner.password);

    expect(session?.token).toMatch(/^tbn_[A-Za-z0-9_-]{43}$/);
    expect(new Date(session?.expires_at ?? 0).getTime()).toBeGreaterThan(Date.now());
    await expect(auth.authenticate(session?.token ?? '')).resolves.toEqual({
      id: owner.owner_id,
      username: owner.username,
    });
  });

  it('refuses a wrong password and an unknown user alike', async () => {
    const owner = await create_test_owner(app);

    await expect(auth.login(owner.username, `${owner.password}x`)).resolves.toBeNull();
    await expect(auth.login('nobody_here', owner.password)).resolves.toBeNull();
  });

  it('rejects an unknown, a logged out and an expired token', async () => {
    const owner = await create_test_owner(app);
    await expect(auth.authenticate('tbn_unknown')).resolves.toBeNull();
    await expect(auth.authenticate('')).resolves.toBeNull();

    await auth.logout(owner.token);
    await expect(auth.authenticate(owner.token)).resolves.toBeNull();

    const sessions = app.get<SessionRepository>(SESSION_REPOSITORY);
    const expired = await sessions.create(owner.owner_id, 'expired_hash', new Date(Date.now() - 1));
    await expect(
      sessions.find_active_by_token_hash(expired.token_hash, new Date()),
    ).resolves.toBeNull();
    await expect(sessions.delete_expired(new Date())).resolves.toBeGreaterThanOrEqual(1);
  });
});
