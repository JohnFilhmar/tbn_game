import type { WorldPlacement } from '@tbn/contracts';
import type { Group } from 'three';
import { PackBuilder, type Footprint } from './builder.ts';
import { PROP_CATALOG, type PropAnchors, type PropSize } from './catalog.ts';
import { BASE_MATERIALS } from './furniture.ts';

/** A prop built at the origin facing +Z: its meshes, the floor it blocks and its anchors. */
export interface PropModel {
  group: Group;
  footprints: Footprint[];
  anchors: PropAnchors;
}

/** The size a placement is built at: its own, or its kind's default; null for a fixed size. */
export function sizeOf(placement: Pick<WorldPlacement, 'kind' | 'width' | 'depth'>): PropSize {
  const base = PROP_CATALOG[placement.kind].size ?? { width: 1, depth: 1 };
  return { width: placement.width ?? base.width, depth: placement.depth ?? base.depth };
}

/** The variant a placement is built in: its own when its kind has it, else the kind's first. */
export function variantOf(placement: Pick<WorldPlacement, 'kind' | 'variant'>): string {
  const { variants } = PROP_CATALOG[placement.kind];
  if (placement.variant !== null && variants.includes(placement.variant)) return placement.variant;
  return variants[0] ?? '';
}

const models = new Map<string, PropModel>();

/** The key under which props share a model: their kind, size and variant. */
export function modelKey(placement: Pick<WorldPlacement, 'kind' | 'width' | 'depth' | 'variant'>) {
  const size = sizeOf(placement);
  return `${placement.kind}:${size.width}x${size.depth}:${variantOf(placement)}`;
}

/** A prop's model, built the first time it is asked for and shared after. */
export function propModel(
  placement: Pick<WorldPlacement, 'kind' | 'width' | 'depth' | 'variant'>,
): PropModel {
  const key = modelKey(placement);
  let model = models.get(key);
  if (model === undefined) {
    const b = new PackBuilder(BASE_MATERIALS);
    const anchors = PROP_CATALOG[placement.kind].build(b, sizeOf(placement), variantOf(placement));
    model = { group: b.build(), footprints: [...b.footprints], anchors };
    models.set(key, model);
  }
  return model;
}
