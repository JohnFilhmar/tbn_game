import type { WorldPlacement } from '@tbn/contracts';
import { unreachable, walkGrid, type Bounds } from '../world/navGrid.ts';
import type { Footprint } from './builder.ts';
import { arrange, footprintToWorld, type ShellAnchors } from './arrangement.ts';
import { PROP_CATALOG } from './catalog.ts';
import { propModel } from './propModel.ts';

/** Overlaps thinner than this are props standing flush, not one inside the other. */
const SLACK = 0.005;

function overlaps(a: Footprint, b: Footprint): boolean {
  return (
    a.minX < b.maxX - SLACK &&
    b.minX < a.maxX - SLACK &&
    a.minZ < b.maxZ - SLACK &&
    b.minZ < a.maxZ - SLACK
  );
}

/** The floor a placement blocks, on the floor. */
export function blockedBy(placement: WorldPlacement): Footprint[] {
  return propModel(placement).footprints.map((footprint) => footprintToWorld(placement, footprint));
}

/** Why `placement` cannot stand where it is among the others: off the floor or on top of something. */
export function placementProblem(
  bounds: Bounds,
  shell: ShellAnchors,
  placement: WorldPlacement,
  others: readonly WorldPlacement[],
): string | null {
  const label = PROP_CATALOG[placement.kind].label;
  const isOnFloor =
    placement.x >= bounds.min_x &&
    placement.x <= bounds.max_x &&
    placement.z >= bounds.min_z &&
    placement.z <= bounds.max_z;
  if (!isOnFloor) return `The ${label.toLowerCase()} is off the floor.`;
  const mine = blockedBy(placement);
  if (mine.some((footprint) => shell.blocks.some((wall) => overlaps(footprint, wall)))) {
    return `The ${label.toLowerCase()} is in a wall.`;
  }
  for (const other of others) {
    // Partitions join at their ends, so one may run into another.
    if (other.id === placement.id) continue;
    if (placement.kind === 'partition' && other.kind === 'partition') continue;
    const theirs = blockedBy(other);
    if (mine.some((footprint) => theirs.some((their) => overlaps(footprint, their)))) {
      return `The ${label.toLowerCase()} is on top of a ${PROP_CATALOG[other.kind].label.toLowerCase()}.`;
    }
  }
  return null;
}

/**
 * Everything wrong with a layout, as sentences: the number of computers, props off the floor or
 * on top of each other, and every seat, spot and doorway nobody can reach. Empty when it can be
 * saved. Build mode shows these, and the pack generator refuses a default layout that has any.
 */
export function layoutProblems(
  bounds: Bounds,
  shell: ShellAnchors,
  placements: readonly WorldPlacement[],
): string[] {
  const problems: string[] = [];
  const computers = placements.filter((placement) => placement.kind === 'computer_desk').length;
  if (computers !== 1) problems.push('The office needs exactly one computer of yours.');
  for (const placement of placements) {
    const problem = placementProblem(bounds, shell, placement, placements);
    if (problem !== null && !problems.includes(problem)) problems.push(problem);
  }
  const arrangement = arrange(shell, placements);
  const grid = walkGrid(bounds, arrangement.footprints);
  for (const problem of unreachable(grid, arrangement.reach)) {
    const sentence = `${problem[0]?.toUpperCase() ?? ''}${problem.slice(1)}.`;
    if (!problems.includes(sentence)) problems.push(sentence);
  }
  return problems;
}
