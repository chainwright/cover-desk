import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  push,
  readDeck,
  releasePusher,
  setCanonical,
  settle,
  type DeckLayout,
  type Pusher,
} from '../src/bead-physics.ts';

const H = 0.012;
const UPPER: DeckLayout = { lo: -0.06, hi: -0.006, half: H, count: 1, beamSide: 'hi' };
const LOWER: DeckLayout = { lo: 0.006, hi: 0.006 + 8 * H + 0.03, half: H, count: 4, beamSide: 'lo' };

function finger(count: number): Pusher {
  return { z: 0, prevZ: Number.NaN, radius: 0.008, sides: new Int8Array(count) };
}

/** Moves a finger from `from` to `to` in small steps, pushing every step. */
function sweep(deck: DeckLayout, c: Float32Array, p: Pusher, from: number, to: number, steps = 60) {
  p.prevZ = Number.NaN;
  releasePusher(p);
  for (let s = 0; s <= steps; s++) {
    const z = from + ((to - from) * s) / steps;
    p.z = z;
    push(deck, c, p);
    p.prevZ = z;
  }
}

function assertValid(deck: DeckLayout, c: Float32Array) {
  const sorted = Array.from(c).sort((a, b) => a - b);
  assert.ok(sorted[0] - deck.half >= deck.lo - 1e-6, 'below deck');
  assert.ok(sorted[sorted.length - 1] + deck.half <= deck.hi + 1e-6, 'above deck');
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i] - sorted[i - 1] >= 2 * deck.half - 1e-6, 'overlap');
  }
}

test('canonical layouts read back as their value', () => {
  const c = new Float32Array(4);
  for (let v = 0; v <= 4; v++) {
    setCanonical(LOWER, v, c);
    assert.equal(readDeck(LOWER, c), v);
    assertValid(LOWER, c);
  }
  const u = new Float32Array(1);
  for (let v = 0; v <= 1; v++) {
    setCanonical(UPPER, v, u);
    assert.equal(readDeck(UPPER, u), v);
  }
});

test('pushing all lower beads toward the beam reads 4', () => {
  const c = new Float32Array(4);
  setCanonical(LOWER, 0, c);
  const p = finger(4);
  sweep(LOWER, c, p, LOWER.hi + 0.02, LOWER.lo + 0.005);
  assertValid(LOWER, c);
  assert.equal(readDeck(LOWER, c), 4);
});

test('pushing two beads up then stopping reads 2', () => {
  const c = new Float32Array(4);
  setCanonical(LOWER, 0, c);
  const p = finger(4);
  // start the finger in the gap between bead 1 and bead 2 (resting layout)
  const start = (c[1] + c[2]) / 2;
  sweep(LOWER, c, p, start, LOWER.lo + 4 * H + 0.008);
  assertValid(LOWER, c);
  assert.equal(readDeck(LOWER, c), 2);
});

test('upper bead pushed down to the beam reads 1, pushed back reads 0', () => {
  const u = new Float32Array(1);
  setCanonical(UPPER, 0, u);
  const p = finger(1);
  sweep(UPPER, u, p, UPPER.lo - 0.02, UPPER.hi - 2 * H);
  assert.equal(readDeck(UPPER, u), 1);
  sweep(UPPER, u, p, UPPER.hi + 0.02, UPPER.lo + 2 * H);
  assert.equal(readDeck(UPPER, u), 0);
  assertValid(UPPER, u);
});

test('a blocked bead does not jump through a finger pressing past its centre', () => {
  const c = new Float32Array(4);
  setCanonical(LOWER, 4, c); // all against the beam
  const before = Array.from(c);
  const p = finger(4);
  // finger comes from the user side and keeps pressing deep toward the beam
  sweep(LOWER, c, p, LOWER.hi + 0.02, LOWER.lo - 0.01, 120);
  assertValid(LOWER, c);
  assert.equal(readDeck(LOWER, c), 4);
  // beads never flip to the far side of the finger (they stay at the beam end)
  for (let j = 0; j < 4; j++) assert.ok(Math.abs(c[j] - before[j]) < 1e-6);
});

test('settle snaps a half-way bead to the nearest state without changing the reading', () => {
  const c = new Float32Array(4);
  setCanonical(LOWER, 1, c);
  const scratch = new Float32Array(4);
  c[1] -= 0.012; // nudged toward the beam, still nearer rest
  const v0 = readDeck(LOWER, c);
  for (let i = 0; i < 60; i++) settle(LOWER, c, scratch, 1 / 72);
  assert.equal(readDeck(LOWER, c), v0);
  setCanonical(LOWER, v0, scratch);
  for (let j = 0; j < 4; j++) assert.ok(Math.abs(c[j] - scratch[j]) < 1e-3);
});

test('top drag moves a counted bead away from the beam (no gap needed)', () => {
  const c = new Float32Array(4);
  setCanonical(LOWER, 4, c); // all four against the beam, no room for a finger edge
  const p = finger(4);
  releasePusher(p);
  p.prevZ = Number.NaN;
  // land on top of the bead furthest from the beam (index 3) and drag toward the user
  const start = c[3];
  for (let s = 0; s <= 60; s++) {
    p.z = start + (0.03 * s) / 60;
    push(LOWER, c, p, true);
    p.prevZ = p.z;
  }
  assertValid(LOWER, c);
  assert.equal(readDeck(LOWER, c), 3);
});

test('top drag on the upper bead lifts it off the beam', () => {
  const u = new Float32Array(1);
  setCanonical(UPPER, 1, u);
  const p = finger(1);
  releasePusher(p);
  p.prevZ = Number.NaN;
  const start = u[0];
  for (let s = 0; s <= 60; s++) {
    p.z = start - (0.035 * s) / 60;
    push(UPPER, u, p, true);
    p.prevZ = p.z;
  }
  assertValid(UPPER, u);
  assert.equal(readDeck(UPPER, u), 0);
});

test('a finger that never reaches a bead changes nothing', () => {
  const c = new Float32Array(4);
  setCanonical(LOWER, 0, c);
  const before = Array.from(c);
  const p = finger(4);
  p.z = LOWER.lo - 0.05;
  assert.equal(push(LOWER, c, p), false);
  assert.deepEqual(Array.from(c), before);
});
