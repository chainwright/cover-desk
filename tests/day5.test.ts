import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EV_DASH_START,
  EV_HOME,
  EV_SPOTTED,
  MODE_DASH,
  MODE_HOME,
  MODE_NOOK,
  MODE_RETREAT,
  MODE_SPOTTED,
  MODE_WAIT,
  newCreature,
  stepCreature,
  type CreatureWorld,
} from '../src/creature.ts';
import { CUP, GRIP_TO_WRIST, SLIDE_SPEED, STOP, seatHandPose } from '../src/emu-seat.ts';
import {
  EYES_OPEN,
  RETURN_RADIUS,
  RoundCues,
  WAKE_RADIUS,
  WIN_BEADS,
  WIN_FX,
  handAtLantern,
  handAtTeachSpot,
  nearestJointToLantern,
  payoffFor,
  winFx,
} from '../src/feedback.ts';
import { addHandCapsules } from '../src/hand-proxy.ts';
import { CREATURE_Y, LEVEL_1, Route, TEACH_SPOT } from '../src/level.ts';
import { LogKeeper, LogStore, MAX_WRITE_FAILURES, assemble, type LogChunk, type LogMeta } from '../src/log-store.ts';
import { PROMPT_LINES, firstRunCues, type CueInput } from '../src/onboarding.ts';
import { BY_NONE, DARK, Occluders, SEEN, look } from '../src/sightline.ts';
import { TesterLogger, analyseLog } from '../src/touch-log.ts';
import { edgeHand, stopHand } from './hand-fixture.ts';

const L = LEVEL_1.lanterns[0];
const ROUTE = new Route(LEVEL_1.route);
const DT = 1 / 72;
const WRIST_Y = 0.02;

/**
 * Plays level 1 with one standing "stop" hand from (x0, z), as the game does:
 * with `wake`, a hand within WAKE_RADIUS of the lantern wakes the keeper,
 * who then sees the whole path. `slide` (m/s) slides the hand toward the
 * trinket once the creature waits in its shadow out on the path.
 */
function play(x0: number, z: number, slide: number, opts: { wake?: boolean; seconds?: number; hand?: (x: number, y: number, z: number) => Float32Array } = {}) {
  const make = opts.hand ?? stopHand;
  const at = [0, 0, 0];
  let joints = make(x0, WRIST_Y, z);
  let occ = new Occluders();
  addHandCapsules(joints, null, 1, occ);
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
  let x = x0;
  let sliding = false;
  let maxS = 0;
  const seconds = opts.seconds ?? 30;
  for (let t = 0; t < seconds; t += DT) {
    awake = !!opts.wake && handAtLantern([joints], [true], L) >= 0;
    stepCreature(c, DT, w);
    maxS = Math.max(maxS, c.s);
    if (c.mode === MODE_HOME) return { home: true, at: t, maxS, spotted: c.spottedCount, awake };
    if (slide > 0 && !sliding && c.mode === MODE_WAIT && c.s > 0.05) sliding = true;
    if (sliding && x < STOP.maxX) {
      x = Math.min(STOP.maxX, x + slide * DT);
      joints = make(x, WRIST_Y, z);
      occ = new Occluders();
      addHandCapsules(joints, null, 1, occ);
    }
  }
  return { home: false, at: seconds, maxS, spotted: c.spottedCount, awake };
}

// ------------------------------------------------- #5 the cupped lantern: the keeper wakes

test('wake radius, chosen by bisection: it covers every still "stop" hand that wins without a slide, and leaves the ghost\'s spot (±1 cm) clear', () => {
  const wins = (x: number, z: number) => play(x, z, 0).home;
  let dStar = 0;
  let columns = 0;
  for (let xi = -20; xi <= 20; xi++) {
    const x = xi / 400; // −5 … +5 cm in 2.5 mm steps
    let lo = L.z + 0.015; // 1.5 cm in front of the lantern
    let hi: number = TEACH_SPOT.z;
    if (!wins(x, lo) || wins(x, hi)) continue;
    columns++;
    while (hi - lo > 1e-4) {
      const m = (lo + hi) / 2;
      if (wins(x, m)) lo = m;
      else hi = m;
    }
    dStar = Math.max(dStar, nearestJointToLantern(stopHand(x, WRIST_Y, lo), L));
  }
  assert.ok(columns >= 5, `columns where a still hand by the lantern wins: ${columns}`);
  assert.ok(dStar > 0.055 && dStar < WAKE_RADIUS - 0.001, `farthest still win: nearest joint ${(dStar * 100).toFixed(2)} cm; wake radius ${WAKE_RADIUS * 100} cm`);
  let teachMin = Infinity;
  for (const dx of [-0.01, 0, 0.01]) for (const dz of [-0.01, 0, 0.01]) {
    teachMin = Math.min(teachMin, nearestJointToLantern(stopHand(TEACH_SPOT.x + dx, WRIST_Y, TEACH_SPOT.z + dz), L));
  }
  assert.ok(teachMin > WAKE_RADIUS + 0.002, `ghost spot ±1 cm: nearest joint ${(teachMin * 100).toFixed(2)} cm`);
});

test('cupping the lantern wakes the keeper: the creature never crosses, still or sliding', () => {
  const cup = stopHand(CUP.x, WRIST_Y, CUP.z);
  assert.equal(handAtLantern([new Float32Array(75), cup], [false, true], L), 1);
  assert.equal(handAtLantern([cup, cup], [false, false], L), -1, 'an untracked hand wakes nobody');
  for (const [x, z] of [[0, -0.08], [-0.02, -0.07], [0.02, -0.075], [0, -0.06]]) {
    const r = play(x, z, 0, { wake: true });
    assert.equal(r.awake, true, `hand at ${x}, ${z}`);
    assert.equal(r.home, false, `hand at ${x}, ${z} won`);
    assert.ok(r.maxS < 0.04, `the creature stayed by its nook (s ${r.maxS})`);
  }
  // without the rule the same hand wins at once (the day-4 shortcut)
  assert.equal(play(0, -0.08, 0).home, true);
});

test('the wake rule leaves the lesson alone: at the ghost\'s spot still → no win, slid → a win, the keeper never wakes', () => {
  const still = play(TEACH_SPOT.x, TEACH_SPOT.z, 0, { wake: true });
  assert.equal(still.home, false);
  assert.equal(still.awake, false);
  const slid = play(TEACH_SPOT.x, TEACH_SPOT.z, SLIDE_SPEED, { wake: true });
  assert.equal(slid.home, true);
  assert.equal(slid.spotted, 0);
});

test('known, not closed: a hand laid on its edge along the path, as a wall, still crosses without a slide', () => {
  // A 17 cm wall a few cm before the path shades all of it; far from the lantern, so the wake rule doesn't apply.
  const r = play(-0.09, 0.02, 0, { wake: true, hand: edgeHand });
  assert.equal(r.home, true);
  assert.equal(r.awake, false);
});

// ------------------------------------------------- #7 slide speed

test('slide speed: from the ghost\'s spot, 1–9 cm/s leads the creature home unspotted; 10 cm/s and faster outruns it', () => {
  for (const cm of [1, 2, 3, 4, 4.5, 5, 6, 7, 8, 9]) {
    const r = play(TEACH_SPOT.x, TEACH_SPOT.z, cm / 100, { wake: true, seconds: 40 });
    assert.equal(r.home, true, `${cm} cm/s`);
    assert.equal(r.spotted, 0, `${cm} cm/s spotted`);
  }
  for (const cm of [10, 12, 15]) {
    const r = play(TEACH_SPOT.x, TEACH_SPOT.z, cm / 100, { wake: true, seconds: 40 });
    assert.ok(!r.home && r.spotted > 0, `${cm} cm/s should outrun it`);
  }
});

// ------------------------------------------------- #4 cards after events

const base: CueInput = { placement: 'desk', placed: true, listening: true, moveRequested: false, everDashed: true, paused: false, leading: true };

test('cards: spotted says what happened and what to do; a hand at the lantern says why the keeper woke; a win asks for the hand back, with the ghost', () => {
  const sp = firstRunCues({ ...base, spotted: true });
  assert.equal(sp.prompt, 'spotted', 'not the stale slide card');
  assert.match(PROMPT_LINES.spotted.join(' '), /saw it.*light's way/i);
  assert.equal(firstRunCues({ ...base, spotted: true, awake: true }).prompt, 'too-close');
  assert.match(PROMPT_LINES['too-close'].join(' '), /lantern/);
  assert.equal(firstRunCues({ ...base, spotted: true, paused: true }).prompt, 'waits', 'a lost hand comes first');
  const ag = firstRunCues({ ...base, leading: false, again: true });
  assert.equal(ag.prompt, 'again');
  assert.equal(ag.ghost, true, 'the ghost shows the start again after a win');
  assert.match(PROMPT_LINES.again.join(' '), /back/);
  assert.equal(firstRunCues({ ...base, leading: false }).ghost, false);
  for (const lines of Object.values(PROMPT_LINES)) for (const l of lines) assert.ok(l.replace('!', '').length <= 33, `card line too long: ${l}`);
});

test('round cues: spotted until the next dash; "again" from a win until a hand is back at the start (or the next dash); the slide latch', () => {
  const r = new RoundCues();
  r.frame(MODE_WAIT, false, false);
  assert.equal(r.leading(0), false);
  r.frame(MODE_WAIT, true, false);
  assert.equal(r.leading(0), true, 'waiting in a hand\'s lane latches the slide card');
  r.frame(MODE_DASH, false, false);
  assert.equal(r.leading(0), true, 'latched: no blinking while it follows');
  assert.equal(r.leading(1), false, 'gone after the first win');
  r.onEvent(EV_SPOTTED);
  assert.equal(r.spotted, true);
  r.frame(MODE_RETREAT, false, true);
  assert.equal(r.spotted, true);
  r.onEvent(EV_DASH_START);
  assert.equal(r.spotted, false);
  r.onEvent(EV_HOME);
  assert.equal(r.again, true);
  r.frame(MODE_HOME, false, true);
  assert.equal(r.again, true, 'not while it is still at home');
  r.frame(MODE_NOOK, false, false);
  assert.equal(r.again, true, 'until the hand is back');
  r.frame(MODE_NOOK, false, true);
  assert.equal(r.again, false);
  r.onEvent(EV_HOME);
  r.onEvent(EV_DASH_START);
  assert.equal(r.again, false, 'a dash also ends it');
});

test('hand back at the start: the wrist within 4 cm of the ghost\'s spot, low; not when untracked, far or held high', () => {
  const at = (dx: number, y: number, dz: number) => stopHand(TEACH_SPOT.x + dx, y, TEACH_SPOT.z + dz);
  assert.equal(handAtTeachSpot([new Float32Array(75), at(0, WRIST_Y, 0)], [false, true]), true);
  assert.equal(handAtTeachSpot([at(0.03, WRIST_Y, 0.02)], [true]), true);
  assert.equal(handAtTeachSpot([at(RETURN_RADIUS + 0.005, WRIST_Y, 0)], [true]), false);
  assert.equal(handAtTeachSpot([at(0.15, WRIST_Y, 0)], [true]), false, 'where the slide ends');
  assert.equal(handAtTeachSpot([at(0, 0.2, 0)], [true]), false, 'lifted');
  assert.equal(handAtTeachSpot([at(0, WRIST_Y, 0)], [false]), false);
});

// ------------------------------------------------- #4 the payoff at desk scale

test('payoff: the keeper\'s eyes open when it spots the creature or a hand is at its lantern; the stare only while spotted; the trinket rides home; one bead per win, up to ten', () => {
  const p = payoffFor(MODE_SPOTTED, 0, false);
  assert.deepEqual([p.eyes, p.stare, p.trinketOnBack], [EYES_OPEN, true, false]);
  assert.deepEqual([payoffFor(MODE_RETREAT, 0, false).eyes, payoffFor(MODE_RETREAT, 0, false).stare], [EYES_OPEN, false]);
  assert.equal(payoffFor(MODE_NOOK, 0, true).eyes, EYES_OPEN, 'awake');
  assert.equal(payoffFor(MODE_NOOK, 0, false).eyes, 1);
  assert.equal(payoffFor(MODE_HOME, 1, false).trinketOnBack, true);
  assert.equal(payoffFor(MODE_WAIT, 1, false).trinketOnBack, false);
  assert.equal(payoffFor(MODE_HOME, 3, false).beads, 3);
  assert.equal(payoffFor(MODE_NOOK, 25, false).beads, WIN_BEADS);
  assert.equal(WIN_BEADS, 10);
});

test('win effects: two hops (the first 4 cm), a warm flare up to +40 % that fades, the new bead pops in at 1.4× and settles; nothing outside a win', () => {
  let maxHop = 0;
  let maxFlare = 0;
  for (let t = 0; t < 0.45; t += 0.005) maxHop = Math.max(maxHop, winFx(t).hop);
  assert.ok(Math.abs(maxHop - WIN_FX.hop) < 1e-3 && WIN_FX.hop >= 0.04, `first hop ${maxHop}`);
  let second = 0;
  for (let t = 0.46; t < 0.9; t += 0.005) second = Math.max(second, winFx(t).hop);
  assert.ok(second > 0.02 && second < maxHop, `second hop ${second}`);
  for (let t = 0; t < 2; t += 0.01) maxFlare = Math.max(maxFlare, winFx(t).flare);
  assert.ok(Math.abs(maxFlare - 0.4) < 0.01, `flare ${maxFlare}`);
  assert.ok(winFx(0.15).flare > 0.2, 'eases out: most of the rise early');
  assert.equal(winFx(2).flare, 0);
  assert.equal(winFx(2).hop, 0);
  assert.ok(Math.abs(winFx(0).bead - 1.4) < 1e-9);
  assert.ok(winFx(0.12).bead > 1 && winFx(0.12).bead < 1.4);
  assert.equal(winFx(0.3).bead, 1);
  assert.deepEqual(winFx(-1), { hop: 0, flare: 0, bead: 1 });
});

// ------------------------------------------------- #6 the log store keeps going after a failed write

/** A fake IndexedDB database: each write completes or fails as `results` says (then completes). */
function fakeDb(results: boolean[]) {
  const kept: { meta: LogMeta | undefined; chunks: LogChunk[]; writes: number } = { meta: undefined, chunks: [], writes: 0 };
  const db = {
    transaction() {
      const pending: { meta?: LogMeta; chunks: LogChunk[] } = { chunks: [] };
      const tx: Record<string, unknown> & { error: Error | null } = {
        error: null,
        objectStore: (name: string) => (name === 'meta' ? { put: (v: LogMeta) => (pending.meta = v) } : { add: (c: LogChunk) => pending.chunks.push(c) }),
      };
      const ok = results.length ? results.shift()! : true;
      kept.writes++;
      setTimeout(() => {
        if (ok) {
          kept.meta = pending.meta;
          kept.chunks.push(...pending.chunks);
          (tx.oncomplete as () => void)?.();
        } else {
          tx.error = new Error('QuotaExceededError');
          (tx.onerror as () => void)?.();
          (tx.onabort as () => void)?.(); // a failed transaction also aborts: counted once
        }
      }, 0);
      return tx;
    },
  };
  return { db: db as unknown as IDBDatabase, kept };
}

function logWith(n: number) {
  const log = new TesterLogger({}, 'ua', 'b');
  log.startSession(0);
  for (let i = 0; i < n; i++) log.event(i, 'e', { i });
  return log;
}

test('log store: a failed write leaves storage on; the next 5 s timer writes the same rows again, and nothing is lost', async () => {
  const log = logWith(3);
  const { db, kept } = fakeDb([false, true]);
  const store = new LogStore(db);
  const keeper = new LogKeeper(() => log.log);
  keeper.attach(store);
  assert.equal(keeper.frame(100), null, 'first frame starts the clock');
  assert.equal(keeper.frame(104), null);
  assert.equal(await keeper.frame(105), false, 'the write failed');
  assert.equal(store.status, 'ready', 'still ready after one failure');
  assert.equal(store.failures, 1);
  assert.equal(keeper.kept, true, 'the panel keeps saying "kept"');
  log.event(106, 'e', {});
  assert.equal(keeper.frame(107), null, 'no retry before the timer');
  assert.equal(await keeper.frame(110), true, 'retried on the next timer');
  assert.equal(store.failures, 0, 'a success resets the count');
  const back = assemble(kept.meta, kept.chunks)!;
  assert.equal(back.sessions[0].events.length, 4, 'the failed write\'s rows are in storage');
  assert.equal(kept.chunks.length, 1, 'written once');
});

test(`log store: ${MAX_WRITE_FAILURES} failed writes in a row switch storage off for the page (the panel says NOT kept); no write is tried after that`, async () => {
  const log = logWith(2);
  const { db, kept } = fakeDb([false, false, true, false, false, false]);
  const store = new LogStore(db);
  const keeper = new LogKeeper(() => log.log, 1);
  keeper.attach(store);
  keeper.frame(0);
  assert.equal(await keeper.frame(1), false);
  assert.equal(await keeper.frame(2), false);
  assert.equal(store.status, 'ready', 'two in a row: still trying');
  assert.equal(await keeper.frame(3), true, 'the third try worked: the count starts over');
  log.event(4, 'e', {});
  for (const t of [5, 6]) assert.equal(await keeper.frame(t), false);
  assert.equal(store.status, 'ready');
  log.event(7, 'e', {});
  assert.equal(await keeper.frame(8), false);
  assert.equal(store.status, 'failed', `${MAX_WRITE_FAILURES} in a row`);
  assert.equal(keeper.kept, false);
  assert.match(store.error, /Quota/);
  const writes = kept.writes;
  log.event(9, 'e', {});
  assert.equal(await keeper.frame(10), false);
  assert.equal(kept.writes, writes, 'no write after giving up');
  await store.clear().catch(() => {});
});

test('log keeper: nothing to write, no store, or a store not ready: no write and no error', async () => {
  const log = logWith(1);
  const keeper = new LogKeeper(() => log.log, 1);
  keeper.frame(0);
  assert.equal(await keeper.frame(1), false, 'no store attached yet');
  const { db, kept } = fakeDb([]);
  keeper.attach(new LogStore(db));
  assert.equal(await keeper.flush(), true);
  assert.equal(await keeper.flush(), true, 'nothing new');
  assert.equal(kept.writes, 1);
  assert.equal(await new LogKeeper(() => null).flush(), false);
  // a store that has given up is never asked to write (the keeper checks, not only LogStore.write)
  let asked = 0;
  const gaveUp = new LogKeeper(() => log.log, 1);
  gaveUp.attach({ status: 'failed', write: async () => (asked++, true) });
  log.event(2, 'e', {});
  assert.equal(await gaveUp.flush(), false);
  assert.equal(asked, 0);
});

// ------------------------------------------------- the /emu/ seat's hand pose (O13, O14)

function rotate(q: number[], v: number[]): number[] {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  // v' = q v q*
  const ix = w * vx + y * vz - z * vy;
  const iy = w * vy + z * vx - x * vz;
  const iz = w * vz + x * vy - y * vx;
  const iw = -x * vx - y * vy - z * vz;
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}

test('/emu/ seat: the hand stands fingers up, back toward the player, with its wrist (not the grip) on the spot, whatever way the board is turned', () => {
  for (const yaw of [0, 0.7, -2.1]) {
    // a board at (0.3, 0.72, −1.9) turned by `yaw` about world up; board +x → (cos, 0, −sin) as Object3D rotation.y does
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const boardPoint = (x: number, z: number, y: number): [number, number, number] => [0.3 + c * x + s * z, 0.72 + y, -1.9 - s * x + c * z];
    const toBoard = (p: number[]) => {
      const dx = p[0] - 0.3, dz = p[2] + 1.9;
      return [c * dx - s * dz, p[1] - 0.72, s * dx + c * dz];
    };
    const pose = seatHandPose(STOP.x, STOP.y, STOP.z, boardPoint);
    const grip = toBoard(pose.position);
    const wrist = [grip[0] + GRIP_TO_WRIST.x, grip[1] + GRIP_TO_WRIST.y, grip[2] + GRIP_TO_WRIST.z];
    assert.ok(Math.hypot(wrist[0] - STOP.x, wrist[1] - STOP.y, wrist[2] - STOP.z) < 1e-6, `yaw ${yaw}: wrist ${wrist}`);
    const fingers = rotate(pose.quaternion, [0, 0, -1]); // −Z toward the fingertips
    assert.ok(fingers[1] > 0.999, `yaw ${yaw}: fingertips up (${fingers})`);
    const back = rotate(pose.quaternion, [0, 1, 0]); // +Y out of the back of the hand
    const towardPlayer = [s, 0, c]; // board +z in the world
    assert.ok(back[0] * towardPlayer[0] + back[2] * towardPlayer[2] > 0.999, `yaw ${yaw}: back of the hand toward the player (${back})`);
  }
  // C: the cupping spot is inside the wake radius
  assert.ok(nearestJointToLantern(stopHand(CUP.x, WRIST_Y, CUP.z), L) < WAKE_RADIUS);
});

// ------------------------------------------------- #7 fps with the board in view

test('analyser: fps median and p5 also for the seconds with the board in view (day-5 logs); null for older logs', () => {
  const log = new TesterLogger({}, 'ua', 'b');
  log.startSession(0);
  const fps = [72, 72, 71, 40, 72, 30, 72, 72];
  fps.forEach((f, i) => log.event(i, 'fps', { inView: f !== 30, viewDeg: f === 30 ? 80 : 10, fps: f, worstMs: 14 }));
  const a = analyseLog(log.log).fps!;
  assert.equal(a.inViewSeconds, 7);
  assert.equal(a.inViewMedian, 72);
  assert.equal(a.inViewP5, 40);
  assert.equal(a.median, 72);
  const old = new TesterLogger({}, 'ua', 'b');
  old.startSession(0);
  old.event(0, 'fps', { fps: 72 });
  assert.equal(analyseLog(old.log).fps!.inViewSeconds, null);
});
