import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  CreatedGuestInviteSchema,
  GuestInviteSchema,
  GuestSchema,
  PrincipalSchema,
} from '@tbn/contracts';
import request from 'supertest';
import { z } from 'zod';
import { PrismaService } from '@/lib/database/prisma.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';

describe('guests', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  async function invite(label = 'Mika', guest_id?: string): Promise<string> {
    const response = await api()
      .post('/guests/invites')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ label, ...(guest_id !== undefined && { guest_id }) })
      .expect(201);
    return CreatedGuestInviteSchema.parse(response.body).path;
  }

  /** Follows an invite link and returns the guest cookie it set. */
  async function follow(path: string): Promise<string> {
    const response = await api().get(path).set('X-Forwarded-Proto', 'https').expect(302);
    expect(response.headers['location']).toBe('/app/');
    const header: unknown = response.headers['set-cookie'];
    const cookie =
      z
        .array(z.string())
        .parse(header)
        .find((value) => value.startsWith('tbn_guest=')) ?? '';
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    return cookie.split(';')[0] ?? '';
  }

  async function guest_id_of(cookie: string): Promise<string> {
    const me = PrincipalSchema.parse((await api().get('/auth/me').set('Cookie', cookie)).body);
    if (me.kind !== 'guest') throw new Error('expected a guest');
    return me.id;
  }

  it('lets the owner invite a friend, who follows the link once and becomes a guest', async () => {
    await api().post('/guests/invites').send({ label: 'Mika' }).expect(401);
    const path = await invite('Mika');
    expect(path).toMatch(/^\/invite\/tbi_/);

    const open = await api()
      .get('/guests/invites')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(
      GuestInviteSchema.array()
        .parse(open.body)
        .map((item) => item.label),
    ).toContain('Mika');

    const cookie = await follow(path);
    await api().get(path).expect(410);
    await api().get('/gate').set('Cookie', cookie).expect(204);
    await api().get('/gate').expect(401);
    await api().get('/gate').set('Cookie', 'tbn_guest=tbg_not_a_session').expect(401);

    const me = PrincipalSchema.parse((await api().get('/auth/me').set('Cookie', cookie)).body);
    expect(me).toMatchObject({ kind: 'guest', name: null, owner_username: owner.username });
    const owner_me = PrincipalSchema.parse(
      (await api().get('/auth/me').set('Authorization', `Bearer ${owner.token}`)).body,
    );
    expect(owner_me).toEqual({ kind: 'owner', id: owner.owner_id, username: owner.username });
  });

  it('gives each guest a name of their own, never the owner username', async () => {
    const first = await follow(await invite('First'));
    const second = await follow(await invite('Second'));

    const named = await api()
      .patch('/guests/me')
      .set('Cookie', first)
      .send({ name: 'Mika Rose' })
      .expect(200);
    expect(GuestSchema.parse(named.body).name).toBe('Mika Rose');
    await api().patch('/guests/me').set('Cookie', second).send({ name: 'mika rose' }).expect(409);
    await api()
      .patch('/guests/me')
      .set('Cookie', second)
      .send({ name: owner.username.toUpperCase() })
      .expect(409);
    await api().patch('/guests/me').set('Cookie', second).send({ name: '<script>' }).expect(400);
    await api()
      .patch('/guests/me')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Owner' })
      .expect(403);
  });

  it('lets a guest read the desk but not settings, and write nothing outside guest routes', async () => {
    const cookie = await follow(await invite('Reader'));
    await api().get('/agents').set('Cookie', cookie).expect(200);
    await api().get('/preferences').set('Cookie', cookie).expect(200);
    await api().get('/providers').set('Cookie', cookie).expect(403);
    await api().get('/integrations').set('Cookie', cookie).expect(403);
    await api().get('/notification_channels').set('Cookie', cookie).expect(403);
    await api().get('/guests').set('Cookie', cookie).expect(403);
    await api()
      .post('/tasks')
      .set('Cookie', cookie)
      .send({ title: 'x', instructions: 'y', assignee_agent_id: owner.owner_id })
      .expect(403);
    await api()
      .put('/preferences/environment')
      .set('Cookie', cookie)
      .send({ value: 'home' })
      .expect(403);
    await api().post('/guests/invites').set('Cookie', cookie).send({ label: 'x' }).expect(403);
  });

  it('signs a known guest back in with a new link, and shuts out a revoked guest at once', async () => {
    const cookie = await follow(await invite('Returning'));
    const guest_id = await guest_id_of(cookie);

    const again = await follow(await invite('Returning again', guest_id));
    expect(await guest_id_of(again)).toBe(guest_id);

    const revoked = await api()
      .post(`/guests/${guest_id}/revoke`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(GuestSchema.parse(revoked.body).revoked_at).not.toBeNull();
    await api().get('/gate').set('Cookie', cookie).expect(401);
    await api().get('/agents').set('Cookie', again).expect(401);
    await api()
      .post('/guests/invites')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ label: 'No way back', guest_id })
      .expect(409);
  });

  it('refuses an expired or revoked invite', async () => {
    const expired = await invite('Late');
    const prisma = app.get(PrismaService);
    await prisma.guestInvite.updateMany({
      where: { owner_id: owner.owner_id, label: 'Late' },
      data: { expires_at: new Date(Date.now() - 1_000) },
    });
    await api().get(expired).expect(410);

    const revoked = await invite('Cancelled');
    const [open] = GuestInviteSchema.array().parse(
      (await api().get('/guests/invites').set('Authorization', `Bearer ${owner.token}`)).body,
    );
    expect(open?.label).toBe('Cancelled');
    await api()
      .post(`/guests/invites/${open?.id ?? ''}/revoke`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204);
    await api().get(revoked).expect(410);
    await api().get('/invite/not_a_token').expect(410);
  });
});
