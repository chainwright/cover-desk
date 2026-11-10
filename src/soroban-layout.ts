/**
 * Soroban dimensions, in metres, in the abacus's local frame:
 *   x — across the rods (user's left → right)
 *   y — up from the desk surface
 *   z — along the rods; +z points toward the user. The beam is at z = 0.
 * Beads are deliberately big: hand-tracked fingertips are only accurate to
 * about a centimetre, so every bead offers a 2.4 cm face and 3 cm of travel.
 */
import type { DeckLayout } from './bead-physics.js';

export const RODS = 5;
export const ROD_SPACING = 0.056;
export const BEAD_RADIUS = 0.021; // across the rod
export const BEAD_HALF = 0.012; // along the rod
export const BEAD_Y = 0.028; // bead centre height above the desk
export const BEAM_HALF = 0.006;
export const TRAVEL = 0.03;
export const FINGER_RADIUS = 0.008;

export const UPPER: DeckLayout = {
  lo: -BEAM_HALF - 2 * BEAD_HALF - TRAVEL,
  hi: -BEAM_HALF,
  half: BEAD_HALF,
  count: 1,
  beamSide: 'hi',
};

export const LOWER: DeckLayout = {
  lo: BEAM_HALF,
  hi: BEAM_HALF + 4 * 2 * BEAD_HALF + TRAVEL,
  half: BEAD_HALF,
  count: 4,
  beamSide: 'lo',
};

export const RAIL = 0.012; // frame rail thickness
/** Empty rod between a resting bead and the frame, so a fingertip fits behind it. */
export const FINGER_GAP = 0.02;
export const FRAME_Z_MIN = UPPER.lo - FINGER_GAP - RAIL;
export const FRAME_Z_MAX = LOWER.hi + FINGER_GAP + RAIL;
export const FRAME_HEIGHT = 0.05;
/** Top of a bead; a fingertip below this (plus its radius) is in contact range. */
export const BEAD_TOP = BEAD_Y + BEAD_RADIUS;
export const FRAME_HALF_X = (RODS * ROD_SPACING) / 2 + RAIL / 2;
/** Shift that centres the frame on the placement point. */
export const CENTER_Z = (FRAME_Z_MIN + FRAME_Z_MAX) / 2;

export function rodX(i: number): number {
  return (i - (RODS - 1) / 2) * ROD_SPACING;
}
