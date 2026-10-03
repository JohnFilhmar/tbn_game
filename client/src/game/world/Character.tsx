import { useFrame, useLoader } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import {
  AnimationMixer,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  type AnimationAction,
  type AnimationClip,
  type Group,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ResolvedAppearance } from '@/game/assets/appearance';
import type { ClipName, PaletteSlot } from '@/game/assets/characterManifest';
import { isStandardMaterial, materialsOf, meshesOf } from './sceneObjects';

/** What a loaded glTF file gives the character: its scene and, for a body, its clips. */
interface LoadedModel {
  scene: Group;
  animations: AnimationClip[];
}

/** Gives every mesh under `root` its own material, coloured by its palette slot. */
function recolour(root: Group, colors: Record<PaletteSlot, string>): void {
  const bySlot = new Map<string, string>(Object.entries(colors));
  for (const mesh of meshesOf(root)) {
    mesh.castShadow = true;
    mesh.material = materialsOf(mesh).map((material) => {
      if (!isStandardMaterial(material)) return material;
      const color = bySlot.get(material.name);
      if (color === undefined) return material;
      const own = material.clone();
      own.color.set(color);
      return own;
    });
    if (Array.isArray(mesh.material) && mesh.material.length === 1) {
      const [only] = mesh.material;
      if (only !== undefined) mesh.material = only;
    }
  }
}

const CUP_GEOMETRY = new CylinderGeometry(0.045, 0.035, 0.1, 8);
const CUP_MATERIAL = new MeshStandardMaterial({ color: '#f4efe6', flatShading: true });

/** A cup in the right hand, shown only while the character drinks. */
function cupIn(model: Group): Mesh {
  const cup = new Mesh(CUP_GEOMETRY, CUP_MATERIAL);
  cup.position.set(0, -0.04, 0.08);
  cup.visible = false;
  model.getObjectByName('hand_r')?.add(cup);
  return cup;
}

/** A body with its parts attached and its palette applied, ready to animate. */
function buildModel(
  body: LoadedModel,
  parts: readonly LoadedModel[],
  appearance: ResolvedAppearance,
): Group {
  const root = body.scene.clone(true);
  recolour(root, appearance.colors);
  appearance.parts.forEach((part, index) => {
    const source = parts[index];
    const node = root.getObjectByName(part.attach);
    if (source === undefined || node === undefined) return;
    const clone = source.scene.clone(true);
    clone.scale.set(appearance.body.width, appearance.body.height, appearance.body.width);
    recolour(clone, appearance.colors);
    node.add(clone);
  });
  return root;
}

/** Props of `Character`. */
export interface CharacterProps {
  appearance: ResolvedAppearance;
  /** The clip to play, read every frame so a change needs no render. */
  clipRef: { readonly current: ClipName };
  /** Playback speed of the walk clip, 1 at walking speed; read every frame. */
  timeScaleRef?: RefObject<number>;
  /** The group whoever owns the character moves. */
  groupRef: RefObject<Group | null>;
  position: [number, number, number];
  rotationY: number;
}

/**
 * A character built from the set: a body variant with its parts attached and its palette applied,
 * playing one of its clips with a short crossfade between them, with a cup in hand to drink. It stands at the origin of its
 * group facing +Z; the owner of the group moves it.
 */
export function Character({
  appearance,
  clipRef,
  timeScaleRef,
  groupRef,
  position,
  rotationY,
}: CharacterProps) {
  const body = useLoader(GLTFLoader, appearance.body.url);
  const parts = useLoader(
    GLTFLoader,
    appearance.parts.map((part) => part.url),
  );
  const model = useMemo(() => buildModel(body, parts, appearance), [body, parts, appearance]);
  const mixer = useMemo(() => new AnimationMixer(model), [model]);
  const cupRef = useRef<Mesh | null>(null);
  const actions = useMemo(() => {
    const byName = new Map<string, AnimationAction>();
    for (const clip of body.animations) byName.set(clip.name, mixer.clipAction(clip));
    return byName;
  }, [body, mixer]);
  const playing = useRef<AnimationAction | null>(null);

  useEffect(() => {
    const cup = cupIn(model);
    cupRef.current = cup;
    return () => {
      cup.removeFromParent();
      cupRef.current = null;
    };
  }, [model]);

  useEffect(() => {
    playing.current = null;
    return () => {
      mixer.stopAllAction();
    };
  }, [mixer]);

  useFrame((_, delta) => {
    const next = actions.get(clipRef.current);
    const previous = playing.current;
    if (next !== undefined && next !== previous) {
      next.reset().fadeIn(0.2).play();
      previous?.fadeOut(0.2);
      playing.current = next;
    }
    const walk = actions.get('walk');
    if (walk !== undefined && timeScaleRef !== undefined) walk.timeScale = timeScaleRef.current;
    const cup = cupRef.current;
    if (cup !== null) cup.visible = clipRef.current === 'drink';
    mixer.update(delta);
  });

  return (
    <group ref={groupRef} position={position} rotation-y={rotationY}>
      <primitive object={model} />
    </group>
  );
}
