/**
 * What the game shows after something happens, and the keeper's wake rule.
 * Pure (plain numbers, no Three.js), so it is unit-tested in Node and the
 * system only copies the results onto the models.
 *
 * Day 5 (outside review of day 4):
 *  - after a spot the card said "Slide your hand along" (stale, no reason);
 *    now it says what happened and what to do;
 *  - a win was a 9 mm bead and an 8 mm bob; now the creature hops, the
 *    light flares warm and the new bead pops in, then an "again" card and the
 *    ghost hand show where to put the hand for the next round;
 *  - a hand cupped right at the lantern shaded (nearly) the whole light and
 *    the creature crossed without any skill; now a hand that close wakes the
 *    keeper, a rule the game shows (its eyes open, a card says why).
 */
import {
  EV_DASH_START,
  EV_HOME,
  EV_SPOTTED,
  MODE_HOME,
  MODE_RETREAT,
  MODE_SPOTTED,
  MODE_WAIT,
} from './creature.ts';
import { TEACH_SPOT } from './level.ts';
import type { Lantern } from './sightline.ts';

/** One brass bead per win along the near edge, up to this many. */
export const WIN_BEADS = 10;

/**
 * The keeper wakes when any joint of a tracked hand is this close to the
 * lantern (3D, board frame). Chosen by bisection (tests/day5.test.ts), in the
 * model: the farthest still "stop" hand that got the creature home without a
 * slide had its nearest joint 6.1 cm from the lantern (author's sweep in 1 mm
 * steps, wrist 1–5 cm up; the test bisects in 2.5 mm steps), and the ghost's
 * spot moved 1 cm toward the lantern has it 6.5 cm away. 6.3 cm sits between
 * the two, about 2 mm from each: a thin margin that a real hand may cross.
 */
export const WAKE_RADIUS = 0.063;

/** Nearest of a hand's 25 joints (board frame, x y z per joint) to the lantern, metres. */
export function nearestJointToLantern(j: Float32Array, l: Lantern): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 2 < j.length; i += 3) {
    const d = Math.hypot(j[i] - l.x, j[i + 1] - l.y, j[i + 2] - l.z);
    if (d < best) best = d;
  }
  return best;
}

/** The tracked hand within `r` of the lantern (the nearer one), or -1. */
export function handAtLantern(local: readonly Float32Array[], tracked: readonly boolean[], l: Lantern, r = WAKE_RADIUS): number {
  let hand = -1;
  let best = r;
  for (let h = 0; h < local.length; h++) {
    if (!tracked[h]) continue;
    const d = nearestJointToLantern(local[h], l);
    if (d < best) {
      best = d;
      hand = h;
    }
  }
  return hand;
}

/** After a win, the hand counts as back at the start when its wrist is this close to the ghost's spot (desk plane) and low. */
export const RETURN_RADIUS = 0.04;
export const RETURN_MAX_Y = 0.06;

/** Is a tracked hand's wrist (joint 0) back where the ghost hand stands? */
export function handAtTeachSpot(local: readonly Float32Array[], tracked: readonly boolean[], r = RETURN_RADIUS): boolean {
  for (let h = 0; h < local.length; h++) {
    if (!tracked[h]) continue;
    const j = local[h];
    if (j[1] <= RETURN_MAX_Y && Math.hypot(j[0] - TEACH_SPOT.x, j[2] - TEACH_SPOT.z) < r) return true;
  }
  return false;
}

/**
 * Round state for the cards: latched by game events, cleared by the player.
 *  - `leadSeen`: the creature has waited in a hand's shadow out on the path
 *    (the slide card shows from then until the first win; latched so it
 *    doesn't blink while the creature follows the lane);
 *  - `spotted`: from a spot until the next dash;
 *  - `again`: from a win until a hand stands at the ghost's spot again (or
 *    the next dash, whichever comes first).
 */
export class RoundCues {
  leadSeen = false;
  spotted = false;
  again = false;

  /** Feed every creature event (EV_* from stepCreature). */
  onEvent(ev: number): void {
    if (ev === EV_SPOTTED) this.spotted = true;
    else if (ev === EV_DASH_START) {
      this.spotted = false;
      this.again = false;
    } else if (ev === EV_HOME) {
      this.spotted = false;
      this.again = true;
    }
  }

  /** Once per frame after stepping the creature. */
  frame(mode: number, shadedByHand: boolean, handBackAtStart: boolean): void {
    if (mode === MODE_WAIT && shadedByHand) this.leadSeen = true;
    if (this.again && mode !== MODE_HOME && handBackAtStart) this.again = false;
  }

  leading(wins: number): boolean {
    return wins === 0 && this.leadSeen;
  }
}

/** What the keeper, the trinket and the bead row show. */
export interface Payoff {
  /** Keeper eye opening, 1 = sleepy slit. */
  eyes: number;
  /** The stare line from the lantern to the creature. */
  stare: boolean;
  /** The creature carries the trinket on its back. */
  trinketOnBack: boolean;
  /** Beads in the row. */
  beads: number;
}

export const EYES_OPEN = 4.5;

export function newPayoff(): Payoff {
  return { eyes: 1, stare: false, trinketOnBack: false, beads: 0 };
}

/** The payoff for this frame (written into `out`, no allocation). `awake`: a hand is at the lantern. */
export function payoffFor(mode: number, wins: number, awake: boolean, out: Payoff = newPayoff()): Payoff {
  const spotted = mode === MODE_SPOTTED || mode === MODE_RETREAT;
  out.eyes = spotted || awake ? EYES_OPEN : 1;
  out.stare = mode === MODE_SPOTTED;
  out.trinketOnBack = mode === MODE_HOME;
  out.beads = Math.min(wins, WIN_BEADS);
  return out;
}

/** The win, staged at desk scale. */
export const WIN_FX = {
  /** Two hops with the trinket, the first this high (m), the second 60 % of it. */
  hop: 0.04,
  hopS: 0.45,
  /** The light's warm side brightens by this much, rising over `flareRiseS` (ease-out), fading out by `flareEndS`. */
  flare: 0.4,
  flareRiseS: 0.3,
  flareEndS: 1.6,
  /** The new bead pops in at this scale and settles to 1 over `beadS`. */
  beadPop: 1.4,
  beadS: 0.25,
} as const;

export interface WinFx {
  hop: number;
  flare: number;
  bead: number;
}

export function newWinFx(): WinFx {
  return { hop: 0, flare: 0, bead: 1 };
}

/** The win effects `t` seconds after the creature got home (t < 0: no win showing). */
export function winFx(t: number, out: WinFx = newWinFx()): WinFx {
  out.hop = 0;
  out.flare = 0;
  out.bead = 1;
  if (!(t >= 0)) return out;
  const f = WIN_FX;
  if (t < 2 * f.hopS) {
    const k = t < f.hopS ? 1 : 0.6;
    out.hop = f.hop * k * Math.sin((Math.PI * (t % f.hopS)) / f.hopS);
  }
  if (t < f.flareRiseS) {
    const u = t / f.flareRiseS;
    out.flare = f.flare * (1 - (1 - u) * (1 - u)); // ease-out
  } else if (t < f.flareEndS) {
    const u = (t - f.flareRiseS) / (f.flareEndS - f.flareRiseS);
    out.flare = f.flare * (1 - u) * (1 - u);
  }
  if (t < f.beadS) out.bead = f.beadPop - (f.beadPop - 1) * (t / f.beadS);
  return out;
}
