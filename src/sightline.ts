/**
 * Sight-line engine: is a point visible from a lantern, or does something
 * stand in the way?
 *
 * Pure (plain numbers, no Three.js, no allocation per query) so it runs in Node
 * for the unit tests and every frame in the headset.
 *
 * Frame: the board's local frame on the desk. x across (user's left → right),
 * y up from the desk, z toward the user. Metres.
 *
 * Two kinds of cover:
 *  - capsules: a segment with a radius. The tracked hand is a set of capsules,
 *    one per bone (see hand-proxy.ts). Any hand pose blocks whatever its
 *    capsules cover; nothing depends on the pose being "edge-on".
 *  - cylinders: a real object registered by touching its top. A vertical
 *    cylinder from the desk (y = 0) up to the touched height.
 */

/** Floats per capsule: ax, ay, az, bx, by, bz, r. */
export const CAPSULE_STRIDE = 7;
/** Floats per cylinder: x, z, radius, top. */
export const CYLINDER_STRIDE = 4;

/** Who blocked a sight line. */
export const BY_NONE = -1;

/**
 * A set of occluders in one flat buffer, plus a per-occluder "owner" tag
 * (e.g. 0 left hand, 1 right hand, 10 + n registered object n).
 */
export class Occluders {
  readonly capsules: Float32Array;
  readonly capsuleOwner: Int16Array;
  capsuleCount = 0;
  readonly cylinders: Float32Array;
  readonly cylinderOwner: Int16Array;
  cylinderCount = 0;

  constructor(maxCapsules = 80, maxCylinders = 8) {
    this.capsules = new Float32Array(maxCapsules * CAPSULE_STRIDE);
    this.capsuleOwner = new Int16Array(maxCapsules);
    this.cylinders = new Float32Array(maxCylinders * CYLINDER_STRIDE);
    this.cylinderOwner = new Int16Array(maxCylinders);
  }

  clear(): void {
    this.capsuleCount = 0;
    this.cylinderCount = 0;
  }

  addCapsule(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, owner: number): void {
    const n = this.capsuleCount;
    if (n * CAPSULE_STRIDE >= this.capsules.length) return;
    const c = this.capsules;
    const o = n * CAPSULE_STRIDE;
    c[o] = ax;
    c[o + 1] = ay;
    c[o + 2] = az;
    c[o + 3] = bx;
    c[o + 4] = by;
    c[o + 5] = bz;
    c[o + 6] = r;
    this.capsuleOwner[n] = owner;
    this.capsuleCount = n + 1;
  }

  addCylinder(x: number, z: number, radius: number, top: number, owner: number): void {
    const n = this.cylinderCount;
    if (n * CYLINDER_STRIDE >= this.cylinders.length) return;
    const c = this.cylinders;
    const o = n * CYLINDER_STRIDE;
    c[o] = x;
    c[o + 1] = z;
    c[o + 2] = radius;
    c[o + 3] = top;
    this.cylinderOwner[n] = owner;
    this.cylinderCount = n + 1;
  }
}

/**
 * Squared distance between segments P0P1 and Q0Q1 (closest points, clamped to
 * both segments). Ericson, Real-Time Collision Detection, 5.1.9.
 */
export function segSegDist2(
  p0x: number, p0y: number, p0z: number, p1x: number, p1y: number, p1z: number,
  q0x: number, q0y: number, q0z: number, q1x: number, q1y: number, q1z: number,
): number {
  const d1x = p1x - p0x, d1y = p1y - p0y, d1z = p1z - p0z;
  const d2x = q1x - q0x, d2y = q1y - q0y, d2z = q1z - q0z;
  const rx = p0x - q0x, ry = p0y - q0y, rz = p0z - q0z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  const EPS = 1e-12;
  let s: number;
  let t: number;
  if (a <= EPS && e <= EPS) {
    return rx * rx + ry * ry + rz * rz;
  }
  if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const dx = p0x + d1x * s - (q0x + d2x * t);
  const dy = p0y + d1y * s - (q0y + d2y * t);
  const dz = p0z + d1z * s - (q0z + d2z * t);
  return dx * dx + dy * dy + dz * dz;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Does segment L→P pass through the vertical cylinder (centre cx, cz, radius
 * R, from y = 0 to y = top)?
 */
export function segHitsCylinder(
  lx: number, ly: number, lz: number, px: number, py: number, pz: number,
  cx: number, cz: number, R: number, top: number,
): boolean {
  const dx = px - lx;
  const dz = pz - lz;
  const ox = lx - cx;
  const oz = lz - cz;
  // |o + t d|² ≤ R² in the xz plane
  const a = dx * dx + dz * dz;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - R * R;
  let t0: number;
  let t1: number;
  if (a < 1e-14) {
    if (c > 0) return false; // vertical segment outside the circle
    t0 = 0;
    t1 = 1;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return false;
    const sq = Math.sqrt(disc);
    t0 = (-b - sq) / (2 * a);
    t1 = (-b + sq) / (2 * a);
  }
  if (t0 < 0) t0 = 0;
  if (t1 > 1) t1 = 1;
  if (t0 > t1) return false;
  // Height along the segment over [t0, t1]; does it overlap [0, top]?
  const ya = ly + (py - ly) * t0;
  const yb = ly + (py - ly) * t1;
  const lo = ya < yb ? ya : yb;
  const hi = ya < yb ? yb : ya;
  return hi >= 0 && lo <= top;
}

/**
 * First occluder between L and P, as its owner tag, or BY_NONE.
 * Endpoints are excluded by `skipNear`: an occluder touching P itself (the
 * creature) within that distance is ignored, so cover the creature stands
 * right next to still counts but the ground under it does not.
 */
export function blockedBy(
  occ: Occluders,
  lx: number, ly: number, lz: number,
  px: number, py: number, pz: number,
): number {
  const caps = occ.capsules;
  const maxY = ly > py ? ly : py;
  for (let i = 0; i < occ.capsuleCount; i++) {
    const o = i * CAPSULE_STRIDE;
    const r = caps[o + 6];
    // Quick reject: the whole capsule is above the sight line's highest point.
    const cminY = (caps[o + 1] < caps[o + 4] ? caps[o + 1] : caps[o + 4]) - r;
    if (cminY > maxY) continue;
    const d2 = segSegDist2(
      lx, ly, lz, px, py, pz,
      caps[o], caps[o + 1], caps[o + 2], caps[o + 3], caps[o + 4], caps[o + 5],
    );
    if (d2 <= r * r) return occ.capsuleOwner[i];
  }
  const cyl = occ.cylinders;
  for (let i = 0; i < occ.cylinderCount; i++) {
    const o = i * CYLINDER_STRIDE;
    if (segHitsCylinder(lx, ly, lz, px, py, pz, cyl[o], cyl[o + 1], cyl[o + 2], cyl[o + 3])) {
      return occ.cylinderOwner[i];
    }
  }
  return BY_NONE;
}

/** A lantern: where its light comes from and which way it looks (in the xz plane). */
export interface Lantern {
  x: number;
  y: number;
  z: number;
  /** Facing as an angle about +y; 0 faces +z (toward the user). */
  yaw: number;
  /** Half the opening angle of the light, radians. */
  half: number;
  /** How far the light reaches on the desk (horizontal), metres. */
  range: number;
}

/** Horizontal angle of P relative to the lantern's facing, in (−π, π]. */
export function azimuth(l: Lantern, px: number, pz: number): number {
  let a = Math.atan2(px - l.x, pz - l.z) - l.yaw;
  if (a > Math.PI) a -= 2 * Math.PI;
  else if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

export function inCone(l: Lantern, px: number, pz: number): boolean {
  const d = Math.hypot(px - l.x, pz - l.z);
  if (d > l.range || d < 1e-6) return false;
  return Math.abs(azimuth(l, px, pz)) <= l.half;
}

/** What the lantern makes of a point. */
export const SEEN = 1;
export const DARK = 0; // outside the light
export const SHADOW = 2; // inside the light, but something is in the way

export interface SightResult {
  state: number; // SEEN | DARK | SHADOW
  by: number; // owner tag of the blocker when SHADOW, else BY_NONE
}

export function look(l: Lantern, occ: Occluders, px: number, py: number, pz: number, out: SightResult): SightResult {
  if (!inCone(l, px, pz)) {
    out.state = DARK;
    out.by = BY_NONE;
    return out;
  }
  const by = blockedBy(occ, l.x, l.y, l.z, px, py, pz);
  out.state = by === BY_NONE ? SEEN : SHADOW;
  out.by = by;
  return out;
}
