import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CREATURE, MODE_HOME, MODE_WAIT, newCreature, stepCreature, type CreatureWorld } from '../src/creature.ts';
import { GRIP_TO_WRIST, SLIDE_SPEED, STOP } from '../src/emu-seat.ts';
import { addHandCapsules } from '../src/hand-proxy.ts';
import { CREATURE_Y, LEVEL_1, Route, TEACH_SPOT } from '../src/level.ts';
import { LightMap } from '../src/light-map.ts';
import { FlushTimer, LOG_FLUSH_S, LogCursor, LogFlusher, assemble, flushOnPageHide, type LogChunk, type LogMeta } from '../src/log-store.ts';
import { PROMPT_LINES, firstRunCues, type CueInput } from '../src/onboarding.ts';
import { BY_NONE, DARK, Occluders, SEEN, SHADOW, look } from '../src/sightline.ts';
import { TesterLogger } from '../src/touch-log.ts';
import { handAtLantern } from '../src/feedback.ts';
import { stopHand } from './hand-fixture.ts';

const L = LEVEL_1.lanterns[0];
const ROUTE = new Route(LEVEL_1.route);
const DT = 1 / 72;
const WRIST_Y = 0.02;

function occWithStop(x: number, z: number, y = WRIST_Y): Occluders {
  const occ = new Occluders();
  addHandCapsules(stopHand(x, y, z), null, 1, occ);
  return occ;
}

function litWithStop(x: number, z: number): number {
  const map = new LightMap();
  map.update(L, occWithStop(x, z), CREATURE_Y, true);
  return map.litFraction;
}

/**
 * Plays level 1 with one standing "stop" hand starting at (x0, z). With
 * `slide` > 0 the player waits until the creature stands in the shadow out on
 * the path, then slides the hand toward the trinket at that speed (m/s), as
 * the /emu/ seat's → key does.
 */
function play(x0: number, z: number, slide: number, seconds = 30) {
  const at = [0, 0, 0];
  let occ = occWithStop(x0, z);
  const w: CreatureWorld = {
    routeLength: ROUTE.length,
    handPresent: true,
    seen: (s) => {
      ROUTE.at(s, at);
      return look(L, occ, at[0], CREATURE_Y, at[1], { state: DARK, by: BY_NONE }).state === SEEN;
    },
  };
  const c = newCreature();
  let x = x0;
  let sliding = false;
  let maxS = 0;
  for (let t = 0; t < seconds; t += DT) {
    stepCreature(c, DT, w);
    maxS = Math.max(maxS, c.s);
    if (c.mode === MODE_HOME) return { home: true, at: t, maxS, spotted: c.spottedCount, handX: x };
    if (slide > 0 && !sliding && c.mode === MODE_WAIT && c.s > 0.05) sliding = true;
    if (sliding && x < STOP.maxX) {
      x = Math.min(STOP.maxX, x + slide * DT);
      occ = occWithStop(x, z);
    }
  }
  return { home: false, at: seconds, maxS, spotted: c.spottedCount, handX: x };
}

// ------------------------------------------------- P0-3: a lane, not a blackout

test('the /emu/ seat stands its hand where the ghost hand stands', () => {
  assert.equal(STOP.x, TEACH_SPOT.x);
  assert.equal(STOP.z, TEACH_SPOT.z);
  assert.equal(STOP.y, WRIST_Y);
  // between the lantern and the path, nearer the middle than the lantern
  const pathZ = 0.065;
  assert.ok(TEACH_SPOT.z > L.z + 0.06 && TEACH_SPOT.z < pathZ - 0.06, `z ${TEACH_SPOT.z}`);
  // the seat sets the emulator's grip so the wrist (not the grip) lands on the spot, above the desk
  assert.ok(STOP.y - GRIP_TO_WRIST.y > 0.1, 'the grip sits ~12 cm above the wrist for a fingers-up hand');
});

test('the taught pose shades part of the light, not all of it: 0 < litFraction < 1', () => {
  const lit = litWithStop(TEACH_SPOT.x, TEACH_SPOT.z);
  assert.ok(lit > 0.5 && lit < 0.95, `lit ${lit}`);
  // and it is a real shadow on the path where the creature waits, not beside it
  assert.equal(look(L, occWithStop(TEACH_SPOT.x, TEACH_SPOT.z), -0.11, CREATURE_Y, 0.064, { state: DARK, by: BY_NONE }).state, SHADOW);
  // the far part of the lit path stays lit: the lane ends before the trinket
  assert.equal(look(L, occWithStop(TEACH_SPOT.x, TEACH_SPOT.z), 0.1, CREATURE_Y, 0.064, { state: DARK, by: BY_NONE }).state, SEEN);
});

test('a hand standing right at the lantern shades (nearly) the whole light, so it wakes the keeper (day 5; was "known, not prevented")', () => {
  assert.ok(litWithStop(0, -0.08) < 0.05, 'the geometry is unchanged: the light alone would let the creature cross');
  assert.equal(handAtLantern([stopHand(0, WRIST_Y, -0.08)], [true], L), 0, 'the keeper wakes (day5.test.ts plays it out)');
});

test('the taught pose held still: the creature dashes into the lane and waits there; it never reaches the trinket', () => {
  for (const dx of [-0.01, 0, 0.01]) {
    for (const dz of [-0.01, 0, 0.01]) {
      const r = play(TEACH_SPOT.x + dx, TEACH_SPOT.z + dz, 0);
      assert.equal(r.home, false, `still hand at dx ${dx} dz ${dz} won`);
      assert.ok(r.maxS > 0.06, `dx ${dx} dz ${dz}: it dashed into the shadow (s ${r.maxS})`);
      assert.ok(r.maxS < ROUTE.length - 0.1, `dx ${dx} dz ${dz}: it stopped well short of home (s ${r.maxS})`);
      assert.equal(r.spotted, 0);
    }
  }
});

test('winning requires a slide: the same hand slid along at the /emu/ seat speed leads it home, never spotted', () => {
  const r = play(TEACH_SPOT.x, TEACH_SPOT.z, SLIDE_SPEED);
  assert.equal(r.home, true, `not home after ${r.at} s (s ${r.maxS}, hand x ${r.handX})`);
  assert.equal(r.spotted, 0, 'the shadow stays slower than the creature');
  assert.ok(r.handX > TEACH_SPOT.x + 0.05, `the hand had to travel (to x ${r.handX})`);
  // a hand that slides much faster than the creature outruns it and leaves it in the light
  const fast = play(TEACH_SPOT.x, TEACH_SPOT.z, SLIDE_SPEED * 10);
  assert.ok(!fast.home || fast.spotted > 0, 'a 10× slide outran the creature');
  assert.ok(SLIDE_SPEED * ((0.065 - L.z) / (TEACH_SPOT.z - L.z)) < CREATURE.dash, 'shadow speed on the path < dash speed');
});

// ------------------------------------------------- the slide card, no tap card during the desk search

const base: CueInput = { placement: 'desk', placed: true, listening: true, moveRequested: false, everDashed: true, paused: false, leading: false };

test('after the first dash, while the creature waits in the lane and has never won: "slide your hand along"', () => {
  const c = firstRunCues({ ...base, leading: true });
  assert.equal(c.prompt, 'slide');
  assert.match(PROMPT_LINES.slide.join(' '), /slide your hand along/i);
  assert.equal(firstRunCues({ ...base, leading: false }).prompt, 'none');
  assert.equal(firstRunCues({ ...base, leading: true, paused: true }).prompt, 'waits', 'a lost hand comes first');
  assert.equal(firstRunCues({ ...base, leading: true, everDashed: false }).prompt, 'teach');
});

test('no "tap your desk" card while the desk is still being searched for; it shows once the board floats', () => {
  const s = firstRunCues({ ...base, everDashed: false, placement: 'searching', placed: false });
  assert.equal(s.prompt, 'none');
  const f = firstRunCues({ ...base, everDashed: false, placement: 'fallback' });
  assert.equal(f.prompt, 'tap-desk');
});

// ------------------------------------------------- tester log: flush triggers, cursor after the write

function loggerWith(n: number) {
  const log = new TesterLogger({}, 'ua', 'b');
  log.startSession(0);
  for (let i = 0; i < n; i++) log.event(i, 'e', { i });
  return log;
}

test('log cursor: take does not advance; commit does', () => {
  const log = loggerWith(3);
  const cur = new LogCursor();
  const a = cur.take(log.log);
  assert.equal(a[0].events.length, 3);
  assert.equal(cur.take(log.log)[0].events.length, 3, 'not committed: the same rows again');
  cur.commit(a);
  assert.deepEqual(cur.take(log.log), []);
  log.event(9, 'e', {});
  assert.equal(cur.take(log.log)[0].events.length, 1);
});

test('log flusher: a failed write is retried whole by the next flush (no lost chunk), and the stored log is complete', async () => {
  const log = loggerWith(2);
  const stored: LogChunk[] = [];
  let meta: LogMeta | undefined;
  let fail = true;
  const f = new LogFlusher(new LogCursor(), async (m, chunks) => {
    if (fail) return false;
    meta = m;
    stored.push(...chunks);
    return true;
  });
  assert.equal(await f.flush(log.log), false);
  log.event(5, 'e', {});
  fail = false;
  assert.equal(await f.flush(log.log), true);
  const back = assemble(meta, stored)!;
  assert.equal(back.sessions[0].events.length, 3, 'the rows of the failed write are in storage');
  assert.equal(await f.flush(log.log), true);
  assert.equal(stored.length, 1, 'nothing new, nothing written');
});

test('log flusher: overlapping flushes write each row once', async () => {
  const log = loggerWith(4);
  const rows: number[] = [];
  const f = new LogFlusher(new LogCursor(), async (_m, chunks) => {
    await new Promise((r) => setTimeout(r, 5));
    for (const c of chunks) rows.push(c.events.length);
    return true;
  });
  await Promise.all([f.flush(log.log), f.flush(log.log)]);
  assert.deepEqual(rows, [4]);
});

test('flush timer: due every 5 s of frame time, not before (kills O10)', () => {
  assert.equal(LOG_FLUSH_S, 5);
  const t = new FlushTimer();
  assert.equal(t.due(100), false, 'first frame starts the clock');
  assert.equal(t.due(104.9), false);
  assert.equal(t.due(105), true);
  assert.equal(t.due(106), false);
  assert.equal(t.due(110.2), true);
  assert.equal(t.due(3), false, 'a restarted clock starts over');
  assert.equal(t.due(8), true);
});

test('flush on page hide: pagehide and a hidden tab write the log; a visible tab does not (kills O9)', () => {
  const handlers: Record<string, () => void> = {};
  const win = { addEventListener: (type: string, fn: () => void) => (handlers[`w:${type}`] = fn) };
  const doc = { visibilityState: 'visible', addEventListener: (type: string, fn: () => void) => (handlers[`d:${type}`] = fn) };
  let n = 0;
  flushOnPageHide(win, doc, () => n++);
  handlers['w:pagehide']();
  assert.equal(n, 1);
  handlers['d:visibilitychange']();
  assert.equal(n, 1, 'visible: no flush');
  doc.visibilityState = 'hidden';
  handlers['d:visibilitychange']();
  assert.equal(n, 2);
});

// ------------------------------------------------- the wrist-height limits quoted in EVIDENCE.md

test('wrist-height limit near the lantern: highest wrist that still covers the path middle, bisected to 0.1 mm', () => {
  const covers = (y: number, z: number) =>
    look(L, occWithStop(0, z, y), 0, CREATURE_Y, 0.065, { state: DARK, by: BY_NONE }).state === SHADOW;
  const limit = (z: number) => {
    let lo = 0.0, hi = 0.2;
    assert.ok(covers(lo, z) && !covers(hi, z));
    while (hi - lo > 1e-4) {
      const m = (lo + hi) / 2;
      if (covers(m, z)) lo = m;
      else hi = m;
    }
    return lo * 100;
  };
  // z in cm from the board centre (lantern at −10.5) → limit in cm, as quoted in EVIDENCE.md
  const table: [number, number][] = [[-8, 7.7], [-6, 7.0], [-3, 5.9], [0, 4.8], [3, 3.7]];
  for (const [z, cm] of table) {
    const got = limit(z / 100);
    assert.ok(Math.abs(got - cm) <= 0.1, `z ${z} cm: limit ${got.toFixed(2)} cm, quoted ${cm}`);
  }
});
