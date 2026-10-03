import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import {
  EVENT_REPOSITORY,
  type EventRepository,
} from '@/modules/events/repositories/interface/event_repository.interface';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import {
  WORLD_LAYOUT_REPOSITORY,
  type WorldLayoutRepository,
} from './interface/world_layout_repository.interface';

function computer_desk(): Record<string, string | number | null> {
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
  };
}

describe('the world layout repository', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let other: TestOwner;
  let layouts: WorldLayoutRepository;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    other = await create_test_owner(app);
    layouts = app.get<WorldLayoutRepository>(WORLD_LAYOUT_REPOSITORY);
  });

  afterAll(async () => {
    await app.close();
  });

  it('saves a first layout, replaces it on the next revision, and refuses a stale one', async () => {
    expect(await layouts.find(owner.owner_id, 'office')).toBeNull();
    const first = await layouts.save(owner.owner_id, 'office', 0, {
      theme: { floor: '#112233' },
      placements: [computer_desk()],
    });
    expect(first).toMatchObject({
      environment: 'office',
      revision: 1,
      theme: { floor: '#112233' },
    });
    expect(
      await layouts.save(owner.owner_id, 'office', 0, { theme: {}, placements: [] }),
    ).toBeNull();

    const desk = computer_desk();
    const second = await layouts.save(owner.owner_id, 'office', 1, {
      theme: {},
      placements: [desk],
    });
    expect(second).toMatchObject({ revision: 2, theme: {}, placements: [desk] });
    expect(
      await layouts.save(owner.owner_id, 'office', 1, { theme: {}, placements: [] }),
    ).toBeNull();
    expect((await layouts.find(owner.owner_id, 'office'))?.revision).toBe(2);
  });

  it('keeps each owner and each environment apart', async () => {
    const mine = await layouts.save(owner.owner_id, 'home', 0, {
      theme: {},
      placements: [computer_desk()],
    });
    expect(mine).not.toBeNull();
    expect(await layouts.find(other.owner_id, 'home')).toBeNull();
    expect(await layouts.find_by_id(other.owner_id, mine?.id ?? '')).toBeNull();
    expect(await layouts.find(owner.owner_id, 'warehouse')).toBeNull();
  });

  it('forgets a layout on reset, and writes an event for every save', async () => {
    const owner_events = await create_test_owner(app);
    const events = app.get<EventRepository>(EVENT_REPOSITORY);
    const saved = await layouts.save(owner_events.owner_id, 'office', 0, {
      theme: {},
      placements: [computer_desk()],
    });
    await layouts.save(owner_events.owner_id, 'office', 1, {
      theme: { wall: '#ffffff' },
      placements: [computer_desk()],
    });
    await layouts.remove(owner_events.owner_id, 'office');
    expect(await layouts.find(owner_events.owner_id, 'office')).toBeNull();
    const recorded = await events.list_after(owner_events.owner_id, 0, 100);
    expect(recorded.map((event) => [event.entity, event.entity_id, event.op])).toEqual([
      ['world_layout', saved?.id, 'insert'],
      ['world_layout', saved?.id, 'update'],
      ['world_layout', saved?.id, 'delete'],
    ]);
  });
});
