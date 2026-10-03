import {
  BoxGeometry,
  type BufferGeometry,
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
import type { Footprint } from '../world/navGrid.ts';

/** A point in metres: x east, y up, z south. */
export type Vec3 = [number, number, number];

export type { Footprint } from '../world/navGrid.ts';

export type { Bounds } from '../world/navGrid.ts';

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
 * material's geometry into one mesh. The pack generator builds the shell with it, and the world
 * builds every prop with it at the origin, once per kind and size.
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
