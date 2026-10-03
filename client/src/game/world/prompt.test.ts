import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { promptAt, type PromptScene } from './prompt';

function scene(agents: Record<string, [number, number]>, owner: [number, number] = [0, 0]) {
  return {
    owner: new Vector3(owner[0], 0, owner[1]),
    facingDeg: 0,
    computer: new Vector3(0, 1.2, 1.5),
    computerReach: 1.9,
    agents: new Map(Object.entries(agents).map(([id, [x, z]]) => [id, new Vector3(x, 0, z)])),
  } satisfies PromptScene;
}

describe('the E prompt', () => {
  it('offers the computer within its reach', () => {
    expect(promptAt(scene({}))).toEqual({ kind: 'computer' });
    expect(promptAt(scene({}, [0, -5]))).toBeNull();
  });

  it('offers the nearer of the computer and an agent in front', () => {
    expect(promptAt(scene({ ada: [0, 1] }))).toEqual({ kind: 'agent', agentId: 'ada' });
    expect(promptAt(scene({ ada: [0, 1.9] }))).toEqual({ kind: 'computer' });
  });

  it('ignores an agent behind the owner or out of reach', () => {
    expect(promptAt(scene({ ada: [0, -4] }, [0, -3]))).toBeNull();
    expect(promptAt(scene({ ada: [0, 0] }, [0, -2.5]))).toBeNull();
    expect(promptAt(scene({ ada: [0, -1.5], bo: [0, -2.5] }, [0, -3]))).toEqual({
      kind: 'agent',
      agentId: 'bo',
    });
  });
});
