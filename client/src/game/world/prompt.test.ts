import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { promptAt, propsInReach, type PromptScene, type UsableProp } from './prompt';

function scene(
  agents: Record<string, [number, number]>,
  owner: [number, number] = [0, 0],
  props: UsableProp[] = [],
) {
  return {
    owner: new Vector3(owner[0], 0, owner[1]),
    facingDeg: 0,
    computer: new Vector3(0, 1.2, 1.5),
    computerReach: 1.9,
    agents: new Map(Object.entries(agents).map(([id, [x, z]]) => [id, new Vector3(x, 0, z)])),
    props,
  } satisfies PromptScene;
}

function prop(placementId: string, x: number, z: number, reach = 1.8): UsableProp {
  return { placementId, x, z, reach };
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

  it('picks the nearest interaction in front of the owner, props among them', () => {
    const coffee = prop('coffee', 0.3, -4);
    const grass = prop('grass', 0, -3.6);
    expect(promptAt(scene({}, [0, -5], [grass, coffee]))).toEqual({
      kind: 'prop',
      placementId: 'coffee',
    });
    expect(promptAt(scene({ ada: [0, -4.5] }, [0, -5], [coffee, grass]))).toEqual({
      kind: 'agent',
      agentId: 'ada',
    });
    // Behind the owner, or past its own reach, a prop is not offered.
    expect(promptAt(scene({}, [0, -5], [prop('board', 0, -6)]))).toBeNull();
    expect(promptAt(scene({}, [0, -5], [prop('switch', 0, -3, 1.5)]))).toBeNull();
  });

  it('keeps E for the computer over a nearer prop, such as the inbox on its desk', () => {
    const tray = prop('tray', 0, 1);
    expect(promptAt(scene({}, [0, 0], [tray]))).toEqual({ kind: 'computer' });
    expect(promptAt(scene({ ada: [0, 0.5] }, [0, 0], [prop('mug', 0, 0.3)]))).toEqual({
      kind: 'prop',
      placementId: 'mug',
    });
  });

  it('lists every prop within reach, nearest first, whichever way the owner faces', () => {
    const owner = new Vector3(0, 0, -5);
    const props = [prop('far', 0, -2), prop('behind', 0, -6), prop('front', 0, -4.2)];
    expect(propsInReach(owner, props)).toEqual(['front', 'behind']);
  });
});
