import type { NestExpressApplication } from '@nestjs/platform-express';
import { PlayerMessageSchema } from '@tbn/contracts';
import request from 'supertest';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_guest, type TestGuest } from '@/testing/test_guest';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';

describe('player messages', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let mika: TestGuest;
  let bo: TestGuest;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    mika = await create_test_guest(app, owner, 'Mika');
    bo = await create_test_guest(app, owner, 'Bo');
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());
  const as_owner = (call: request.Test) => call.set('Authorization', `Bearer ${owner.token}`);

  async function inbox(call: request.Test): Promise<string[]> {
    return PlayerMessageSchema.array()
      .parse((await call.expect(200)).body)
      .map((message) => `${message.from_name}>${message.text}`);
  }

  it('carries messages between guests and the owner, each seeing only their own', async () => {
    await api()
      .post('/player_messages')
      .set('Cookie', mika.cookie)
      .send({ to_id: bo.guest_id, text: 'Hi Bo' })
      .expect(201);
    await api()
      .post('/player_messages')
      .set('Cookie', bo.cookie)
      .send({ to_id: owner.owner_id, text: 'Hi boss' })
      .expect(201);
    await as_owner(api().post('/player_messages'))
      .send({ to_id: mika.guest_id, text: 'Welcome' })
      .expect(201);

    expect(await inbox(api().get('/player_messages').set('Cookie', mika.cookie))).toEqual([
      'Mika>Hi Bo',
      `${owner.username}>Welcome`,
    ]);
    expect(await inbox(api().get('/player_messages').set('Cookie', bo.cookie))).toEqual([
      'Mika>Hi Bo',
      'Bo>Hi boss',
    ]);
    expect(await inbox(as_owner(api().get('/player_messages')))).toEqual([
      'Bo>Hi boss',
      `${owner.username}>Welcome`,
    ]);
  });

  it('marks a thread read for its recipient only', async () => {
    await api()
      .post('/player_messages')
      .set('Cookie', mika.cookie)
      .send({ to_id: bo.guest_id, text: 'Read me' })
      .expect(201);
    await api()
      .post('/player_messages/read')
      .set('Cookie', mika.cookie)
      .send({ from_id: bo.guest_id })
      .expect(204);
    const unread = PlayerMessageSchema.array()
      .parse((await api().get('/player_messages').set('Cookie', bo.cookie)).body)
      .filter((message) => message.read_at === null && message.to_id === bo.guest_id);
    expect(unread.length).toBeGreaterThan(0);

    await api()
      .post('/player_messages/read')
      .set('Cookie', bo.cookie)
      .send({ from_id: mika.guest_id })
      .expect(204);
    const after = PlayerMessageSchema.array()
      .parse((await api().get('/player_messages').set('Cookie', bo.cookie)).body)
      .filter((message) => message.read_at === null && message.to_id === bo.guest_id);
    expect(after).toEqual([]);
  });

  it('refuses a message to oneself, to a stranger, or from a guest without a name', async () => {
    await api()
      .post('/player_messages')
      .set('Cookie', mika.cookie)
      .send({ to_id: mika.guest_id, text: 'Me' })
      .expect(400);
    const stranger = await create_test_owner(app);
    await api()
      .post('/player_messages')
      .set('Cookie', mika.cookie)
      .send({ to_id: stranger.owner_id, text: 'Who?' })
      .expect(400);
    const unnamed = await create_test_guest(app, owner);
    await api()
      .post('/player_messages')
      .set('Cookie', unnamed.cookie)
      .send({ to_id: owner.owner_id, text: 'Hi' })
      .expect(409);
    await api()
      .post('/player_messages')
      .set('Cookie', mika.cookie)
      .send({ to_id: unnamed.guest_id, text: 'Hi' })
      .expect(400);
    await api().post('/player_messages').send({ to_id: owner.owner_id, text: 'x' }).expect(401);
  });
});
