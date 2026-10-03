import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Euler,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A point in metres: x east, y up, z south. */
export type Vec3 = [number, number, number];

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

/** A place in the scene and the direction to face there, as the manifest carries it. */
export interface Anchor {
  position: Vec3;
  yaw_deg: number;
}

/** A desk: where the work is, the direction the sitter faces and where the sitter sits. */
export interface DeskAnchor extends Anchor {
  seat: Vec3;
}

/** The unit forward vector of a yaw, 0 facing +Z and 90 facing +X. */
export function forwardOf(yawDeg: number): [number, number] {
  const yaw = (yawDeg * Math.PI) / 180;
  return [Math.sin(yaw), Math.cos(yaw)];
}

/** `point` moved `distance` along `yawDeg`, on the floor. */
export function ahead(point: Vec3, yawDeg: number, distance: number): Vec3 {
  const [dx, dz] = forwardOf(yawDeg);
  return [point[0] + dx * distance, point[1], point[2] + dz * distance];
}

/**
 * Collects geometry per material and the footprints that block walking, then merges each
 * material's geometry into one mesh and lays a navigation mesh over what is left of the floor.
 */
export class PackBuilder {
  private readonly geometries = new Map<string, BufferGeometry[]>();
  readonly footprints: Footprint[] = [];
  readonly materials: Record<string, string>;

  constructor(materials: Record<string, string>) {
    this.materials = materials;
  }

  /** Adds a geometry already shaped, placed at `position` with a yaw, under a material. */
  add(geometry: BufferGeometry, material: string, position: Vec3, yawDeg = 0): void {
    if (!(material in this.materials)) throw new Error(`Unknown material ${material}`);
    const rotation = new Quaternion().setFromEuler(new Euler(0, (yawDeg * Math.PI) / 180, 0));
    geometry.applyMatrix4(
      new Matrix4().compose(new Vector3(...position), rotation, new Vector3(1, 1, 1)),
    );
    const list = this.geometries.get(material) ?? [];
    list.push(geometry);
    this.geometries.set(material, list);
  }

  /** A box of `size` centred at `position`, rotated by `yawDeg`; blocks the floor unless told not to. */
  box(material: string, size: Vec3, position: Vec3, yawDeg = 0, blocks = true): void {
    this.add(new BoxGeometry(...size), material, position, yawDeg);
    if (blocks) this.block(footprintOfBox(size, position, yawDeg));
  }

  /** A vertical cylinder standing on `base`. */
  cylinder(material: string, radius: number, height: number, base: Vec3, blocks = true): void {
    const geometry = new CylinderGeometry(radius, radius, height, 10);
    this.add(geometry, material, [base[0], base[1] + height / 2, base[2]]);
    if (blocks) {
      this.block({
        minX: base[0] - radius,
        maxX: base[0] + radius,
        minZ: base[2] - radius,
        maxZ: base[2] + radius,
      });
    }
  }

  /** A floor panel at `y`, facing up. Walkable. */
  floor(material: string, width: number, depth: number, centre: Vec3 = [0, 0, 0]): void {
    const geometry = new PlaneGeometry(width, depth);
    geometry.rotateX(-Math.PI / 2);
    this.add(geometry, material, centre);
  }

  /** A wall from `from` to `to` on the floor, `height` tall and `thickness` thick. */
  wall(
    material: string,
    from: [number, number],
    to: [number, number],
    height = 3,
    thickness = 0.2,
  ): void {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const length = Math.hypot(dx, dz);
    const yawDeg = (Math.atan2(dx, dz) * 180) / Math.PI;
    const centre: Vec3 = [(from[0] + to[0]) / 2, height / 2, (from[1] + to[1]) / 2];
    this.box(material, [thickness, height, length], centre, yawDeg);
  }

  /**
   * An outer wall: one face, turned towards the origin, so a camera outside the room looks
   * straight through it. It blocks the floor like a wall `thickness` thick.
   */
  outerWall(
    material: string,
    from: [number, number],
    to: [number, number],
    height = 3,
    thickness = 0.2,
  ): void {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const length = Math.hypot(dx, dz);
    const centre: Vec3 = [(from[0] + to[0]) / 2, height / 2, (from[1] + to[1]) / 2];
    let normalX = dz / length;
    let normalZ = -dx / length;
    if (normalX * -centre[0] + normalZ * -centre[2] < 0) {
      normalX = -normalX;
      normalZ = -normalZ;
    }
    const facingDeg = (Math.atan2(normalX, normalZ) * 180) / Math.PI;
    this.add(new PlaneGeometry(length, height), material, centre, facingDeg);
    const wallDeg = (Math.atan2(dx, dz) * 180) / Math.PI;
    this.block(footprintOfBox([thickness, height, length], centre, wallDeg));
  }

  /** Marks floor nobody walks through, with or without geometry. */
  block(footprint: Footprint): void {
    this.footprints.push(footprint);
  }

  /** One mesh per material, named after it, in a group. */
  build(): Group {
    const group = new Group();
    group.name = 'scene';
    for (const [name, list] of this.geometries) {
      const merged = mergeGeometries(
        list.map((geometry) => (geometry.index === null ? geometry : geometry.toNonIndexed())),
        false,
      );
      if (merged === null) throw new Error(`Could not merge ${name}`);
      merged.computeVertexNormals();
      const mesh = new Mesh(
        merged,
        new MeshStandardMaterial({ name, color: this.materials[name], roughness: 0.9 }),
      );
      mesh.name = name;
      group.add(mesh);
    }
    return group;
  }

  /**
   * The walkable floor as a grid of cells, each cell's centre at least `radius` from every
   * footprint, as one indexed geometry whose cells share vertices. Every anchor must land on a
   * walkable cell and every anchor must be reachable from the first, or this throws.
   */
  navmesh(bounds: Bounds, cell: number, radius: number, anchors: Vec3[]): BufferGeometry {
    const nx = Math.round((bounds.max_x - bounds.min_x) / cell);
    const nz = Math.round((bounds.max_z - bounds.min_z) / cell);
    const walkable: boolean[] = new Array<boolean>(nx * nz).fill(false);
    const at = (i: number, j: number): number => j * nx + i;
    for (let j = 0; j < nz; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const cx = bounds.min_x + (i + 0.5) * cell;
        const cz = bounds.min_z + (j + 0.5) * cell;
        const insideBounds =
          cx >= bounds.min_x + radius &&
          cx <= bounds.max_x - radius &&
          cz >= bounds.min_z + radius &&
          cz <= bounds.max_z - radius;
        walkable[at(i, j)] =
          insideBounds &&
          !this.footprints.some(
            (f) =>
              cx >= f.minX - radius &&
              cx <= f.maxX + radius &&
              cz >= f.minZ - radius &&
              cz <= f.maxZ + radius,
          );
      }
    }
    const cellOf = (point: Vec3): [number, number] => [
      Math.floor((point[0] - bounds.min_x) / cell),
      Math.floor((point[2] - bounds.min_z) / cell),
    ];
    for (const anchor of anchors) {
      const [i, j] = cellOf(anchor);
      if (i < 0 || j < 0 || i >= nx || j >= nz || !walkable[at(i, j)]) {
        throw new Error(`Anchor ${anchor.join(',')} is not on walkable floor`);
      }
    }
    const first = anchors[0];
    if (first !== undefined) {
      const start = cellOf(first);
      const reached = new Set<number>([at(start[0], start[1])]);
      const queue = [start];
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        const [i, j] = next;
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
          const index = at(ni, nj);
          if (walkable[index] && !reached.has(index)) {
            reached.add(index);
            queue.push([ni, nj]);
          }
        }
      }
      for (const anchor of anchors) {
        const [i, j] = cellOf(anchor);
        if (!reached.has(at(i, j))) {
          throw new Error(`Anchor ${anchor.join(',')} cannot be reached from ${first.join(',')}`);
        }
      }
    }

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
        if (!walkable[at(i, j)]) continue;
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
}

/** The floor rectangle a rotated box covers. */
export function footprintOfBox(size: Vec3, position: Vec3, yawDeg: number): Footprint {
  const [dx, dz] = forwardOf(yawDeg);
  const halfW = size[0] / 2;
  const halfD = size[2] / 2;
  // The box's local X axis is (cos yaw, -sin yaw) on the floor once rotated about Y.
  const offsets: [number, number][] = [
    [halfW, halfD],
    [-halfW, halfD],
    [halfW, -halfD],
    [-halfW, -halfD],
  ];
  const corners = offsets.map(([lx, lz]): [number, number] => [
    position[0] + lx * dz + lz * dx,
    position[2] - lx * dx + lz * dz,
  ]);
  const xs = corners.map((c) => c[0]);
  const zs = corners.map((c) => c[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}
