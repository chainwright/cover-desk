import assert from 'node:assert/strict';
import { test } from 'node:test';
import { push, readDeck, releasePusher, setCanonical, type Pusher } from '../src/bead-physics.ts';
import { PLACE, TapCalibrator, spotFromTouch } from '../src/calibration.ts';
import { CONTACT, SURFACE, contactRod } from '../src/contact.ts';
import { parseFlags } from '../src/flags.ts';
import { deckAfterStroke } from '../src/rest-reader.ts';
import { BEAD_Y, FINGER_RADIUS, LOWER, UPPER, rodX } from '../src/soroban-layout.ts';
import { LOG_FORMAT, TouchLogger, analyseLog } from '../src/touch-log.ts';

// ------------------------------------------------------------- contact

test('contact: hysteresis keeps a finger in contact between enter and exit heights', () => {
  const x = rodX(2);
  const between = SURFACE + (CONTACT.enter + CONTACT.exit) / 2;
  assert.equal(contactRod(x, between, -1), -1, 'does not start between the thresholds');
  assert.equal(contactRod(x, between, 2), 2, 'stays once in contact');
  assert.equal(contactRod(x, SURFACE + CONTACT.exit + 0.001, 2), -1, 'ends above exit');
  assert.equal(contactRod(x, 0.008, -1), 2, 'finger on the desk under the rod is in contact');
});

test('contact: bands pick the right rod and leave a gap between rods', () => {
  for (let r = 0; r < 5; r++) assert.equal(contactRod(rodX(r) + 0.01, 0.01, -1), r);
  const mid = (rodX(1) + rodX(2)) / 2;
  assert.equal(contactRod(mid, 0.01, -1), -1);
  assert.equal(contactRod(rodX(4) + 0.05, 0.01, -1), -1, 'outside the frame');
  assert.equal(contactRod(rodX(0), -0.05, -1), -1, 'below the floor');
});

// ------------------------------------------------------------- calibration

function feed(c: TapCalibrator, from: number, to: number, y: (t: number) => number, x = 0.05, z = -0.3) {
  let out = null;
  for (let t = from; t <= to + 1e-9; t += 1 / 72) {
    const r = c.push(t, x, y(t), z, 0, 1.2, 0);
    if (r && !out) out = { ...r, t };
  }
  return out;
}

test('calibration: a tap and a still hold returns the mean fingertip height', () => {
  const c = new TapCalibrator();
  // descend from 0.82 to 0.735 in 0.3 s, then hold with ±1 mm jitter
  const res = feed(c, 0, 1.5, (t) => (t < 0.3 ? 0.82 - (0.085 * t) / 0.3 : 0.735 + 0.001 * Math.sin(t * 40)));
  assert.ok(res, 'calibrated');
  assert.ok(Math.abs(res!.y - 0.735) < 0.0015, `mean y ${res!.y}`);
  assert.ok(res!.t > 0.85 && res!.t < 1.1, `after the hold, t=${res!.t}`);
});

test('calibration: a hand resting still without a tap does not calibrate', () => {
  const c = new TapCalibrator();
  assert.equal(feed(c, 0, 3, () => 0.735), null);
});

test('calibration: a fingertip that keeps moving does not calibrate', () => {
  const c = new TapCalibrator();
  assert.equal(feed(c, 0, 3, (t) => 0.75 + 0.02 * Math.sin(t * 6)), null);
});

test('calibration: out of reach (too far below the eyes) is ignored', () => {
  const c = new TapCalibrator();
  const res = feed(c, 0, 1.5, (t) => (t < 0.3 ? 0.15 - t * 0.2 : 0.09));
  assert.equal(res, null);
});

test('placement: under the finger when within reach, facing the viewer', () => {
  // eyes 0.35 m above the desk; touch 0.27 m ahead → 0.44 m away, kept
  const s = spotFromTouch(0, 0.85, -0.27, 0, 1.2, 0);
  assert.ok(!s.moved);
  assert.ok(Math.abs(s.z + 0.27) < 1e-9);
  assert.ok(Math.abs(s.yaw) < 1e-9, 'faces +z toward the viewer');
  assert.ok(s.eyeDistance <= 0.45);
});

test('placement: a far touch is pulled in to the reach target when the desk edge is known', () => {
  const s = spotFromTouch(0.3, 0.85, -0.6, 0, 1.2, 0, { ...PLACE, maxPull: Infinity });
  assert.ok(s.moved);
  assert.ok(Math.abs(s.eyeDistance - 0.45) < 1e-6, `distance ${s.eyeDistance}`);
  // still on the eye→touch line
  assert.ok(Math.abs(s.x / s.z - 0.3 / -0.6) < 1e-9);
});

test('placement: without a known desk edge, a far touch is pulled in by at most 5 cm', () => {
  const s = spotFromTouch(0.3, 0.85, -0.6, 0, 1.2, 0);
  const h = Math.hypot(0.3, 0.6);
  assert.ok(Math.abs(Math.hypot(s.x, s.z) - (h - PLACE.maxPull)) < 1e-9);
});

test('placement: a touch right under the chin is pushed out to the minimum reach', () => {
  const s = spotFromTouch(0, 0.75, -0.1, 0, 1.2, 0);
  assert.ok(s.moved);
  assert.ok(Math.abs(Math.hypot(s.x, s.z) - 0.24) < 1e-9);
});

// ------------------------------------------------------------- rest reader vs physics

function finger(count: number): Pusher {
  return { z: 0, prevZ: Number.NaN, radius: FINGER_RADIUS, sides: new Int8Array(count) };
}

/** Deterministic PRNG (mulberry32) and a normal sample. */
function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
}

/** Live physics along a jittery path; returns the reading and the noisy endpoints. */
function livePhysics(deck: typeof LOWER, value: number, from: number, to: number, top: boolean, noise: () => number, sigma: number) {
  const c = new Float32Array(deck.count);
  setCanonical(deck, value, c);
  const p = finger(deck.count);
  releasePusher(p);
  let first = from, last = to;
  for (let s = 0; s <= 60; s++) {
    p.z = from + ((to - from) * s) / 60 + noise() * sigma;
    if (s === 0) first = p.z;
    last = p.z;
    push(deck, c, p, top);
    p.prevZ = p.z;
  }
  return { phys: readDeck(deck, c), first, last };
}

/** The stroke a person makes to change the lower deck from v to n. */
function intendedLower(v: number, n: number): { from: number; to: number; top: boolean } {
  const H = LOWER.half;
  const counted = (j: number) => LOWER.lo + H + 2 * H * j;
  const resting = (j: number) => LOWER.hi - H - 2 * H * (LOWER.count - 1 - j);
  if (n > v) {
    // edge push from the seam below resting bead n-1, up to where n beads are counted
    return { from: resting(n - 1) + H + FINGER_RADIUS * 0.5, to: counted(n - 1) + H + FINGER_RADIUS + 0.002, top: false };
  }
  // drag counted bead n down from its top to its resting spot
  return { from: counted(n), to: resting(n) + 0.004, top: true };
}

test('rest reader: replays every lower-deck change correctly, and beats live physics under jitter', () => {
  let restOk = 0, liveOk = 0, total = 0;
  for (const sigma of [0, 0.002, 0.004]) {
    for (let seed = 1; seed <= 4; seed++) {
      const noise = rng(seed * 97 + Math.round(sigma * 1e4));
      for (let v = 0; v <= 4; v++) {
        for (let n = 0; n <= 4; n++) {
          if (n === v) continue;
          const s = intendedLower(v, n);
          const live = livePhysics(LOWER, v, s.from, s.to, s.top, noise, sigma);
          const rest = deckAfterStroke(LOWER, FINGER_RADIUS, v, { startZ: live.first, endZ: live.last, top: s.top });
          total++;
          if (rest === n) restOk++;
          if (live.phys === n) liveOk++;
          if (sigma === 0) assert.equal(rest, n, `noise-free v=${v} n=${n}`);
        }
      }
    }
  }
  assert.ok(restOk / total >= 0.97, `rest ${restOk}/${total}`);
  assert.ok(restOk >= liveOk, `rest ${restOk} vs live ${liveOk} of ${total}`);
});

test('rest reader: upper bead both ways, and a short nudge changes nothing', () => {
  const H = UPPER.half;
  const on = UPPER.hi - H;
  const off = UPPER.lo + H;
  assert.equal(deckAfterStroke(UPPER, FINGER_RADIUS, 0, { startZ: UPPER.lo - 0.012, endZ: on - H - FINGER_RADIUS, top: false }), 1);
  assert.equal(deckAfterStroke(UPPER, FINGER_RADIUS, 1, { startZ: on, endZ: off, top: true }), 0);
  assert.equal(deckAfterStroke(UPPER, FINGER_RADIUS, 1, { startZ: on, endZ: on - 0.005, top: true }), 1);
  assert.equal(deckAfterStroke(LOWER, FINGER_RADIUS, 3, { startZ: 0.05, endZ: 0.056, top: false }), 3);
});

// ------------------------------------------------------------- log

test('log: samples are rate-limited, labelled, and the analyser scores them', () => {
  const log = new TouchLogger({}, 'test', 'test');
  log.startSession(10);
  const x = rodX(2);
  log.setLabel('slide-desk', 10);
  for (let t = 10; t < 13; t += 1 / 72) log.sample(t, 1, x, 0.008, 0.05, 2, 2);
  log.setLabel('hover-2cm', 13);
  for (let t = 13; t < 16; t += 1 / 72) log.sample(t, 1, x, SURFACE + 0.02, 0.05, -1, 1);
  log.endSession();
  const s = log.log.sessions[0];
  assert.ok(s.samples.length > 170 && s.samples.length < 185, `≈30 Hz, got ${s.samples.length}`);
  const parsed = JSON.parse(log.toJSON());
  assert.equal(parsed.format, LOG_FORMAT);
  const sum = analyseLog(parsed);
  const slide = sum.labels.find((l) => l.label === 'slide-desk')!;
  const hover = sum.labels.find((l) => l.label === 'hover-2cm')!;
  assert.equal(slide.errorRate, 0);
  assert.equal(hover.errorRate, 0);
  assert.equal(slide.heightMm[1], 8);
  // with a much higher enter threshold, the hover would become false contact
  const loose = analyseLog(parsed, { ...CONTACT, enter: 0.03, exit: 0.04 });
  assert.equal(loose.labels.find((l) => l.label === 'hover-2cm')!.errorRate, 1);
});

test('flags: defaults and parsing', () => {
  assert.deepEqual(parseFlags(''), { test: false, read: 'physics', hands: 'mask', depth: false, reset: false, guide: true });
  const f = parseFlags('?test=1&read=rest&hands=outline&occlude=depth&reset=1&guide=0');
  assert.deepEqual(f, { test: true, read: 'rest', hands: 'outline', depth: true, reset: true, guide: false });
  assert.equal(parseFlags('?test=0').test, false);
  assert.equal(BEAD_Y > 0, true);
});
