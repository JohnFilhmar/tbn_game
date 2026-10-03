import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { PathPlanner } from '@/game/world/navmesh';
import { AgentActor, WALK_SPEED, type Activity, type ActorHome } from './agentActor';

const straight: PathPlanner = { findPath: (_from, to) => [to.clone()] };

function home(x: number, z: number, hasDesk = true): ActorHome {
  return {
    seat: new Vector3(x, 0, z),
    standing: new Vector3(x, 0, z - 1),
    yawDeg: 0,
    hasDesk,
  };
}

function actorAt(x: number, z: number, from: 'home' | Vector3 = 'home') {
  const activities: Activity[] = [];
  const lines: string[] = [];
  const actor = new AgentActor({
    id: `agent-${x}-${z}`,
    name: `Agent ${x}`,
    home: home(x, z),
    planner: straight,
    listener: {
      onActivity: (activity) => activities.push(activity),
      onNarrate: (text) => lines.push(text),
    },
    from,
  });
  return { actor, activities, lines };
}

/** Runs the actor for `seconds` in small steps. */
function run(actor: AgentActor, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) actor.tick(1 / 60);
}

describe('an agent actor', () => {
  it('stands by its desk, walks to the seat to work, and comes back when done', () => {
    const { actor, activities, lines } = actorAt(2, 2);
    expect(actor.position).toEqual(new Vector3(2, 0, 1));
    run(actor, 0.1);
    expect(actor.activity).toBe('at_desk');
    expect(actor.clip).toBe('idle');

    actor.startWork('Agent 2 starts on "Notes".');
    run(actor, 0.1);
    expect(actor.activity).toBe('walking');
    expect(actor.clip).toBe('walk');
    run(actor, 2);
    expect(actor.activity).toBe('working');
    expect(actor.clip).toBe('work');
    expect(actor.position).toEqual(new Vector3(2, 0, 2));

    actor.stopWork('Agent 2 finishes "Notes".');
    run(actor, 2);
    expect(actor.activity).toBe('at_desk');
    expect(actor.clip).toBe('idle');
    expect(actor.position.z).toBeCloseTo(1, 1);
    expect(activities).toEqual(['walking', 'working', 'walking', 'at_desk']);
    expect(lines).toEqual(['Agent 2 starts on "Notes".', 'Agent 2 finishes "Notes".']);
  });

  it('walks at walking speed along the path, turning towards it', () => {
    const { actor } = actorAt(0, 0);
    actor.home.seat.set(0, 0, 10);
    actor.startWork();
    run(actor, 1);
    expect(actor.position.z).toBeCloseTo(-1 + WALK_SPEED * 1, 0);
    expect(actor.yawDeg).toBeCloseTo(0, 0);
  });

  it('visits another agent, waves, and returns to where it was', () => {
    const { actor: manager, lines } = actorAt(0, 0);
    const { actor: intern } = actorAt(6, 0);
    manager.startWork();
    run(manager, 3);
    expect(manager.activity).toBe('working');
    manager.visit(intern, 'handing_off', 'Agent 0 hands "Part" to Agent 6.');
    run(manager, 0.1);
    expect(manager.activity).toBe('handing_off');
    run(manager, 5);
    expect(manager.clip === 'wave' || manager.activity === 'returning').toBe(true);
    run(manager, 8);
    expect(manager.activity).toBe('working');
    expect(manager.position).toEqual(new Vector3(0, 0, 0));
    expect(lines).toEqual(['Agent 0 hands "Part" to Agent 6.', 'Agent 0 returns to the desk.']);
  });

  it('arrives from the entry and leaves through the exit', () => {
    const { actor, activities, lines } = actorAt(2, 2, new Vector3(2, 0, 8));
    expect(actor.position).toEqual(new Vector3(2, 0, 8));
    run(actor, 0.1);
    expect(actor.activity).toBe('arriving');
    run(actor, 8);
    expect(actor.activity).toBe('at_desk');
    expect(actor.position).toEqual(new Vector3(2, 0, 1));

    actor.leave(new Vector3(2, 0, 8));
    run(actor, 0.1);
    expect(actor.activity).toBe('leaving');
    run(actor, 8);
    expect(actor.isGone).toBe(true);
    expect(activities).toEqual(['arriving', 'at_desk', 'leaving', 'gone']);
    expect(lines).toEqual(['Agent 2 arrives.', 'Agent 2 leaves.']);
  });

  it('moves home at once on a pack switch and keeps working there', () => {
    const { actor } = actorAt(0, 0);
    actor.startWork();
    run(actor, 3);
    actor.moveHome(home(10, 10));
    run(actor, 0.1);
    expect(actor.position.x).toBeCloseTo(10, 1);
    run(actor, 2);
    expect(actor.activity).toBe('working');
    expect(actor.position).toEqual(new Vector3(10, 0, 10));
  });

  it('works standing at an overflow anchor', () => {
    const { actor } = actorAt(0, 0);
    actor.home = { ...home(0, 0, false), standing: new Vector3(0, 0, 0) };
    actor.moveHome(actor.home);
    actor.startWork();
    run(actor, 1);
    expect(actor.activity).toBe('working');
    expect(actor.clip).toBe('idle');
  });
});
