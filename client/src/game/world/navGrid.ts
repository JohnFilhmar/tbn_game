import { BufferAttribute, BufferGeometry } from 'three';

/** The floor area a piece of furniture or a wall takes, which nobody walks through. */
export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The floor the navigation mesh covers. */
export interface Bounds {
  min_x: number;
  max_x: number;
  min_z: number;
  max_z: number;
}

/** A point someone must be able to stand on and reach, with a name for the error. */
export interface NamedPoint {
  name: string;
  x: number;
  z: number;
}

/** The walkable floor as cells, each cell's centre clear of every footprint by the radius. */
export interface WalkGrid {
  bounds: Bounds;
  cell: number;
  nx: number;
  nz: number;
  walkable: boolean[];
}

/** The grid of cells the agents and the owner walk on, for a floor and what stands on it. */
export function walkGrid(
  bounds: Bounds,
  footprints: readonly Footprint[],
  cell = 0.5,
  radius = 0.3,
): WalkGrid {
  const nx = Math.round((bounds.max_x - bounds.min_x) / cell);
  const nz = Math.round((bounds.max_z - bounds.min_z) / cell);
  const walkable = new Array<boolean>(nx * nz).fill(false);
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const cx = bounds.min_x + (i + 0.5) * cell;
      const cz = bounds.min_z + (j + 0.5) * cell;
      const isInside =
        cx >= bounds.min_x + radius &&
        cx <= bounds.max_x - radius &&
        cz >= bounds.min_z + radius &&
        cz <= bounds.max_z - radius;
      walkable[j * nx + i] =
        isInside &&
        !footprints.some(
          (f) =>
            cx >= f.minX - radius &&
            cx <= f.maxX + radius &&
            cz >= f.minZ - radius &&
            cz <= f.maxZ + radius,
        );
    }
  }
  return { bounds, cell, nx, nz, walkable };
}

function cellOf(grid: WalkGrid, x: number, z: number): number | null {
  const i = Math.floor((x - grid.bounds.min_x) / grid.cell);
  const j = Math.floor((z - grid.bounds.min_z) / grid.cell);
  if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz) return null;
  return j * grid.nx + i;
}

/**
 * Why some of `points` cannot be used: each one off walkable floor, or cut off from the first
 * point, as a sentence. Empty when every point stands on the floor and can reach the first.
 */
export function unreachable(grid: WalkGrid, points: readonly NamedPoint[]): string[] {
  const problems: string[] = [];
  const first = points[0];
  if (first === undefined) return problems;
  const start = cellOf(grid, first.x, first.z);
  const reached = new Set<number>();
  if (start !== null && grid.walkable[start] === true) {
    reached.add(start);
    const queue = [start];
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      const i = next % grid.nx;
      const j = Math.floor(next / grid.nx);
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= grid.nx || nj >= grid.nz) continue;
        const index = nj * grid.nx + ni;
        if (grid.walkable[index] === true && !reached.has(index)) {
          reached.add(index);
          queue.push(index);
        }
      }
    }
  }
  for (const point of points) {
    const at = cellOf(grid, point.x, point.z);
    if (at === null || grid.walkable[at] !== true) {
      problems.push(`${point.name} is blocked`);
    } else if (!reached.has(at)) {
      problems.push(`${point.name} cannot be reached from ${first.name}`);
    }
  }
  return problems;
}

/** The walkable cells as one indexed mesh whose cells share vertices, a little above the floor. */
export function gridGeometry(grid: WalkGrid): BufferGeometry {
  const { bounds, cell, nx, nz, walkable } = grid;
  const vertexIndex = new Map<number, number>();
  const positions: number[] = [];
  const indices: number[] = [];
  const vertex = (i: number, j: number): number => {
    const key = j * (nx + 1) + i;
    let index = vertexIndex.get(key);
    if (index === undefined) {
      index = positions.length / 3;
      vertexIndex.set(key, index);
      positions.push(bounds.min_x + i * cell, 0.02, bounds.min_z + j * cell);
    }
    return index;
  };
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      if (walkable[j * nx + i] !== true) continue;
      const a = vertex(i, j);
      const b = vertex(i + 1, j);
      const c = vertex(i, j + 1);
      const d = vertex(i + 1, j + 1);
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
