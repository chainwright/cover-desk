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

/**
 * Day 7 (outside review: the wake test had no hysteresis, so a hand jittering
 * around 6.3 cm toggled the card, the "hm?" and the eyes every frame): once
 * awake, the keeper goes back to sleep only when every joint is farther than
 * this. The wake radius itself is unchanged.
 */
export const SLEEP_RADIUS = 0.07;

/**
 * Day 8 (outside review: the ghost's spot ±1 cm clears the wake radius by
 * about 2 mm, while hand tracking errs by about 1.7 cm at best): a hand
 * must stay inside WAKE_RADIUS this long, without a break, before the
 * keeper wakes. A joint that flickers inside for a frame or two wakes
 * nothing; a hand cupping the lantern still does, a quarter second later.
 * The radius itself is unchanged, so the bisection behind it still holds.
 */
export const WAKE_DWELL_S = 0.25;

/**
 * The lantern wake: wakes once a hand has stayed inside WAKE_RADIUS for
 * WAKE_DWELL_S (day 8), sleeps again only when every joint is beyond
 * SLEEP_RADIUS (day 7, hysteresis).
 */
export class LanternWake {
  /** The hand keeping the keeper awake (-1: asleep). */
  hand = -1;
  /** While asleep: how long a hand has stayed inside WAKE_RADIUS without a break, s. */
  inside = 0;
  /** How long the hand had stayed inside when the keeper last woke, s (logged; the wiring check reads it). */
  wokeAfter = 0;

  get awake(): boolean {
    return this.hand >= 0;
  }

  /** Call once per frame with the frame's (game) time step; returns the hand keeping the keeper awake (-1 none). */
  update(local: readonly Float32Array[], tracked: readonly boolean[], l: Lantern, dt: number): number {
    if (this.hand >= 0) {
      this.hand = handAtLantern(local, tracked, l, SLEEP_RADIUS);
      return this.hand;
    }
    const h = handAtLantern(local, tracked, l, WAKE_RADIUS);
    this.inside = h >= 0 ? this.inside + dt : 0;
    if (h >= 0 && this.inside >= WAKE_DWELL_S - 1e-9) {
      this.hand = h;
      this.wokeAfter = this.inside;
      this.inside = 0;
    }
    return this.hand;
  }

  reset(): void {
    this.hand = -1;
    this.inside = 0;
  }
}

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

/** Is a tracked hand's wrist (joint 0) back where the ghost hand stands (level 1's spot, or level 2's left ghost)? */
export function handAtTeachSpot(local: readonly Float32Array[], tracked: readonly boolean[], r = RETURN_RADIUS, spot: { x: number; z: number } = TEACH_SPOT): boolean {
  for (let h = 0; h < local.length; h++) {
    if (!tracked[h]) continue;
    const j = local[h];
    if (j[1] <= RETURN_MAX_Y && Math.hypot(j[0] - spot.x, j[2] - spot.z) < r) return true;
  }
  return false;
}

/** After a win the next round starts no sooner than this (the win and the "Home!" card get their time)… */
export const NEXT_ROUND_S = 3.5;
/** …and, if no hand comes back to the start, this much later anyway. */
export const NEXT_ROUND_MAX_S = 10;

/**
 * Day 7 (outside review: the ghost and the "again" card vanished 3.5 s after
 * a win, before the hand was back, because the next round's creep-out dash
 * cleared them): the next round starts once a hand is back at the start, or
 * after NEXT_ROUND_MAX_S.
 */
export function nextRoundDue(sinceHome: number, handBack: boolean): boolean {
  return sinceHome > NEXT_ROUND_MAX_S || (handBack && sinceHome > NEXT_ROUND_S);
}

/**
 * Round state for the cards: latched by game events, cleared by the player.
 *  - `leadSeen`: the creature has waited in a hand's shadow out on the path
 *    (the slide card shows from then until the first win; latched so it
 *    doesn't blink while the creature follows the lane);
 *  - `spotted`: from a spot until the next dash;
 *  - `again`: from a win until a hand stands at the ghost's spot again (or
 *    the next dash, whichever comes first; since day 7 the next round, and
 *    so its first dash, waits for that hand or NEXT_ROUND_MAX_S).
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

/**
 * Day 8 (outside review: the level-2 win, the hardest and most mixed-reality moment, ran the same handler,
 * card and chime as the tutorial): level 2's own climax. The creature hops as in level 1, then tosses the
 * trinket up onto the top of the registered object (the mug that held the shade), while the keeper nods
 * off into real sleep (eyes shut, head down) and the lantern dims to a glow until the next round. Its own
 * sound (click-sound.ts lullaby), its own card.
 */
export const L2_WIN = {
  /** The win's first warm flash, then the lantern dims to `dim` (a negative flare) by `dimEndS`, and stays. */
  flash: 0.25,
  flashS: 0.3,
  dim: -0.6,
  dimEndS: 1.6,
  /** The trinket's flight from the creature's back to the object's top. */
  arcStartS: 0.9,
  arcS: 0.9,
  arcH: 0.07,
  /** The keeper's eyes shut tight (1 = its usual sleepy slit) and its head nods forward (rad), by `sleepS`. */
  eyes: 0.15,
  nod: 0.22,
  sleepS: 1.4,
} as const;

export interface L2WinFx extends WinFx {
  /** The trinket's flight, 0 on the creature's back … 1 on the object's top. */
  arc: number;
  eyes: number;
  nod: number;
}

export function newL2WinFx(): L2WinFx {
  return { hop: 0, flare: 0, bead: 1, arc: 0, eyes: 1, nod: 0 };
}

/** Level 2's win effects `t` s after the creature got home (t < 0: none). The hop and bead as in level 1. */
export function l2WinFx(t: number, out: L2WinFx = newL2WinFx()): L2WinFx {
  winFx(t, out);
  out.arc = 0;
  out.eyes = 1;
  out.nod = 0;
  if (!(t >= 0)) return out;
  const w = L2_WIN;
  if (t < w.flashS) {
    const u = t / w.flashS;
    out.flare = w.flash * (1 - (1 - u) * (1 - u));
  } else {
    const u = Math.min(1, (t - w.flashS) / (w.dimEndS - w.flashS));
    out.flare = w.flash + (w.dim - w.flash) * u * u * (3 - 2 * u); // smooth fall to the glow, held
  }
  out.arc = Math.min(1, Math.max(0, (t - w.arcStartS) / w.arcS));
  const s = Math.min(1, t / w.sleepS);
  const e = s * s * (3 - 2 * s);
  out.eyes = 1 + (w.eyes - 1) * e;
  out.nod = w.nod * e;
  return out;
}

/** Where the trinket flies during the level-2 climax: from (a) on the creature's back to (b) the object's top, in an arc. */
export function arcPoint(p: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, h: number, out: Float32Array): Float32Array {
  out[0] = ax + (bx - ax) * p;
  out[1] = ay + (by - ay) * p + 4 * h * p * (1 - p);
  out[2] = az + (bz - az) * p;
  return out;
}

/**
 * Day 8 (outside review: the first frames were static; nothing showed the danger before the instruction):
 * a 2 s threat beat on a first run, before the teach card and the ghost hand. The keeper stirs: its eyes
 * half open, its head turns to look along the path and back, the lantern brightens, a sleepy "hm?"; the
 * creature flinches back into its nook. Visual and sound only: the game itself runs as always.
 */
export const INTRO = { s: 2, eyes: 2.6, look: 0.45, flare: 0.35, flinch: 0.012 } as const;

export interface IntroFx {
  eyes: number;
  /** The keeper's head turn, rad. */
  look: number;
  flare: number;
  /** How far the creature shrinks back into its nook, m. */
  flinch: number;
}

export function newIntroFx(): IntroFx {
  return { eyes: 1, look: 0, flare: 0, flinch: 0 };
}

/** Is the threat beat showing? On a first run (no shadow yet), for INTRO.s after the board is placed. */
export function introActive(placed: boolean, everDashed: boolean, sincePlaced: number): boolean {
  return placed && !everDashed && sincePlaced >= 0 && sincePlaced < INTRO.s;
}

/** The threat beat `t` s in (outside 0…INTRO.s: nothing). */
export function introFx(t: number, out: IntroFx = newIntroFx()): IntroFx {
  out.eyes = 1;
  out.look = 0;
  out.flare = 0;
  out.flinch = 0;
  if (!(t >= 0 && t < INTRO.s)) return out;
  const bump = (a: number, b: number) => (t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a)));
  out.eyes = 1 + (INTRO.eyes - 1) * bump(0.25, 1.75);
  out.look = INTRO.look * Math.sin((2 * Math.PI * Math.max(0, t - 0.35)) / 1.3) * bump(0.35, 1.65);
  out.flare = INTRO.flare * bump(0.2, 1.4);
  out.flinch = INTRO.flinch * bump(0.3, 1.9);
  return out;
}
