import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addHandCapsules,
  classifyPose,
  isPointingDown,
  HAND_CAPSULES,
  POSE_EDGE,
  POSE_FLAT,
  POSE_STOP,
  type PoseInfo,
} from '../src/hand-proxy.ts';
import { CREATURE_Y, LEVEL_1, Route } from '../src/level.ts';
import { LightMap, MAP_COLS, MAP_MIN_D, MAP_ROWS } from '../src/light-map.ts';
import {
  BY_NONE,
  DARK,
  Occluders,
  SEEN,
  SHADOW,
  azimuth,
  blockedBy,
  inCone,
  look,
  segHitsCylinder,
  segSegDist2,
  type SightResult,
} from '../src/sightline.ts';
import { edgeHand, flatHand, pointingHand, stopHand } from './hand-fixture.ts';

const L = LEVEL_1.lanterns[0];
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

// ------------------------------------------------------------- primitives

test('segSegDist2: crossing, parallel, skew and endpoint cases', () => {
  // crossing in the same plane
  assert.ok(near(segSegDist2(-1, 0, 0, 1, 0, 0, 0, -1, 0, 0, 1, 0), 0));
  // parallel, 0.5 apart, overlapping
  assert.ok(near(segSegDist2(0, 0, 0, 1, 0, 0, 0.2, 0.5, 0, 2, 0.5, 0), 0.25));
  // skew lines 0.3 apart in z
  assert.ok(near(segSegDist2(-1, 0, 0, 1, 0, 0, 0, -1, 0.3, 0, 1, 0.3), 0.09));
  // closest points at the endpoints (segments end before they would cross)
  assert.ok(near(segSegDist2(0, 0, 0, 1, 0, 0, 2, -1, 0, 2, 1, 0), 1));
  // degenerate: two points
  assert.ok(near(segSegDist2(0, 0, 0, 0, 0, 0, 3, 4, 0, 3, 4, 0), 25));
});

test('segHitsCylinder: through, over the top, beside, and stopping short', () => {
  // horizontal line at 2 cm through a cylinder 5 cm tall
  assert.equal(segHitsCylinder(-0.2, 0.02, 0, 0.2, 0.02, 0, 0, 0, 0.04, 0.05), true);
  // same line at 6 cm passes over it
  assert.equal(segHitsCylinder(-0.2, 0.06, 0, 0.2, 0.06, 0, 0, 0, 0.04, 0.05), false);
  // beside it (5 cm away, radius 4 cm)
  assert.equal(segHitsCylinder(-0.2, 0.02, 0.05, 0.2, 0.02, 0.05, 0, 0, 0.04, 0.05), false);
  // stops 2 cm before the cylinder
  assert.equal(segHitsCylinder(-0.2, 0.02, 0, -0.06, 0.02, 0, 0, 0, 0.04, 0.05), false);
  // descending line that enters the cylinder's footprint only above its top
  assert.equal(segHitsCylinder(-0.2, 0.2, 0, 0.0, 0.06, 0, 0, 0, 0.04, 0.05), false);
  // descending line that dips below the top inside the footprint
  assert.equal(segHitsCylinder(-0.2, 0.2, 0, 0.0, 0.03, 0, 0, 0, 0.04, 0.05), true);
});

test('cone: azimuth is measured from the lantern facing, range and half-angle bound it', () => {
  assert.ok(near(azimuth(L, 0, 0.1), 0));
  assert.ok(inCone(L, 0, 0.06));
  assert.equal(inCone(L, 0, L.z + L.range + 0.01), false, 'beyond range');
  // the route ends sit just outside the light (that is where the nook and the trinket are)
  assert.equal(inCone(L, -0.19, 0.06), false);
  assert.equal(inCone(L, 0.19, 0.06), false);
  assert.equal(inCone(L, 0, L.z - 0.05), false, 'behind the keeper');
});

test('blockedBy: capsule radius is the boundary, owners are reported', () => {
  const occ = new Occluders();
  // a capsule standing 1 cm beside a line, radius 0.0099 → clear; radius 0.0101 → blocked
  occ.addCapsule(0, 0, 0.01, 0, 0.1, 0.01, 0.0099, 3);
  assert.equal(blockedBy(occ, -0.2, 0.05, 0, 0.2, 0.05, 0), BY_NONE);
  occ.clear();
  occ.addCapsule(0, 0, 0.01, 0, 0.1, 0.01, 0.0101, 3);
  assert.equal(blockedBy(occ, -0.2, 0.05, 0, 0.2, 0.05, 0), 3);
  occ.addCylinder(0.1, 0, 0.04, 0.08, 12);
  occ.clear();
  occ.addCylinder(0.1, 0, 0.04, 0.08, 12);
  assert.equal(blockedBy(occ, -0.2, 0.05, 0, 0.2, 0.05, 0), 12);
});

test('blockedBy: the quick reject skips capsules above the line and never changes the answer', () => {
  const occ = new Occluders();
  occ.addCapsule(-0.1, 0.2, 0, 0.1, 0.2, 0, 0.01, 1); // far above
  assert.equal(blockedBy(occ, -0.2, 0.075, 0, 0.2, 0.012, 0), BY_NONE);
  // a capsule whose lower end dips into the line must still block
  occ.addCapsule(0, 0.3, 0, 0, 0.03, 0, 0.01, 2);
  assert.equal(blockedBy(occ, -0.2, 0.075, 0, 0.2, 0.012, 0), 2);
});

// ------------------------------------------------------------- the hand as cover

function routePoint(x: number): [number, number, number] {
  const r = new Route(LEVEL_1.route);
  // find s for this x by walking (route is monotone in x)
  const out = [0, 0, 0];
  for (let s = 0; s <= r.length; s += 0.0005) {
    r.at(s, out);
    if (out[0] >= x) break;
  }
  return [out[0], CREATURE_Y, out[1]];
}

function sightThrough(joints: Float32Array, px: number, pz: number): SightResult {
  const occ = new Occluders();
  addHandCapsules(joints, null, 1, occ);
  return look(L, occ, px, CREATURE_Y, pz, { state: DARK, by: BY_NONE });
}

test('hand proxy: 25 joints become 30 capsules (24 bones + 6 palm webs)', () => {
  const occ = new Occluders();
  assert.equal(addHandCapsules(stopHand(0, 0.02, -0.06), null, 0, occ), HAND_CAPSULES);
  assert.equal(occ.capsuleCount, 30);
});

test('pose-agnostic: an edge-on wall and a "stop" palm both shade the middle of the path', () => {
  const [px, , pz] = routePoint(0);
  assert.equal(look(L, new Occluders(), px, CREATURE_Y, pz, { state: DARK, by: BY_NONE }).state, SEEN, 'lit without a hand');
  const edge = sightThrough(edgeHand(-0.08, 0.045, -0.03), px, pz);
  assert.equal(edge.state, SHADOW, 'edge-on hand');
  assert.equal(edge.by, 1);
  assert.equal(sightThrough(stopHand(0, 0.02, -0.06), px, pz).state, SHADOW, 'stop palm');
});

test('a flat hand casts a short shadow: it hides the creature right behind it, not from near the lantern', () => {
  const [px, , pz] = routePoint(0);
  // flat on the desk close to the path: the light comes in low over it → shaded
  assert.equal(sightThrough(flatHand(-0.09, 0.015, 0.035), px, pz).state, SHADOW, 'flat hand next to the path');
  // flat near the lantern: the light passes over the back of the hand → still seen
  assert.equal(sightThrough(flatHand(-0.09, 0.015, -0.06), px, pz).state, SEEN, 'flat hand near the lantern');
});

test('spread fingers leave gaps the light passes through; closed fingers do not', () => {
  // a stop palm close to the lantern, the target behind the gap between middle and ring fingers
  const closed = stopHand(0, 0.0, -0.075, 1);
  const spread = stopHand(0, 0.0, -0.075, 2.6);
  const occClosed = new Occluders();
  const occSpread = new Occluders();
  addHandCapsules(closed, null, 1, occClosed);
  addHandCapsules(spread, null, 1, occSpread);
  // aim through the gap: from the lantern toward the point midway between the
  // spread middle (x≈+0.021) and ring (x≈−0.026) fingertips at fingertip height
  let gapsFound = 0;
  for (let x = -0.03; x <= 0.03; x += 0.0025) {
    // a target point on the line from the lantern through (x, 0.16, −0.075), behind the hand
    const t = 2;
    const tx = L.x + (x - L.x) * t;
    const ty = L.y + (0.16 - L.y) * t;
    const tz = L.z + (-0.075 - L.z) * t;
    const a = blockedBy(occClosed, L.x, L.y, L.z, tx, ty, tz);
    const b = blockedBy(occSpread, L.x, L.y, L.z, tx, ty, tz);
    assert.notEqual(a, BY_NONE, `closed fingers block at x=${x.toFixed(4)}`);
    if (b === BY_NONE) gapsFound++;
  }
  assert.ok(gapsFound >= 1, `spread fingers let light through somewhere (${gapsFound})`);
});

test('pose classes: flat, edge, stop; pointing down is detected only for a pointing hand', () => {
  const info: PoseInfo = { pose: 0, normalY: 0, fingerY: 0 };
  assert.equal(classifyPose(flatHand(0, 0.015, 0), info).pose, POSE_FLAT);
  assert.equal(classifyPose(edgeHand(0, 0.045, 0), info).pose, POSE_EDGE);
  assert.equal(classifyPose(stopHand(0, 0.02, 0), info).pose, POSE_STOP);
  assert.equal(isPointingDown(pointingHand(0, 0.1, 0)), true);
  assert.equal(isPointingDown(flatHand(0, 0.015, 0)), false, 'flat hand');
  assert.equal(isPointingDown(edgeHand(0, 0.045, 0)), false, 'edge hand');
  assert.equal(isPointingDown(stopHand(0, 0.02, 0)), false, 'stop hand');
});

// ------------------------------------------------------------- light map

test('light map: all lit without cover; equals the sight test at every cell centre with a hand and an object', () => {
  const map = new LightMap();
  const empty = new Occluders();
  map.update(L, empty, CREATURE_Y, true);
  assert.equal(map.litFraction, 1);

  const occ = new Occluders();
  addHandCapsules(stopHand(0.02, 0.02, -0.06), null, 1, occ);
  addHandCapsules(edgeHand(-0.16, 0.045, 0.0), null, 0, occ);
  occ.addCylinder(0.12, -0.02, 0.04, 0.09, 10);
  map.update(L, occ, CREATURE_Y, true);
  assert.ok(map.litFraction < 0.9 && map.litFraction > 0.1, `lit ${map.litFraction}`);
  const res: SightResult = { state: DARK, by: BY_NONE };
  let checked = 0;
  for (let c = 0; c < MAP_COLS; c++) {
    for (let r = 0; r < MAP_ROWS; r++) {
      const az = -L.half + ((c + 0.5) / MAP_COLS) * 2 * L.half;
      const d = MAP_MIN_D + ((r + 0.5) / MAP_ROWS) * (L.range - MAP_MIN_D);
      const px = L.x + Math.sin(L.yaw + az) * d;
      const pz = L.z + Math.cos(L.yaw + az) * d;
      const want = look(L, occ, px, CREATURE_Y, pz, res).state === SEEN ? 255 : 0;
      assert.equal(map.data[(r * MAP_COLS + c) * 4], want, `cell ${c},${r}`);
      checked++;
    }
  }
  assert.equal(checked, MAP_COLS * MAP_ROWS);
});

test('light map: two half refreshes equal one full refresh', () => {
  const occ = new Occluders();
  addHandCapsules(stopHand(-0.03, 0.02, -0.05), null, 1, occ);
  const a = new LightMap();
  const b = new LightMap();
  a.update(L, occ, CREATURE_Y, true);
  b.update(L, occ, CREATURE_Y);
  b.update(L, occ, CREATURE_Y);
  assert.deepEqual(Array.from(b.data), Array.from(a.data));
});

test('light map cost: a full refresh with two hands and four objects stays well under a frame', () => {
  const occ = new Occluders();
  addHandCapsules(stopHand(0.02, 0.02, -0.06), null, 1, occ);
  addHandCapsules(flatHand(-0.12, 0.015, 0.0), null, 0, occ);
  for (let i = 0; i < 4; i++) occ.addCylinder(-0.15 + i * 0.1, -0.03, 0.04, 0.09, 10 + i);
  const map = new LightMap();
  for (let i = 0; i < 20; i++) map.update(L, occ, CREATURE_Y, true); // warm up
  const n = 200;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) map.update(L, occ, CREATURE_Y); // the per-frame (half) refresh
  const ms = (performance.now() - t0) / n;
  console.log(`  light map half refresh: ${ms.toFixed(3)} ms (desktop Node)`);
  assert.ok(ms < 2, `${ms} ms`);
});

test('the palm stays solid when the fingers spread (palm webs)', () => {
  const occ = new Occluders();
  addHandCapsules(stopHand(0, 0.0, -0.075, 2.6), null, 1, occ);
  // rays through the palm just below the knuckle line, across its width
  for (let x = -0.03; x <= 0.03; x += 0.0025) {
    const tx = L.x + (x - L.x) * 2;
    const ty = L.y + (0.078 - L.y) * 2;
    const tz = L.z + (-0.075 - L.z) * 2;
    assert.notEqual(blockedBy(occ, L.x, L.y, L.z, tx, ty, tz), BY_NONE, `palm at x=${x.toFixed(4)}`);
  }
});
