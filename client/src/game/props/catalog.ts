import type { PropKind } from '@tbn/contracts';
import type { DeskAnchor, PackBuilder, Vec3 } from './builder.ts';
import { blindsRail, coffeeSet, grassPatch, lampFixture, lightSwitch } from './fixtures.ts';
import {
  computerDesk,
  counter,
  desk,
  forklift,
  fridge,
  lowTable,
  pallet,
  partition,
  plant,
  rug,
  shelfUnit,
  sofa,
  tableSeats,
  tree,
  waterCooler,
  whiteboard,
  type ComputerAnchor,
} from './furniture.ts';
import { interactionSpots } from './interactions.ts';
import { spot, type SpotAnchor } from './spots.ts';

export { spot, type SpotAnchor, type SpotKind } from './spots.ts';

/** The size of a kind that comes in any size: across (x) and along (z), before it turns. */
export interface PropSize {
  width: number;
  depth: number;
}

/** What a prop offers the world, at the origin facing +Z. */
export interface PropAnchors {
  desks: DeskAnchor[];
  computer: ComputerAnchor | null;
  spots: SpotAnchor[];
  /** Floor points someone must reach, such as the owner's chair. */
  reach: Vec3[];
}

/** How the build panel groups the catalog. */
export type PropCategory = 'desks' | 'furniture' | 'lights' | 'plants' | 'storage' | 'zones';

/** One kind of prop: how it is offered in build mode and how it is built. */
export interface PropSpec {
  label: string;
  category: PropCategory;
  /** The size it starts at, for kinds that come in any size; null for a fixed size. */
  size: PropSize | null;
  /** The variants it comes in, the first the default; empty when there is one look. */
  variants: readonly string[];
  /** The material a colour on one prop repaints; null when it cannot be repainted. */
  colorSlot: string | null;
  /** Builds the prop at the origin facing +Z and answers its anchors there. */
  build: (b: PackBuilder, size: PropSize, variant: string) => PropAnchors;
}

function none(): PropAnchors {
  return { desks: [], computer: null, spots: [], reach: [] };
}

function withSpots(spots: SpotAnchor[]): PropAnchors {
  return { ...none(), spots };
}

/** Every prop an owner can place, by kind. */
export const PROP_CATALOG: Record<PropKind, PropSpec> = {
  desk: {
    label: 'Desk',
    category: 'desks',
    size: null,
    variants: [],
    colorSlot: 'wood',
    build: (b) => ({ ...none(), desks: [desk(b, [0, 0], 0)] }),
  },
  computer_desk: {
    label: 'Your computer',
    category: 'desks',
    size: null,
    variants: [],
    colorSlot: 'wood',
    build: (b) => {
      const made = computerDesk(b, [0, 0], 0);
      return { ...none(), computer: made.computer, reach: [made.desk.seat] };
    },
  },
  table: {
    label: 'Table of four',
    category: 'desks',
    size: { width: 2.4, depth: 1.2 },
    variants: ['wood', 'metal'],
    colorSlot: null,
    build: (b, size, variant) => ({
      ...none(),
      desks: tableSeats(b, [0, 0], 0, [size.width, size.depth], variant),
    }),
  },
  partition: {
    label: 'Partition',
    category: 'furniture',
    size: { width: 2.4, depth: 0.08 },
    variants: [],
    colorSlot: 'partition',
    build: (b, size) => {
      partition(b, [-size.width / 2, 0], [size.width / 2, 0]);
      return none();
    },
  },
  sofa: {
    label: 'Sofa',
    category: 'furniture',
    size: { width: 2, depth: 0.85 },
    variants: [],
    colorSlot: 'fabric',
    build: (b, size) => {
      sofa(b, [0, 0], 0, size.width);
      return none();
    },
  },
  low_table: {
    label: 'Low table',
    category: 'furniture',
    size: { width: 1, depth: 0.5 },
    variants: [],
    colorSlot: 'wood',
    build: (b, size) => {
      lowTable(b, [0, 0], 0, [size.width, size.depth]);
      return none();
    },
  },
  whiteboard: {
    label: 'Whiteboard',
    category: 'furniture',
    size: null,
    variants: [],
    colorSlot: null,
    build: (b) => {
      whiteboard(b, [0, 0], 0);
      return withSpots(interactionSpots('whiteboard'));
    },
  },
  water_cooler: {
    label: 'Water cooler',
    category: 'furniture',
    size: null,
    variants: [],
    colorSlot: null,
    build: (b) => {
      waterCooler(b, [0, 0]);
      return withSpots(interactionSpots('water_cooler'));
    },
  },
  coffee_set: {
    label: 'Coffee set',
    category: 'furniture',
    size: null,
    variants: [],
    colorSlot: 'wood',
    build: (b) => {
      coffeeSet(b);
      return withSpots(interactionSpots('coffee_set'));
    },
  },
  blinds: {
    label: 'Window blinds',
    category: 'furniture',
    size: { width: 2, depth: 0.08 },
    variants: [],
    colorSlot: null,
    build: (b, size) => {
      blindsRail(b, size.width);
      return withSpots(interactionSpots('blinds'));
    },
  },
  lamp: {
    label: 'Ceiling lamp',
    category: 'lights',
    size: null,
    variants: ['panel', 'high_bay'],
    colorSlot: null,
    build: (b, _size, variant) => {
      lampFixture(b, variant);
      return none();
    },
  },
  light_switch: {
    label: 'Light switch',
    category: 'lights',
    size: null,
    variants: [],
    colorSlot: null,
    build: (b) => {
      lightSwitch(b);
      return none();
    },
  },
  rug: {
    label: 'Rug',
    category: 'furniture',
    size: { width: 3.2, depth: 2.4 },
    variants: ['fabric', 'accent'],
    colorSlot: null,
    build: (b, size, variant) => {
      rug(b, [0, 0], [size.width, size.depth], variant);
      return none();
    },
  },
  plant: {
    label: 'Pot plant',
    category: 'plants',
    size: null,
    variants: [],
    colorSlot: 'plant',
    build: (b) => {
      plant(b, [0, 0]);
      return withSpots([spot('plant', [0, 0.9], [0, 0])]);
    },
  },
  tree: {
    label: 'Tree',
    category: 'plants',
    size: null,
    variants: ['tall', 'small'],
    colorSlot: 'plant',
    build: (b, _size, variant) => {
      tree(b, [0, 0], variant === 'small' ? 2.2 : 2.6);
      return withSpots([spot('plant', [0, 1], [0, 0])]);
    },
  },
  grass_patch: {
    label: 'Patch of grass',
    category: 'plants',
    size: { width: 1.6, depth: 1.6 },
    variants: [],
    colorSlot: null,
    build: (b, size) => {
      grassPatch(b, size.width, size.depth);
      return withSpots(interactionSpots('grass_patch'));
    },
  },
  shelf: {
    label: 'Shelving',
    category: 'storage',
    size: { width: 10, depth: 1 },
    variants: [],
    colorSlot: null,
    build: (b, size) => {
      shelfUnit(b, [0, 0], 0, size.width, { depth: size.depth, height: 2.8 });
      return withSpots([spot('look', [size.depth / 2 + 0.7, 0], [0, 0])]);
    },
  },
  counter: {
    label: 'Counter',
    category: 'storage',
    size: { width: 7, depth: 0.6 },
    variants: [],
    colorSlot: 'counter',
    build: (b, size) => {
      counter(b, [0, 0], 0, size.width);
      return none();
    },
  },
  fridge: {
    label: 'Fridge',
    category: 'storage',
    size: null,
    variants: [],
    colorSlot: null,
    build: (b) => {
      fridge(b, [0, 0], 0);
      return withSpots([spot('water', [-0.3, 1.3], [0, 0])]);
    },
  },
  pallet: {
    label: 'Pallet',
    category: 'storage',
    size: null,
    variants: [],
    colorSlot: null,
    build: (b) => {
      pallet(b, [0, 0], 0);
      return withSpots([spot('look', [0, 1.2], [0, 0])]);
    },
  },
  forklift: {
    label: 'Forklift',
    category: 'storage',
    size: null,
    variants: [],
    colorSlot: 'accent',
    build: (b) => {
      forklift(b, [0, 0], 0);
      return withSpots([spot('look', [0, -1.7], [0, 0])]);
    },
  },
  zone_rug: {
    label: 'Department zone',
    category: 'zones',
    size: { width: 4, depth: 4 },
    variants: [],
    colorSlot: null,
    build: () => none(),
  },
};
