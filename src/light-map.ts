/**
 * The lantern's light on the desk, as a small polar grid: columns are angles
 * across the light, rows are distances from the lantern. Each cell says
 * whether the keeper can see a creature standing there (lit) or not (shadow).
 *
 * It uses the same sight-line test as the game, so the shadow drawn on the
 * desk is exactly where the creature is safe. The grid is uploaded as a tiny
 * texture and drawn by the light-pool shader (cover-model.ts).
 *
 * Cost control: per frame only every other column is recomputed (the light
 * pool is refreshed at half the frame rate), and each column tests only the
 * occluders whose angle range covers it and which are near enough.
 */
import {
  CAPSULE_STRIDE,
  CYLINDER_STRIDE,
  segHitsCylinder,
  segSegDist2,
  type Lantern,
  type Occluders,
} from './sightline.ts';

export const MAP_COLS = 64;
export const MAP_ROWS = 32;
/** Rows start this far from the lantern (the keeper's own feet are not drawn). */
export const MAP_MIN_D = 0.02;

const FULL = 10; // marker for "covers every angle"

export class LightMap {
  /** RGBA bytes, MAP_COLS × MAP_ROWS, row = distance, column = angle. Red = lit. */
  readonly data = new Uint8Array(MAP_COLS * MAP_ROWS * 4);
  /** Lit cells / all cells, after the last full refresh (for the log). */
  litFraction = 1;
  private azLo = new Float32Array(128);
  private azHi = new Float32Array(128);
  private dMin = new Float32Array(128);
  private cand = new Int16Array(128);
  private parity = 0;

  constructor() {
    this.data.fill(255);
  }

  /** Refreshes half the columns (alternating), or all when `full`. */
  update(l: Lantern, occ: Occluders, height: number, full = false): void {
    const nCap = Math.min(occ.capsuleCount, 100);
    const nCyl = Math.min(occ.cylinderCount, 28);
    this.bounds(l, occ, nCap, nCyl);
    const start = full ? 0 : this.parity;
    const step = full ? 1 : 2;
    this.parity ^= 1;
    const caps = occ.capsules;
    const cyl = occ.cylinders;
    const span = l.range - MAP_MIN_D;
    const ly = l.y;
    const maxY = ly > height ? ly : height;
    for (let c = start; c < MAP_COLS; c += step) {
      const az = -l.half + ((c + 0.5) / MAP_COLS) * 2 * l.half;
      // candidates for this column
      let k = 0;
      for (let i = 0; i < nCap + nCyl; i++) {
        if (az >= this.azLo[i] && az <= this.azHi[i]) this.cand[k++] = i;
      }
      const a = l.yaw + az;
      const sx = Math.sin(a);
      const sz = Math.cos(a);
      for (let r = 0; r < MAP_ROWS; r++) {
        const d = MAP_MIN_D + ((r + 0.5) / MAP_ROWS) * span;
        const px = l.x + sx * d;
        const pz = l.z + sz * d;
        let lit = true;
        for (let q = 0; q < k && lit; q++) {
          const i = this.cand[q];
          if (this.dMin[i] > d) continue;
          if (i < nCap) {
            const o = i * CAPSULE_STRIDE;
            const rad = caps[o + 6];
            if ((caps[o + 1] < caps[o + 4] ? caps[o + 1] : caps[o + 4]) - rad > maxY) continue;
            const d2 = segSegDist2(
              l.x, ly, l.z, px, height, pz,
              caps[o], caps[o + 1], caps[o + 2], caps[o + 3], caps[o + 4], caps[o + 5],
            );
            if (d2 <= rad * rad) lit = false;
          } else {
            const o = (i - nCap) * CYLINDER_STRIDE;
            if (segHitsCylinder(l.x, ly, l.z, px, height, pz, cyl[o], cyl[o + 1], cyl[o + 2], cyl[o + 3])) lit = false;
          }
        }
        this.data[(r * MAP_COLS + c) * 4] = lit ? 255 : 0;
      }
    }
    let litCount = 0;
    for (let i = 0; i < MAP_COLS * MAP_ROWS; i++) if (this.data[i * 4] > 127) litCount++;
    this.litFraction = litCount / (MAP_COLS * MAP_ROWS);
  }

  /** Angle range and nearest horizontal distance of every occluder, seen from the lantern. */
  private bounds(l: Lantern, occ: Occluders, nCap: number, nCyl: number): void {
    const caps = occ.capsules;
    for (let i = 0; i < nCap; i++) {
      const o = i * CAPSULE_STRIDE;
      const r = caps[o + 6];
      const ax = caps[o] - l.x, az = caps[o + 2] - l.z;
      const bx = caps[o + 3] - l.x, bz = caps[o + 5] - l.z;
      const da = Math.hypot(ax, az);
      const db = Math.hypot(bx, bz);
      // nearest horizontal distance from the lantern to the segment
      const ex = bx - ax, ez = bz - az;
      const ee = ex * ex + ez * ez;
      let t = ee > 1e-12 ? -(ax * ex + az * ez) / ee : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const near = Math.hypot(ax + ex * t, az + ez * t);
      this.dMin[i] = near - r;
      if (near <= r) {
        this.azLo[i] = -FULL;
        this.azHi[i] = FULL;
        continue;
      }
      const a1 = wrap(Math.atan2(ax, az) - l.yaw);
      const a2 = wrap(Math.atan2(bx, bz) - l.yaw);
      const p1 = da > r ? Math.asin(r / da) : Math.PI;
      const p2 = db > r ? Math.asin(r / db) : Math.PI;
      if (Math.abs(a1 - a2) > Math.PI) {
        this.azLo[i] = -FULL;
        this.azHi[i] = FULL;
      } else {
        this.azLo[i] = Math.min(a1 - p1, a2 - p2);
        this.azHi[i] = Math.max(a1 + p1, a2 + p2);
      }
    }
    const cyl = occ.cylinders;
    for (let j = 0; j < nCyl; j++) {
      const i = nCap + j;
      const o = j * CYLINDER_STRIDE;
      const cx = cyl[o] - l.x, cz = cyl[o + 1] - l.z, R = cyl[o + 2];
      const dist = Math.hypot(cx, cz);
      this.dMin[i] = dist - R;
      if (dist <= R) {
        this.azLo[i] = -FULL;
        this.azHi[i] = FULL;
        continue;
      }
      const a = wrap(Math.atan2(cx, cz) - l.yaw);
      const p = Math.asin(R / dist);
      this.azLo[i] = a - p;
      this.azHi[i] = a + p;
    }
  }

  /** Lit value (0 or 1) of the cell nearest to board point (x, z); 0 outside the light. */
  sample(l: Lantern, x: number, z: number): number {
    const d = Math.hypot(x - l.x, z - l.z);
    if (d > l.range) return 0;
    const az = wrap(Math.atan2(x - l.x, z - l.z) - l.yaw);
    if (Math.abs(az) > l.half) return 0;
    const c = Math.min(MAP_COLS - 1, Math.floor(((az + l.half) / (2 * l.half)) * MAP_COLS));
    const r = Math.min(MAP_ROWS - 1, Math.max(0, Math.floor(((d - MAP_MIN_D) / (l.range - MAP_MIN_D)) * MAP_ROWS)));
    return this.data[(r * MAP_COLS + c) * 4] > 127 ? 1 : 0;
  }
}

function wrap(a: number): number {
  if (a > Math.PI) return a - 2 * Math.PI;
  if (a <= -Math.PI) return a + 2 * Math.PI;
  return a;
}
