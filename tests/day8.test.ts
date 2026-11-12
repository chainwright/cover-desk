/**
 * Day 8: fixes from the round-6 outside review (judges_impl_d6).
 *  - the keeper's lantern wake waits WAKE_DWELL_S (0.25 s) inside the radius
 *    before it wakes: a frame or two of tracking flicker wakes nothing, a
 *    cupped lantern still does;
 * Same geometry model as the other tests (synthetic 25-joint hands).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODE_HOME, MODE_WAIT, newCreature, stepCreature, type CreatureWorld } from '../src/creature.ts';
import { CUP } from '../src/emu-seat.ts';
import { LanternWake, WAKE_DWELL_S, WAKE_RADIUS, handAtLantern, nearestJointToLantern } from '../src/feedback.ts';
import { addHandCapsules } from '../src/hand-proxy.ts';
import { CREATURE_Y, LEVEL_1, Route, TEACH_SPOT } from '../src/level.ts';
import { BY_NONE, DARK, Occluders, SEEN, look } from '../src/sightline.ts';
import { stopHand } from './hand-fixture.ts';

const L = LEVEL_1.lanterns[0];
const ROUTE = new Route(LEVEL_1.route);
const DT = 1 / 72;
const WY = 0.02;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

/** A "hand" whose 25 joints all sit `d` in front of the lantern. */
const handAt = (d: number) => {
  const j = new Float32Array(75);
  for (let i = 0; i < 25; i++) j.set([L.x, L.y, L.z + d], i * 3);
  return j;
};

test('the keeper wakes only after a hand has stayed inside the wake radius for 0.25 s', () => {
  assert.equal(WAKE_DWELL_S, 0.25);
  const w = new LanternWake();
  let frames = 0;
  while (w.update([handAt(0.05)], [true], L, DT) < 0) {
    frames++;
    assert.ok(frames < 100, 'never woke');
  }
  const t = (frames + 1) * DT;
  assert.ok(t >= WAKE_DWELL_S - 1e-9 && t < WAKE_DWELL_S + DT, `woke after ${t.toFixed(3)} s`);
  assert.ok(Math.abs(w.wokeAfter - t) < 1e-6, 'the wait it reports (logged with the wake)');
  // awake, the day-7 hysteresis is unchanged: 6.9 cm keeps it awake, beyond 7 cm it sleeps at once
  assert.equal(w.update([handAt(0.069)], [true], L, DT), 0);
  assert.equal(w.update([handAt(0.071)], [true], L, DT), -1);
});

test('brief brushes inside the radius (0.2 s, then one frame out) never wake it; losing the hand restarts the wait', () => {
  const w = new LanternWake();
  for (let t = 0; t < 30; t += 0.2 + DT) {
    for (let k = 0; k < Math.round(0.2 / DT); k++) w.update([handAt(0.055)], [true], L, DT);
    w.update([handAt(0.08)], [true], L, DT);
    assert.equal(w.awake, false);
  }
  const u = new LanternWake();
  for (let k = 0; k < 14; k++) u.update([handAt(0.055)], [true], L, DT);
  u.update([handAt(0.055)], [false], L, DT); // tracking drops for a frame
  for (let k = 0; k < 14; k++) u.update([handAt(0.055)], [true], L, DT);
  assert.equal(u.awake, false, '14 + 14 frames with a gap is not 0.25 s');
});

/**
 * A still "stop" hand 1 cm in front of the ghost's spot, toward the lantern (its nearest joint about
 * 6.5 cm away, the case set's thinnest margin), whose tracking jitters by up to ±amp every 1/30 s.
 * Returns how many times the keeper woke in `seconds`: through LanternWake (the game) and, for
 * comparison, with an instant wake at the same radius.
 */
function jitterWakes(seed: number, amp: number, seconds = 30) {
  const r = rng(seed);
  const w = new LanternWake();
  let j = stopHand(TEACH_SPOT.x, WY, TEACH_SPOT.z - 0.01);
  let wakes = 0;
  let instant = 0;
  let wasInstant = false;
  let next = 0;
  for (let t = 0; t < seconds; t += DT) {
    if (t >= next) {
      next += 1 / 30;
      j = stopHand(TEACH_SPOT.x + (r() * 2 - 1) * amp, WY + (r() * 2 - 1) * amp * 0.5, TEACH_SPOT.z - 0.01 + (r() * 2 - 1) * amp);
    }
    const was = w.awake;
    w.update([j], [true], L, DT);
    if (w.awake && !was) wakes++;
    const p = handAtLantern([j], [true], L) >= 0;
    if (p && !wasInstant) instant++;
    wasInstant = p;
  }
  return { wakes, instant };
}

test('a still hand by the ghost\'s spot whose tracking jitters ±5 mm at 30 Hz: the keeper never wakes with the dwell (an instant rule would)', () => {
  const d = nearestJointToLantern(stopHand(TEACH_SPOT.x, WY, TEACH_SPOT.z - 0.01), L);
  assert.ok(d > WAKE_RADIUS && d < WAKE_RADIUS + 0.004, `nearest joint ${(d * 100).toFixed(2)} cm`);
  let wakes = 0;
  let instant = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const x = jitterWakes(seed, 0.005);
    wakes += x.wakes;
    instant += x.instant;
  }
  console.log(`  jitter ±5 mm by the ghost's spot, ten 30 s runs: ${wakes} wakes with the 0.25 s dwell, ${instant} with an instant rule`);
  assert.equal(wakes, 0);
  assert.ok(instant > 0);
});

/**
 * Level 1 with one still hand (25 joints, fixed), the keeper woken through LanternWake as in the game.
 * Returns whether the creature got home, how far it got, and whether the keeper woke.
 */
function playStill(joints: Float32Array, seconds = 30) {
  const occ = new Occluders();
  addHandCapsules(joints, null, 1, occ);
  const wake = new LanternWake();
  const at = [0, 0, 0];
  const w: CreatureWorld = {
    routeLength: ROUTE.length,
    handPresent: true,
    seen: (s) => {
      if (wake.awake) return true;
      ROUTE.at(s, at);
      return look(L, occ, at[0], CREATURE_Y, at[1], { state: DARK, by: BY_NONE }).state === SEEN;
    },
  };
  const c = newCreature();
  let maxS = 0;
  let woke = false;
  for (let t = 0; t < seconds; t += DT) {
    wake.update([joints], [true], L, DT);
    woke ||= wake.awake;
    stepCreature(c, DT, w);
    maxS = Math.max(maxS, c.s);
    if (c.mode === MODE_HOME) return { home: true, maxS, woke };
  }
  return { home: false, maxS, woke, waiting: c.mode === MODE_WAIT };
}

test('cupping the lantern with the 0.25 s dwell: the keeper still wakes and the creature never crosses (it stays by its nook)', () => {
  for (const [x, z] of [[CUP.x, CUP.z], [0, -0.08], [-0.02, -0.07], [0.02, -0.075], [0, -0.06]]) {
    const r = playStill(stopHand(x, WY, z));
    assert.equal(r.woke, true, `hand at ${x}, ${z}`);
    assert.equal(r.home, false, `hand at ${x}, ${z} won`);
    assert.ok(r.maxS < 0.04, `hand at ${x}, ${z}: the creature got to s ${r.maxS.toFixed(3)}`);
  }
});

test('every still hand inside the wake radius that would win without the rule (the bisection\'s region) still loses with the dwell', () => {
  let checked = 0;
  for (let xi = -20; xi <= 20; xi += 2) {
    const x = xi / 400;
    for (let z = L.z + 0.015; z < TEACH_SPOT.z; z += 0.0025) {
      const j = stopHand(x, WY, z);
      if (nearestJointToLantern(j, L) >= WAKE_RADIUS) continue;
      // the same hand with no wake rule at all
      const occ = new Occluders();
      addHandCapsules(j, null, 1, occ);
      const at = [0, 0, 0];
      const free: CreatureWorld = { routeLength: ROUTE.length, handPresent: true, seen: (s) => (ROUTE.at(s, at), look(L, occ, at[0], CREATURE_Y, at[1], { state: DARK, by: BY_NONE }).state === SEEN) };
      const c = newCreature();
      let won = false;
      for (let t = 0; t < 30 && !won; t += DT) won = (stepCreature(c, DT, free), c.mode === MODE_HOME);
      if (!won) continue;
      checked++;
      assert.equal(playStill(j).home, false, `still hand at ${x}, ${z.toFixed(4)} won with the dwell`);
    }
  }
  assert.ok(checked >= 20, `hands checked: ${checked}`);
});
