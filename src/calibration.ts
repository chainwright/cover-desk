/**
 * One-touch desk calibration.
 *
 * The user brings an index fingertip down onto the desk and holds it there
 * for a moment. We look for a short descent followed by a still hold, average
 * the fingertip height over the hold, and take the desk to be TIP_PAD below
 * that. Pure (plain numbers, no Three.js) so it is unit-tested in Node.
 *
 * World coordinates: y up, metres.
 */

export interface CalibParams {
  /** How long the fingertip must stay still. */
  hold: number;
  /** Max height spread (max − min) during the hold. */
  spreadY: number;
  /** Max horizontal wander from the hold's mean during the hold. */
  spreadXZ: number;
  /** The tip must have been at least this much higher shortly before the hold (the "tap"). */
  descent: number;
  /** How far back to look for that descent, before the hold starts. */
  lookback: number;
  /** Valid tip drop below the eyes. */
  minDrop: number;
  maxDrop: number;
  /** Valid horizontal distance from the eyes. */
  minReach: number;
  maxReach: number;
}

export const CALIB: CalibParams = {
  hold: 0.6,
  spreadY: 0.006,
  spreadXZ: 0.012,
  descent: 0.025,
  lookback: 1.0,
  minDrop: 0.2,
  maxDrop: 1.0,
  minReach: 0.12,
  maxReach: 0.8,
};

export interface CalibResult {
  /** Mean fingertip position during the hold. */
  x: number;
  y: number;
  z: number;
  /** Height spread during the hold. */
  spread: number;
  samples: number;
}

/** Fixed-size ring buffer of fingertip samples (no allocation per frame). */
export class TapCalibrator {
  private readonly n: number;
  private readonly t: Float64Array;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly z: Float32Array;
  private head = 0;
  private count = 0;
  /** Fraction (0..1) of the hold completed, for the progress ring. */
  progress = 0;

  readonly params: CalibParams;

  constructor(params: CalibParams = CALIB, capacity = 256) {
    this.params = params;
    this.n = capacity;
    this.t = new Float64Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
  }

  reset(): void {
    this.count = 0;
    this.head = 0;
    this.progress = 0;
  }

  /**
   * Adds a sample and returns a result once a tap-and-hold is complete
   * (`eye` is the viewer's eye position, for the reach checks).
   */
  push(
    time: number,
    x: number,
    y: number,
    z: number,
    eyeX: number,
    eyeY: number,
    eyeZ: number,
  ): CalibResult | null {
    const i = this.head;
    this.t[i] = time;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.head = (i + 1) % this.n;
    if (this.count < this.n) this.count++;
    this.progress = 0;

    const p = this.params;
    const drop = eyeY - y;
    const reach = Math.hypot(x - eyeX, z - eyeZ);
    if (drop < p.minDrop || drop > p.maxDrop || reach < p.minReach || reach > p.maxReach) {
      return null;
    }

    // Walk back from the newest sample while the tip stays within the hold box
    // around the newest sample (a cheap, allocation-free "still" test).
    let minY = y, maxY = y, sx = 0, sy = 0, sz = 0, k = 0;
    let oldest = time;
    for (let back = 0; back < this.count; back++) {
      const j = (i - back + this.n) % this.n;
      if (time - this.t[j] > p.hold + 0.25) break;
      const yy = this.y[j];
      if (Math.hypot(this.x[j] - x, this.z[j] - z) > p.spreadXZ) break;
      const lo = Math.min(minY, yy);
      const hi = Math.max(maxY, yy);
      if (hi - lo > p.spreadY) break;
      minY = lo;
      maxY = hi;
      sx += this.x[j];
      sy += yy;
      sz += this.z[j];
      k++;
      oldest = this.t[j];
    }
    const still = time - oldest;
    this.progress = Math.min(1, still / p.hold);
    if (still < p.hold || k < 3) return null;

    // The tap: somewhere in the lookback window before the hold, the tip was higher.
    let peak = -Infinity;
    for (let back = 0; back < this.count; back++) {
      const j = (i - back + this.n) % this.n;
      const age = oldest - this.t[j];
      if (age < 0) continue;
      if (age > p.lookback) break;
      if (this.y[j] > peak) peak = this.y[j];
    }
    const meanY = sy / k;
    if (peak - meanY < p.descent) {
      this.progress = Math.min(this.progress, 0.95);
      return null;
    }
    return { x: sx / k, y: meanY, z: sz / k, spread: maxY - minY, samples: k };
  }
}

export interface PlaceParams {
  /** Aim: abacus centre no further than this from the eyes (3D). */
  maxEyeDistance: number;
  /** Never closer than this horizontally (keeps the frame out of the chest). */
  minReach: number;
  /**
   * How far the spot may be pulled in from the touch toward the viewer. The
   * touch proves there is desk under the finger, not between finger and
   * viewer, so without a known desk edge the pull is kept small.
   */
  maxPull: number;
}

export const PLACE: PlaceParams = { maxEyeDistance: 0.45, minReach: 0.24, maxPull: 0.05 };

export interface DeskSpot {
  x: number;
  y: number;
  z: number;
  /** Rotation about +y so the abacus's +z (near rail) points at the viewer. */
  yaw: number;
  /** Centre-to-eye distance after clamping. */
  eyeDistance: number;
  /** True if the spot was pulled in or pushed out from under the finger. */
  moved: boolean;
}

/**
 * Where the abacus goes for a desk touch at (tx, deskY, tz): under the finger,
 * facing the viewer, pulled in along the eye→touch line when the touch is
 * beyond comfortable reach (by at most maxPull), pushed out to minReach when
 * it is under the chin. When the desk is more than maxEyeDistance below the
 * eyes, the aim can't be met at all; the closest allowed spot is used.
 */
export function spotFromTouch(
  tx: number,
  deskY: number,
  tz: number,
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  p: PlaceParams = PLACE,
): DeskSpot {
  const dx = tx - eyeX;
  const dz = tz - eyeZ;
  const h = Math.hypot(dx, dz);
  const drop = Math.max(0, eyeY - deskY);
  const hMax = Math.max(p.minReach, Math.sqrt(Math.max(0, p.maxEyeDistance ** 2 - drop ** 2)));
  const hClamped = Math.max(p.minReach, Math.max(h - p.maxPull, Math.min(hMax, h)));
  const ux = h > 1e-6 ? dx / h : 0;
  const uz = h > 1e-6 ? dz / h : -1;
  const x = eyeX + ux * hClamped;
  const z = eyeZ + uz * hClamped;
  return {
    x,
    y: deskY,
    z,
    yaw: Math.atan2(eyeX - x, eyeZ - z),
    eyeDistance: Math.hypot(hClamped, drop),
    moved: Math.abs(hClamped - h) > 1e-4,
  };
}
