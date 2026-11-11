/**
 * Labelled case set for the main claim: "your real hand (or a registered
 * object) between the lantern and the creature hides it; anything else
 * doesn't".
 *
 * Each case is a hand pose (the synthetic 25-joint hands from hand-fixture.ts)
 * or an object, placed in the level-1 board frame, and a creature position on
 * the desk. The expected verdict was written from the geometry before the
 * test ran (the "why" column), not copied from the code's output. Positive
 * cases expect SHADOW; negative controls expect SEEN (the hand is there but
 * not in the way) or DARK (the creature is outside the light).
 *
 * Geometry used for the labels: the lantern sits at (0, 7.5 cm, −10.5 cm) and
 * lights a 76° fan, 28 cm long, toward the user (+z). The creature's body
 * centre is 1.2 cm above the desk and its path runs at z ≈ 6–6.5 cm, so a
 * sight line to the middle of the path passes about 5.8 cm above the desk at
 * z = −6 cm (4.5 cm in front of the lantern), 4.5 cm above it at z = −2.5 cm and 4 cm above it at
 * z = −1 cm.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLEEP_RADIUS, WAKE_RADIUS, nearestJointToLantern } from '../src/feedback.ts';
import { addHandCapsules } from '../src/hand-proxy.ts';
import { CREATURE_Y, LEVEL_1 } from '../src/level.ts';
import { BY_NONE, DARK, Occluders, SEEN, SHADOW, look, type SightResult } from '../src/sightline.ts';
import { edgeHand, flatHand, makeHand, stopHand } from './hand-fixture.ts';

const L = LEVEL_1.lanterns[0];

/** A fist held upright: fingers up, all four curled into the palm. */
const fist = (x: number, y: number, z: number) =>
  makeHand({ wrist: [x, y, z], u: [0, 1, 0], v: [1, 0, 0], n: [0, 0, -1], curl: [0, 1, 2, 3] });

type Expect = 'shadow' | 'seen' | 'dark';
interface Case {
  id: string;
  why: string;
  /** Creature position on the desk (board frame x, z). */
  at: [number, number];
  hands?: { joints: Float32Array; owner: number }[];
  objects?: { x: number; z: number; r: number; top: number; owner: number }[];
  expect: Expect;
  /** For shadow cases: which owner should be reported. */
  by?: number;
}

export const CASES: Case[] = [
  // ---- positive: something real stands in the sight line
  // Day 7: P1–P3 and P6–P8 stood 4.5 cm in front of the lantern (z −6 cm), where the day-5 wake rule
  // wakes the keeper in the game. They now stand 8 cm in front of it (z −2.5 cm, the ghost's depth), every
  // joint more than 7 cm from the lantern (test below), so the verdict here is also the game's.
  { id: 'P1', expect: 'shadow', by: 1, at: [0, 0.065], hands: [{ joints: stopHand(0, 0.02, -0.025), owner: 1 }],
    why: "'stop' palm 8 cm in front of the lantern; the line crosses it at y≈4.5 cm, inside the palm (2–19 cm)" },
  { id: 'P2', expect: 'shadow', by: 1, at: [-0.1, 0.064], hands: [{ joints: stopHand(-0.05, 0.02, -0.025), owner: 1 }],
    why: 'a palm 5 cm left of centre; the line to a point 10 cm left on the path crosses z=−2.5 cm at x≈−4.7 cm, on the palm (x −7.7…−2.4 cm)' },
  { id: 'P3', expect: 'shadow', by: 1, at: [0.1, 0.064], hands: [{ joints: stopHand(0.05, 0.02, -0.025), owner: 1 }],
    why: 'mirror of P2: the line crosses at x≈+4.7 cm, on a palm 5 cm right of centre (x +2.3…+7.6 cm)' },
  { id: 'P4', expect: 'shadow', by: 1, at: [0, 0.065], hands: [{ joints: edgeHand(-0.08, 0.045, -0.03), owner: 1 }],
    why: 'hand on its little-finger side, fingers along x from −8 to +9 cm at z=−3 cm, 4.5 cm up: a wall across the line (y≈4.7 cm there)' },
  { id: 'P5', expect: 'shadow', by: 1, at: [0, 0.065], hands: [{ joints: flatHand(-0.09, 0.015, 0.035), owner: 1 }],
    why: 'flat hand lying beside the path at z=+3.5 cm; the line is only ~2.3 cm high there, below the back of the hand' },
  { id: 'P6', expect: 'shadow', by: 1, at: [0, 0.065], hands: [{ joints: fist(0, 0.03, -0.025), owner: 1 }],
    why: 'a fist held up at z=−2.5 cm spans y≈3–11 cm around x=0; the line passes at 4.5 cm' },
  { id: 'P7', expect: 'shadow', by: 0, at: [-0.1, 0.064],
    hands: [{ joints: stopHand(-0.05, 0.02, -0.025), owner: 0 }, { joints: stopHand(0.07, 0.02, -0.025), owner: 1 }],
    why: 'two hands: the left palm (x −7.7…−2.4 cm) covers the line to the left point (x≈−4.7 cm at the palm); it is reported as the left hand' },
  { id: 'P8', expect: 'shadow', by: 1, at: [0.1, 0.064],
    hands: [{ joints: stopHand(-0.05, 0.02, -0.025), owner: 0 }, { joints: stopHand(0.04, 0.02, -0.025), owner: 1 }],
    why: 'two hands: the right palm (x +1.3…+6.6 cm) covers the line to the right point (x≈+4.7 cm)' },
  { id: 'P9', expect: 'shadow', by: 10, at: [0.1, 0.064], objects: [{ x: 0.06, z: -0.01, r: 0.04, top: 0.09, owner: 10 }],
    why: 'a 9 cm mug at (6, −1) cm: the line to (10, 6.4) passes x≈5.6 cm at z=−1 cm, 4 cm high, inside the 8 cm-wide column' },

  // ---- negative controls: a hand is there, but not between the lantern and the creature
  { id: 'N1', expect: 'seen', at: [0, 0.065],
    why: 'no hand at all: the middle of the path is lit (light-on control)' },
  { id: 'N2', expect: 'seen', at: [-0.1, 0.064], hands: [{ joints: stopHand(0.06, 0.02, -0.06), owner: 1 }],
    why: 'palm 6 cm to the right (x 3…9 cm); the line to the left point crosses at x≈−2.6 cm, beside it' },
  { id: 'N3', expect: 'seen', at: [0, 0.065], hands: [{ joints: flatHand(-0.09, 0.015, -0.06), owner: 1 }],
    why: 'flat hand lying low near the lantern (top ≈2.6 cm); the line passes over it at 5.8 cm, as real light would' },
  { id: 'N4', expect: 'seen', at: [0, 0.065], hands: [{ joints: stopHand(0, 0.02, 0.1), owner: 1 }],
    why: "'stop' palm on the far side of the creature (z=+10 cm, toward the user): behind it, not in front of the light" },
  { id: 'N5', expect: 'seen', at: [0, 0.065], hands: [{ joints: stopHand(0, 0.2, -0.06), owner: 1 }],
    why: 'the same palm lifted 20 cm: the wrist is above the line, the light passes under the hand' },
  { id: 'N6', expect: 'seen', at: [0, 0.065], hands: [{ joints: stopHand(0, 0.02, -0.15), owner: 1 }],
    why: 'palm behind the lantern (z=−15 cm): not between the light and the path' },
  { id: 'N7', expect: 'seen', at: [0.1, 0.064], objects: [{ x: 0.06, z: -0.01, r: 0.04, top: 0.015, owner: 10 }],
    why: 'a 1.5 cm-tall object where the mug was: the line is at least ~2.5 cm high over its footprint' },
  { id: 'N8', expect: 'dark', at: [-0.19, 0.06],
    why: 'the nook: 63° off the lantern axis, outside the 38° half-angle (no light, nothing to hide)' },
  { id: 'N9', expect: 'dark', at: [0, 0.2],
    why: 'beyond the light: 30.5 cm from the lantern, past the 28 cm range' },
];

function verdict(c: Case): SightResult {
  const occ = new Occluders();
  for (const h of c.hands ?? []) addHandCapsules(h.joints, null, h.owner, occ);
  for (const o of c.objects ?? []) occ.addCylinder(o.x, o.z, o.r, o.top, o.owner);
  return look(L, occ, c.at[0], CREATURE_Y, c.at[1], { state: DARK, by: BY_NONE });
}

const NAME = { [SEEN]: 'seen', [SHADOW]: 'shadow', [DARK]: 'dark' } as Record<number, Expect>;

test('line-of-sight case set: every labelled case gets its expected verdict', () => {
  const rows: string[] = [];
  let pass = 0;
  for (const c of CASES) {
    const r = verdict(c);
    const got = NAME[r.state];
    const ok = got === c.expect && (c.expect !== 'shadow' || c.by === undefined || r.by === c.by);
    if (ok) pass++;
    rows.push(`${ok ? 'PASS' : 'FAIL'} ${c.id} expect ${c.expect}${c.by !== undefined ? `/${c.by}` : ''} got ${got}${got === 'shadow' ? `/${r.by}` : ''}  ${c.why}`);
  }
  const neg = CASES.filter((c) => c.expect !== 'shadow').length;
  console.log(`  line-of-sight case set: ${pass}/${CASES.length} (${CASES.length - neg} cover cases, ${neg} negative controls)`);
  const failed = rows.filter((r) => r.startsWith('FAIL'));
  assert.equal(failed.length, 0, '\n' + failed.join('\n'));
});

test('every hand in a cover case stands outside the keeper\'s wake radius, with room to spare (so the game agrees with the case set)', () => {
  // Day 7 (outside review): six of the nine cover cases stood where the day-5 wake rule wakes the keeper,
  // who then sees the whole path: the case set tested the sight function, not the game.
  let hands = 0;
  for (const c of CASES.filter((k) => k.expect === 'shadow')) {
    for (const h of c.hands ?? []) {
      hands++;
      const d = nearestJointToLantern(h.joints, L);
      assert.ok(d > SLEEP_RADIUS, `${c.id}: nearest joint ${(d * 100).toFixed(2)} cm from the lantern (wakes at ${WAKE_RADIUS * 100}, sleeps beyond ${SLEEP_RADIUS * 100})`);
    }
  }
  assert.equal(hands, 10, 'hands in the cover cases (P7 and P8 have two)');
});
