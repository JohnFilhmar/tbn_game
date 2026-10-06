import type { PlayerPose } from '@tbn/contracts';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { PathPlanner } from '@/game/world/navmesh';
import { RemoteBody } from './remoteBody';

const STRAIGHT: PathPlanner = { findPath: (_from, to) => [to.clone()] };
const EXIT = new Vector3(3, 0, 0);

function pose(x: number, z: number, overrides: Partial<PlayerPose> = {}): PlayerPose {
  return {
    environment: 'office',
    x,
    y: 0,
    z,
    yaw: 0,
    moving: false,
    running: false,
    seated: false,
    act: null,
    ...overrides,
  };
}

function run(body: RemoteBody, seconds: number, mode: 'online' | 'offline' | 'leaving'): void {
  for (let left = seconds; left > 0; left -= 0.1) body.tick(0.1, mode, 'Mika', STRAIGHT, EXIT);
}

describe('a remote player body', () => {
  it('walks to the pose its player sent, and jumps when far behind', () => {
    const body = new RemoteBody('mika', pose(0, 0));
    body.follow(pose(1, 0, { moving: true }));
    body.tick(0.1, 'online', 'Mika', STRAIGHT, EXIT);
    expect(body.clip).toBe('walk');
    expect(body.position.x).toBeGreaterThan(0);
    expect(body.position.x).toBeLessThan(1);
    run(body, 1, 'online');
    expect(body.position.x).toBeCloseTo(1);

    body.follow(pose(10, 0));
    body.tick(0.1, 'online', 'Mika', STRAIGHT, EXIT);
    expect(body.position.x).toBe(10);
  });

  it('sits where a seated player sits', () => {
    const body = new RemoteBody('mika', pose(0, 0));
    body.follow(pose(2, 2, { seated: true, yaw: 90 }));
    body.tick(0.1, 'online', 'Mika', STRAIGHT, EXIT);
    expect(body.clip).toBe('work');
    expect(body.position.toArray()).toEqual([2, 0, 2]);
  });

  it('sits on the sofa at its height, then stands up and walks off', () => {
    const body = new RemoteBody('mika', pose(0, 0));
    body.follow(pose(1, 1, { y: 0.4, act: 'sit', yaw: 180 }));
    body.tick(0.1, 'online', 'Mika', STRAIGHT, EXIT);
    expect(body.clip).toBe('sit');
    expect(body.position.toArray()).toEqual([1, 0.4, 1]);
    expect(body.yawDeg).toBe(180);

    body.follow(pose(1.5, 1, { moving: true }));
    body.tick(0.1, 'online', 'Mika', STRAIGHT, EXIT);
    expect(body.clip).toBe('walk');
    expect(body.position.y).toBe(0);
  });

  it('walks out through the exit and is gone, once its player left for good', () => {
    const body = new RemoteBody('mika', pose(0, 0));
    run(body, 1, 'offline');
    expect(body.isGone).toBe(false);
    run(body, 1, 'leaving');
    expect(body.position.x).toBeGreaterThan(0.5);
    run(body, 5, 'leaving');
    expect(body.isGone).toBe(true);
  });
});
