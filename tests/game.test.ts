import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLACE, TapCalibrator, spotFromTouch } from '../src/calibration.ts';
import { REGISTER, TIP_PAD, distanceToPolyline, hysteresis, judgeRegistration } from '../src/contact.ts';
import {
  CREATURE,
  EV_BACK_IN_NOOK,
  EV_HOME,
  EV_PAUSE,
  EV_RESUME,
  EV_SPOTTED,
  MODE_HOME,
  MODE_NOOK,
  MODE_PAUSED,
  MODE_RETREAT,
  MODE_SPOTTED,
  MODE_WAIT,
  newCreature,
  stepCreature,
  type CreatureWorld,
} from '../src/creature.ts';
import { parseFlags } from '../src/flags.ts';
import { POSE_EDGE, POSE_FLAT, POSE_LOST } from '../src/hand-proxy.ts';
import { BOARD, LEVEL_1, Route } from '../src/level.ts';
import { LABELS, LOG_FORMAT, TesterLogger, analyseLog } from '../src/touch-log.ts';

const DT = 1 / 72;

/** A world where the lit stretch of the path is [litFrom, litTo] minus any shaded intervals. */
function world(length: number, lit: [number, number], shade: [number, number][] = []): CreatureWorld & { shade: [number, number][] } {
  const w = {
    routeLength: length,
    handPresent: true,
    shade,
    seen(s: number) {
      if (s < lit[0] || s > lit[1]) return false;
      return !w.shade.some(([a, b]) => s >= a && s <= b);
    },
  };
  return w;
}

function run(c: ReturnType<typeof newCreature>, w: CreatureWorld, seconds: number): number[] {
  const evs: number[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const e = stepCreature(c, DT, w);
    if (e) evs.push(e);
  }
  return evs;
}

// ------------------------------------------------------------- creature

test('creature: with the light uncovered it creeps to the edge of the light and waits there', () => {
  const c = newCreature();
  const w = world(0.38, [0.06, 0.32]);
  run(c, w, 5);
  assert.ok(c.mode === MODE_NOOK || c.mode === MODE_WAIT, `mode ${c.mode}`);
  assert.ok(c.s < 0.06 && c.s > 0.06 - CREATURE.lookahead - 0.005, `stopped just before the light at s=${c.s}`);
  assert.equal(w.seen(c.s), false);
  assert.equal(c.spottedCount, 0);
});

test('creature: a fully shaded path takes it home in under 8 s (the hold limit)', () => {
  const c = newCreature();
  const evs = run(c, world(0.38, [0.06, 0.32], [[0, 1]]), 8);
  assert.equal(c.mode, MODE_HOME);
  assert.ok(evs.includes(EV_HOME));
  assert.ok(0.38 / CREATURE.dash < 8, 'a full crossing fits in one 8 s hold');
});

test('creature: it waits at the edge of a shadow and never steps into light', () => {
  const c = newCreature();
  const w = world(0.38, [0.06, 0.32], [[0.06, 0.15]]);
  run(c, w, 4);
  assert.equal(c.mode, MODE_WAIT);
  assert.ok(c.s > 0.1 && c.s < 0.15, `waiting inside the shadow, s=${c.s}`);
  assert.ok(!w.seen(c.s));
  assert.equal(c.spottedCount, 0);
});

test('creature: lifting the hand mid-crossing gets it spotted, then it runs back to the nook', () => {
  const c = newCreature();
  const w = world(0.38, [0.06, 0.32], [[0, 1]]);
  run(c, w, 1.2); // in the middle of the lit stretch
  assert.ok(c.s > 0.1);
  w.shade = []; // hand lifted
  const evs = run(c, w, 0.3);
  assert.ok(evs.includes(EV_SPOTTED));
  assert.equal(c.mode, MODE_SPOTTED);
  run(c, w, CREATURE.freeze + 0.05);
  assert.equal(c.mode, MODE_RETREAT);
  const back = run(c, w, 2);
  assert.ok(back.includes(EV_BACK_IN_NOOK), 'ran all the way back to the nook');
  assert.ok(c.s < 0.06, `then waits out of the light, s=${c.s}`);
  assert.equal(c.spottedCount, 1);
});

test('creature: a single-frame flicker of light does not get it spotted', () => {
  const c = newCreature();
  const w = world(0.38, [0.06, 0.32], [[0, 1]]);
  run(c, w, 1.2);
  w.shade = [];
  stepCreature(c, DT, w); // one frame lit
  stepCreature(c, DT, w);
  w.shade = [[0, 1]];
  run(c, w, 0.5);
  assert.equal(c.spottedCount, 0);
});

test('creature: when the headset loses every hand it waits; nothing moves or is judged, then a grace', () => {
  const c = newCreature();
  const w = world(0.38, [0.06, 0.32], [[0, 1]]);
  run(c, w, 1.2);
  const s = c.s;
  w.handPresent = false;
  w.shade = []; // no hand = no shadow, the creature is in the light
  const evs = run(c, w, 3);
  assert.deepEqual(evs, [EV_PAUSE]);
  assert.equal(c.mode, MODE_PAUSED);
  assert.equal(c.s, s);
  assert.equal(c.spottedCount, 0);
  // the hand comes back: a grace period before anything is judged
  w.handPresent = true;
  const back = run(c, w, CREATURE.grace - 0.05);
  assert.equal(back[0], EV_RESUME);
  assert.equal(c.spottedCount, 0, 'not spotted during the grace');
  run(c, w, 0.4);
  assert.equal(c.spottedCount, 1, 'judged again after the grace');
});

// ------------------------------------------------------------- route + level

test('route: arc length lookup is exact at the vertices and the level ends lie outside the light', () => {
  const r = new Route(LEVEL_1.route);
  const out = [0, 0, 0];
  r.at(0, out);
  assert.deepEqual([+out[0].toFixed(6), +out[1].toFixed(6)], [-0.19, 0.06]);
  r.at(r.length, out);
  assert.deepEqual([+out[0].toFixed(6), +out[1].toFixed(6)], [0.19, 0.06]);
  assert.ok(r.length > 0.37 && r.length < 0.4, `length ${r.length}`);
});

// ------------------------------------------------------------- registration

const base = { board: BOARD, routeDistance: 0.12, keeperDistance: 0.2, pointing: true, x: 0.12, z: -0.06 };

test('registration: a pointing hold 9 cm above the desk beside the path registers', () => {
  assert.equal(judgeRegistration({ ...base, y: 0.09 + TIP_PAD }), 'ok');
});

test('registration: rejections — desk height, too high, not pointing, off the board, on the path, on a keeper', () => {
  assert.equal(judgeRegistration({ ...base, y: 0.015 + TIP_PAD }), 'too-low');
  assert.equal(judgeRegistration({ ...base, y: 0.4 }), 'too-high');
  assert.equal(judgeRegistration({ ...base, y: 0.1, pointing: false }), 'not-pointing');
  assert.equal(judgeRegistration({ ...base, y: 0.1, x: 0.4 }), 'off-board');
  assert.equal(judgeRegistration({ ...base, y: 0.1, routeDistance: 0.03 }), 'on-route');
  assert.equal(judgeRegistration({ ...base, y: 0.1, keeperDistance: 0.05 }), 'on-keeper');
  assert.equal(REGISTER.radius * 2, 0.08, 'default footprint is 8 cm');
});

test('registration: distance to the path polyline', () => {
  assert.ok(Math.abs(distanceToPolyline(0, 0, [-1, 0.05, 1, 0.05]) - 0.05) < 1e-9);
  assert.ok(Math.abs(distanceToPolyline(2, 0, [-1, 0, 1, 0]) - 1) < 1e-9, 'beyond the end');
});

test('hysteresis: enters below enter, leaves only above exit', () => {
  const h = { enter: 0.01, exit: 0.02 };
  assert.equal(hysteresis(0.015, false, h), false);
  assert.equal(hysteresis(0.015, true, h), true);
  assert.equal(hysteresis(0.021, true, h), false);
});

// ------------------------------------------------------------- calibration (reused)

function feed(c: TapCalibrator, from: number, to: number, y: (t: number) => number, x = 0.05, z = -0.3) {
  let out = null;
  for (let t = from; t <= to + 1e-9; t += DT) {
    const r = c.push(t, x, y(t), z, 0, 1.2, 0);
    if (r && !out) out = { ...r, t };
  }
  return out;
}

test('calibration (reused): a tap and a still hold returns the mean fingertip height; a resting hand does not', () => {
  const c = new TapCalibrator();
  const res = feed(c, 0, 1.5, (t) => (t < 0.3 ? 0.82 - (0.085 * t) / 0.3 : 0.735 + 0.001 * Math.sin(t * 40)));
  assert.ok(res && Math.abs(res.y - 0.735) < 0.0015);
  assert.equal(feed(new TapCalibrator(), 0, 3, () => 0.735), null);
});

test('placement (reused): a far touch is pulled in to the reach target when the desk edge is known', () => {
  const s = spotFromTouch(0.3, 0.85, -0.6, 0, 1.2, 0, { ...PLACE, maxPull: Infinity });
  assert.ok(s.moved);
  assert.ok(Math.abs(s.eyeDistance - 0.45) < 1e-6);
});

// ------------------------------------------------------------- flags + log

test('flags: defaults and options', () => {
  assert.deepEqual(parseFlags(''), { test: false, hands: 'mask', proxy: false, depth: false, reset: false, guide: true });
  const f = parseFlags('?test=1&hands=outline&proxy=1&occlude=depth&reset=1&guide=0');
  assert.deepEqual(f, { test: true, hands: 'outline', proxy: true, depth: true, reset: true, guide: false });
});

test('tester log: pose stability, line events, registrations and fps are summarised', () => {
  const log = new TesterLogger({}, 'test', 'dev');
  log.startSession(0);
  log.setLabel('flat', 0);
  for (let i = 0; i < 300; i++) {
    const t = i / 30;
    const lost = i >= 280; // the last 20 samples: tracking lost
    log.sample(t, 1, lost ? 0 : 0.01 + 0.001 * Math.sin(i), lost ? 0 : 0.02, lost ? 0 : -0.03, 0.01,
      lost ? POSE_LOST : i % 100 === 50 ? POSE_EDGE : POSE_FLAT, 0.9);
  }
  log.event(1, 'line', { blocked: true, by: 'hand-right' });
  log.event(2, 'line', { blocked: false, by: null });
  log.event(2, 'register', {});
  log.event(3, 'register-rejected', { reason: 'on-route' });
  log.event(3, 'spotted', {});
  log.event(4, 'fps', { fps: 72, worstMs: 15.1 });
  log.event(5, 'fps', { fps: 70, worstMs: 18 });
  const s = analyseLog(JSON.parse(log.toJSON()));
  assert.equal(s.format, LOG_FORMAT);
  assert.deepEqual(s.lines, { blocked: 1, cleared: 1, byOwner: { 'hand-right': 1 } });
  assert.deepEqual(s.registrations, { ok: 1, rejected: { 'on-route': 1 } });
  assert.equal(s.creature.spotted, 1);
  assert.equal(s.fps?.median, 72);
  assert.equal(s.fps?.worstFrameMs, 18);
  const flat = s.labels.find((l) => l.label === 'flat' && l.hand === 1)!;
  assert.ok(Math.abs(flat.tracked - 280 / 300) < 0.01, `tracked ${flat.tracked}`);
  assert.ok(flat.poseMatch! > 0.98 && flat.poseMatch! < 1, `match ${flat.poseMatch}`);
  assert.ok(flat.poseFlipsPerMin > 0, 'flips counted');
  assert.ok(flat.wristStepMm > 0 && flat.wristStepMm < 2, `step ${flat.wristStepMm}`);
  assert.ok(LABELS.includes('stop'));
});
