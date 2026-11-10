/**
 * One-dimensional bead model for a single soroban rod.
 *
 * Coordinates are in metres along the rod, in the abacus's local frame:
 * the reckoning bar (beam) sits at 0, the upper deck is on the negative side
 * (away from the user), the lower deck on the positive side (toward the user).
 *
 * This module is pure (no rendering, no imports) so it can be unit-tested in
 * plain Node.
 */

export interface DeckLayout {
  /** Lowest allowed bead edge (inclusive). */
  lo: number;
  /** Highest allowed bead edge (inclusive). */
  hi: number;
  /** Half of a bead's length along the rod. */
  half: number;
  /** Number of beads in this deck. */
  count: number;
  /** Which end of the deck touches the beam: 'hi' for the upper deck, 'lo' for the lower deck. */
  beamSide: 'lo' | 'hi';
}

export interface Pusher {
  /** Fingertip position along the rod, this frame. */
  z: number;
  /** Fingertip position along the rod, previous frame (NaN if it was not in contact range). */
  prevZ: number;
  /** Fingertip radius. */
  radius: number;
  /**
   * Per-bead contact memory owned by this finger for this deck: 0 = no contact,
   * -1 = finger is on the low side of the bead, +1 = on the high side.
   * Keeps the push direction stable while a blocked bead lets the finger sink in.
   */
  sides: Int8Array;
}

/** Clears a finger's contact memory (call when the finger leaves the rod). */
export function releasePusher(p: Pusher): void {
  p.sides.fill(0);
}

/** Centre position of bead `j` (0 = nearest the beam) when the deck shows `value`. */
export function canonicalCenter(deck: DeckLayout, value: number, j: number): number {
  const d = deck.half * 2;
  if (deck.beamSide === 'lo') {
    // lower deck: beam at `lo`; counted beads are pushed up against the beam
    if (j < value) return deck.lo + deck.half + d * j;
    return deck.hi - deck.half - d * (deck.count - 1 - j);
  }
  // upper deck: beam at `hi`
  if (j < value) return deck.hi - deck.half - d * j;
  return deck.lo + deck.half + d * (deck.count - 1 - j);
}

/** Fill `out` with canonical centres for `value`. Bead order: index 0 is nearest the beam. */
export function setCanonical(deck: DeckLayout, value: number, out: Float32Array): void {
  for (let j = 0; j < deck.count; j++) out[j] = canonicalCenter(deck, value, j);
}

/**
 * Reads how many beads count (are closer to their "against the beam" spot
 * than to their "resting" spot). Beads are ordered, so this is a prefix count.
 */
export function readDeck(deck: DeckLayout, centers: Float32Array): number {
  let value = 0;
  for (let j = 0; j < deck.count; j++) {
    const on = canonicalCenter(deck, j + 1, j); // bead j counted
    const off = canonicalCenter(deck, 0, j); // bead j resting
    if (Math.abs(centers[j] - on) < Math.abs(centers[j] - off)) value = j + 1;
    else break;
  }
  return value;
}

/**
 * Enforces ordering, no overlap and deck limits. `towardHi` decides which
 * pass runs first so a pushed chain moves as a block.
 * Index 0 is nearest the beam; we convert to ascending-z order internally.
 */
export function resolve(deck: DeckLayout, centers: Float32Array, towardHi: boolean): void {
  const n = deck.count;
  const d = deck.half * 2;
  // ascending-z index helpers
  const at = (k: number) => (deck.beamSide === 'lo' ? k : n - 1 - k);
  const forward = () => {
    let min = deck.lo + deck.half;
    for (let k = 0; k < n; k++) {
      const i = at(k);
      if (centers[i] < min) centers[i] = min;
      min = centers[i] + d;
    }
  };
  const backward = () => {
    let max = deck.hi - deck.half;
    for (let k = n - 1; k >= 0; k--) {
      const i = at(k);
      if (centers[i] > max) centers[i] = max;
      max = centers[i] - d;
    }
  };
  if (towardHi) {
    forward();
    backward();
  } else {
    backward();
    forward();
  }
}

export const SIDE_NONE = 0;
export const SIDE_LOW = -1;
export const SIDE_HIGH = 1;
/** Finger landed on the bead's top: the bead follows the finger (friction drag). */
export const SIDE_TOP = 2;

/**
 * Moves beads with a fingertip. Returns true if the finger touched a bead.
 *
 * Two contact modes, chosen when the finger first reaches a bead and then
 * kept until it leaves (so a blocked bead never flips through the finger):
 * - edge push: the finger arrives from one side and shoves the bead ahead of it;
 * - top drag: the finger lands on the bead's top (`onTop`, within the middle
 *   of the bead) and the bead follows the finger's motion, like friction on a
 *   real soroban. This is what lets a bead resting against the frame or the
 *   beam be moved at all.
 * Neighbours are pushed along and deck limits respected either way.
 */
export function push(
  deck: DeckLayout,
  centers: Float32Array,
  p: Pusher,
  onTop = false,
): boolean {
  let touched = false;
  let towardHi = true;
  const reach = deck.half + p.radius;
  const hasPrev = !Number.isNaN(p.prevZ);
  const dz = hasPrev ? p.z - p.prevZ : 0;
  for (let j = 0; j < deck.count; j++) {
    const c = centers[j];
    if (Math.abs(p.z - c) >= reach) {
      p.sides[j] = SIDE_NONE;
      continue;
    }
    if (p.sides[j] === SIDE_NONE) {
      const ref = hasPrev ? p.prevZ : p.z;
      if (onTop && Math.abs(p.z - c) < deck.half * 0.7) p.sides[j] = SIDE_TOP;
      else p.sides[j] = ref < c ? SIDE_LOW : SIDE_HIGH;
    }
    touched = true;
    if (p.sides[j] === SIDE_TOP) {
      if (dz !== 0) {
        centers[j] = c + dz;
        towardHi = dz > 0;
      }
      continue;
    }
    const fromLow = p.sides[j] === SIDE_LOW; // finger on the low side → push toward hi
    towardHi = fromLow;
    centers[j] = fromLow ? p.z + reach : p.z - reach;
  }
  if (touched) resolve(deck, centers, towardHi);
  return touched;
}

/** Eases beads toward the canonical layout for their current reading. */
export function settle(
  deck: DeckLayout,
  centers: Float32Array,
  scratch: Float32Array,
  dt: number,
  rate = 14,
): number {
  const value = readDeck(deck, centers);
  setCanonical(deck, value, scratch);
  const k = 1 - Math.exp(-rate * dt);
  for (let j = 0; j < deck.count; j++) centers[j] += (scratch[j] - centers[j]) * k;
  return value;
}
