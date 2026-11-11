/**
 * Synthetic 25-joint hands (WebXR joint order) for the unit tests.
 *
 * A hand is built in its own frame: u = wrist → fingers, v = across the palm
 * (thumb side positive), n = out of the palm. Then placed with a wrist
 * position and the three axes in the board frame.
 */
type V3 = [number, number, number];

export interface HandSpec {
  wrist: V3;
  u: V3;
  v: V3;
  n: V3;
  /** 1 = fingers together, larger spreads them at the knuckles and beyond. */
  spread?: number;
  /** Curl these fingers (0 index … 3 little): tips folded back into the palm. */
  curl?: number[];
}

// knuckle offsets across the palm (index … little) and finger segment lengths
const ACROSS = [0.026, 0.008, -0.01, -0.027];
const SEGS = [
  [0.042, 0.025, 0.021], // index: proximal, intermediate, distal(+tip)
  [0.047, 0.028, 0.022],
  [0.044, 0.027, 0.021],
  [0.034, 0.02, 0.019],
];

export function makeHand(s: HandSpec): Float32Array {
  const j = new Float32Array(75);
  const put = (i: number, a: number, b: number, c: number) => {
    j[i * 3] = s.wrist[0] + s.u[0] * a + s.v[0] * b + s.n[0] * c;
    j[i * 3 + 1] = s.wrist[1] + s.u[1] * a + s.v[1] * b + s.n[1] * c;
    j[i * 3 + 2] = s.wrist[2] + s.u[2] * a + s.v[2] * b + s.n[2] * c;
  };
  put(0, 0, 0, 0);
  // thumb
  put(1, 0.02, 0.022, 0.004);
  put(2, 0.045, 0.045, 0.006);
  put(3, 0.068, 0.058, 0.006);
  put(4, 0.088, 0.066, 0.006);
  const spread = s.spread ?? 1;
  for (let f = 0; f < 4; f++) {
    const base = 5 + f * 5;
    const across = ACROSS[f];
    put(base, 0.02, across * 0.5, 0); // metacarpal base
    put(base + 1, 0.085, across * spread, 0); // knuckle
    const lean = (across * (spread - 1)) / 0.04; // spread fans the fingers out
    let a = 0.085;
    let b = across * spread;
    if (s.curl?.includes(f)) {
      put(base + 2, a + 0.025, b, -0.02);
      put(base + 3, a + 0.012, b, -0.035);
      put(base + 4, a - 0.004, b, -0.03);
      continue;
    }
    for (let k = 0; k < 3; k++) {
      a += SEGS[f][k];
      b += SEGS[f][k] * lean;
      put(base + 2 + k, a, b, 0);
    }
  }
  return j;
}

/** Fingers along +x, palm down, wrist at (x, y, z). */
export function flatHand(x: number, y: number, z: number, spread = 1): Float32Array {
  return makeHand({ wrist: [x, y, z], u: [1, 0, 0], v: [0, 0, -1], n: [0, -1, 0], spread });
}

/** On its little-finger edge, fingers along +x, palm toward the user (+z): a wall across the light. */
export function edgeHand(x: number, y: number, z: number): Float32Array {
  return makeHand({ wrist: [x, y, z], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] });
}

/** "Stop": fingers up, palm toward the lantern (−z). */
export function stopHand(x: number, y: number, z: number, spread = 1): Float32Array {
  return makeHand({ wrist: [x, y, z], u: [0, 1, 0], v: [1, 0, 0], n: [0, 0, -1], spread });
}

/** Pointing straight down with the index finger, others curled. */
export function pointingHand(x: number, tipY: number, z: number): Float32Array {
  // index tip is 0.085 + 0.088 below the wrist along u = −y
  return makeHand({ wrist: [x, tipY + 0.173, z], u: [0, -1, 0], v: [1, 0, 0], n: [0, 0, 1], curl: [1, 2, 3] });
}
