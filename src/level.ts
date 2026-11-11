/**
 * Level layouts, in the board frame (x across, y up from the desk, z toward
 * the user; the board centre sits where the desk was tapped). Metres.
 *
 * Level 1, "Hand wall": one sleepy lantern-keeper at the back of the board.
 * Its light falls toward you across the creature's path. The creature starts
 * in a felt nook on the left, just outside the light, and its trinket waits
 * on the right, also just outside. In between, ~26 cm of path is lit. Put a
 * hand in the light and its shadow opens a lane the creature dashes through.
 */
import type { Lantern } from './sightline.ts';

export const BOARD = { halfX: 0.21, zMin: -0.16, zMax: 0.13 } as const;

/** Height of the point on the creature the keeper must not see (its body centre). */
export const CREATURE_Y = 0.012;

export interface Level {
  id: number;
  name: string;
  lanterns: Lantern[];
  /** Keeper bodies (one per lantern), x/z on the desk. */
  keepers: { x: number; z: number }[];
  /** Route polyline on the desk, x/z pairs, start nook first, trinket last. */
  route: number[];
  /** A real object is needed to finish (levels after the first). */
  needsObject: boolean;
}

const DEG = Math.PI / 180;

export const LEVEL_1: Level = {
  id: 1,
  name: 'Hand wall',
  lanterns: [{ x: 0, y: 0.075, z: -0.105, yaw: 0, half: 38 * DEG, range: 0.28 }],
  keepers: [{ x: 0, z: -0.13 }],
  route: [-0.19, 0.06, -0.06, 0.065, 0.06, 0.065, 0.19, 0.06],
  needsObject: false,
};

/**
 * Where the first-run ghost hand stands (and the /emu/ seat's 'stop' hand):
 * the wrist on the desk, halfway between the lantern (z −10.5 cm) and the
 * path (z ≈ 6.5 cm), a little left of centre so its shadow starts at the
 * creature's waiting spot.
 *
 * Day 4: the ghost stood 7 cm in front of the lantern and the /emu/ hand 4.5
 * cm; so close, one hand shades (nearly) the whole light and the creature
 * runs home without a slide. Here a standing hand shades a lane a few cm
 * wide on the path (the /emu/ creature waits 10.4 cm along it, having
 * entered the light at 3.3 cm): the creature dashes into it and waits at its
 * far edge, and only sliding the hand along gets it home (tests/day4.test.ts,
 * tests/day5.test.ts). Day 5: a hand by the lantern now wakes the keeper.
 */
export const TEACH_SPOT = { x: -0.065, z: -0.025 } as const;

/** Route helper: cumulative lengths and point lookup by arc length (no allocation per call). */
export class Route {
  readonly xz: Float32Array;
  readonly cum: Float32Array;
  readonly length: number;

  constructor(points: readonly number[]) {
    this.xz = Float32Array.from(points);
    const n = points.length / 2;
    this.cum = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      this.cum[i] = this.cum[i - 1] + Math.hypot(points[2 * i] - points[2 * i - 2], points[2 * i + 1] - points[2 * i - 1]);
    }
    this.length = this.cum[n - 1];
  }

  /** Writes [x, z, headingYaw] at arc length s into `out`. */
  at(s: number, out: Float32Array | number[]): void {
    const n = this.cum.length;
    if (s <= 0) s = 0;
    if (s >= this.length) s = this.length;
    let i = 1;
    while (i < n - 1 && this.cum[i] < s) i++;
    const s0 = this.cum[i - 1];
    const seg = this.cum[i] - s0 || 1;
    const f = (s - s0) / seg;
    const ax = this.xz[2 * i - 2], az = this.xz[2 * i - 1];
    const bx = this.xz[2 * i], bz = this.xz[2 * i + 1];
    out[0] = ax + (bx - ax) * f;
    out[1] = az + (bz - az) * f;
    out[2] = Math.atan2(bx - ax, bz - az);
  }
}
