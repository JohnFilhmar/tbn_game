import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
  WorldLayoutResponseSchema,
  WorldLayoutSchema,
  WorldPropStateSchema,
  WorldPropStatesResponseSchema,
  type WorldPlacement,
} from '@tbn/contracts';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';

function placement(overrides: Partial<WorldPlacement> = {}): WorldPlacement {
  return {
    id: randomUUID(),
    kind: 'computer_desk',
    x: -4.5,
    z: 6.4,
    yaw_deg: 180,
    width: null,
    depth: null,
    zone: null,
    variant: null,
    color: null,
    ...overrides,
  };
}

describe('world routes', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;

  function api(): ReturnType<typeof request> {
    return request(app.getHttpServer());
  }

  function auth(key = randomUUID()): Record<string, string> {
    return { Authorization: `Bearer ${owner.token}`, [IDEMPOTENCY_KEY_HEADER]: key };
  }

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a token', async () => {
    await api().get('/world/office').expect(401);
    await api().put('/world/office').send({ revision: 0, theme: {}, placements: [] }).expect(401);
  });

  it('answers null before a save, then the saved layout, and forgets it on reset', async () => {
    const empty = await api().get('/world/office').set(auth()).expect(200);
    expect(WorldLayoutResponseSchema.parse(empty.body)).toEqual({ layout: null });

    const desk = placement();
    const plant = placement({ kind: 'plant', x: 2, z: 3, yaw_deg: 0 });
    const saved = await api()
      .put('/world/office')
      .set(auth())
      .send({ revision: 0, theme: { floor: '#334455' }, placements: [desk, plant] })
      .expect(200);
    expect(WorldLayoutSchema.parse(saved.body)).toMatchObject({
      environment: 'office',
      revision: 1,
      theme: { floor: '#334455' },
      placements: [desk, plant],
    });

    const read = await api().get('/world/office').set(auth()).expect(200);
    expect(WorldLayoutResponseSchema.parse(read.body).layout?.placements).toEqual([desk, plant]);

    await api().delete('/world/office').set(auth()).expect(204);
    const after = await api().get('/world/office').set(auth()).expect(200);
    expect(WorldLayoutResponseSchema.parse(after.body)).toEqual({ layout: null });
  });

  it('refuses a stale revision with 409 and saves once for a repeated key', async () => {
    const body = { revision: 0, theme: {}, placements: [placement()] };
    const key = randomUUID();
    const first = await api().put('/world/home').set(auth(key)).send(body).expect(200);
    const replay = await api().put('/world/home').set(auth(key)).send(body).expect(200);
    expect(first.headers[IDEMPOTENT_REPLAYED_HEADER.toLowerCase()]).toBeUndefined();
    expect(replay.headers[IDEMPOTENT_REPLAYED_HEADER.toLowerCase()]).toBe('true');
    expect(WorldLayoutSchema.parse(replay.body).revision).toBe(1);

    await api().put('/world/home').set(auth()).send(body).expect(409);
  });

  it('refuses a layout without exactly one computer desk, off the floor or of an unknown kind', async () => {
    const two = { revision: 0, theme: {}, placements: [placement(), placement()] };
    await api().put('/world/warehouse').set(auth()).send(two).expect(400);
    const none = { revision: 0, theme: {}, placements: [placement({ kind: 'desk' })] };
    await api().put('/world/warehouse').set(auth()).send(none).expect(400);
    const off = { revision: 0, theme: {}, placements: [placement({ x: 40 })] };
    await api().put('/world/warehouse').set(auth()).send(off).expect(400);
    const unknown = { revision: 0, theme: {}, placements: [{ ...placement(), kind: 'piano' }] };
    await api().put('/world/warehouse').set(auth()).send(unknown).expect(400);
    await api().get('/world/moon').set(auth()).expect(400);
  });

  describe('prop states', () => {
    const blinds = randomUUID();
    const board = randomUUID();

    it('needs a token', async () => {
      await api().get('/world/office/props').expect(401);
      await api()
        .put(`/world/office/props/${blinds}`)
        .send({ kind: 'blinds', state: { open: false } })
        .expect(401);
    });

    it('saves a state, reads it back with the environment, and replays a repeated key', async () => {
      const key = randomUUID();
      const body = { kind: 'blinds', state: { open: false } };
      const saved = await api()
        .put(`/world/office/props/${blinds}`)
        .set(auth(key))
        .send(body)
        .expect(200);
      expect(WorldPropStateSchema.parse(saved.body)).toMatchObject({
        environment: 'office',
        placement_id: blinds,
        kind: 'blinds',
        state: { open: false },
      });
      const replay = await api()
        .put(`/world/office/props/${blinds}`)
        .set(auth(key))
        .send(body)
        .expect(200);
      expect(replay.headers[IDEMPOTENT_REPLAYED_HEADER.toLowerCase()]).toBe('true');

      const stroke = {
        color: '#1f2937',
        width: 0.01,
        points: [
          [0.1, 0.1],
          [0.5, 0.4],
        ],
      };
      await api()
        .put(`/world/office/props/${board}`)
        .set(auth())
        .send({ kind: 'whiteboard', state: { strokes: [stroke], texts: [] } })
        .expect(200);

      const read = await api().get('/world/office/props').set(auth()).expect(200);
      const { states } = WorldPropStatesResponseSchema.parse(read.body);
      expect(states.map((state) => [state.placement_id, state.kind])).toEqual(
        expect.arrayContaining([
          [blinds, 'blinds'],
          [board, 'whiteboard'],
        ]),
      );
      const home = await api().get('/world/home/props').set(auth()).expect(200);
      expect(WorldPropStatesResponseSchema.parse(home.body).states).toEqual([]);
    });

    it('refuses a state that does not fit its kind with 400', async () => {
      await api()
        .put(`/world/office/props/${blinds}`)
        .set(auth())
        .send({ kind: 'blinds', state: { mode: 'off' } })
        .expect(400);
      await api()
        .put(`/world/office/props/${blinds}`)
        .set(auth())
        .send({ kind: 'lamp', state: { mode: 'dim' } })
        .expect(400);
      await api()
        .put('/world/office/props/not-an-id')
        .set(auth())
        .send({ kind: 'lamp', state: { mode: 'on' } })
        .expect(400);
    });

    it('refuses a whiteboard over its cap with 413', async () => {
      // 1,500 strokes of 20 points each is about 650 KB: under the body limit, over the board's.
      const points = Array.from({ length: 20 }, (_, index) => [index / 20, 0.123456789]);
      const strokes = Array.from({ length: 1_500 }, () => ({
        color: '#1f2937',
        width: 0.01,
        points,
      }));
      await api()
        .put(`/world/office/props/${board}`)
        .set(auth())
        .send({ kind: 'whiteboard', state: { strokes, texts: [] } })
        .expect(413);
    });
  });
});
