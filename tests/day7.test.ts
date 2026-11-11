/**
 * Day 7: fixes from the day-6 outside review (judges_impl_d5).
 *  - the post-win flow: the "again" card and the ghost stay until a hand is
 *    back at the start (or 10 s), and level 2's gaze waits for that card;
 *  - the wake rule's hysteresis (wakes inside 6.3 cm, sleeps beyond 7 cm);
 *  - the creature's dwell: standing still it moves on only after the way
 *    ahead has been dark for 0.1 s (a jittering shadow edge no longer
 *    ratchets it forward into the light);
 *  - level 2's lift-over as a continuous motion, not a jump between spots;
 *  - pure pieces of the glue an outside run mutated unnoticed (the knob's
 *    pointing gate, the object kept at the level switch, the fps log's inView).
 * Same geometry model as the other tests (synthetic 25-joint hands).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REGISTER, TIP_PAD, onKnob } from '../src/contact.ts';
import { CREATURE, EV_DASH_START, EV_HOME, MODE_HOME, MODE_NOOK, MODE_WAIT, newCreature, stepCreature, type CreatureWorld } from '../src/creature.ts';
import { LIFT_OVER, STOP, liftOverAt } from '../src/emu-seat.ts';
import {
  LanternWake,
  NEXT_ROUND_MAX_S,
  NEXT_ROUND_S,
  RoundCues,
  SLEEP_RADIUS,
  WAKE_RADIUS,
  handAtLantern,
  handAtTeachSpot,
  nearestJointToLantern,
  nextRoundDue,
} from '../src/feedback.ts';
import { addHandCapsules } from '../src/hand-proxy.ts';
import { CREATURE_Y, KNOB, LEVEL_1, Route, TEACH_SPOT } from '../src/level.ts';
import { Gaze, L2_LEFT, L2_RIGHT, MUG_SPOT, keepNewestObject } from '../src/level2.ts';
import { firstRunCues, type CueInput } from '../src/onboarding.ts';
import { BY_NONE, DARK, Occluders, SEEN, look } from '../src/sightline.ts';
import { IN_VIEW_DEG, boardInView } from '../src/touch-log.ts';
import { makeHand, stopHand } from './hand-fixture.ts';

const L = LEVEL_1.lanterns[0];
const ROUTE = new Route(LEVEL_1.route);
const GAZE = new Gaze(L, ROUTE);
const DT = 1 / 72;
const WY = 0.02;
const rightStop = (x: number, y: number, z: number) => makeHand({ wrist: [x, y, z], u: [0, 1, 0], v: [-1, 0, 0], n: [0, 0, -1] });

/** A deterministic random sequence (LCG), so the jitter runs are reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

// ------------------------------------------------- post-win flow (fix 4)

test('after a win the next round waits for a hand back at the start (no sooner than 3.5 s), or 10 s', () => {
  assert.equal(nextRoundDue(1, true), false, 'the win gets its time');
  assert.equal(nextRoundDue(NEXT_ROUND_S + 0.1, false), false, 'day 6 restarted here without the hand');
  assert.equal(nextRoundDue(9.9, false), false);
  assert.equal(nextRoundDue(NEXT_ROUND_S + 0.1, true), true, 'hand back');
  assert.equal(nextRoundDue(NEXT_ROUND_MAX_S + 0.1, false), true, 'or 10 s');
  assert.equal(NEXT_ROUND_MAX_S, 10);
});

test('post-win flow as the game runs it: "Home!" and the ghost stay past 3.5 s until the hand is back; the gaze and the level-2 card only after', () => {
  const round = new RoundCues();
  const cues = (again: boolean) => firstRunCues({ placement: 'desk', placed: true, listening: true, moveRequested: false, everDashed: true, paused: false, leading: false, again, unlocked: true, objects: 0, level: 1 });
  round.onEvent(EV_HOME);
  let mode = MODE_HOME;
  // 6 s with the hand at the end of its slide (not back): still home, card and ghost stay, no gaze yet
  for (let t = 0; t < 6; t += DT) {
    if (nextRoundDue(t, false)) mode = MODE_NOOK;
    round.frame(mode, false, false);
  }
  assert.equal(mode, MODE_HOME, 'no new round without the hand');
  let c = cues(round.again);
  assert.deepEqual([c.prompt, c.ghost, c.gaze, c.mugGhost], ['again', true, false, false], 'Home! first; the gaze waits');
  // the hand comes back: the next round starts, the card goes, then level 2's card and the gaze show
  assert.equal(nextRoundDue(6, true), true);
  mode = MODE_NOOK;
  round.frame(mode, false, true);
  assert.equal(round.again, false);
  c = cues(round.again);
  // day 7b: level 1 draws no gaze (it has no gaze rule); the ghost mug shows where level 2's object goes
  assert.deepEqual([c.prompt, c.gaze, c.mugGhost], ['unlocked', false, true]);
  // no hand at all: after 10 s the round starts anyway and its first dash ends the card
  const r2 = new RoundCues();
  r2.onEvent(EV_HOME);
  assert.equal(nextRoundDue(10.05, false), true);
  r2.onEvent(EV_DASH_START);
  assert.equal(r2.again, false);
});

test('hand back at the start: level 1\'s ghost spot, or level 2\'s left ghost', () => {
  const at = (x: number, z: number) => [stopHand(x, WY, z)];
  assert.equal(handAtTeachSpot(at(TEACH_SPOT.x, TEACH_SPOT.z), [true]), true);
  assert.equal(handAtTeachSpot(at(L2_LEFT.x, L2_LEFT.z), [true], undefined, L2_LEFT), true);
  assert.equal(handAtTeachSpot(at(L2_RIGHT.x, L2_RIGHT.z), [true], undefined, L2_LEFT), false, 'where a level-2 win leaves the hand');
  assert.equal(handAtTeachSpot(at(STOP.maxX, TEACH_SPOT.z), [true]), false, 'where a level-1 slide ends');
});

// ------------------------------------------------- the keeper's wake with hysteresis (fix 7)

/** A "hand" whose 25 joints all sit `d` in front of the lantern. */
const handAt = (d: number) => {
  const j = new Float32Array(75);
  for (let i = 0; i < 25; i++) j.set([L.x, L.y, L.z + d], i * 3);
  return j;
};

test('wake hysteresis: wakes inside 6.3 cm, stays awake until every joint is beyond 7 cm; asleep, 6.6 cm wakes nothing', () => {
  assert.ok(Math.abs(nearestJointToLantern(handAt(0.066), L) - 0.066) < 1e-6);
  const w = new LanternWake();
  assert.equal(w.update([handAt(0.066)], [true], L), -1, '6.6 cm while asleep');
  assert.equal(w.update([handAt(0.062)], [true], L), 0, '6.2 cm wakes it');
  assert.equal(w.update([handAt(0.066)], [true], L), 0, '6.6 cm: still awake');
  assert.equal(w.update([handAt(0.069)], [true], L), 0, '6.9 cm: still awake');
  assert.equal(w.update([handAt(0.071)], [true], L), -1, '7.1 cm: asleep');
  assert.equal(w.update([handAt(0.066)], [true], L), -1);
  assert.equal(w.update([handAt(0.05)], [false], L), -1, 'an untracked hand wakes nobody');
  assert.ok(SLEEP_RADIUS > WAKE_RADIUS);
});

test('a hand jittering ±4 mm around the wake radius wakes the keeper once, not on every flicker', () => {
  const r = rng(7);
  const w = new LanternWake();
  let edges = 0;
  let plain = 0;
  let wasPlain = false;
  for (let i = 0; i < 300; i++) {
    const j = handAt(WAKE_RADIUS + (r() * 2 - 1) * 0.004);
    const was = w.awake;
    w.update([j], [true], L);
    if (w.awake && !was) edges++;
    const p = handAtLantern([j], [true], L) >= 0; // day 6: no hysteresis
    if (p && !wasPlain) plain++;
    wasPlain = p;
  }
  assert.equal(edges, 1, `rising edges with hysteresis: ${edges}`);
  assert.ok(plain > 30, `rising edges without it: ${plain}`);
});

// ------------------------------------------------- the creature's dwell on a jittering edge (fix 7)

/** Level 1, a still "stop" hand at the ghost's spot whose joints jitter by up to `amp` every 1/30 s (hand tracking's rate). */
function jittered(seed: number, amp: number, dwell: number, seconds = 30) {
  const r = rng(seed);
  const at = [0, 0, 0];
  let occ = new Occluders();
  const w: CreatureWorld = {
    routeLength: ROUTE.length,
    handPresent: true,
    seen: (s) => {
      ROUTE.at(s, at);
      return look(L, occ, at[0], CREATURE_Y, at[1], { state: DARK, by: BY_NONE }).state === SEEN;
    },
  };
  const c = newCreature();
  const p = { ...CREATURE, dwell };
  let next = 0;
  for (let t = 0; t < seconds; t += DT) {
    if (t >= next) {
      next += 1 / 30;
      occ = new Occluders();
      addHandCapsules(stopHand(TEACH_SPOT.x + (r() * 2 - 1) * amp, WY + (r() * 2 - 1) * amp * 0.5, TEACH_SPOT.z + (r() * 2 - 1) * amp), null, 1, occ);
    }
    stepCreature(c, DT, w, p);
    if (c.mode === MODE_HOME) return { home: true, spotted: c.spottedCount };
  }
  return { home: false, spotted: c.spottedCount, s: c.s };
}

test('a still hand whose tracking jitters ±7 mm at 30 Hz: never spotted with the 0.1 s dwell (without it the creature ratchets into the light); never a win', () => {
  assert.equal(CREATURE.dwell, 0.1);
  let withDwell = 0;
  let without = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const a = jittered(seed, 0.007, CREATURE.dwell);
    assert.equal(a.home, false, `seed ${seed}: a still hand won`);
    withDwell += a.spotted;
    without += jittered(seed, 0.007, 0).spotted;
  }
  assert.equal(withDwell, 0, `spotted with the dwell: ${withDwell} in 10 runs of 30 s`);
  assert.ok(without > 0, `spotted without the dwell: ${without} (the day-6 creature)`);
});

test('slide speed with the dwell, joint radii 7–13 mm: 1–9 cm/s leads it home unspotted; 11 cm/s and faster outrun it at every radius', () => {
  const play = (v: number, radius: number) => {
    const rad = radius ? new Float32Array(25).fill(radius) : null;
    const at = [0, 0, 0];
    let x: number = TEACH_SPOT.x;
    let occ = new Occluders();
    addHandCapsules(stopHand(x, WY, TEACH_SPOT.z), rad, 1, occ);
    const w: CreatureWorld = {
      routeLength: ROUTE.length,
      handPresent: true,
      seen: (s) => {
        ROUTE.at(s, at);
        return look(L, occ, at[0], CREATURE_Y, at[1], { state: DARK, by: BY_NONE }).state === SEEN;
      },
    };
    const c = newCreature();
    let sliding = false;
    for (let t = 0; t < 40; t += DT) {
      stepCreature(c, DT, w);
      if (c.mode === MODE_HOME) return { home: true, spotted: c.spottedCount };
      if (!sliding && c.mode === MODE_WAIT && c.s > 0.05) sliding = true;
      if (sliding && x < STOP.maxX) {
        x = Math.min(STOP.maxX, x + v * DT);
        occ = new Occluders();
        addHandCapsules(stopHand(x, WY, TEACH_SPOT.z), rad, 1, occ);
      }
    }
    return { home: false, spotted: c.spottedCount };
  };
  const rows: string[] = [];
  for (const r of [0, 0.009, 0.011, 0.013]) {
    for (const cm of [1, 3, 5, 7, 9]) {
      const g = play(cm / 100, r);
      assert.ok(g.home && g.spotted === 0, `${cm} cm/s at ${r * 1000 || 7} mm`);
    }
    for (const cm of [11, 12, 15]) assert.equal(play(cm / 100, r).home, false, `${cm} cm/s at ${r * 1000 || 7} mm should outrun it`);
    rows.push(`${r * 1000 || 7} mm: 10 cm/s ${play(0.1, r).home ? 'home' : 'outruns'}`);
  }
  console.log(`  slide 10 cm/s with the dwell: ${rows.join('; ')}`);
});

// ------------------------------------------------- level 2: the lift-over as a motion (fix 6)

const MUG = { x: MUG_SPOT.x, z: MUG_SPOT.z, top: 0.1 };

/**
 * Level 2 as the game plays it (keeper awake while a hand is at the lantern or shades the gaze), with a
 * hand that moves continuously: it stands at the left ghost (edging toward the mug if `edge`), and once
 * the creature waits past the middle it lifts straight up by `lift` (0.2 s), moves over to the right
 * ghost at that height (0.4 s) and comes down there (0.2 s). With `edge` (the 7 mm floor, where a still
 * hand at either ghost leaves a gap to the mug's shadow) it comes down just right of the gaze instead,
 * as close as it can without waking the keeper, and slides on toward the trinket while the creature
 * waits. Joints jitter-free; `radius` as in day 6.
 */
function liftOver(make: (x: number, y: number, z: number) => Float32Array, lift: number, opts: { radius?: number; edge?: boolean } = {}) {
  const rad = opts.radius ? new Float32Array(25).fill(opts.radius) : null;
  const wakes = (j: Float32Array) => handAtLantern([j], [true], L) >= 0 || GAZE.handIn(j, rad);
  const at = [0, 0, 0];
  let occ = new Occluders();
  let awake = false;
  const w: CreatureWorld = {
    routeLength: ROUTE.length,
    handPresent: true,
    seen: (s) => {
      if (awake) return true;
      ROUTE.at(s, at);
      return look(L, occ, at[0], CREATURE_Y, at[1], { state: DARK, by: BY_NONE }).state === SEEN;
    },
  };
  const c = newCreature();
  let x: number = L2_LEFT.x;
  let y = WY;
  let phase = 0; // 0 standing/edging, 1 up, 2 over, 3 down, 4 at the right ghost
  let t0 = 0;
  let x0 = 0;
  let land: number = L2_RIGHT.x;
  if (opts.edge) {
    land = 0;
    while (wakes(make(land, WY, L2_LEFT.z))) land += 0.005;
  }
  let woke = 0;
  let maxWristY = 0;
  for (let t = 0; t < 30; t += DT) {
    ROUTE.at(c.s, at);
    if (phase === 0) {
      if (c.mode === MODE_WAIT && at[0] > 0) {
        phase = 1;
        t0 = t;
        x0 = x;
      } else if (opts.edge && c.mode === MODE_WAIT && c.s > 0.05) {
        const nx = x + 0.03 * DT;
        if (!wakes(make(nx, WY, L2_LEFT.z))) x = nx;
      }
    }
    if (phase >= 1 && phase <= 3) {
      // day 7b: the same motion the /emu/ R key plays (emu-seat.ts liftOverAt), at height `lift`
      const p = liftOverAt(t - t0, x0, land, 0, lift);
      x = p.x;
      y = WY + p.dy;
      phase = p.done ? 4 : t - t0 < LIFT_OVER.upS ? 1 : t - t0 < LIFT_OVER.upS + LIFT_OVER.overS ? 2 : 3;
    } else if (phase === 4 && opts.edge && c.mode === MODE_WAIT) {
      const nx = Math.min(0.15, x + 0.03 * DT); // with the 7 mm floor the hand slides on (the steps say "slide the hand along")
      if (!wakes(make(nx, WY, L2_LEFT.z))) x = nx;
    }
    maxWristY = Math.max(maxWristY, y);
    const j = make(x, y, L2_LEFT.z);
    occ = new Occluders();
    addHandCapsules(j, rad, 1, occ);
    occ.addCylinder(MUG.x, MUG.z, REGISTER.radius, MUG.top, 10);
    awake = wakes(j);
    if (awake) woke++;
    stepCreature(c, DT, w);
    if (c.mode === MODE_HOME) return { home: true, woke, spotted: c.spottedCount, lifted: phase > 0, maxWristY };
  }
  return { home: false, woke, spotted: c.spottedCount, lifted: phase > 0, maxWristY };
}

test('level 2, the lift-over as one continuous motion: left ghost → up 10 cm → over the gaze → down on the right: no wake, a win (either hand; 11 mm joints still at the right ghost, the 7 mm floor edging and sliding)', () => {
  for (const make of [stopHand, rightStop]) {
    // with 11 mm joints (the emulator's) a still hand at the left ghost gets the creature into the mug's shadow
    const a = liftOver(make, 0.1, { radius: 0.011 });
    assert.ok(a.lifted, 'the creature reached the mug\'s shadow');
    assert.deepEqual([a.home, a.woke, a.spotted], [true, 0, 0], `11 mm, ${make.name || 'rightStop'}`);
    // with the fixture's 7 mm floor the hand edges toward the mug first, lifts over, comes down just past the gaze and slides on
    const b = liftOver(make, 0.1, { edge: true });
    assert.deepEqual([b.home, b.woke, b.spotted], [true, 0, 0], `7 mm, edging, ${make.name || 'rightStop'} ${JSON.stringify(b)}`);
  }
});

test('level 2: a hand moved over the gaze too low wakes the keeper (why the steps say "lift your hand high"); the lowest lift that works is printed', () => {
  const low = liftOver(stopHand, 0.01, { radius: 0.011 });
  assert.ok(low.woke > 0 && !low.home, `a 1 cm lift: woke ${low.woke}, home ${low.home}`);
  let ok = Infinity;
  for (let cm = 1; cm <= 12; cm++) {
    const r = liftOver(stopHand, cm / 100, { radius: 0.011 });
    const r2 = liftOver(rightStop, cm / 100, { radius: 0.011 });
    if (r.home && r.woke === 0 && r2.home && r2.woke === 0) {
      ok = cm;
      break;
    }
  }
  assert.ok(ok <= 10, `lowest lift that wins without waking: ${ok} cm`);
  console.log(`  lowest lift over the gaze that wakes nothing (wrist on the desk at 2 cm, 11 mm joints): ${ok} cm`);
});

// ------------------------------------------------- pure glue (fix 9: R3, R7, R9)

test('the move knob needs a pointing fingertip on it, low (a resting hand never moves the board)', () => {
  const y = 0.01 + TIP_PAD;
  assert.equal(onKnob(true, KNOB.x, y, KNOB.z, KNOB), true);
  assert.equal(onKnob(false, KNOB.x, y, KNOB.z, KNOB), false, 'not pointing');
  assert.equal(onKnob(true, KNOB.x + KNOB.r + 0.01, y, KNOB.z, KNOB), false, 'beside it');
  assert.equal(onKnob(true, KNOB.x, y + 0.03, KNOB.z, KNOB), false, 'above it');
});

test('at the level switch only the object registered last is kept (in slot 0)', () => {
  const o = new Float32Array(12);
  o.set([0.12, -0.04, 0.1, 0, -0.03, 0.1]);
  assert.equal(keepNewestObject(o, 2, 1), 1);
  assert.deepEqual(Array.from(o.slice(0, 3)).map((v) => +v.toFixed(3)), [0, -0.03, 0.1]);
  const p = new Float32Array(12);
  p.set([0.05, -0.03, 0.08, 0.12, -0.04, 0.1]);
  assert.equal(keepNewestObject(p, 2, 0), 1);
  assert.deepEqual(Array.from(p.slice(0, 3)).map((v) => +v.toFixed(3)), [0.05, -0.03, 0.08]);
  assert.equal(keepNewestObject(p, 0, 0), 0);
});

test('fps log: the board counts as in view only when placed and within 35° of where the head looks', () => {
  assert.equal(IN_VIEW_DEG, 35);
  assert.equal(boardInView(true, 10), true);
  assert.equal(boardInView(true, 80), false);
  assert.equal(boardInView(false, 10), false);
});

test('level-2 ghosts and the cards: the "again" card after a level-2 win stands the ghost at the left spot', () => {
  const base: CueInput = { placement: 'desk', placed: true, listening: false, moveRequested: false, everDashed: true, paused: false, leading: false, unlocked: true, level: 2, objects: 1, mugCovers: true };
  const c = firstRunCues({ ...base, again: true, l2Won: true });
  assert.deepEqual([c.prompt, c.ghost, c.ghostSpot, c.gaze], ['again', true, 'left', true]);
});
