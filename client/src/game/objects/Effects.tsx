import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  Color,
  Matrix4,
  MeshBasicMaterial,
  OctahedronGeometry,
  Quaternion,
  Vector3,
  type InstancedMesh,
} from 'three';
import type { EffectKind } from '@/game/props/interactions';
import { EFFECT_SECONDS, liveEffects, MOST_EFFECTS } from './liveEffects';

const PARTICLES = 8;
const GEOMETRY = new OctahedronGeometry(1, 0);
const MATERIAL = new MeshBasicMaterial({ transparent: true, opacity: 0.85 });
const COLORS: Record<EffectKind, Color> = {
  steam: new Color('#f1f5f9'),
  bubbles: new Color('#a8dcff'),
  blades: new Color('#5fa84a'),
};
/** The golden angle, which spreads a burst's particles evenly around it. */
const SPREAD = 2.39996;

/** Where particle `index` of a burst is `age` seconds in, and how big. */
function place(kind: EffectKind, index: number, age: number, out: Vector3): number {
  const angle = index * SPREAD;
  const life = age / EFFECT_SECONDS;
  if (kind === 'steam') {
    const sway = angle + age * 1.5;
    out.set(Math.cos(sway) * 0.06, age * 0.35 + index * 0.03, Math.sin(sway) * 0.06);
    return 0.02 + 0.04 * (1 - life);
  }
  if (kind === 'bubbles') {
    out.set(Math.cos(angle) * 0.07, (age * 0.4 + index * 0.05) % 0.4, Math.sin(angle) * 0.07);
    return 0.025;
  }
  const speed = 0.7 + (index % 3) * 0.25;
  const height = Math.max(0, 1.4 * age - 2.2 * age * age);
  out.set(Math.cos(angle) * speed * age, height, Math.sin(angle) * speed * age);
  return 0.035 * (1 - life * 0.5);
}

/**
 * The bursts of steam, bubbles and flying grass that props give off while used, drawn as one
 * instanced mesh of small low poly pieces that live two seconds each.
 */
export function Effects() {
  const ref = useRef<InstancedMesh>(null);
  const scratch = useMemo(
    () => ({
      matrix: new Matrix4(),
      offset: new Vector3(),
      scale: new Vector3(),
      turn: new Quaternion(),
    }),
    [],
  );

  useFrame(({ invalidate }) => {
    const mesh = ref.current;
    if (mesh === null) return;
    const now = performance.now() / 1000;
    let first = liveEffects[0];
    while (first !== undefined && now - first.bornAt > EFFECT_SECONDS) {
      liveEffects.shift();
      first = liveEffects[0];
    }
    let count = 0;
    for (const effect of liveEffects) {
      const age = now - effect.bornAt;
      for (let index = 0; index < PARTICLES; index += 1) {
        const size = place(effect.kind, index, age, scratch.offset);
        const { offset } = scratch;
        offset.set(offset.x + effect.x, offset.y + effect.y, offset.z + effect.z);
        scratch.scale.setScalar(size);
        mesh.setMatrixAt(
          count,
          scratch.matrix.compose(scratch.offset, scratch.turn, scratch.scale),
        );
        mesh.setColorAt(count, COLORS[effect.kind]);
        count += 1;
      }
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    if (count > 0) invalidate();
  });

  return (
    <instancedMesh
      ref={ref}
      args={[GEOMETRY, MATERIAL, MOST_EFFECTS * PARTICLES]}
      frustumCulled={false}
    />
  );
}
