import type { BufferGeometry, Vector3 } from 'three';
import { Pathfinding } from 'three-pathfinding';

/** A polygon of the navigation mesh. */
export interface NavNode {
  id: number;
  centroid: Vector3;
}

/** What the world asks of the path finder, with the answers it really gives at runtime. */
interface PathEngine {
  getGroup(zoneId: string, position: Vector3): number | null;
  getClosestNode(
    position: Vector3,
    zoneId: string,
    groupId: number,
    checkPolygon?: boolean,
  ): NavNode | null;
  findPath(start: Vector3, target: Vector3, zoneId: string, groupId: number): Vector3[] | null;
  clampStep(
    start: Vector3,
    end: Vector3,
    node: NavNode,
    zoneId: string,
    groupId: number,
    endTarget: Vector3,
  ): NavNode | undefined;
}

const ZONE = 'pack';

/** Anything that plans a walk; the actors take it so tests can give a straight line. */
export interface PathPlanner {
  /** The corners to walk through to reach `to`, the last one being `to` or the nearest to it. */
  findPath: (from: Vector3, to: Vector3) => Vector3[];
}

/**
 * The walkable floor of a pack: paths for the agents and a clamp that keeps the owner's character
 * on it. One zone per pack; the mesh may hold several disconnected groups, so every question first
 * finds the group the point is in.
 */
export class Navigation implements PathPlanner {
  private readonly engine: PathEngine;

  constructor(geometry: BufferGeometry) {
    const pathfinding = new Pathfinding();
    pathfinding.setZoneData(ZONE, Pathfinding.createZone(geometry));
    this.engine = pathfinding;
  }

  private groupOf(position: Vector3): number {
    return this.engine.getGroup(ZONE, position) ?? 0;
  }

  /** The point itself when it lies on the mesh, else the centre of the nearest polygon. */
  snap(position: Vector3): Vector3 {
    const group = this.groupOf(position);
    if (this.engine.getClosestNode(position, ZONE, group, true) !== null) return position.clone();
    const nearest = this.engine.getClosestNode(position, ZONE, group, false);
    return nearest === null ? position.clone() : nearest.centroid.clone();
  }

  findPath(from: Vector3, to: Vector3): Vector3[] {
    const start = this.snap(from);
    const end = this.snap(to);
    const path = this.engine.findPath(start, end, ZONE, this.groupOf(start)) ?? [];
    return path.length === 0 ? [end] : path;
  }

  /**
   * Moves from `from` towards `to` without leaving the mesh, writing the point reached into
   * `out`. Returns the polygon that point is in, to pass back next frame.
   */
  clampStep(from: Vector3, to: Vector3, node: NavNode | null, out: Vector3): NavNode | null {
    const group = this.groupOf(from);
    const current = node ?? this.engine.getClosestNode(from, ZONE, group, false);
    if (current === null) {
      out.copy(to);
      return null;
    }
    return this.engine.clampStep(from, to, current, ZONE, group, out) ?? current;
  }
}
