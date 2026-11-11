/**
 * Fingertip contact rules, pure so they are unit-tested in Node.
 *
 * Carried over from the first desk prototype: the fingertip pad offset and a
 * height hysteresis (contact starts below `enter`, ends only above `exit`, so a
 * resting finger does not flicker in and out).
 *
 * New here: one-touch registration of a real object. The user points down onto
 * the top of a mug or a book and holds still (the same tap-and-hold detector
 * as the desk calibration, `TapCalibrator`). The hold height above the
 * calibrated desk becomes the object's height, with a default 8 cm footprint.
 * WebXR does not tell us whether the finger rests on something or pauses in
 * the air, so the rule is deliberately strict: a pointing hand, a clear tap,
 * a longer still hold, and a height between REGISTER.minHeight and maxHeight.
 */
import { CALIB, type CalibParams } from './calibration.ts';

/** Height of the index-tip joint above the surface its pad touches. */
export const TIP_PAD = 0.008;

export interface Hysteresis {
  enter: number;
  exit: number;
}

/** True while "in": enters below `enter`, leaves above `exit` (exit ≥ enter). */
export function hysteresis(value: number, wasIn: boolean, h: Hysteresis): boolean {
  return wasIn ? value < h.exit : value < h.enter;
}

/** A fingertip "on the desk" (used to show the hand's touch on the board). */
export const ON_DESK: Hysteresis = { enter: 0.012, exit: 0.024 };

export interface RegisterParams {
  /** Default footprint: radius of the cylinder that becomes cover. */
  radius: number;
  /** Lowest object top that counts (below: it is the desk). */
  minHeight: number;
  /** Highest (above: a pause in the air, not something on a desk). */
  maxHeight: number;
  /** How far outside the board an object may stand. */
  boardMargin: number;
  /** Keep this clear of the creature's path (centre line to footprint edge). */
  routeClear: number;
  /** Keep this clear of a keeper. */
  keeperClear: number;
  /** A new touch this close to an old object replaces it. */
  replace: number;
  maxObjects: number;
}

export const REGISTER: RegisterParams = {
  radius: 0.04,
  minHeight: 0.03,
  maxHeight: 0.3,
  boardMargin: 0.06,
  routeClear: 0.015,
  keeperClear: 0.03,
  replace: 0.06,
  maxObjects: 4,
};

/** The tap-and-hold for registration: like the desk tap, but held longer. */
export const REGISTER_HOLD: CalibParams = { ...CALIB, hold: 0.8, descent: 0.02, minDrop: 0.05 };

export const REG_OK = 'ok';
export type RegisterVerdict =
  | 'ok'
  | 'too-low'
  | 'too-high'
  | 'off-board'
  | 'on-route'
  | 'on-keeper'
  | 'not-pointing';

export interface RegisterInput {
  /** Fingertip (tip joint) in the board frame. */
  x: number;
  y: number;
  z: number;
  /** Hand pose was "pointing down" with the index finger during the hold. */
  pointing: boolean;
  board: { halfX: number; zMin: number; zMax: number };
  /** Distance from (x, z) to the route's centre line. */
  routeDistance: number;
  /** Distance from (x, z) to the nearest keeper. */
  keeperDistance: number;
}

/** Judges a finished hold on top of something. */
export function judgeRegistration(i: RegisterInput, p: RegisterParams = REGISTER): RegisterVerdict {
  if (!i.pointing) return 'not-pointing';
  const top = i.y - TIP_PAD;
  if (top < p.minHeight) return 'too-low';
  if (top > p.maxHeight) return 'too-high';
  if (
    Math.abs(i.x) > i.board.halfX + p.boardMargin ||
    i.z < i.board.zMin - p.boardMargin ||
    i.z > i.board.zMax + p.boardMargin
  ) {
    return 'off-board';
  }
  if (i.routeDistance < p.radius + p.routeClear) return 'on-route';
  if (i.keeperDistance < p.radius + p.keeperClear) return 'on-keeper';
  return 'ok';
}

/** Distance from point (x, z) to a polyline given as x/z pairs. */
export function distanceToPolyline(x: number, z: number, xz: ArrayLike<number>): number {
  let best = Infinity;
  for (let i = 0; i + 3 < xz.length; i += 2) {
    const ax = xz[i], az = xz[i + 1], bx = xz[i + 2], bz = xz[i + 3];
    const ex = bx - ax, ez = bz - az;
    const ee = ex * ex + ez * ez;
    let t = ee > 1e-12 ? ((x - ax) * ex + (z - az) * ez) / ee : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - ax - ex * t, z - az - ez * t);
    if (d < best) best = d;
  }
  return best;
}

/**
 * The move knob (day 5: pointing only, so a resting hand never moves the
 * board): a pointing fingertip on the knob, low. Board frame, metres. Pure
 * since day 7 so the pointing gate is unit-tested (an outside run removed it
 * and nothing noticed).
 */
export function onKnob(pointing: boolean, lx: number, ly: number, lz: number, knob: { x: number; z: number; r: number }): boolean {
  return pointing && Math.hypot(lx - knob.x, lz - knob.z) < knob.r + 0.006 && ly < 0.01 + TIP_PAD + 0.015;
}
