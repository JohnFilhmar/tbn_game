import {
  AnimationClip,
  BoxGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
  type Object3D,
} from 'three';

/**
 * The character set: a blocky figure of rigid parts under named nodes, three body variants, the
 * five clips, and the parts that attach to `head` and `spine`. The contract is `docs/assets.md`.
 */

/** A palette slot's default colour; the runtime recolours by material name. */
export const PALETTE_DEFAULTS: Record<string, string> = {
  skin: '#e8b89a',
  hair: '#4a2e1a',
  top: '#3b6fb6',
  bottom: '#374151',
  shoes: '#1f2937',
  accent: '#f59e0b',
};

const EYES = '#1b1b1f';

/** The proportions of one body variant, as factors on the regular figure. */
export interface BodyVariant {
  name: string;
  width: number;
  height: number;
}

/** The three bodies the manifest offers. */
export const BODY_VARIANTS: readonly BodyVariant[] = [
  { name: 'regular', width: 1, height: 1 },
  { name: 'slim', width: 0.85, height: 1.02 },
  { name: 'broad', width: 1.2, height: 0.96 },
];

const materials = new Map<string, MeshStandardMaterial>();

/** One material per palette slot, shared by every mesh that uses it. */
export function material(slot: string): MeshStandardMaterial {
  let found = materials.get(slot);
  if (found === undefined) {
    const color = slot === 'eyes' ? EYES : (PALETTE_DEFAULTS[slot] ?? '#888888');
    found = new MeshStandardMaterial({ name: slot, color, roughness: 0.85, metalness: 0 });
    materials.set(slot, found);
  }
  return found;
}

/** A box mesh centred at `position` under `parent`. */
export function box(
  parent: Object3D,
  name: string,
  slot: string,
  size: [number, number, number],
  position: [number, number, number],
): Mesh {
  const mesh = new Mesh(new BoxGeometry(...size), material(slot));
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function node(parent: Object3D, name: string, position: [number, number, number]): Group {
  const group = new Group();
  group.name = name;
  group.position.set(...position);
  parent.add(group);
  return group;
}

/** The height of the hips node when standing; the clips move it down to sit. */
/** Every clip a character carries, in the order the manifest lists them. */
export const CLIP_NAMES = [
  'idle',
  'walk',
  'work',
  'sit',
  'wave',
  'drink',
  'look',
  'write',
  'touch',
  'stretch',
  'talk',
  'press',
  'think',
  'thumbs_up',
  'bow',
  'nod',
  'sigh',
];

export const HIP_HEIGHT = 0.78;
const SEATED_HIP_HEIGHT = 0.47;

/**
 * Builds one body: `hips` at the root with `leg_l` and `leg_r` (each with a `shin_l` or
 * `shin_r`), and `spine` carrying `arm_l` and `arm_r` (each with a `forearm_l` or `forearm_r`
 * at the elbow, which carries the hand) and `head`. The figure faces +Z.
 */
export function buildBody(variant: BodyVariant): Group {
  const w = variant.width;
  const h = variant.height;
  const hips = new Group();
  hips.name = 'hips';
  hips.position.set(0, HIP_HEIGHT * h, 0);

  box(hips, 'pelvis', 'bottom', [0.36 * w, 0.16 * h, 0.22 * w], [0, 0.08 * h, 0]);
  for (const side of ['l', 'r'] as const) {
    const x = side === 'l' ? 0.1 * w : -0.1 * w;
    const leg = node(hips, `leg_${side}`, [x, 0, 0]);
    box(leg, `thigh_${side}`, 'bottom', [0.16 * w, 0.36 * h, 0.18 * w], [0, -0.18 * h, 0]);
    const shin = node(leg, `shin_${side}`, [0, -0.36 * h, 0]);
    box(shin, `calf_${side}`, 'bottom', [0.15 * w, 0.34 * h, 0.17 * w], [0, -0.17 * h, 0]);
    box(shin, `shoe_${side}`, 'shoes', [0.17 * w, 0.08 * h, 0.26 * w], [0, -0.38 * h, 0.04 * w]);
  }

  const spine = node(hips, 'spine', [0, 0.16 * h, 0]);
  box(spine, 'torso', 'top', [0.38 * w, 0.5 * h, 0.22 * w], [0, 0.25 * h, 0]);
  for (const side of ['l', 'r'] as const) {
    const x = side === 'l' ? 0.25 * w : -0.25 * w;
    const arm = node(spine, `arm_${side}`, [x, 0.44 * h, 0]);
    box(arm, `sleeve_${side}`, 'top', [0.12 * w, 0.25 * h, 0.14 * w], [0, -0.125 * h, 0]);
    const forearm = node(arm, `forearm_${side}`, [0, -0.25 * h, 0]);
    box(forearm, `cuff_${side}`, 'top', [0.115 * w, 0.22 * h, 0.13 * w], [0, -0.11 * h, 0]);
    box(forearm, `hand_${side}`, 'skin', [0.11 * w, 0.12 * h, 0.12 * w], [0, -0.27 * h, 0]);
  }

  const head = node(spine, 'head', [0, 0.54 * h, 0]);
  box(head, 'skull', 'skin', [0.26 * w, 0.26 * h, 0.26 * w], [0, 0.15 * h, 0]);
  box(head, 'eye_l', 'eyes', [0.04 * w, 0.04 * h, 0.02], [0.06 * w, 0.17 * h, 0.135 * w]);
  box(head, 'eye_r', 'eyes', [0.04 * w, 0.04 * h, 0.02], [-0.06 * w, 0.17 * h, 0.135 * w]);
  return hips;
}

/** Samples `f` over `[0, duration]` at `steps` evenly spaced times, the last equal to the first. */
function sampled(
  duration: number,
  steps: number,
  f: (phase: number) => number,
): [number[], number[]] {
  const times: number[] = [];
  const values: number[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const phase = index / steps;
    times.push(phase * duration);
    values.push(f(phase % 1));
  }
  return [times, values];
}

/** A rotation track about X (and optionally Z and Y) for one node, sampled from a function of phase. */
function rotation(
  nodeName: string,
  duration: number,
  steps: number,
  x: (phase: number) => number,
  z: (phase: number) => number = () => 0,
  y: (phase: number) => number = () => 0,
): QuaternionKeyframeTrack {
  const [times] = sampled(duration, steps, x);
  const values: number[] = [];
  const quaternion = new Quaternion();
  for (let index = 0; index <= steps; index += 1) {
    const phase = (index / steps) % 1;
    quaternion.setFromEuler(new Euler(x(phase), y(phase), z(phase), 'XYZ'));
    values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  }
  return new QuaternionKeyframeTrack(`${nodeName}.quaternion`, times, values);
}

function hipHeight(
  duration: number,
  steps: number,
  f: (phase: number) => number,
  heightFactor: number,
): VectorKeyframeTrack {
  const [times, values] = sampled(duration, steps, f);
  const positions: number[] = [];
  for (const value of values) positions.push(0, value * heightFactor, 0);
  return new VectorKeyframeTrack('hips.position', times, positions);
}

const TAU = Math.PI * 2;
const sin = (phase: number): number => Math.sin(phase * TAU);
/** How far an elbow bends at rest, so a hanging arm is not straight. */
const RELAXED_ELBOW = -0.12;

/** Rises from 0 to 1 and back over one phase, smoothly at both ends. */
const bump = (phase: number): number => Math.sin(phase * Math.PI) ** 2;

/** The nodes every clip moves, so a crossfade never leaves one posed by the last clip. */
const POSED_NODES = [
  'spine',
  'head',
  'arm_l',
  'arm_r',
  'forearm_l',
  'forearm_r',
  'leg_l',
  'leg_r',
  'shin_l',
  'shin_r',
] as const;

type PosedNode = (typeof POSED_NODES)[number];

/** A node's rotation in a clip: about X, and optionally Z and Y, each a function of phase. */
interface Pose {
  x?: (phase: number) => number;
  z?: (phase: number) => number;
  y?: (phase: number) => number;
}

/**
 * A clip that moves the given nodes and holds every other node of `POSED_NODES` at rest, with the
 * hips at `hip` (a function of phase, in unscaled metres).
 */
function clipOf(
  name: string,
  duration: number,
  heightFactor: number,
  hip: (phase: number) => number,
  poses: Partial<Record<PosedNode, Pose>>,
): AnimationClip {
  const steps = Math.max(8, Math.round(duration * 10));
  const rest: Record<PosedNode, Pose> = {
    spine: {},
    head: {},
    arm_l: { z: () => 0.08 },
    arm_r: { z: () => -0.08 },
    forearm_l: { x: () => RELAXED_ELBOW },
    forearm_r: { x: () => RELAXED_ELBOW },
    leg_l: {},
    leg_r: {},
    shin_l: {},
    shin_r: {},
  };
  return new AnimationClip(name, duration, [
    hipHeight(duration, steps, hip, heightFactor),
    ...POSED_NODES.map((nodeName) => {
      const pose = poses[nodeName] ?? rest[nodeName];
      return rotation(
        nodeName,
        duration,
        steps,
        pose.x ?? (() => 0),
        pose.z ?? (() => 0),
        pose.y ?? (() => 0),
      );
    }),
  ]);
}

/** The idle clips of phase 4c: what an agent does at a spot, and the owner at an object. */
function spotClips(h: number): AnimationClip[] {
  const standing = (): number => HIP_HEIGHT;
  return [
    clipOf('drink', 2.4, h, standing, {
      arm_r: { x: (p) => -0.2 - 0.6 * bump(p), z: (p) => -0.08 + 0.3 * bump(p) },
      forearm_r: { x: (p) => RELAXED_ELBOW - 1.9 * bump(p) },
      head: { x: (p) => -0.25 * bump(p) },
    }),
    clipOf('look', 3, h, standing, {
      head: { x: () => -0.05, y: (p) => 0.6 * sin(p) },
      spine: { y: (p) => 0.15 * sin(p) },
    }),
    clipOf('write', 1.6, h, standing, {
      arm_r: { x: (p) => -1.2 + 0.15 * sin(p * 2), z: (p) => 0.1 * sin(p) },
      forearm_r: { x: () => -0.6 },
      head: { x: () => 0.05 },
    }),
    clipOf('touch', 2.5, h, () => 0.4, {
      leg_l: { x: () => -1.3 },
      leg_r: { x: () => -1.3 },
      shin_l: { x: () => 2.2 },
      shin_r: { x: () => 2.2 },
      spine: { x: () => 0.5 },
      arm_r: { x: (p) => -0.8 - 0.15 * sin(p * 3) },
      head: { x: () => 0.3 },
    }),
    clipOf('stretch', 2.4, h, (p) => HIP_HEIGHT + 0.02 * bump(p), {
      arm_l: { x: (p) => -2.9 * bump(p), z: (p) => 0.08 + 0.15 * bump(p) },
      arm_r: { x: (p) => -2.9 * bump(p), z: (p) => -0.08 - 0.15 * bump(p) },
      spine: { x: (p) => -0.15 * bump(p) },
      head: { x: (p) => -0.2 * bump(p) },
    }),
    clipOf('talk', 1.6, h, standing, {
      arm_l: { x: (p) => -0.3 - 0.15 * sin(p), z: () => 0.1 },
      arm_r: { x: (p) => -0.3 + 0.15 * sin(p), z: () => -0.1 },
      forearm_l: { x: (p) => -0.8 - 0.3 * sin(p) },
      forearm_r: { x: (p) => -0.8 + 0.3 * sin(p) },
      head: { x: (p) => 0.06 * sin(p * 2) },
    }),
    clipOf('press', 1, h, standing, {
      arm_r: { x: (p) => -1.1 - 0.15 * bump(p) },
      forearm_r: { x: () => -0.4 },
      head: { x: () => 0.05 },
    }),
  ];
}

/**
 * The conversation clips of phase 4h: thinking while a reply is prepared, and the gestures that
 * answer a command: a hand to the chin, a thumb up, a bow, a nod and a sigh.
 */
function conversationClips(h: number): AnimationClip[] {
  const standing = (): number => HIP_HEIGHT;
  return [
    clipOf('think', 3, h, standing, {
      arm_r: { x: () => -0.55, z: () => 0.2 },
      forearm_r: { x: () => -2.3, z: () => 0.25 },
      arm_l: { x: () => -0.35, z: () => -0.1 },
      forearm_l: { x: () => -1.5, z: () => -0.7 },
      head: { x: (p) => 0.14 + 0.04 * sin(p), y: () => -0.12 },
      spine: { x: () => 0.04 },
    }),
    clipOf('thumbs_up', 1.4, h, standing, {
      arm_r: { x: (p) => -0.6 * bump(p), z: (p) => -0.08 + 0.15 * bump(p) },
      forearm_r: { x: (p) => RELAXED_ELBOW - 1.5 * bump(p) },
      head: { x: (p) => -0.1 * bump(p) },
    }),
    clipOf('bow', 1.6, h, standing, {
      spine: { x: (p) => 0.6 * bump(p) },
      head: { x: (p) => 0.3 * bump(p) },
      arm_l: { x: (p) => 0.15 * bump(p), z: () => 0.08 },
      arm_r: { x: (p) => 0.15 * bump(p), z: () => -0.08 },
    }),
    clipOf('nod', 1.2, h, standing, {
      head: { x: (p) => 0.3 * Math.max(0, sin(p * 2)) },
    }),
    clipOf('sigh', 2, h, (p) => HIP_HEIGHT - 0.02 * bump(p), {
      spine: { x: (p) => 0.12 * bump(p) },
      head: { x: (p) => -0.25 * bump(p) + 0.2 * bump(Math.max(0, p * 2 - 1)) },
      arm_l: { z: (p) => 0.08 + 0.1 * bump(p) },
      arm_r: { z: (p) => -0.08 - 0.1 * bump(p) },
    }),
  ];
}

/** The clips every character carries, scaled to the variant's height. */
export function buildClips(variant: BodyVariant): AnimationClip[] {
  const h = variant.height;
  const idle = new AnimationClip('idle', 2, [
    hipHeight(2, 16, (p) => HIP_HEIGHT + 0.01 * sin(p), h),
    rotation(
      'arm_l',
      2,
      16,
      (p) => 0.05 * sin(p),
      () => 0.08,
    ),
    rotation(
      'arm_r',
      2,
      16,
      (p) => -0.05 * sin(p),
      () => -0.08,
    ),
    rotation('leg_l', 2, 16, () => 0),
    rotation('leg_r', 2, 16, () => 0),
    rotation('shin_l', 2, 16, () => 0),
    rotation('shin_r', 2, 16, () => 0),
    rotation('forearm_l', 2, 16, () => RELAXED_ELBOW),
    rotation('forearm_r', 2, 16, () => RELAXED_ELBOW),
    rotation('head', 2, 16, (p) => 0.03 * sin(p)),
    rotation('spine', 2, 16, () => 0),
  ]);
  const walk = new AnimationClip('walk', 0.8, [
    hipHeight(0.8, 16, (p) => HIP_HEIGHT + 0.025 * Math.abs(sin(p)), h),
    rotation('leg_l', 0.8, 16, (p) => 0.7 * sin(p)),
    rotation('leg_r', 0.8, 16, (p) => -0.7 * sin(p)),
    rotation('shin_l', 0.8, 16, (p) => 0.35 - 0.35 * sin(p)),
    rotation('shin_r', 0.8, 16, (p) => 0.35 + 0.35 * sin(p)),
    rotation(
      'arm_l',
      0.8,
      16,
      (p) => -0.5 * sin(p),
      () => 0.05,
    ),
    rotation(
      'arm_r',
      0.8,
      16,
      (p) => 0.5 * sin(p),
      () => -0.05,
    ),
    rotation('forearm_l', 0.8, 16, (p) => -0.35 + 0.15 * sin(p)),
    rotation('forearm_r', 0.8, 16, (p) => -0.35 - 0.15 * sin(p)),
    rotation('head', 0.8, 16, () => 0),
    rotation('spine', 0.8, 16, () => 0),
  ]);
  const seated = (
    name: string,
    duration: number,
    arms: (phase: number, side: 1 | -1) => number,
  ): AnimationClip =>
    new AnimationClip(name, duration, [
      hipHeight(duration, 8, () => SEATED_HIP_HEIGHT, h),
      rotation('leg_l', duration, 8, () => -Math.PI / 2),
      rotation('leg_r', duration, 8, () => -Math.PI / 2),
      rotation('shin_l', duration, 8, () => Math.PI / 2),
      rotation('shin_r', duration, 8, () => Math.PI / 2),
      rotation(
        'arm_l',
        duration,
        8,
        (p) => arms(p, 1),
        () => 0.1,
      ),
      rotation(
        'arm_r',
        duration,
        8,
        (p) => arms(p, -1),
        () => -0.1,
      ),
      rotation('forearm_l', duration, 8, () => -0.5),
      rotation('forearm_r', duration, 8, () => -0.5),
      rotation('head', duration, 8, () => 0.12),
      rotation('spine', duration, 8, () => 0),
    ]);
  const sit = seated('sit', 2, () => -0.45);
  const work = seated('work', 0.6, (p, side) => -0.85 + 0.1 * sin(p + (side === 1 ? 0 : 0.5)));
  const wave = new AnimationClip('wave', 1.2, [
    hipHeight(1.2, 8, () => HIP_HEIGHT, h),
    rotation(
      'arm_r',
      1.2,
      12,
      () => -2.9,
      (p) => -0.35 - 0.3 * sin(p * 2),
    ),
    rotation(
      'arm_l',
      1.2,
      12,
      () => 0.05,
      () => 0.08,
    ),
    rotation('leg_l', 1.2, 12, () => 0),
    rotation('leg_r', 1.2, 12, () => 0),
    rotation('shin_l', 1.2, 12, () => 0),
    rotation('shin_r', 1.2, 12, () => 0),
    rotation('forearm_r', 1.2, 12, (p) => -0.5 + 0.35 * sin(p * 2)),
    rotation('forearm_l', 1.2, 12, () => RELAXED_ELBOW),
    rotation('head', 1.2, 12, () => -0.08),
    rotation('spine', 1.2, 12, () => 0),
  ]);
  return [idle, walk, work, sit, wave, ...spotClips(h), ...conversationClips(h)];
}

/** A part: a group named after the node it attaches to, with its meshes placed relative to it. */
export interface Part {
  kind: 'hair' | 'outfit' | 'accessory';
  name: string;
  root: Group;
}

function part(kind: Part['kind'], name: string, attach: 'head' | 'spine'): Part {
  const root = new Group();
  root.name = attach;
  return { kind, name, root };
}

/** Every hair, outfit and accessory the manifest offers. */
export function buildParts(): Part[] {
  const parts: Part[] = [];

  const short = part('hair', 'short', 'head');
  box(short.root, 'hair_top', 'hair', [0.28, 0.08, 0.28], [0, 0.31, 0]);
  box(short.root, 'hair_back', 'hair', [0.28, 0.14, 0.06], [0, 0.22, -0.12]);
  parts.push(short);

  const long = part('hair', 'long', 'head');
  box(long.root, 'hair_top', 'hair', [0.28, 0.08, 0.28], [0, 0.31, 0]);
  box(long.root, 'hair_back', 'hair', [0.28, 0.4, 0.08], [0, 0.08, -0.13]);
  box(long.root, 'hair_side_l', 'hair', [0.05, 0.3, 0.2], [0.145, 0.13, -0.02]);
  box(long.root, 'hair_side_r', 'hair', [0.05, 0.3, 0.2], [-0.145, 0.13, -0.02]);
  parts.push(long);

  const curly = part('hair', 'curly', 'head');
  const curls = new Mesh(new IcosahedronGeometry(0.19, 1), material('hair'));
  curls.name = 'hair_curls';
  curls.position.set(0, 0.22, -0.02);
  curls.scale.set(1, 0.8, 1);
  curly.root.add(curls);
  parts.push(curly);

  const bun = part('hair', 'bun', 'head');
  box(bun.root, 'hair_top', 'hair', [0.28, 0.07, 0.28], [0, 0.305, 0]);
  const knot = new Mesh(new IcosahedronGeometry(0.07, 1), material('hair'));
  knot.name = 'hair_bun';
  knot.position.set(0, 0.3, -0.15);
  bun.root.add(knot);
  parts.push(bun);

  const vest = part('outfit', 'vest', 'spine');
  box(vest.root, 'vest_front', 'accent', [0.4, 0.34, 0.03], [0, 0.26, 0.12]);
  box(vest.root, 'vest_back', 'accent', [0.4, 0.34, 0.03], [0, 0.26, -0.12]);
  box(vest.root, 'vest_side_l', 'accent', [0.03, 0.34, 0.24], [0.2, 0.26, 0]);
  box(vest.root, 'vest_side_r', 'accent', [0.03, 0.34, 0.24], [-0.2, 0.26, 0]);
  parts.push(vest);

  const apron = part('outfit', 'apron', 'spine');
  box(apron.root, 'apron_front', 'accent', [0.3, 0.46, 0.02], [0, 0.2, 0.125]);
  box(apron.root, 'apron_strap', 'accent', [0.08, 0.1, 0.02], [0, 0.48, 0.125]);
  parts.push(apron);

  const tie = part('outfit', 'tie', 'spine');
  box(tie.root, 'tie_knot', 'accent', [0.07, 0.05, 0.03], [0, 0.47, 0.125]);
  box(tie.root, 'tie_blade', 'accent', [0.05, 0.3, 0.02], [0, 0.3, 0.125]);
  parts.push(tie);

  const scarf = part('outfit', 'scarf', 'spine');
  box(scarf.root, 'scarf_ring', 'accent', [0.32, 0.08, 0.3], [0, 0.5, 0]);
  box(scarf.root, 'scarf_tail', 'accent', [0.09, 0.28, 0.03], [0.08, 0.35, 0.13]);
  parts.push(scarf);

  const glasses = part('accessory', 'glasses', 'head');
  box(glasses.root, 'lens_l', 'accent', [0.08, 0.06, 0.02], [0.06, 0.17, 0.145]);
  box(glasses.root, 'lens_r', 'accent', [0.08, 0.06, 0.02], [-0.06, 0.17, 0.145]);
  box(glasses.root, 'bridge', 'accent', [0.04, 0.015, 0.015], [0, 0.17, 0.145]);
  parts.push(glasses);

  const cap = part('accessory', 'cap', 'head');
  box(cap.root, 'cap_crown', 'accent', [0.3, 0.1, 0.3], [0, 0.32, 0]);
  box(cap.root, 'cap_brim', 'accent', [0.26, 0.02, 0.14], [0, 0.285, 0.2]);
  parts.push(cap);

  const headset = part('accessory', 'headset', 'head');
  box(headset.root, 'band', 'accent', [0.3, 0.03, 0.04], [0, 0.3, 0]);
  box(headset.root, 'cup_l', 'accent', [0.04, 0.09, 0.09], [0.15, 0.17, 0]);
  box(headset.root, 'cup_r', 'accent', [0.04, 0.09, 0.09], [-0.15, 0.17, 0]);
  box(headset.root, 'mic', 'accent', [0.02, 0.02, 0.14], [0.12, 0.1, 0.08]);
  parts.push(headset);

  const beanie = part('accessory', 'beanie', 'head');
  box(beanie.root, 'beanie_crown', 'accent', [0.29, 0.12, 0.29], [0, 0.3, 0]);
  box(beanie.root, 'beanie_band', 'accent', [0.3, 0.05, 0.3], [0, 0.24, 0]);
  parts.push(beanie);

  return parts;
}

/** A standing figure with its clips, for the file the runtime loads. */
export function buildCharacter(variant: BodyVariant): { root: Object3D; clips: AnimationClip[] } {
  const scene = new Group();
  scene.name = `body_${variant.name}`;
  scene.add(buildBody(variant));
  return { root: scene, clips: buildClips(variant) };
}
