/**
 * Day 6: level 2, "The keeper's gaze" (src/level2.ts). A real object is
 * needed: a hand alone never wins, one object alone never wins, the two
 * together do. Same geometry model as the other tests (synthetic 25-joint
 * hands, 7 mm joint radius + 4 mm inflation; not real tracked hands).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REGISTER, distanceToPolyline, judgeRegistration } from '../src/contact.ts';
import { EV_HOME, MODE_HOME, MODE_NOOK, MODE_WAIT, newCreature, stepCreature, type CreatureWorld } from '../src/creature.ts';
import { EMU_MUG, STOP, seatSpotX } from '../src/emu-seat.ts';
import { handAtLantern } from '../src/feedback.ts';
import { addHandCapsules } from '../src/hand-proxy.ts';
import { BOARD, CREATURE_Y, LEVEL_1, Route, TEACH_SPOT } from '../src/level.ts';
import { GAZE_HALF, Gaze, L2_LEFT, L2_RIGHT, LEVEL_2, LevelProgress, MUG_SPOT, objectSlot, startLevel } from '../src/level2.ts';
import { LightMap } from '../src/light-map.ts';
import { PROMPT_LINES, firstRunCues, type CueInput } from '../src/onboarding.ts';
import { BY_NONE, DARK, Occluders, SEEN, SHADOW, look } from '../src/sightline.ts';
import { edgeHand, flatHand, makeHand, stopHand } from './hand-fixture.ts';

const L = LEVEL_1.lanterns[0];
const ROUTE = new Route(LEVEL_1.route);
const GAZE = new Gaze(L, ROUTE);
const DT = 1 / 72;
const WY = 0.02;
/** The fixture's stopHand has its thumb toward +x (a left hand); this one toward −x (a right hand). */
const rightStop = (x: number, y: number, z: number) => makeHand({ wrist: [x, y, z], u: [0, 1, 0], v: [-1, 0, 0], n: [0, 0, -1] });
const STOPS = [stopHand, rightStop] as const;
const MUG = { x: MUG_SPOT.x, z: MUG_SPOT.z, top: 0.1 };

type Obj = { x: number; z: number; top: number };
type Policy = (c: ReturnType<typeof newCreature>, wakes: (j: Float32Array) => boolean) => Float32Array | null;

/**
 * Plays level 2 as the game does: the keeper wakes (and sees the whole path)
 * while a hand is at the lantern or shades the path inside the gaze.
 * `gaze: false` plays the same scene with level 1's rules.
 */
function play(policy: Policy, objects: Obj[], opts: { seconds?: number; gaze?: boolean; radius?: number } = {}) {
  const rad = opts.radius ? new Float32Array(25).fill(opts.radius) : null;
  const at = [0, 0, 0];
  let occ = new Occluders();
  let awake = false;
  const useGaze = opts.gaze ?? true;
  const wakes = (j: Float32Array) => handAtLantern([j], [true], L) >= 0 || (useGaze && GAZE.handIn(j, rad));
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
  let woke = 0;
  let maxS = 0;
  const seconds = opts.seconds ?? 30;
  for (let t = 0; t < seconds; t += DT) {
    const j = policy(c, wakes);
    occ = new Occluders();
    if (j) addHandCapsules(j, rad, 1, occ);
    objects.forEach((o, i) => occ.addCylinder(o.x, o.z, REGISTER.radius, o.top, 10 + i));
    awake = !!j && wakes(j);
    if (awake) woke++;
    const ev = stepCreature(c, DT, w);
    maxS = Math.max(maxS, c.s);
    if (ev === EV_HOME || c.mode === MODE_HOME) return { home: true, t, spotted: c.spottedCount, woke, maxS };
  }
  return { home: false, t: seconds, spotted: c.spottedCount, woke, maxS };
}

const still = (j: Float32Array): Policy => () => j;

/**
 * A careful player: stands at the left ghost, slides toward the trinket at
 * `v` but never into the gaze (a step that would wake the keeper is not
 * taken); once the creature waits past the middle, the hand goes over the
 * top to the nearest spot right of the gaze that wakes nothing, and slides on.
 */
function careful(make: (x: number, y: number, z: number) => Float32Array, v = 0.03): Policy {
  const at = [0, 0, 0];
  let x: number = L2_LEFT.x;
  let phase = 0;
  let cx = NaN;
  let j: Float32Array | null = null;
  return (c, wakes) => {
    ROUTE.at(c.s, at);
    if (phase === 0 && c.mode === MODE_WAIT && c.s > 0.05) phase = 1;
    if (phase === 1 && c.mode === MODE_WAIT && at[0] > 0) {
      phase = 2;
      x = 0;
      while (wakes(make(x, WY, L2_LEFT.z))) x += 0.005;
    }
    if (phase >= 1) {
      const nx = Math.min(0.15, x + v * DT);
      if (!wakes(make(nx, WY, L2_LEFT.z))) x = nx;
    }
    if (x !== cx) {
      cx = x;
      j = make(x, WY, L2_LEFT.z);
    }
    return j;
  };
}

/** A player who doesn't know the rule: slides straight on from the left ghost into the gaze. */
function heedless(make: (x: number, y: number, z: number) => Float32Array, v = 0.03): Policy {
  let x: number = L2_LEFT.x;
  let sliding = false;
  return (c) => {
    if (!sliding && c.mode === MODE_WAIT && c.s > 0.05) sliding = true;
    if (sliding) x = Math.min(0.15, x + v * DT);
    return make(x, WY, L2_LEFT.z);
  };
}

/** Hand at the left ghost; once the creature waits past the middle, the hand at the right ghost (no slide). */
function twoSpots(make: (x: number, y: number, z: number) => Float32Array): Policy {
  const left = make(L2_LEFT.x, WY, L2_LEFT.z);
  const right = make(L2_RIGHT.x, WY, L2_RIGHT.z);
  let swapped = false;
  return (c) => {
    if (!swapped && c.mode === MODE_WAIT && c.s > GAZE.s0) swapped = true;
    return swapped ? right : left;
  };
}

function legalSpots(step = 0.01): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let x = -0.27; x <= 0.27 + 1e-9; x += step) {
    for (let z = BOARD.zMin - 0.06; z <= BOARD.zMax + 0.06 + 1e-9; z += step) {
      let keeperDistance = Math.hypot(x - L.x, z - L.z);
      for (const k of LEVEL_1.keepers) keeperDistance = Math.min(keeperDistance, Math.hypot(x - k.x, z - k.z));
      const v = judgeRegistration({ x, y: 0.2, z, pointing: true, board: BOARD, routeDistance: distanceToPolyline(x, z, LEVEL_1.route), keeperDistance });
      if (v === 'ok') out.push({ x, z });
    }
  }
  return out;
}

// ------------------------------------------------- the gaze itself

test('the gaze: a narrow stretch in the middle of the lit path (both ends of the light stay outside it)', () => {
  assert.equal(GAZE_HALF, (10 * Math.PI) / 180);
  assert.ok(GAZE.count > 20, `samples ${GAZE.count}`);
  const at = [0, 0, 0];
  ROUTE.at(GAZE.s0, at);
  const x0 = at[0];
  ROUTE.at(GAZE.s1, at);
  assert.ok(x0 > -0.04 && x0 < -0.02 && at[0] > 0.02 && at[0] < 0.04, `gaze from x ${x0} to ${at[0]}`);
  assert.equal(LEVEL_2.needsObject, true);
  assert.equal(LEVEL_1.needsObject, false, 'level 1 unchanged');
  assert.deepEqual([LEVEL_2.lanterns, LEVEL_2.route, LEVEL_2.keepers], [LEVEL_1.lanterns, LEVEL_1.route, LEVEL_1.keepers], 'same board, light and path');
});

test('any hand that shades a point of the path inside the gaze wakes the keeper (no hand shades it unnoticed)', () => {
  // Every still pose on a grid, both hands' chirality, three heights: whenever a hand casts shadow on
  // any route point inside the gaze (exact creature test at 1 mm steps), the 2 mm-sampled wake test fires.
  const at = [0, 0, 0];
  let shading = 0;
  for (let x = -0.12; x <= 0.12 + 1e-9; x += 0.01) for (let z = -0.09; z <= 0.07 + 1e-9; z += 0.01) {
    for (const make of [stopHand, rightStop, edgeHand, flatHand]) for (const y of [0, 0.02, 0.05]) {
      const j = make(x, y, z);
      const occ = new Occluders();
      addHandCapsules(j, null, 1, occ);
      let shades = false;
      for (let s = GAZE.s0; s <= GAZE.s1 && !shades; s += 0.001) {
        ROUTE.at(s, at);
        shades = look(L, occ, at[0], CREATURE_Y, at[1], { state: DARK, by: BY_NONE }).state === SHADOW;
      }
      if (shades) {
        shading++;
        assert.ok(GAZE.handIn(j, null), `${make.name || 'rightStop'} at ${x.toFixed(2)}, ${y}, ${z.toFixed(2)} shades the gaze unnoticed`);
      }
    }
  }
  assert.ok(shading > 200, `poses that shade the gaze: ${shading}`);
});

test('the ghost spots (±1 cm, either hand, 7 and 11 mm joint radii) keep clear of the gaze; level 2\'s spots sit outside level 1\'s', () => {
  for (const r of [0, 0.011]) {
    const rad = r ? new Float32Array(25).fill(r) : null;
    for (const make of STOPS) for (const spot of [L2_LEFT, L2_RIGHT]) for (const dx of [-0.01, 0, 0.01]) for (const dz of [-0.01, 0, 0.01]) {
      const j = make(spot.x + dx, WY, spot.z + dz);
      assert.equal(GAZE.handIn(j, rad), false, `${make.name || 'rightStop'} at ${spot.x + dx}, ${spot.z + dz}, radius ${r}`);
      assert.equal(handAtLantern([j], [true], L), -1);
    }
  }
  // known: with 14 mm radii, 1 cm inward and 1 cm toward the lantern (thumb in) touches the gaze
  const thick = new Float32Array(25).fill(0.014);
  assert.equal(GAZE.handIn(stopHand(L2_LEFT.x + 0.01, WY, L2_LEFT.z - 0.01), thick), true);
  assert.ok(Math.abs(L2_LEFT.x) > Math.abs(TEACH_SPOT.x));
});

// ------------------------------------------------- the three claims

test('level 2 cannot be won without a registered object: no still hand, no careful or heedless slide, either hand', () => {
  for (let x = -0.15; x <= 0.15 + 1e-9; x += 0.015) for (let z = -0.1; z <= 0.06 + 1e-9; z += 0.015) {
    for (const make of [stopHand, rightStop, edgeHand, flatHand]) for (const y of [0, 0.03]) {
      const r = play(still(make(x, y, z)), [], { seconds: 5 });
      assert.equal(r.home, false, `${make.name || 'rightStop'} still at ${x.toFixed(3)}, ${y}, ${z.toFixed(3)}`);
    }
  }
  for (const make of STOPS) for (const cm of [1, 3, 6, 9]) {
    assert.equal(play(careful(make, cm / 100), []).home, false, `careful ${cm} cm/s`);
    assert.equal(play(heedless(make, cm / 100), []).home, false, `heedless ${cm} cm/s`);
  }
  // The same careful slide with level 1's rules (no gaze) does win: the gaze is what makes the object necessary.
  assert.equal(play(careful(stopHand), [], { gaze: false }).home, true);
});

test('the object alone: it shades the gaze and part of the light (0 < lit < 1), never all of the path; no single legal object wins alone', () => {
  const occ = new Occluders();
  occ.addCylinder(MUG.x, MUG.z, REGISTER.radius, MUG.top, 10);
  assert.equal(GAZE.coveredBy(occ), true, 'the mug on the ghost mug covers the gaze');
  const map = new LightMap();
  map.update(L, occ, CREATURE_Y);
  const empty = new LightMap();
  empty.update(L, new Occluders(), CREATURE_Y);
  assert.ok(map.litFraction > 0 && map.litFraction < 1 && map.litFraction < empty.litFraction - 0.1, `lit ${map.litFraction} (empty ${empty.litFraction})`);
  // both ends of the lit path stay lit
  const at = [0, 0, 0];
  let litLeft = false, litRight = false;
  for (let s = 0; s <= ROUTE.length; s += 0.002) {
    ROUTE.at(s, at);
    if (look(L, occ, at[0], CREATURE_Y, at[1], { state: DARK, by: BY_NONE }).state !== SEEN) continue;
    if (at[0] < 0) litLeft = true;
    else litRight = true;
  }
  assert.ok(litLeft && litRight, 'both ends of the path still lit');
  assert.equal(play(() => null, [MUG]).home, false);
  // every legal spot (1 cm grid), as tall as registration allows: never home alone
  const spots = legalSpots();
  assert.ok(spots.length > 1000, `legal spots ${spots.length}`);
  for (const p of spots) {
    const r = play(() => null, [{ ...p, top: REGISTER.maxHeight }], { seconds: 6 });
    assert.equal(r.home, false, `object alone at ${p.x.toFixed(2)}, ${p.z.toFixed(2)} won`);
  }
});

test('a win requires the combination: hand + object wins unspotted (a careful slide, or a still hand at each ghost with 11 mm joints); either alone does not; a hand slid into the gaze wakes the keeper', () => {
  for (const make of STOPS) {
    const r = play(careful(make), [MUG]);
    assert.equal(r.home, true, `careful + mug (${make.name || 'rightStop'})`);
    assert.equal(r.spotted, 0);
    assert.equal(r.woke, 0, 'the keeper never woke');
    const two = play(twoSpots(make), [MUG], { radius: 0.011 });
    assert.equal(two.home, true, `the two ghosts + mug, 11 mm radii (${make.name || 'rightStop'})`);
    assert.equal(two.woke, 0);
    assert.equal(play(careful(make), []).home, false, 'hand alone');
    const heed = play(heedless(make), [MUG]);
    assert.equal(heed.home, false, 'slid into the gaze');
    assert.ok(heed.woke > 0 && heed.spotted > 0, `woke ${heed.woke}, spotted ${heed.spotted}`);
  }
  assert.equal(play(() => null, [MUG]).home, false, 'object alone');
  // Where the object may stand: a window around the ghost mug, not just one point (careful player, right hand).
  let wins = 0;
  for (const dx of [-0.01, 0, 0.01]) for (const dz of [-0.01, 0, 0.01]) if (play(careful(rightStop), [{ x: MUG.x + dx, z: MUG.z + dz, top: MUG.top }]).home) wins++;
  assert.equal(wins, 9, `wins with the mug moved ±1 cm: ${wins}/9`);
});

test('level 2 counts one object: a new registration replaces it (two objects could stand in for the hand)', () => {
  // Why: two legal objects can shade the whole path between them, so with two the hand would not be needed.
  const two = [{ x: -0.06, z: -0.02, top: 0.3 }, { x: 0.02, z: -0.02, top: 0.3 }];
  assert.equal(play(() => null, two).home, true, 'two objects win alone in the model');
  const objs = new Float32Array(12);
  objs.set([-0.1, 0, 0.2, 0.02, -0.02, 0.2]);
  assert.deepEqual(objectSlot(true, objs, 1, 0.12, 0, REGISTER.replace, 4), { slot: 0, count: 1, shift: false });
  assert.deepEqual(objectSlot(true, objs, 0, 0, 0, REGISTER.replace, 4), { slot: 0, count: 1, shift: false });
  // level 1 as before: replace one touched again, add, or drop the oldest
  assert.deepEqual(objectSlot(false, objs, 2, 0.03, -0.02, REGISTER.replace, 4), { slot: 1, count: 2, shift: false });
  assert.deepEqual(objectSlot(false, objs, 2, 0.2, 0.1, REGISTER.replace, 4), { slot: 2, count: 3, shift: false });
  assert.deepEqual(objectSlot(false, objs, 4, 0.2, 0.1, REGISTER.replace, 4), { slot: 3, count: 4, shift: true });
});

// ------------------------------------------------- unlocking, cards, /emu/

test('unlock: level 2 after a level-1 win, starting at a round boundary once an object is registered; ?level=2 starts there', () => {
  const p = new LevelProgress();
  assert.deepEqual([p.level, p.unlocked], [1, false]);
  assert.equal(p.update(1, true), false, 'an object before any win: still level 1');
  p.onWin();
  assert.equal(p.unlocked, true);
  assert.equal(p.update(0, true), false, 'no object: level 1 plays on');
  assert.equal(p.update(1, false), false, 'not mid-round');
  assert.equal(p.update(1, true), true);
  assert.equal(p.level, 2);
  assert.equal(p.update(0, true), false, 'level 2 stays when the object is gone (the card says so)');
  assert.equal(p.level, 2);
  assert.equal(startLevel('?level=2&test=1'), 2);
  assert.equal(startLevel('?test=1'), 1);
  assert.deepEqual([new LevelProgress(2).level, new LevelProgress(2).unlocked], [2, true]);
});

const base: CueInput = { placement: 'desk', placed: true, listening: true, moveRequested: false, everDashed: true, paused: false, leading: false };

test('cards: level 1 unchanged until a win; then it names what level 2 needs; level 2 says honestly when the object is missing or off the gaze', () => {
  // level 1, before the unlock: the day-5 cards
  assert.equal(firstRunCues({ ...base, everDashed: false }).prompt, 'teach');
  assert.equal(firstRunCues({ ...base, leading: true }).prompt, 'slide');
  assert.equal(firstRunCues({ ...base, again: true }).prompt, 'again');
  assert.equal(firstRunCues({ ...base, again: true }).gaze, false);
  assert.equal(firstRunCues({ ...base, again: true, unlocked: true, objects: 0 }).prompt, 'again', 'the day-5 "again" card first');
  // unlocked, no object yet
  const un = firstRunCues({ ...base, unlocked: true, objects: 0 });
  assert.deepEqual([un.prompt, un.gaze, un.mugGhost], ['unlocked', true, true]);
  assert.equal(firstRunCues({ ...base, unlocked: true, objects: 0, spotted: true }).prompt, 'spotted', 'play comes first');
  const l2 = { ...base, unlocked: true, level: 2 };
  const need = firstRunCues({ ...l2, objects: 0 });
  assert.deepEqual([need.prompt, need.ghost, need.mugGhost], ['need-object', false, true]);
  assert.match(PROMPT_LINES['need-object'].join(' '), /needs a real mug or book/);
  assert.equal(firstRunCues({ ...l2, objects: 1, mugCovers: false }).prompt, 'mug-off');
  const teach = firstRunCues({ ...l2, objects: 1, mugCovers: true });
  assert.deepEqual([teach.prompt, teach.ghost, teach.ghostSpot, teach.mugGhost], ['l2-teach', true, 'left', false]);
  const swap = firstRunCues({ ...l2, objects: 1, mugCovers: true, pastGaze: true });
  assert.deepEqual([swap.prompt, swap.ghostSpot], ['l2-swap', 'right']);
  assert.equal(firstRunCues({ ...l2, objects: 1, mugCovers: true, gazeWake: true, awake: true }).prompt, 'gaze');
  assert.equal(firstRunCues({ ...l2, objects: 1, mugCovers: true, awake: true }).prompt, 'too-close');
  assert.equal(firstRunCues({ ...l2, objects: 0, paused: true }).prompt, 'waits');
  const again = firstRunCues({ ...l2, objects: 1, mugCovers: true, again: true, l2Won: true });
  assert.deepEqual([again.prompt, again.ghostSpot], ['again', 'left']);
  assert.equal(firstRunCues({ ...l2, objects: 1, mugCovers: true, l2Won: true }).prompt, 'none');
  for (const k of ['unlocked', 'need-object', 'mug-off', 'gaze', 'l2-teach', 'l2-swap'] as const) {
    for (const line of PROMPT_LINES[k]) assert.ok(line.replace('!', '').length <= 33, `card line too long: ${line}`);
  }
});

test('/emu/: O\'s emulated mug passes the registration rules and covers the gaze; H and R stand the hand at level 2\'s ghosts', () => {
  let keeperDistance = Math.hypot(EMU_MUG.x - L.x, EMU_MUG.z - L.z);
  for (const k of LEVEL_1.keepers) keeperDistance = Math.min(keeperDistance, Math.hypot(EMU_MUG.x - k.x, EMU_MUG.z - k.z));
  const v = judgeRegistration({ x: EMU_MUG.x, y: EMU_MUG.top + 0.008, z: EMU_MUG.z, pointing: true, board: BOARD, routeDistance: distanceToPolyline(EMU_MUG.x, EMU_MUG.z, LEVEL_1.route), keeperDistance });
  assert.equal(v, 'ok');
  const occ = new Occluders();
  occ.addCylinder(EMU_MUG.x, EMU_MUG.z, REGISTER.radius, EMU_MUG.top, 10);
  assert.equal(GAZE.coveredBy(occ), true);
  assert.equal(GAZE.coveredBy(new Occluders()), false, 'nothing registered covers nothing');
  // a mug beside the gaze covers part of it, not all: the card says "the mug must cover the gaze"
  const side = new Occluders();
  side.addCylinder(0.05, -0.03, REGISTER.radius, 0.1, 10);
  let some = 0;
  for (let i = 0; i < GAZE.count; i++) if (look(L, side, GAZE.samples[2 * i], CREATURE_Y, GAZE.samples[2 * i + 1], { state: DARK, by: BY_NONE }).state === SHADOW) some++;
  assert.ok(some > 0 && some < GAZE.count, `covered ${some}/${GAZE.count}`);
  assert.equal(GAZE.coveredBy(side), false);
  assert.deepEqual([seatSpotX(2, 'h'), seatSpotX(2, 'r'), seatSpotX(1, 'h')], [L2_LEFT.x, L2_RIGHT.x, STOP.x]);
  assert.equal(MODE_NOOK, 0);
});
