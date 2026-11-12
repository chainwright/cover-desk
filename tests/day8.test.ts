/**
 * Day 8: fixes from the round-6 outside review (judges_impl_d6).
 *  - the keeper's lantern wake waits WAKE_DWELL_S (0.25 s) inside the radius
 *    before it wakes: a frame or two of tracking flicker wakes nothing, a
 *    cupped lantern still does;
 *  - level 2's own climax (the trinket tossed onto the mug, the keeper asleep,
 *    the lantern dimmed, its own card), the 2 s threat beat before the first
 *    lesson, and the beads and the unlock kept for the next visit.
 * Same geometry model as the other tests (synthetic 25-joint hands).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODE_HOME, MODE_WAIT, newCreature, stepCreature, type CreatureWorld } from '../src/creature.ts';
import { CUP } from '../src/emu-seat.ts';
import {
  INTRO,
  L2_WIN,
  LanternWake,
  WAKE_DWELL_S,
  WAKE_RADIUS,
  WIN_BEADS,
  arcPoint,
  handAtLantern,
  introActive,
  introFx,
  l2WinFx,
  nearestJointToLantern,
  winFx,
} from '../src/feedback.ts';
import { PROMPT_LINES, firstRunCues, type CueInput } from '../src/onboarding.ts';
import { PROGRESS_KEY, beadsFor, formatProgress, loadProgress, parseProgress, saveProgress } from '../src/progress-store.ts';
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

// ------------------------------------------------- level 2's own climax

test('level 2\'s climax: the same hops as level 1, then the lantern dims to a glow and stays dim, the trinket flies to the mug, the keeper falls asleep', () => {
  for (const t of [0, 0.2, 0.5, 0.8]) assert.ok(Math.abs(l2WinFx(t).hop - winFx(t).hop) < 1e-9, `hop at ${t}`);
  assert.ok(l2WinFx(0.25).flare > 0.15, 'a warm flash first');
  assert.ok(Math.abs(l2WinFx(L2_WIN.dimEndS).flare - L2_WIN.dim) < 1e-9 && Math.abs(l2WinFx(8).flare - L2_WIN.dim) < 1e-9, 'then dim, held');
  assert.ok(l2WinFx(8).flare <= -0.5, `the lantern dims to a glow (light at ${(1 + l2WinFx(8).flare).toFixed(2)} of normal)`);
  assert.ok(winFx(3).flare === 0, 'level 1 returns to normal light');
  assert.equal(l2WinFx(L2_WIN.arcStartS - 0.01).arc, 0);
  assert.equal(l2WinFx(L2_WIN.arcStartS + L2_WIN.arcS).arc, 1);
  const late = l2WinFx(5);
  assert.ok(late.eyes < 0.2 && late.nod > 0.2, `asleep: eyes ${late.eyes}, nod ${late.nod}`);
  assert.deepEqual([l2WinFx(-1).flare, l2WinFx(-1).arc, l2WinFx(-1).eyes], [0, 0, 1], 'no win showing');
  const out = new Float32Array(3);
  assert.deepEqual(Array.from(arcPoint(0, 0.19, 0.02, 0.06, 0, 0.104, -0.03, 0.07, out)).map((v) => +v.toFixed(4)), [0.19, 0.02, 0.06]);
  assert.deepEqual(Array.from(arcPoint(1, 0.19, 0.02, 0.06, 0, 0.104, -0.03, 0.07, out)).map((v) => +v.toFixed(4)), [0, 0.104, -0.03]);
  assert.ok(arcPoint(0.5, 0.19, 0.02, 0.06, 0, 0.104, -0.03, 0.07, out)[1] > 0.13, 'an arc over the board, not a slide');
});

test('level 2\'s win has its own card; level 1\'s stays "Home!"', () => {
  const l2: CueInput = { placement: 'desk', placed: true, listening: false, moveRequested: false, everDashed: true, paused: false, leading: false, unlocked: true, level: 2, objects: 1, mugCovers: true, again: true, l2Won: true };
  const c = firstRunCues({ ...l2, l2Home: true });
  assert.deepEqual([c.prompt, c.ghost, c.ghostSpot], ['l2-home', true, 'left']);
  assert.match(PROMPT_LINES['l2-home'].join(' '), /mug held the shade/);
  assert.equal(firstRunCues({ ...l2, level: 1, objects: 0, l2Home: false }).prompt, 'again');
});

// ------------------------------------------------- the threat beat before the first lesson

test('threat beat: 2 s after the board lands on a first run, no teach card and no ghost yet; the keeper half wakes and looks, the creature flinches', () => {
  assert.equal(INTRO.s, 2);
  assert.equal(introActive(true, false, 0.5), true);
  assert.equal(introActive(true, false, 2.01), false);
  assert.equal(introActive(true, true, 0.5), false, 'not once the lesson is learned');
  assert.equal(introActive(false, false, 0.5), false);
  const base: CueInput = { placement: 'desk', placed: true, listening: true, moveRequested: false, everDashed: false, paused: false, leading: false };
  const during = firstRunCues({ ...base, intro: true });
  assert.deepEqual([during.prompt, during.ghost], ['none', false]);
  assert.equal(firstRunCues({ ...base, intro: true, unlocked: true }).prompt, 'none', 'a kept unlock does not jump the beat');
  const after = firstRunCues({ ...base, intro: false });
  assert.deepEqual([after.prompt, after.ghost], ['teach', true]);
  const mid = introFx(1);
  assert.ok(mid.eyes > 2 && mid.flinch > 0.008 && mid.flare > 0.1, JSON.stringify(mid));
  let looked = 0;
  for (let t = 0; t < 2; t += 0.05) looked = Math.max(looked, Math.abs(introFx(t).look));
  assert.ok(looked > 0.3, `the keeper looks along the path: ${looked.toFixed(2)} rad`);
  assert.deepEqual(introFx(2.5), { eyes: 1, look: 0, flare: 0, flinch: 0 });
});

// ------------------------------------------------- beads and the unlock kept for the next visit

test('progress kept in localStorage: wins and the unlock round-trip; malformed or other versions count as none; beads cap at 10', () => {
  const mem = new Map<string, string>();
  const s = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  assert.deepEqual(loadProgress(s), { wins: 0, unlocked: false });
  assert.equal(saveProgress({ wins: 3, unlocked: true }, s), true);
  assert.equal(mem.get(PROGRESS_KEY), formatProgress({ wins: 3, unlocked: true }));
  assert.deepEqual(loadProgress(s), { wins: 3, unlocked: true });
  for (const bad of ['', 'nope', '{"wins":5}', '{"v":2,"wins":5,"unlocked":true}', 'null', '{"v":1,"wins":"7"}']) {
    const p = parseProgress(bad);
    assert.ok(p.wins === 0 && p.unlocked === false, `${bad} → ${JSON.stringify(p)}`);
  }
  assert.deepEqual(parseProgress('{"v":1,"wins":1e9}'), { wins: 999, unlocked: true });
  assert.deepEqual(parseProgress('{"v":1,"wins":2,"unlocked":false}'), { wins: 2, unlocked: true }, 'a win always unlocks level 2');
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => undefined };
  assert.deepEqual(loadProgress(broken), { wins: 0, unlocked: false });
  assert.equal(saveProgress({ wins: 1, unlocked: true }, broken), false);
  assert.equal(beadsFor(4), 4);
  assert.equal(beadsFor(40), WIN_BEADS);
});
