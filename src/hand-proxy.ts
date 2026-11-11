/**
 * The tracked hand as cover: one capsule per bone of the 25 WebXR hand joints,
 * plus a few "web" capsules across the palm so a flat hand has no holes.
 *
 * Pose-agnostic on purpose: a flat palm, a hand on its edge, a fist or a
 * "stop" palm all block whatever their capsules cover. Fingers spread wide
 * leave real gaps, and light passes through them, as it would.
 *
 * Joints arrive as a Float32Array of 25 × xyz in the board frame (see
 * sightline.ts), in the WebXR order:
 *   0 wrist
 *   1–4   thumb: metacarpal, proximal, distal, tip
 *   5–9   index: metacarpal, proximal, intermediate, distal, tip
 *   10–14 middle, 15–19 ring, 20–24 little (same five)
 *
 * WebXR gives no per-joint confidence, so the proxy is coarse on purpose:
 * every capsule is inflated by INFLATE. Quest 3 hand tracking error is
 * about 1.7 cm in the best case, so cover is never meant to be pixel exact.
 */
import type { Occluders } from './sightline.ts';

export const JOINTS = 25;
export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_META = 5;
export const INDEX_PROX = 6;
export const INDEX_TIP = 9;
export const MIDDLE_PROX = 11;
export const MIDDLE_TIP = 14;
export const RING_TIP = 19;
export const LITTLE_META = 20;
export const LITTLE_PROX = 21;
export const LITTLE_TIP = 24;

/** Bones (joint pairs) followed by palm webs. 24 bones + 6 webs = 30 capsules. */
export const BONES: readonly (readonly [number, number])[] = [
  // thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // index, middle, ring, little
  [0, 5], [5, 6], [6, 7], [7, 8], [8, 9],
  [0, 10], [10, 11], [11, 12], [12, 13], [13, 14],
  [0, 15], [15, 16], [16, 17], [17, 18], [18, 19],
  [0, 20], [20, 21], [21, 22], [22, 23], [23, 24],
  // palm webs: across the knuckles and across the metacarpal bases
  [6, 11], [11, 16], [16, 21],
  [5, 10], [10, 15], [15, 20],
];
export const HAND_CAPSULES = BONES.length;

/** Smallest capsule radius used, whatever the runtime reports. */
export const MIN_RADIUS = 0.007;
/** Added to every capsule: tracking error, and the skin around the joints. */
export const INFLATE = 0.004;

/**
 * Appends this hand's capsules to `occ`. `radii` are per-joint radii from the
 * runtime (may be all zero if unavailable). Returns the number added.
 */
export function addHandCapsules(
  joints: Float32Array,
  radii: Float32Array | null,
  owner: number,
  occ: Occluders,
  inflate = INFLATE,
): number {
  for (let i = 0; i < BONES.length; i++) {
    const a = BONES[i][0];
    const b = BONES[i][1];
    const ra = radii ? radii[a] : 0;
    const rb = radii ? radii[b] : 0;
    const r = Math.max(MIN_RADIUS, (ra + rb) / 2) + inflate;
    occ.addCapsule(
      joints[a * 3], joints[a * 3 + 1], joints[a * 3 + 2],
      joints[b * 3], joints[b * 3 + 1], joints[b * 3 + 2],
      r, owner,
    );
  }
  return BONES.length;
}

/** Hand pose classes, for the tester log. */
export const POSE_LOST = 0;
export const POSE_FLAT = 1; // palm facing down (or up), lying flat
export const POSE_EDGE = 2; // palm vertical, fingers along the desk: a wall on its edge
export const POSE_STOP = 3; // palm vertical, fingers up: "stop"
export const POSE_OTHER = 4;
export const POSE_NAMES = ['lost', 'flat', 'edge', 'stop', 'other'] as const;

export interface PoseInfo {
  pose: number;
  /** Palm normal's vertical component (1 = palm facing straight up or down). */
  normalY: number;
  /** Middle finger direction's vertical component (1 = pointing straight up). */
  fingerY: number;
}

/**
 * Classifies the hand from three palm points (wrist, index knuckle, little
 * knuckle) and the middle finger. Only for logging and the tutorial; cover
 * itself never depends on it.
 */
export function classifyPose(j: Float32Array, out: PoseInfo): PoseInfo {
  const wx = j[0], wy = j[1], wz = j[2];
  const ax = j[INDEX_PROX * 3] - wx, ay = j[INDEX_PROX * 3 + 1] - wy, az = j[INDEX_PROX * 3 + 2] - wz;
  const bx = j[LITTLE_PROX * 3] - wx, by = j[LITTLE_PROX * 3 + 1] - wy, bz = j[LITTLE_PROX * 3 + 2] - wz;
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  const nl = Math.hypot(nx, ny, nz) || 1;
  const fx = j[MIDDLE_TIP * 3] - j[MIDDLE_PROX * 3];
  const fy = j[MIDDLE_TIP * 3 + 1] - j[MIDDLE_PROX * 3 + 1];
  const fz = j[MIDDLE_TIP * 3 + 2] - j[MIDDLE_PROX * 3 + 2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  out.normalY = Math.abs(ny / nl);
  out.fingerY = fy / fl;
  if (out.normalY > 0.75) out.pose = POSE_FLAT;
  else if (out.normalY < 0.45) out.pose = out.fingerY > 0.6 ? POSE_STOP : Math.abs(out.fingerY) < 0.5 ? POSE_EDGE : POSE_OTHER;
  else out.pose = POSE_OTHER;
  return out;
}

/**
 * True when the hand is pointing down with the index finger: the index tip is
 * clearly the lowest fingertip and well below the wrist. Required for a desk
 * tap (calibration) and for registering a real object, so a hand resting on
 * the desk as cover never counts as either.
 */
export function isPointingDown(j: Float32Array, tipMargin = 0.01, wristMargin = 0.03): boolean {
  const iy = j[INDEX_TIP * 3 + 1];
  if (j[WRIST * 3 + 1] - iy < wristMargin) return false;
  for (let k = 0; k < OTHER_TIPS.length; k++) {
    if (j[OTHER_TIPS[k] * 3 + 1] - iy < tipMargin) return false;
  }
  return true;
}
const OTHER_TIPS = [MIDDLE_TIP, RING_TIP, LITTLE_TIP] as const;
