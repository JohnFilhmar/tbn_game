import { describe, expect, it } from 'vitest';
import { Strider, WALK_STRIDE } from './strider';

function walk(strider: Strider, from: number, to: number, step: number, isWalking = true): number {
  let steps = 0;
  for (let x = from; x <= to + 1e-9; x += step) {
    if (strider.advance(x, 0, isWalking, WALK_STRIDE)) steps += 1;
  }
  return steps;
}

describe('footfalls', () => {
  it('steps once a stride, whatever the frame rate', () => {
    expect(walk(new Strider(), 0, 7.3, 0.01)).toBe(10);
    expect(walk(new Strider(), 0, 7.3, 0.1)).toBe(10);
  });

  it('never steps standing still, gliding while seated, or on a teleport', () => {
    const strider = new Strider();
    expect(walk(strider, 0, 7, 0.1, false)).toBe(0);
    expect(strider.advance(0, 0, true, WALK_STRIDE)).toBe(false);
    expect(strider.advance(20, 0, true, WALK_STRIDE)).toBe(false);
    expect(strider.advance(20.4, 0, true, WALK_STRIDE)).toBe(false);
    expect(strider.advance(20.8, 0, true, WALK_STRIDE)).toBe(true);
  });
});
