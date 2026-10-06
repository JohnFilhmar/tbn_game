/** Metres between footfalls walking, and running. */
export const WALK_STRIDE = 0.7;
export const RUN_STRIDE = 1.1;
/** Farther than this in one frame is a teleport, not a step. */
const JUMP = 1.5;

/**
 * Counts a walker's footfalls by the ground it covers, so a step sounds every stride whatever the
 * clip or the frame rate. Standing, sitting or jumping never steps.
 */
export class Strider {
  private lastX: number | null = null;
  private lastZ = 0;
  private travelled = 0;

  /** Moves the walker to (`x`, `z`); true when that move finished a stride of `stride` metres. */
  advance(x: number, z: number, isWalking: boolean, stride: number): boolean {
    const moved = this.lastX === null ? 0 : Math.hypot(x - this.lastX, z - this.lastZ);
    this.lastX = x;
    this.lastZ = z;
    if (!isWalking || moved > JUMP) {
      this.travelled = 0;
      return false;
    }
    this.travelled += moved;
    if (this.travelled < stride) return false;
    this.travelled %= stride;
    return true;
  }
}
