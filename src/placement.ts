/**
 * When the board goes where: the timing rules of placement, pure so they are
 * unit-tested (day 3: an outside review's mutation "late-desk window off"
 * changed nothing in the tests, because this logic lived inside the system).
 *
 * CoverSystem calls `placementStep` once per frame while the board is
 * restoring, searching or floating, and carries out the returned action. The
 * two callbacks are only called when their answer matters (each does real
 * work: `anchorPose` moves the board, `findDesk` scans the planes).
 */

/** How long to wait for a desk plane before using the fallback spot. */
export const DESK_WAIT_S = 2.5;
/** After a fallback, a desk found within this window still wins (once). */
export const LATE_DESK_S = 10;
/**
 * How long to wait for last session's anchor before searching again.
 * 8 s (was 4 s): after a power cycle the headset may need longer to
 * relocalise, and giving up early is costly, because the automatic desk
 * placement that follows saves a new anchor over the old one.
 */
export const RESTORE_WAIT_S = 8;
/** The head must be at least this high before a desk is searched for (a session that has not started tracking reports 0). */
export const MIN_HEAD_Y = 0.3;

export type PlacementState = 'preview' | 'restoring' | 'searching' | 'desk' | 'fallback' | 'touch' | 'anchor';

export type PlacementAction =
  | 'none'
  /** The saved anchor was found; the board is already on it. */
  | 'anchor'
  /** The anchor did not come back (failed, unsupported or too slow): search for a desk. */
  | 'restore-gave-up'
  /** A desk plane in reach: put the board on it. */
  | 'desk'
  /** No desk in time: float the board in front of the viewer. */
  | 'fallback';

export interface PlacementClock {
  placement: PlacementState;
  time: number;
  restoreStart: number;
  searchStart: number;
  placedAt: number;
}

export interface PlacementWorld {
  headY: number;
  /** The anchor restore failed or anchors are unsupported. */
  anchorFailed: boolean;
  /** A restored anchor exists and its pose was applied to the board. */
  anchorPose(): boolean;
  /** A desk plane in reach was found (and remembered by the caller). */
  findDesk(): boolean;
}

export function placementStep(c: PlacementClock, w: PlacementWorld): PlacementAction {
  switch (c.placement) {
    case 'restoring':
      if (w.anchorPose()) return 'anchor';
      if (w.anchorFailed || c.time - c.restoreStart > RESTORE_WAIT_S) return 'restore-gave-up';
      return 'none';
    case 'searching':
      if (w.headY < MIN_HEAD_Y) return 'none';
      if (w.findDesk()) return 'desk';
      return c.time - c.searchStart > DESK_WAIT_S ? 'fallback' : 'none';
    case 'fallback':
      return c.time - c.placedAt < LATE_DESK_S && w.findDesk() ? 'desk' : 'none';
    default:
      return 'none';
  }
}
