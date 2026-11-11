/**
 * Reads a rod from where the finger comes to rest, without bead meshes.
 *
 * In the faded stages the beads are gone, so the value can't come from beads
 * being knocked around frame by frame. Instead each stroke on a rod is reduced
 * to three numbers: where the finger started, where it came to rest, and
 * whether it started on a bead top (a drag) or at desk level (an edge push).
 * The stroke is then replayed as a straight line on a clean layout of the
 * rod's current value, using the same bead physics as the visible abacus.
 *
 * So wobble along the way, tracking jitter, and drift across rods during the
 * stroke don't matter; only the start, the rest point and the contact mode do.
 * Pure, in the layout frame (z along the rod, +z toward the user, beam at 0).
 */
import { push, readDeck, setCanonical, type DeckLayout, type Pusher } from './bead-physics.ts';

export interface Stroke {
  /** Finger z when contact started. */
  startZ: number;
  /** Finger z where it came to rest (lift-off or dwell). */
  endZ: number;
  /** Contact started on a bead top (drag) rather than at desk level (edge push). */
  top: boolean;
}

/** Strokes shorter than this are taps and change nothing. */
export const MIN_STROKE = 0.01;
const STEPS = 48;

const scratch = new Float32Array(8);
const sides = new Int8Array(8);

/** The deck's value after replaying `s` on a clean layout of `current`. */
export function deckAfterStroke(deck: DeckLayout, fingerR: number, current: number, s: Stroke): number {
  if (Math.abs(s.endZ - s.startZ) < MIN_STROKE) return current;
  const c = scratch.subarray(0, deck.count);
  setCanonical(deck, current, c);
  const p: Pusher = { z: s.startZ, prevZ: Number.NaN, radius: fingerR, sides: sides.subarray(0, deck.count) };
  p.sides.fill(0);
  for (let i = 0; i <= STEPS; i++) {
    p.z = s.startZ + ((s.endZ - s.startZ) * i) / STEPS;
    push(deck, c, p, s.top);
    p.prevZ = p.z;
  }
  return readDeck(deck, c);
}

/** Which deck a stroke belongs to: the side of the beam where it started. */
export function strokeDeck(startZ: number): 'upper' | 'lower' {
  return startZ < 0 ? 'upper' : 'lower';
}
