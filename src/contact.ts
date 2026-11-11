/**
 * Touch versus hover for one fingertip, in the abacus's local frame
 * (x across the rods, y up from the calibrated desk, z along the rods).
 *
 * Pure (no rendering) so the threshold sweep and the log analyser can run the
 * exact same rule in Node.
 *
 * Heights are measured from SURFACE, the height of the index-tip joint when
 * the finger pad rests on a bead top. The tip joint sits about TIP_PAD above
 * whatever the pad touches, and the desk height itself is measured with the
 * same fingertip (one-touch calibration), so a constant pad offset cancels out.
 *
 * Contact uses hysteresis: it starts below SURFACE + enter and only ends above
 * SURFACE + exit. Without it, a fingertip resting near the threshold flickers
 * in and out, and every re-entry can pick a different push side.
 */
import { BEAD_TOP, ROD_SPACING, RODS, rodX } from './soroban-layout.ts';

/** Height of the index-tip joint above the surface its pad touches. */
export const TIP_PAD = 0.008;
/** Tip height when the pad rests on a bead top. */
export const SURFACE = BEAD_TOP + TIP_PAD;

export interface ContactParams {
  /** Contact starts when the tip is below SURFACE + enter. */
  enter: number;
  /** Contact ends when the tip rises above SURFACE + exit (exit ≥ enter). */
  exit: number;
  /** Below this height (under the desk) tracking is treated as lost. */
  floor: number;
  /** Half-width of a rod's band, across the rods, to start contact. */
  band: number;
  /** Half-width while already in contact with that rod. */
  bandHold: number;
}

/**
 * Chosen by `tools/sweep-thresholds.mjs` (see devlog/DAY2.md for the table and
 * the noise model). To be re-checked against real Quest logs.
 */
export const CONTACT: ContactParams = {
  enter: 0.004,
  exit: 0.016,
  floor: -0.03,
  band: 0.023,
  bandHold: 0.027,
};

/**
 * Rod in contact this frame, or -1.
 * `prevRod` is last frame's result for the same finger (-1 if none).
 */
export function contactRod(
  x: number,
  y: number,
  prevRod: number,
  p: ContactParams = CONTACT,
): number {
  if (y <= p.floor) return -1;
  if (prevRod >= 0 && y < SURFACE + p.exit && Math.abs(x - rodX(prevRod)) < p.bandHold) {
    return prevRod;
  }
  if (y >= SURFACE + p.enter) return -1;
  const r = Math.round(x / ROD_SPACING + (RODS - 1) / 2);
  if (r < 0 || r >= RODS) return -1;
  return Math.abs(x - rodX(r)) < p.band ? r : -1;
}

/** Fingertip state codes used in the log and the tester panel. */
export const STATE_AWAY = 0; // not near any rod
export const STATE_HOVER = 1; // over the abacus, above the contact height
export const STATE_CONTACT = 2; // at contact height on a rod, not touching a bead
export const STATE_BEAD = 3; // moving or holding a bead

export const STATE_NAMES = ['away', 'hover', 'contact', 'bead'] as const;
