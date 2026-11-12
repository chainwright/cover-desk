/**
 * Day 8 (outside review: nothing carried over to the next session, so every
 * visit started from zero): the bead count and the level-2 unlock are kept in
 * the browser's localStorage (on the headset, this site only) and read back
 * at the next page load. `?reset=1` forgets them with the desk spot.
 *
 * Pure parsing and a thin storage wrapper; storage can throw (private
 * browsing, blocked site data), and then the game simply starts fresh.
 */
import { WIN_BEADS } from './feedback.ts';

export const PROGRESS_KEY = 'cover-progress-v1';

export interface Progress {
  /** Wins so far (beads shown: up to WIN_BEADS). */
  wins: number;
  /** Level 2 unlocked (a level-1 win). */
  unlocked: boolean;
}

/** The stored text back into progress; anything malformed counts as none. Wins are clamped to 0…999. */
export function parseProgress(text: string | null | undefined): Progress {
  const none: Progress = { wins: 0, unlocked: false };
  if (!text) return none;
  try {
    const v = JSON.parse(text) as { wins?: unknown; unlocked?: unknown; v?: unknown };
    if (!v || typeof v !== 'object' || v.v !== 1) return none;
    const wins = typeof v.wins === 'number' && Number.isFinite(v.wins) ? Math.max(0, Math.min(999, Math.floor(v.wins))) : 0;
    return { wins, unlocked: v.unlocked === true || wins > 0 };
  } catch {
    return none;
  }
}

export function formatProgress(p: Progress): string {
  return JSON.stringify({ v: 1, wins: p.wins, unlocked: p.unlocked });
}

/** Beads to show for a win count. */
export function beadsFor(wins: number): number {
  return Math.min(wins, WIN_BEADS);
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storage(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadProgress(s: Store | null = storage()): Progress {
  try {
    return parseProgress(s?.getItem(PROGRESS_KEY));
  } catch {
    return parseProgress(null);
  }
}

export function saveProgress(p: Progress, s: Store | null = storage()): boolean {
  try {
    if (!s) return false;
    s.setItem(PROGRESS_KEY, formatProgress(p));
    return true;
  } catch {
    return false;
  }
}

export function forgetProgress(s: Store | null = storage()): void {
  try {
    s?.removeItem(PROGRESS_KEY);
  } catch {
    // nothing kept, nothing to forget
  }
}
