import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import {
  EVENT_REPOSITORY,
  type EventRepository,
} from '@/modules/events/repositories/interface/event_repository.interface';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import {
  WORLD_PROP_STATE_REPOSITORY,
  type WorldPropStateRepository,
} from './interface/world_prop_state_repository.interface';

describe('the world prop state repository', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let other: TestOwner;
  let states: WorldPropStateRepository;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    other = await create_test_owner(app);
    states = app.get<WorldPropStateRepository>(WORLD_PROP_STATE_REPOSITORY);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a placement state, then replaces it in the same row', async () => {
    const placement_id = randomUUID();
    const first = await states.save(owner.owner_id, {
      environment: 'office',
      placement_id,
      kind: 'blinds',
      state: { open: false },
    });
    const second = await states.save(owner.owner_id, {
      environment: 'office',
      placement_id,
      kind: 'blinds',
      state: { open: true },
    });
    expect(second).toMatchObject({ id: first.id, placement_id, state: { open: true } });
    expect(await states.list(owner.owner_id, 'office')).toEqual([second]);
  });

  it('keeps each owner and each environment apart', async () => {
    const mine = await states.save(owner.owner_id, {
      environment: 'home',
      placement_id: randomUUID(),
      kind: 'lamp',
      state: { mode: 'off' },
    });
    expect(await states.list(other.owner_id, 'home')).toEqual([]);
    expect(await states.find_by_id(other.owner_id, mine.id)).toBeNull();
    expect(await states.list(owner.owner_id, 'warehouse')).toEqual([]);
    expect(await states.find_by_id(owner.owner_id, mine.id)).toEqual(mine);
  });

  it('writes an event for every save', async () => {
    const owner_events = await create_test_owner(app);
    const events = app.get<EventRepository>(EVENT_REPOSITORY);
    const placement_id = randomUUID();
    const board = { strokes: [], texts: [] };
    const saved = await states.save(owner_events.owner_id, {
      environment: 'office',
      placement_id,
      kind: 'whiteboard',
      state: board,
    });
    await states.save(owner_events.owner_id, {
      environment: 'office',
      placement_id,
      kind: 'whiteboard',
      state: { ...board, texts: [{ x: 0.1, y: 0.2, color: '#1f2937', size: 0.1, text: 'hi' }] },
    });
    const recorded = await events.list_after(owner_events.owner_id, 0, 100);
    expect(recorded.map((event) => [event.entity, event.entity_id, event.op])).toEqual([
      ['world_prop_state', saved.id, 'insert'],
      ['world_prop_state', saved.id, 'update'],
    ]);
  });
});
