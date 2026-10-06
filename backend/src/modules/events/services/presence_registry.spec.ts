import type { Player, PlayerPose } from '@tbn/contracts';
import { PresenceRegistry } from './presence_registry';

const OWNER_ID = 'owner';
const POSE: PlayerPose = {
  environment: 'office',
  x: 1,
  y: 0,
  z: 2,
  yaw: 0.5,
  moving: true,
  running: false,
  seated: false,
  act: null,
};

describe('the presence registry', () => {
  let changed: Player[];
  let gone: string[];
  let registry: PresenceRegistry;

  beforeEach(() => {
    jest.useFakeTimers();
    changed = [];
    gone = [];
    registry = new PresenceRegistry(
      {
        changed: (_owner, player) => changed.push(player),
        gone: (_owner, id) => gone.push(id),
      },
      1_000,
    );
  });

  afterEach(() => {
    registry.clear();
    jest.useRealTimers();
  });

  it('tells each player who is already there, and everyone about moves', () => {
    expect(registry.join(OWNER_ID, { id: 'a', kind: 'owner', name: 'john' }, 's1')).toEqual([]);
    const seen = registry.join(OWNER_ID, { id: 'b', kind: 'guest', name: 'Mika' }, 's2');
    expect(seen.map((player) => player.id)).toEqual(['a']);
    registry.move(OWNER_ID, 'b', POSE);
    expect(changed.at(-1)).toMatchObject({ id: 'b', pose: POSE, online: true });
  });

  it('keeps a player online while any socket stays, then lingers before they are gone', () => {
    registry.join(OWNER_ID, { id: 'b', kind: 'guest', name: 'Mika' }, 's1');
    registry.join(OWNER_ID, { id: 'b', kind: 'guest', name: 'Mika' }, 's2');
    registry.leave(OWNER_ID, 'b', 's1');
    expect(changed.at(-1)?.online).toBe(true);
    registry.leave(OWNER_ID, 'b', 's2');
    expect(changed.at(-1)).toMatchObject({ id: 'b', online: false });
    jest.advanceTimersByTime(999);
    expect(gone).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(gone).toEqual(['b']);
  });

  it('brings back a player who returns before the linger ends, with a new name', () => {
    registry.join(OWNER_ID, { id: 'b', kind: 'guest', name: 'Guest' }, 's1');
    registry.leave(OWNER_ID, 'b', 's1');
    registry.join(OWNER_ID, { id: 'b', kind: 'guest', name: 'Mika' }, 's2');
    expect(changed.at(-1)).toMatchObject({ id: 'b', online: true, name: 'Mika' });
    jest.advanceTimersByTime(5_000);
    expect(gone).toEqual([]);
  });
});
