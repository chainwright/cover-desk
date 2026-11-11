import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REGISTER, TIP_PAD, distanceToPolyline, judgeRegistration } from '../src/contact.ts';
import { CoverWatch } from '../src/creature.ts';
import { addHandCapsules, POSE_STOP } from '../src/hand-proxy.ts';
import { BOARD, CREATURE_Y, LEVEL_1 } from '../src/level.ts';
import { LogCursor, STORE_VERSION, assemble, metaOf, storedChunk, type LogChunk } from '../src/log-store.ts';
import { PROMPT_LINES } from '../src/onboarding.ts';
import {
  DESK_WAIT_S,
  LATE_DESK_S,
  RESTORE_WAIT_S,
  placementStep,
  type PlacementClock,
  type PlacementWorld,
} from '../src/placement.ts';
import { BY_NONE, DARK, Occluders, SEEN, SHADOW, look } from '../src/sightline.ts';
import { LOG_VERSION, TesterLogger } from '../src/touch-log.ts';
import { stopHand } from './hand-fixture.ts';

// ------------------------------------------------- CoverWatch: an object takes over (kills O3)

test('CoverWatch: while waiting for a lost cover hand, a registered object shading the creature ends the wait', () => {
  const w = new CoverWatch();
  // The right hand shades the creature, the left rests in view.
  assert.equal(w.update(0, [true, true], 1, false), true);
  // The headset loses the right hand with the creature in the light: play waits for it.
  assert.equal(w.update(0.1, [true, false], -1, true), false);
  assert.equal(w.waitingFor, 1);
  // A mug now stands in the sight line: no hand shades it (shadeHand −1) and it is not exposed.
  assert.equal(w.update(0.2, [true, false], -1, false), true, 'the object is cover: play goes on');
  assert.equal(w.waitingFor, -1);
});

// ------------------------------------------------- placement timing (kills O4)

function world(over: Partial<PlacementWorld> & { desk?: boolean; anchor?: boolean } = {}) {
  const calls = { findDesk: 0, anchorPose: 0 };
  const w: PlacementWorld = {
    headY: over.headY ?? 1.2,
    anchorFailed: over.anchorFailed ?? false,
    anchorPose: () => (calls.anchorPose++, over.anchor ?? false),
    findDesk: () => (calls.findDesk++, over.desk ?? false),
  };
  return { w, calls };
}
const clock = (placement: PlacementClock['placement'], time: number): PlacementClock => ({ placement, time, restoreStart: 0, searchStart: 0, placedAt: 0 });

test('placement: a desk found within the late window after a fallback still wins; after the window it is not even looked for', () => {
  assert.equal(LATE_DESK_S, 10);
  const early = world({ desk: true });
  assert.equal(placementStep(clock('fallback', 5), early.w), 'desk', '5 s after floating, a desk appears: the board goes onto it');
  assert.equal(placementStep(clock('fallback', LATE_DESK_S - 0.1), early.w), 'desk');
  const late = world({ desk: true });
  assert.equal(placementStep(clock('fallback', LATE_DESK_S + 0.5), late.w), 'none', 'too late: it stays where the player may already be playing');
  assert.equal(late.calls.findDesk, 0);
  assert.equal(placementStep(clock('fallback', 3), world({ desk: false }).w), 'none');
});

test('placement: searching waits for a tracked head, takes a desk at once, and floats the board after the desk wait', () => {
  assert.equal(placementStep(clock('searching', 10), world({ headY: 0, desk: true }).w), 'none', 'head not tracked yet');
  assert.equal(placementStep(clock('searching', 0.2), world({ desk: true }).w), 'desk');
  assert.equal(placementStep(clock('searching', DESK_WAIT_S - 0.1), world().w), 'none');
  assert.equal(placementStep(clock('searching', DESK_WAIT_S + 0.1), world().w), 'fallback');
});

test('placement: the saved anchor is waited for up to 8 s (the tester protocol says the same), a failure gives up at once', () => {
  assert.equal(RESTORE_WAIT_S, 8);
  assert.equal(placementStep(clock('restoring', 6), world().w), 'none', 'still relocalising at 6 s: keep waiting');
  assert.equal(placementStep(clock('restoring', 8.1), world().w), 'restore-gave-up');
  assert.equal(placementStep(clock('restoring', 0.5), world({ anchorFailed: true }).w), 'restore-gave-up');
  assert.equal(placementStep(clock('restoring', 7), world({ anchor: true }).w), 'anchor');
  for (const p of ['desk', 'touch', 'anchor', 'preview'] as const) {
    const x = world({ desk: true });
    assert.equal(placementStep(clock(p, 1), x.w), 'none', p);
    assert.equal(x.calls.findDesk, 0, `${p}: no plane scan once placed`);
  }
});

// ------------------------------------------------- the teaching copy matches the light (P0-3)

const L = LEVEL_1.lanterns[0];
const PATH_MID: [number, number] = [0, 0.065];
function sightWithStop(y: number, z: number): number {
  const occ = new Occluders();
  addHandCapsules(stopHand(0, y, z), null, 1, occ);
  return look(L, occ, PATH_MID[0], CREATURE_Y, PATH_MID[1], { state: DARK, by: BY_NONE }).state;
}

test('teaching copy: a "stop" hand standing on the desk between the lantern and the path is cover; one held high or in the lit area in front of the path is not', () => {
  const teach = PROMPT_LINES.teach.join(' ').replace(/!/g, '');
  assert.ok(teach.includes('between the lantern and the path'), teach);
  assert.ok(!/hold your hand up|in the light/i.test(teach), 'the day-2 wording sent hands too high or in front of the path');
  // Standing on the desk (wrist 2 cm up) anywhere between the lantern (z −10.5 cm) and the path (z ≈ 6 cm).
  for (const z of [-0.08, -0.06, -0.03, 0, 0.03]) assert.equal(sightWithStop(0.02, z), SHADOW, `standing at z=${z}`);
  // Near the lantern the wrist may rise to about 7 cm; at 9 cm the light passes under the hand.
  assert.equal(sightWithStop(0.065, -0.06), SHADOW, 'wrist 6.5 cm up near the lantern');
  assert.equal(sightWithStop(0.09, -0.06), SEEN, 'wrist 9 cm up: no cover');
  // The fan reaches past the path toward the player (to z ≈ 17.5 cm): a hand there is lit but useless.
  const lit = look(L, new Occluders(), 0, CREATURE_Y, 0.15, { state: DARK, by: BY_NONE }).state;
  assert.equal(lit, SEEN, 'the desk 15 cm toward the player is still in the light');
  assert.equal(sightWithStop(0.02, 0.15), SEEN, 'a hand in that light, in front of the path, casts no shadow on it');
});

// ------------------------------------------------- tester protocol step 8 can measure phantoms

test('protocol step 8: a mid-air pointing pause beside the path passes every registration rule (so phantoms can be counted); one on the creature is rejected as on-route', () => {
  const route = LEVEL_1.route;
  const judge = (x: number, z: number, top: number) =>
    judgeRegistration({ x, y: top + TIP_PAD, z, pointing: true, board: BOARD, routeDistance: distanceToPolyline(x, z, route), keeperDistance: Math.hypot(x, z + 0.13) });
  // 9 cm toward the player from the path, 10 cm above the desk, nothing under the finger.
  assert.equal(judge(0, 0.15, 0.1), 'ok');
  assert.equal(judge(0.12, 0.15, 0.06), 'ok');
  // The protocol's band: 6–12 cm from the path on the player's side; closer is on-route, 15 cm is off the board.
  assert.equal(judge(0, 0.065 + 0.06, 0.05), 'ok');
  assert.equal(judge(0, 0.065 + 0.05, 0.05), 'on-route');
  assert.equal(judge(0, 0.065 + 0.12, 0.2), 'ok');
  assert.equal(judge(0, 0.065 + 0.15, 0.1), 'off-board');
  // Pointing at the creature on the path: what the day-2 step asked; always rejected.
  assert.equal(judge(0, 0.065, 0.1), 'on-route');
  assert.ok(REGISTER.radius + REGISTER.routeClear < 0.085);
});

// ------------------------------------------------- the tester log survives a reload (P0-1)

function sampleSession(log: TesterLogger, t0: number, n: number) {
  for (let i = 0; i < n; i++) log.sample(t0 + i / 30, 1, 0.01, 0.05, -0.04, 0.12, POSE_STOP, 0.1, 0.02, 0.13, -0.05);
}

test('log store: chunks written every few seconds rebuild the whole log after a reload, and a new page continues it', () => {
  // Page 1: one session, written in two flushes.
  const a = new TesterLogger({ k: 1 }, 'ua', 'build-a');
  const cursor = new LogCursor();
  const chunks: LogChunk[] = [];
  a.startSession(0, false, true);
  a.event(0, 'session', { emulator: false });
  sampleSession(a, 0, 40);
  let taken = cursor.take(a.log);
  cursor.commit(taken);
  chunks.push(...taken.map(storedChunk));
  assert.deepEqual(cursor.take(a.log), [], 'nothing new, nothing written');
  a.event(2, 'home', { wins: 1 });
  sampleSession(a, 2, 25);
  taken = cursor.take(a.log);
  cursor.commit(taken);
  chunks.push(...taken.map(storedChunk));
  assert.equal(chunks.length, 2);
  assert.equal(chunks[1].samples.length, 25, 'only the new part is written');
  let meta = metaOf(a.log);
  assert.equal(meta.storeVersion, STORE_VERSION);
  assert.ok(!('samples' in meta.sessions[0]), 'the meta record carries no samples');

  // Reload: the page is gone, storage is all that is left.
  const restored = assemble(JSON.parse(JSON.stringify(meta)), JSON.parse(JSON.stringify(chunks)));
  assert.deepEqual(restored, JSON.parse(a.toJSON()));
  assert.equal(restored!.sessions[0].guided, true);
  assert.equal(restored!.sessions[0].build, 'build-a');

  // Page 2 (a new build): adopts the stored log, its first session is number 1.
  const b = new TesterLogger({ k: 1 }, 'ua', 'build-b');
  b.adopt(restored!);
  const cursor2 = new LogCursor();
  cursor2.markAll(restored!);
  b.startSession(100, false);
  sampleSession(b, 100, 10);
  const more = cursor2.take(b.log).map(storedChunk);
  assert.deepEqual(more.map((c) => [c.session, c.samples.length]), [[1, 10]], 'only the new session is written');
  meta = metaOf(b.log);
  const again = assemble(meta, [...chunks, ...more])!;
  assert.equal(again.sessions.length, 2);
  assert.equal(again.sessions[1].build, 'build-b');
  assert.equal(b.sampleCount, again.sessions[0].samples.length + again.sessions[1].samples.length, 'the sample cap counts the kept sessions too');
  assert.ok(again.sessions[0].samples.length > 60);
  assert.deepEqual(again, JSON.parse(b.toJSON()));
});

test('log store: a stored log of another version is never mixed in; a chunk without a session header is skipped; a new log starts empty', () => {
  const a = new TesterLogger({}, 'ua', 'x');
  a.startSession(0);
  sampleSession(a, 0, 5);
  const chunks = new LogCursor().take(a.log).map(storedChunk);
  const meta = metaOf(a.log);
  assert.equal(assemble({ ...meta, storeVersion: STORE_VERSION + 1 }, chunks), null);
  assert.equal(assemble({ ...meta, header: { ...meta.header, version: LOG_VERSION + 1 } }, chunks), null);
  assert.equal(assemble(undefined, chunks), null);
  const stray = assemble(meta, [...chunks, { session: 7, samples: [[0]], events: [] }])!;
  assert.equal(stray.sessions.length, 1);
  assert.equal(stray.sessions[0].samples.length, 5);
  a.clear();
  assert.equal(a.sampleCount, 0);
  assert.equal(JSON.parse(a.toJSON()).sessions.length, 1, 'the running session continues, emptied');
  assert.equal(JSON.parse(a.toJSON()).sessions[0].samples.length, 0);
});
