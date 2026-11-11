/**
 * The felt creature's behaviour along its route. Pure, so it is unit-tested.
 *
 * You never steer it. It only moves forward through shadow:
 *  - standing unseen, it dashes on if the path a little ahead is also unseen;
 *  - otherwise it waits where it is (in its nook, or in a shadow);
 *  - if the keeper sees it for SPOT_S in a row it is spotted: it freezes,
 *    then scurries back to its nook;
 *  - if the headset loses every hand, it waits: nothing moves, nothing is
 *    judged, and a short grace follows when a hand comes back.
 *  - at the end of the route it has its trinket back.
 */

export const MODE_NOOK = 0; // at the start, out of the light
export const MODE_WAIT = 1; // standing in a shadow on the path, waiting for a lane
export const MODE_DASH = 2;
export const MODE_SPOTTED = 3;
export const MODE_RETREAT = 4;
export const MODE_HOME = 5;
export const MODE_PAUSED = 6; // no hand tracked
export const MODE_NAMES = ['nook', 'wait', 'dash', 'spotted', 'retreat', 'home', 'paused'] as const;

export interface CreatureParams {
  /** Dash speed through shadow, m/s. */
  dash: number;
  /** Retreat speed after being spotted, m/s. */
  retreat: number;
  /** How far ahead the path must be dark before it dashes on. */
  lookahead: number;
  /** Seen this long in a row = spotted (absorbs single-frame tracking flicker). */
  spot: number;
  /** Freeze after being spotted, before running back. */
  freeze: number;
  /** After a hand comes back from a tracking loss, nothing is judged for this long. */
  grace: number;
  /** The nook: route length from the start that counts as "home base". */
  nook: number;
}

export const CREATURE: CreatureParams = {
  dash: 0.13,
  retreat: 0.3,
  lookahead: 0.03,
  spot: 0.15,
  freeze: 0.7,
  grace: 0.5,
  nook: 0.02,
};

export interface CreatureState {
  s: number;
  mode: number;
  /** Mode before a hand-loss pause. */
  resume: number;
  seenFor: number;
  modeTime: number;
  graceLeft: number;
  spottedCount: number;
  dashes: number;
}

export function newCreature(): CreatureState {
  return { s: 0, mode: MODE_NOOK, resume: MODE_NOOK, seenFor: 0, modeTime: 0, graceLeft: 0, spottedCount: 0, dashes: 0 };
}

/** What the creature can ask about the world. */
export interface CreatureWorld {
  routeLength: number;
  /** Would the keeper see the creature at arc length s right now? */
  seen(s: number): boolean;
  /** Is at least one hand tracked? */
  handPresent: boolean;
}

/** Event codes returned by step (for sounds and the log). */
export const EV_NONE = 0;
export const EV_DASH_START = 1;
export const EV_SPOTTED = 2;
export const EV_HOME = 3;
export const EV_PAUSE = 4;
export const EV_RESUME = 5;
export const EV_BACK_IN_NOOK = 6;

function setMode(c: CreatureState, mode: number): void {
  if (c.mode !== mode) {
    c.mode = mode;
    c.modeTime = 0;
  }
}

/** Advances the creature by dt seconds. Returns an EV_* code for this step. */
export function stepCreature(c: CreatureState, dt: number, w: CreatureWorld, p: CreatureParams = CREATURE): number {
  c.modeTime += dt;
  if (c.mode === MODE_HOME) return EV_NONE;

  if (!w.handPresent) {
    if (c.mode !== MODE_PAUSED) {
      c.resume = c.mode === MODE_DASH ? MODE_WAIT : c.mode;
      setMode(c, MODE_PAUSED);
      c.seenFor = 0;
      return EV_PAUSE;
    }
    return EV_NONE;
  }
  if (c.mode === MODE_PAUSED) {
    setMode(c, c.resume);
    c.graceLeft = p.grace;
    return EV_RESUME;
  }
  if (c.graceLeft > 0) c.graceLeft = Math.max(0, c.graceLeft - dt);

  if (c.mode === MODE_SPOTTED) {
    if (c.modeTime >= p.freeze) setMode(c, MODE_RETREAT);
    return EV_NONE;
  }
  if (c.mode === MODE_RETREAT) {
    c.s = Math.max(0, c.s - p.retreat * dt);
    if (c.s <= 0) {
      setMode(c, MODE_NOOK);
      return EV_BACK_IN_NOOK;
    }
    return EV_NONE;
  }

  // nook, wait or dash
  if (w.seen(c.s)) {
    if (c.graceLeft > 0) return EV_NONE;
    c.seenFor += dt;
    if (c.s > p.nook && c.seenFor >= p.spot) {
      setMode(c, MODE_SPOTTED);
      c.spottedCount++;
      c.seenFor = 0;
      return EV_SPOTTED;
    }
    // seen but not yet spotted: freeze in place
    if (c.mode === MODE_DASH) setMode(c, c.s <= p.nook ? MODE_NOOK : MODE_WAIT);
    return EV_NONE;
  }
  c.seenFor = 0;

  const ahead1 = Math.min(w.routeLength, c.s + p.lookahead * 0.5);
  const ahead2 = Math.min(w.routeLength, c.s + p.lookahead);
  if (!w.seen(ahead1) && !w.seen(ahead2)) {
    const wasDash = c.mode === MODE_DASH;
    setMode(c, MODE_DASH);
    c.s = Math.min(w.routeLength, c.s + p.dash * dt);
    if (c.s >= w.routeLength) {
      setMode(c, MODE_HOME);
      return EV_HOME;
    }
    if (!wasDash) {
      c.dashes++;
      return EV_DASH_START;
    }
    return EV_NONE;
  }
  setMode(c, c.s <= p.nook ? MODE_NOOK : MODE_WAIT);
  return EV_NONE;
}
