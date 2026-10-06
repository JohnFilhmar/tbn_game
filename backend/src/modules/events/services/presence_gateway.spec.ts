import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  ChangeEventSchema,
  PlayerSchema,
  REALTIME_MESSAGES,
  SoundCueSchema,
  type ChangeEvent,
  type Player,
  type PlayerPose,
  type SoundCue,
} from '@tbn/contracts';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { z } from 'zod';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_guest, type TestGuest } from '@/testing/test_guest';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { wait_for } from '@/testing/wait_for';
import { REALTIME_PATH } from './realtime_gateway.service';

const POSE: PlayerPose = {
  environment: 'office',
  x: 2,
  y: 0,
  z: -1,
  yaw: 1.5,
  moving: true,
  running: false,
  seated: false,
  act: null,
};

/** A connected socket and everything it heard. */
interface Listener {
  socket: Socket;
  snapshot: Player[];
  players: Player[];
  changes: ChangeEvent[];
  cues: SoundCue[];
}

describe('presence and private messages over the gateway', () => {
  let app: NestExpressApplication;
  let url: string;
  let owner: TestOwner;
  let mika: TestGuest;
  let bo: TestGuest;
  const listeners: Listener[] = [];

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const port =
      typeof address === 'object' && address !== null ? (address satisfies AddressInfo).port : 0;
    url = `http://127.0.0.1:${port}`;
    owner = await create_test_owner(app);
    mika = await create_test_guest(app, owner, 'Mika');
    bo = await create_test_guest(app, owner, 'Bo');
  });

  afterAll(async () => {
    for (const listener of listeners) listener.socket.disconnect();
    await app.close();
  });

  async function connect(who: { token?: string; cookie?: string }): Promise<Listener> {
    const socket = io(url, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      reconnection: false,
      auth: who.token === undefined ? {} : { token: who.token },
      ...(who.cookie !== undefined && { extraHeaders: { Cookie: who.cookie } }),
    });
    const listener: Listener = { socket, snapshot: [], players: [], changes: [], cues: [] };
    listeners.push(listener);
    socket.on(REALTIME_MESSAGES.player, (player: unknown) => {
      listener.players.push(PlayerSchema.parse(player));
    });
    socket.on(REALTIME_MESSAGES.cue, (cue: unknown) => {
      listener.cues.push(SoundCueSchema.parse(cue));
    });
    socket.on(REALTIME_MESSAGES.changes, (events: unknown) => {
      listener.changes.push(...z.array(ChangeEventSchema).parse(events));
    });
    await new Promise<void>((resolve, reject) => {
      socket.once(REALTIME_MESSAGES.players, (players: unknown) => {
        listener.snapshot = z.array(PlayerSchema).parse(players);
        resolve();
      });
      socket.once('connect_error', reject);
    });
    return listener;
  }

  it('lets guests in by cookie, shows who is there, and relays poses to everyone else', async () => {
    await expect(connect({})).rejects.toThrow('unauthorized');
    const owner_socket = await connect({ token: owner.token });
    const mika_socket = await connect({ cookie: mika.cookie });
    expect(mika_socket.snapshot.map((player) => player.name)).toEqual([owner.username]);
    const bo_socket = await connect({ cookie: bo.cookie });
    expect(bo_socket.snapshot.map((player) => player.name).sort()).toEqual(
      ['Mika', owner.username].sort(),
    );

    mika_socket.socket.emit(REALTIME_MESSAGES.presence, POSE);
    await wait_for('the others to see Mika move', () =>
      owner_socket.players.find((player) => player.name === 'Mika' && player.pose !== null) &&
      bo_socket.players.find((player) => player.name === 'Mika' && player.pose !== null)
        ? true
        : undefined,
    );
    expect(mika_socket.players.find((player) => player.name === 'Mika')).toBeUndefined();

    mika_socket.socket.emit(REALTIME_MESSAGES.presence, { ...POSE, x: 'far' });
    mika_socket.socket.disconnect();
    await wait_for('Mika to show offline', () =>
      bo_socket.players.find((player) => player.name === 'Mika' && !player.online)
        ? true
        : undefined,
    );
  });

  it('delivers a player message to its two players and no one else', async () => {
    const owner_socket = await connect({ token: owner.token });
    const mika_socket = await connect({ cookie: mika.cookie });
    const bo_socket = await connect({ cookie: bo.cookie });
    await request(app.getHttpServer())
      .post('/player_messages')
      .set('Cookie', mika.cookie)
      .send({ to_id: owner.owner_id, text: 'Psst, boss' })
      .expect(201);

    const reached = (listener: Listener) =>
      listener.changes.some(
        (event) => event.entity === 'player_message' && event.data?.text === 'Psst, boss',
      );
    await wait_for('the owner and Mika to get it', () =>
      reached(owner_socket) && reached(mika_socket) ? true : undefined,
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(reached(bo_socket)).toBe(false);
  });

  it('relays a sound to the other players only, and drops bad and hurried ones', async () => {
    const owner_socket = await connect({ token: owner.token });
    const mika_socket = await connect({ cookie: mika.cookie });
    const blinds: SoundCue = { sound: 'blinds', environment: 'office', x: 3, y: 0, z: -2 };
    mika_socket.socket.emit(REALTIME_MESSAGES.cue, blinds);
    mika_socket.socket.emit(REALTIME_MESSAGES.cue, { ...blinds, sound: 'click' });
    await wait_for('the owner to hear the blinds', () =>
      owner_socket.cues.length > 0 ? true : undefined,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    mika_socket.socket.emit(REALTIME_MESSAGES.cue, { ...blinds, sound: 'explosion' });
    mika_socket.socket.emit(REALTIME_MESSAGES.cue, { ...blinds, x: 'far' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(owner_socket.cues).toEqual([blinds]);
    expect(mika_socket.cues).toEqual([]);
  });
});
