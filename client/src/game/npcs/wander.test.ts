import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Spot } from '@/game/assets/packManifest';
import type { PathPlanner } from '@/game/world/navmesh';
import { AgentActor } from './agentActor';
import { seededRandom, WanderScheduler } from './wander';

const straight: PathPlanner = { findPath: (_from, to) => [to.clone()] };

const WATER: Spot = { kind: 'water', position: [5, 0, 0], yaw_deg: 90, clip: 'drink', seconds: 2 };
const WINDOW: Spot = {
  kind: 'window',
  position: [-5, 0, 0],
  yaw_deg: 270,
  clip: 'look',
  seconds: 2,
};

function actor(id: string, x: number, lines: string[] = []): AgentActor {
  return new AgentActor({
    id,
    name: id,
    home: {
      seat: new Vector3(x, 0, 10),
      standing: new Vector3(x, 0, 9),
      yawDeg: 0,
      hasDesk: true,
    },
    planner: straight,
    listener: { onActivity: () => undefined, onNarrate: (text) => lines.push(text) },
    from: 'home',
  });
}

/** Runs the world for `seconds`, ticking the actors and asking the scheduler twice a second. */
function run(
  scheduler: WanderScheduler,
  actors: AgentActor[],
  from: number,
  seconds: number,
): number {
  let now = from;
  let lastCheck = -1;
  for (let step = 0; step < seconds * 20; step += 1) {
    now += 0.05;
    for (const one of actors) one.tick(0.05);
    if (now - lastCheck >= 0.5) {
      lastCheck = now;
      scheduler.update(now, actors);
    }
  }
  return now;
}

describe('wandering', () => {
  it('draws the same numbers from the same seed', () => {
    const first = seededRandom('agent-a');
    const second = seededRandom('agent-a');
    const other = seededRandom('agent-b');
    const a = [first(), first(), first()];
    expect([second(), second(), second()]).toEqual(a);
    expect([other(), other(), other()]).not.toEqual(a);
    for (const value of a) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('sends an idle agent to a spot and back, the same way for the same agent', () => {
    const journeys: string[][] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const lines: string[] = [];
      const ada = actor('ada', 0, lines);
      const scheduler = new WanderScheduler([WATER, WINDOW], (text) => lines.push(text));
      run(scheduler, [ada], 0, 60);
      journeys.push(lines);
    }
    const [first, second] = journeys;
    expect(first?.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(first?.[0]).toMatch(/^ada (goes for a drink|looks out of the window)\.$/);
  });

  it('comes back to the desk once the spot is done', () => {
    const ada = actor('ada', 0);
    const scheduler = new WanderScheduler([WATER], () => undefined);
    let now = run(scheduler, [ada], 0, 26);
    for (let guard = 0; guard < 200 && ada.activity !== 'wandering'; guard += 1) {
      now = run(scheduler, [ada], now, 0.5);
    }
    expect(ada.activity).toBe('wandering');
    for (let guard = 0; guard < 200 && ada.activity === 'wandering'; guard += 1) {
      now = run(scheduler, [ada], now, 0.5);
    }
    expect(ada.activity).toBe('at_desk');
    expect(ada.position.distanceTo(new Vector3(0, 0, 9))).toBeLessThan(0.1);
  });

  it('drops a wander for a task and walks straight to the desk', () => {
    const ada = actor('ada', 0);
    ada.wander({ position: new Vector3(5, 0, 0), yawDeg: 90, clip: 'drink', seconds: 10 });
    for (let step = 0; step < 20; step += 1) ada.tick(0.05);
    expect(ada.activity).toBe('wandering');
    ada.startWork();
    for (let step = 0; step < 400 && ada.activity !== 'working'; step += 1) ada.tick(0.05);
    expect(ada.activity).toBe('working');
    expect(ada.position.distanceTo(new Vector3(0, 0, 10))).toBeLessThan(0.1);
  });

  it('never puts two agents on one spot', () => {
    const ada = actor('ada', 0);
    const bo = actor('bo', 20);
    const scheduler = new WanderScheduler([WATER], () => undefined);
    let atSpot = 0;
    let now = 0;
    for (let check = 0; check < 240; check += 1) {
      now = run(scheduler, [ada, bo], now, 0.5);
      const near = [ada, bo].filter(
        (one) => one.position.distanceTo(new Vector3(5, 0, 0)) < 0.1,
      ).length;
      atSpot = Math.max(atSpot, near);
    }
    expect(atSpot).toBe(1);
  });

  it('stops to talk, waves, and goes back to rest when the talk ends', () => {
    const ada = actor('ada', 0);
    ada.startTalk(180);
    for (let step = 0; step < 10; step += 1) ada.tick(0.05);
    expect(ada.clip).toBe('wave');
    expect(ada.yawDeg).toBe(180);
    for (let step = 0; step < 40; step += 1) ada.tick(0.05);
    expect(ada.clip).toBe('talk');
    expect(ada.activity).toBe('talking');
    expect(ada.isIdle).toBe(false);
    ada.endTalk();
    for (let step = 0; step < 10; step += 1) ada.tick(0.05);
    expect(ada.activity).toBe('at_desk');
  });
});
