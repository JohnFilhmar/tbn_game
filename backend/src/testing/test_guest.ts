import type { NestExpressApplication } from '@nestjs/platform-express';
import { CreatedGuestInviteSchema, PrincipalSchema } from '@tbn/contracts';
import request from 'supertest';
import { z } from 'zod';
import type { TestOwner } from './test_owner';

/** A guest with a live session, for tests. */
export interface TestGuest {
  guest_id: string;
  /** The `Cookie` header value that signs the guest in. */
  cookie: string;
}

/**
 * Invites a guest of `owner`, follows the link, and names the guest when `name` is given.
 *
 * @param app - A running web application.
 */
export async function create_test_guest(
  app: NestExpressApplication,
  owner: TestOwner,
  name?: string,
): Promise<TestGuest> {
  const server = app.getHttpServer();
  const created = await request(server)
    .post('/guests/invites')
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ label: name ?? 'guest' })
    .expect(201);
  const followed = await request(server)
    .get(CreatedGuestInviteSchema.parse(created.body).path)
    .expect(302);
  const header: unknown = followed.headers['set-cookie'];
  const set_cookie =
    z
      .array(z.string())
      .parse(header)
      .find((value) => value.startsWith('tbn_guest=')) ?? '';
  const cookie = set_cookie.split(';')[0] ?? '';
  const me = PrincipalSchema.parse(
    (await request(server).get('/auth/me').set('Cookie', cookie)).body,
  );
  if (me.kind !== 'guest') throw new Error('The invite did not sign a guest in');
  if (name !== undefined) {
    await request(server).patch('/guests/me').set('Cookie', cookie).send({ name }).expect(200);
  }
  return { guest_id: me.id, cookie };
}
