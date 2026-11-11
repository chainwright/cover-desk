/**
 * Level 2, "The keeper's gaze": a real object is needed, so mixed reality is
 * the reason the level exists (day 6; outside review: level 1 plays the same
 * on any flat surface, and Silhouette (2023) already plays hand shadows).
 *
 * The same board, lantern and path as level 1, plus one rule: the keeper
 * watches the middle of its light, a narrow wedge from the lantern to the
 * path (its gaze). A hand that comes between the lantern and any point of
 * the path inside the gaze wakes the keeper (it sees the whole path, as in
 * level 1's lantern rule); a still real object there does not. So:
 *
 *  - your hand alone can lead the creature to the edge of the gaze, never
 *    across it: every point of the path inside the gaze is either in the
 *    light or shaded by a hand, and a hand there wakes the keeper;
 *  - a mug or a book stood in the gaze shades the middle of the path, but
 *    not all of it: one 8 cm object (the registration footprint) as close to
 *    the lantern as registration allows still leaves both ends lit;
 *  - together: your hand leads the creature into the mug's shadow; the mug
 *    holds it there while you take your hand over the top (a hand above the
 *    sight lines shades nothing, so it wakes nothing) to the other side, and
 *    your hand leads it home.
 *
 * Level 2 counts one object (a new registration replaces it), so two or three
 * mugs can't replace the hand either. Pure (no Three.js), unit-tested in
 * tests/day6.test.ts.
 */
import { addHandCapsules, INFLATE } from './hand-proxy.ts';
import { CREATURE_Y, LEVEL_1, Route, type Level } from './level.ts';
import { BY_NONE, Occluders, azimuth, blockedBy, inCone, type Lantern } from './sightline.ts';

const DEG = Math.PI / 180;

/** Half the gaze wedge's opening (the light's own half-opening is 38°). */
export const GAZE_HALF = 10 * DEG;

export const LEVEL_2: Level = {
  ...LEVEL_1,
  id: 2,
  name: "The keeper's gaze",
  needsObject: true,
};

/**
 * Where the ghost hand stands in level 2: left of the gaze to start, right of
 * it after the mug has taken over (board frame, wrist on the desk), 8 cm out
 * from the middle (level 1's spot is 6.5 cm left). Chosen against the gaze
 * and the mug (tests/day6.test.ts): a "stop" hand moved 1 cm any way, thumb
 * in or out, keeps clear of the gaze at 7 and 11 mm joint radii; at 14 mm
 * the corner 1 cm inward and 1 cm toward the lantern touches it. With 11 mm
 * radii (the emulator reports about 11) a still hand at each ghost, the mug
 * on its ghost, gets the creature home; with the fixture's 7 mm floor the
 * hand has to move a little toward the mug.
 */
export const L2_LEFT = { x: -0.08, z: -0.025 } as const;
export const L2_RIGHT = { x: 0.08, z: -0.025 } as const;

/**
 * Where the ghost mug shows the object should go: in the gaze, 7.5 cm in
 * front of the lantern (registration refuses closer than 7 cm). Its shadow
 * covers the gaze with room on both sides; both ends of the light stay lit.
 */
export const MUG_SPOT = { x: 0, z: -0.03 } as const;

/** Spacing of the gaze samples along the path, and the extra capsule radius the wake test uses (covers the gaps between samples). */
export const GAZE_STEP = 0.002;
export const GAZE_PAD = 0.002;

/**
 * The gaze: the stretch of the path inside the wedge, sampled every
 * GAZE_STEP, and the test "does a hand shade any of it" (it wakes the keeper).
 *
 * Why it is airtight in the model: any path point P in the gaze is within
 * GAZE_STEP / 2 of a sample S; the sight lines L→P and L→S diverge from 0 at
 * the lantern to at most 1 mm at the path, so a capsule that blocks L→P
 * comes within its radius + 1 mm of L→S, and the wake test pads every
 * capsule by GAZE_PAD = 2 mm. A hand can never shade a gaze point without
 * waking the keeper.
 */
export class Gaze {
  /** x, z of each sample on the path. */
  readonly samples: Float32Array;
  readonly count: number;
  /** Arc length along the route where the gaze stretch starts and ends. */
  readonly s0: number;
  readonly s1: number;
  readonly lantern: Lantern;
  private occ = new Occluders(40, 1);

  constructor(lantern: Lantern, route: Route, half = GAZE_HALF, step = GAZE_STEP) {
    this.lantern = lantern;
    const at = [0, 0, 0];
    const xs: number[] = [];
    let s0 = -1, s1 = -1;
    for (let s = 0; s <= route.length + 1e-9; s += step) {
      route.at(s, at);
      if (inCone(lantern, at[0], at[1]) && Math.abs(azimuth(lantern, at[0], at[1])) <= half) {
        xs.push(at[0], at[1]);
        if (s0 < 0) s0 = s;
        s1 = s;
      }
    }
    this.samples = Float32Array.from(xs);
    this.count = xs.length / 2;
    this.s0 = s0;
    this.s1 = s1;
  }

  /** Does this hand (25 joints, board frame) shade any point of the path inside the gaze? */
  handIn(joints: Float32Array, radii: Float32Array | null): boolean {
    const o = this.occ;
    o.clear();
    addHandCapsules(joints, radii, 0, o, INFLATE + GAZE_PAD);
    const l = this.lantern;
    const p = this.samples;
    for (let i = 0; i < this.count; i++) {
      if (blockedBy(o, l.x, l.y, l.z, p[2 * i], CREATURE_Y, p[2 * i + 1]) !== BY_NONE) return true;
    }
    return false;
  }

  /** Do these occluders (the registered objects) shade every point of the path inside the gaze? */
  coveredBy(objects: Occluders): boolean {
    if (objects.capsuleCount + objects.cylinderCount === 0) return false;
    const l = this.lantern;
    const p = this.samples;
    for (let i = 0; i < this.count; i++) {
      if (blockedBy(objects, l.x, l.y, l.z, p[2 * i], CREATURE_Y, p[2 * i + 1]) === BY_NONE) return false;
    }
    return this.count > 0;
  }

  /** The tracked hand in the gaze (the first found), or -1. */
  handInGaze(local: readonly Float32Array[], radii: readonly (Float32Array | null)[], tracked: readonly boolean[]): number {
    for (let h = 0; h < local.length; h++) {
      if (tracked[h] && this.handIn(local[h], radii[h] ?? null)) return h;
    }
    return -1;
  }
}

/**
 * Which level a round plays. Level 2 unlocks with the first level-1 win (or
 * ?level=2), and starts at a round boundary (the creature in its nook, home,
 * or waiting at the light's edge) once a real object is registered. From then on the session stays on
 * level 2; if its object is forgotten (the board moved), the game says that
 * level 2 needs one, and nothing else changes: there is no win without it.
 */
export class LevelProgress {
  level: 1 | 2 = 1;
  unlocked = false;

  constructor(start: 1 | 2 = 1) {
    if (start === 2) {
      this.level = 2;
      this.unlocked = true;
    }
  }

  /** A win on the current level. */
  onWin(): void {
    if (this.level === 1) this.unlocked = true;
  }

  /**
   * Call every frame: switches to level 2 when it is unlocked, an object is
   * registered and the round is at a boundary. Returns true on the switch.
   */
  update(objects: number, atBoundary: boolean): boolean {
    if (this.level === 1 && this.unlocked && objects > 0 && atBoundary) {
      this.level = 2;
      return true;
    }
    return false;
  }
}

/**
 * Which object slot a new registration writes, and the object count after it
 * (writes nothing itself). Level 1: an object touched again (within
 * `replace`) is replaced, else a new slot, else the oldest goes (shift, slot
 * max−1). Level 2 counts one object: always slot 0, count 1.
 */
export function objectSlot(level2: boolean, objects: ArrayLike<number>, count: number, x: number, z: number, replace: number, max: number): { slot: number; count: number; shift: boolean } {
  if (level2) return { slot: 0, count: 1, shift: false };
  let slot = -1;
  for (let i = 0; i < count; i++) {
    if (Math.hypot(objects[i * 3] - x, objects[i * 3 + 1] - z) < replace) slot = i;
  }
  if (slot >= 0) return { slot, count, shift: false };
  if (count < max) return { slot: count, count: count + 1, shift: false };
  return { slot: max - 1, count, shift: true };
}

/** ?level=2 starts on level 2 (for judges and testers without a level-1 win). */
export function startLevel(search: string): 1 | 2 {
  return new URLSearchParams(search).get('level') === '2' ? 2 : 1;
}
