/**
 * Day 7b: three small open items from day 7.
 *  1. /emu/ R lifts the hand over the gaze as one continuous motion (emu-seat.ts liftOverAt), the motion
 *     day 7's model test plays, instead of jumping it to the right ghost in one frame.
 *  2. Level 1 after the unlock no longer draws the keeper's gaze (no gaze rule there); the ghost mug shows.
 *  3. The debug handle is not on `window` in the main build (src/cover-system.ts coverDebug; the dist
 *     check fails on '__cover' in the main bundle).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LIFT_OVER, LIFT_OVER_S, STOP, liftOverAt, seatSpotX } from '../src/emu-seat.ts';
import { Gaze, L2_LEFT, L2_RIGHT } from '../src/level2.ts';
import { LEVEL_1, Route } from '../src/level.ts';
import { PROMPT_LINES, firstRunCues, type CueInput } from '../src/onboarding.ts';
import { stopHand } from './hand-fixture.ts';

test('R: the lift-over is a continuous motion: up 10 cm in place, across at full height, down at the right ghost', () => {
  assert.deepEqual([LIFT_OVER.up, LIFT_OVER_S], [0.1, 0.8]);
  const from = seatSpotX(2, 'h'), to = seatSpotX(2, 'r');
  assert.deepEqual([from, to], [L2_LEFT.x, L2_RIGHT.x]);
  // stepped as the seat steps it (≤ 0.05 s a frame, here a 30 fps frame)
  const dt = 1 / 30;
  let prev = liftOverAt(0, from, to);
  assert.deepEqual([prev.x, prev.dy, prev.done], [from, 0, false], 'starts where the hand stands');
  let maxStep = 0, maxDy = 0, frames = 1;
  for (let t = dt; ; t += dt) {
    const p = liftOverAt(t, from, to);
    frames++;
    maxStep = Math.max(maxStep, Math.hypot(p.x - prev.x, p.dy - prev.dy));
    maxDy = Math.max(maxDy, p.dy);
    // the hand only moves across at full height: never low anywhere between the two ghosts
    if (p.x > from + 1e-9 && p.x < to - 1e-9) assert.ok(Math.abs(p.dy - LIFT_OVER.up) < 1e-9, `low over the gaze at t ${t}: x ${p.x}, dy ${p.dy}`);
    prev = p;
    if (p.done) break;
  }
  assert.deepEqual([prev.x, prev.dy], [to, 0], 'ends standing at the right ghost');
  assert.equal(maxDy, LIFT_OVER.up);
  assert.ok(frames >= 24, `frames: ${frames}`);
  // no jump: at 30 fps a frame moves the wrist at most about 1.6 cm (the 16 cm across in 0.4 s)
  assert.ok(maxStep < 0.02, `largest step per frame ${maxStep.toFixed(4)} m`);
});

test('R from a lifted hand (L) stays at the lifted height across and still comes down; from a lower lift it rises to 10 cm', () => {
  const from = L2_LEFT.x, to = L2_RIGHT.x;
  const mid = liftOverAt(LIFT_OVER.upS + LIFT_OVER.overS / 2, from, to, STOP.lift);
  assert.equal(mid.dy, STOP.lift, 'no dip from 20 cm down to 10 cm over the gaze');
  assert.equal(liftOverAt(0, from, to, STOP.lift).dy, STOP.lift);
  assert.deepEqual(liftOverAt(LIFT_OVER_S + 0.01, from, to, STOP.lift), { x: to, dy: 0, done: true });
});

test('R\'s motion over the gaze with the stop hand: no wrist pose on the way shades the gaze (the keeper stays asleep)', () => {
  const route = new Route(LEVEL_1.route);
  const gaze = new Gaze(LEVEL_1.lanterns[0], route);
  const rad = new Float32Array(25).fill(0.011);
  let woke = 0;
  for (let t = 0; t <= LIFT_OVER_S + 1e-9; t += 0.01) {
    const p = liftOverAt(t, L2_LEFT.x, L2_RIGHT.x);
    if (gaze.handIn(stopHand(p.x, STOP.y + p.dy, L2_LEFT.z), rad)) woke++;
  }
  assert.equal(woke, 0);
  // what R did until day 7, as a motion along the desk (a jump has no in-between, a low slide does): it wakes
  let low = 0;
  for (let x = L2_LEFT.x; x <= L2_RIGHT.x; x += 0.005) if (gaze.handIn(stopHand(x, STOP.y, L2_LEFT.z), rad)) low++;
  assert.ok(low > 0, 'a hand moved across low shades the gaze');
});

test('level 1 never draws the gaze (before, during and after the unlock); level 2 does; the ghost mug shows in level 1 once unlocked', () => {
  const base: CueInput = { placement: 'desk', placed: true, listening: false, moveRequested: false, everDashed: true, paused: false, leading: false };
  const states: Partial<CueInput>[] = [{}, { everDashed: false }, { leading: true }, { again: true }, { unlocked: true }, { unlocked: true, again: true }, { unlocked: true, objects: 1 }, { unlocked: true, spotted: true }, { unlocked: true, awake: true }];
  for (const st of states) assert.equal(firstRunCues({ ...base, ...st, level: 1 }).gaze, false, JSON.stringify(st));
  const un = firstRunCues({ ...base, unlocked: true, objects: 0, level: 1 });
  assert.deepEqual([un.prompt, un.gaze, un.mugGhost], ['unlocked', false, true]);
  assert.equal(firstRunCues({ ...base, unlocked: true, again: true, objects: 0, level: 1 }).mugGhost, false, 'not during the "again" card');
  assert.equal(firstRunCues({ ...base, unlocked: true, objects: 1, level: 1 }).mugGhost, false, 'an object is registered: level 2 starts at the round boundary');
  assert.equal(firstRunCues({ ...base, unlocked: true, objects: 0 }).gaze, false, 'level absent = level 1');
  for (const st of [{ objects: 0 }, { objects: 1, mugCovers: true }, { objects: 1, mugCovers: false }, { objects: 1, mugCovers: true, again: true }]) {
    assert.equal(firstRunCues({ ...base, unlocked: true, level: 2, ...st }).gaze, true, `level 2 ${JSON.stringify(st)}`);
  }
  assert.equal(firstRunCues({ ...base, placed: false, placement: 'searching', level: 2 }).gaze, false, 'nothing drawn off the board');
  // the level-1 card no longer points at a gaze that isn't drawn
  const card = PROMPT_LINES.unlocked.join(' ');
  assert.doesNotMatch(card, /gaze/);
  assert.match(card, /ghost mug/);
  for (const line of PROMPT_LINES.unlocked) assert.ok(line.replace('!', '').length <= 33, line);
});

test('the debug handle goes on window only behind __COVER_EMU__ (set only for /emu/ and the dev server)', () => {
  const src = readFileSync(new URL('../src/cover-system.ts', import.meta.url), 'utf8');
  const lines = src.split('\n').filter((l) => l.includes("'__cover'") || l.includes('.__cover'));
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /^\s*if \(__COVER_EMU__\) /);
  const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(index, /__cover/, 'the page reads the handle from the module');
  const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(vite, /__COVER_EMU__: JSON\.stringify\(process\.env\.COVER_VARIANT === 'emu' \|\| command === 'serve'\)/);
  const check = readFileSync(new URL('../tools/check-dist.mjs', import.meta.url), 'utf8');
  assert.match(check, /'__cover'/, 'the dist check looks for the handle');
});
