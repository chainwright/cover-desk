import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COVER_WINDOW_S,
  CoverWatch,
  EV_PAUSE,
  EV_RESUME,
  EV_SPOTTED,
  MODE_PAUSED,
  newCreature,
  stepCreature,
  type CreatureWorld,
} from '../src/creature.ts';
import { POSE_FLAT } from '../src/hand-proxy.ts';
import { PROMPT_LINES, firstRunCues, type CueInput } from '../src/onboarding.ts';
import { COLUMNS, LOG_VERSION, TesterLogger, analyseLog } from '../src/touch-log.ts';

const DT = 1 / 72;

// ------------------------------------------------------------- first-run cues (fix 2)

const base: CueInput = { placement: 'desk', placed: true, listening: true, moveRequested: false, everDashed: false, paused: false, leading: false };

test('first run on the auto-desk path (still listening for a tap): ghost, teaching prompt, knob label, registration allowed', () => {
  const c = firstRunCues(base);
  assert.equal(c.ghost, true, 'ghost hand shows although listening');
  assert.equal(c.prompt, 'teach');
  assert.equal(c.promptOnBoard, true);
  assert.equal(c.knobLabel, true, '"tap & hold to move" is on the knob');
  assert.equal(c.canRegister, true, 'a mug can be registered without a desk tap first');
});

test('first run after a touch or anchor placement: the same cues', () => {
  for (const placement of ['touch', 'anchor'] as const) {
    const c = firstRunCues({ ...base, placement, listening: false });
    assert.deepEqual([c.ghost, c.prompt, c.knobLabel, c.canRegister], [true, 'teach', true, true], placement);
  }
});

test('the main prompt never carries the move instruction; the teaching copy is "stand your hand like stop right where the pale hand is" (day 7)', () => {
  for (const lines of Object.values(PROMPT_LINES)) {
    assert.ok(!lines.join(' ').toLowerCase().includes('to move it'), lines.join(' '));
  }
  const teach = PROMPT_LINES.teach.join(' ').replace(/!/g, '');
  // Chief 12.11 (judges r2: labels of 4 words or fewer): the copy is shorter, the instruction the same
  assert.equal(teach, "Hand up, like 'stop' on the pale hand");
  assert.ok(!teach.toLowerCase().includes('rest'), 'no "rest your hand"');
});

test('once the creature has stood in a hand shadow, the ghost, the prompt and the knob label go away', () => {
  const c = firstRunCues({ ...base, everDashed: true });
  assert.deepEqual([c.ghost, c.prompt, c.knobLabel, c.canRegister], [false, 'none', false, true]);
});

test('a knob move request: "tap the desk where you want it", no registration, no knob label', () => {
  const c = firstRunCues({ ...base, placement: 'touch', listening: true, moveRequested: true });
  assert.deepEqual([c.prompt, c.canRegister, c.knobLabel], ['tap-new-spot', false, false]);
});

test('paused (no hand): "it waits for your hand" wins over teaching, the ghost stays', () => {
  const c = firstRunCues({ ...base, paused: true });
  assert.deepEqual([c.prompt, c.ghost], ['waits', true]);
});

test('no desk yet: a board floating in the air asks for a desk tap, in front of the viewer (day 4: not while still searching)', () => {
  const s = firstRunCues({ ...base, placement: 'searching', placed: false });
  assert.deepEqual([s.prompt, s.ghost, s.canRegister], ['none', false, false]);
  const f = firstRunCues({ ...base, placement: 'fallback' });
  assert.deepEqual([f.prompt, f.promptOnBoard, f.ghost, f.canRegister, f.knobLabel], ['tap-desk', false, true, false, false]);
  const r = firstRunCues({ ...base, placement: 'restoring', placed: false });
  assert.equal(r.prompt, 'none', 'nothing while the saved spot is restored');
});

// ------------------------------------------------------------- cover-hand loss (fix 4)

/**
 * A creature mid-crossing, shaded by the right hand (1) while the left hand (0)
 * rests in view. The light covers [0.06, 0.32]; the shade is wherever the
 * right hand is, and it vanishes when that hand is lost or lifted.
 */
function scene() {
  const st = { tracked: [true, true], rightCovers: true, leftCovers: false };
  const shaded = () => (st.rightCovers && st.tracked[1]) || (st.leftCovers && st.tracked[0]);
  const w: CreatureWorld = {
    routeLength: 0.38,
    handPresent: true,
    seen: (s: number) => s >= 0.06 && s <= 0.32 && !shaded(),
  };
  const watch = new CoverWatch();
  const c = newCreature();
  let t = 0;
  const run = (seconds: number) => {
    const evs: number[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      t += DT;
      const exposed = w.seen(c.s);
      const shadeHand = !exposed && c.s >= 0.06 && c.s <= 0.32 ? (st.rightCovers && st.tracked[1] ? 1 : st.leftCovers && st.tracked[0] ? 0 : -1) : -1;
      w.handPresent = watch.update(t, st.tracked, shadeHand, exposed);
      const e = stepCreature(c, DT, w);
      if (e) evs.push(e);
    }
    return evs;
  };
  return { st, c, watch, run };
}

test('cover hand lost while the other hand is tracked: the creature waits, is not spotted, and resumes when the hand is back', () => {
  const { st, c, watch, run } = scene();
  run(1.2);
  assert.ok(c.s > 0.1 && c.s < 0.32, `mid-crossing in the shadow, s=${c.s}`);
  const s = c.s;
  st.tracked[1] = false; // the headset drops the right (covering) hand; the left is still tracked
  const evs = run(3);
  assert.deepEqual(evs, [EV_PAUSE]);
  assert.equal(c.mode, MODE_PAUSED);
  assert.equal(watch.waitingFor, 1);
  assert.equal(c.s, s, 'nothing moved');
  assert.equal(c.spottedCount, 0, 'not spotted by a tracking loss');
  st.tracked[1] = true; // the hand is back and shades again
  const back = run(0.5);
  assert.equal(back[0], EV_RESUME);
  assert.equal(c.spottedCount, 0);
  assert.ok(c.s > s, 'running again');
});

test('a covering hand lifted but still tracked gets it spotted (the rule is unchanged)', () => {
  const { st, c, run } = scene();
  run(1.2);
  st.rightCovers = false; // lifted out of the light, still tracked
  const evs = run(0.4);
  assert.ok(evs.includes(EV_SPOTTED));
  assert.ok(!evs.includes(EV_PAUSE));
});

test('after a cover-hand loss, the other hand taking over the shade resumes play', () => {
  const { st, c, watch, run } = scene();
  run(1.2);
  st.tracked[1] = false;
  run(1);
  assert.equal(c.mode, MODE_PAUSED);
  st.leftCovers = true; // the left hand moves in and shades it
  const evs = run(1);
  assert.ok(evs.includes(EV_RESUME));
  assert.equal(watch.waitingFor, -1);
  assert.equal(c.spottedCount, 0);
});

test('the lost cover hand comes back but out of the light: play resumes (grace), then the creature is spotted', () => {
  const { st, c, watch, run } = scene();
  run(1.2);
  st.tracked[1] = false;
  run(1);
  assert.equal(c.mode, MODE_PAUSED);
  st.rightCovers = false; // tracked again, but held away from the light
  st.tracked[1] = true;
  const evs = run(1);
  assert.equal(evs[0], EV_RESUME, 'not stuck waiting for a hand that is already back');
  assert.equal(watch.waitingFor, -1);
  assert.ok(evs.includes(EV_SPOTTED), 'judged again after the grace');
});

test('CoverWatch: a hand lost long after it last shaded the creature does not pause; both hands lost always does', () => {
  const w = new CoverWatch();
  assert.equal(w.update(0, [true, true], 1, false), true);
  assert.equal(w.update(COVER_WINDOW_S + 0.05, [true, false], -1, true), true, 'outside the window: not its cover any more');
  assert.equal(w.update(1, [false, false], -1, true), false);
  const x = new CoverWatch();
  x.update(0, [true, true], 1, false);
  assert.equal(x.update(0.1, [true, false], -1, false), true, 'out of the light: nothing at risk, no pause');
});

// ------------------------------------------------------------- tester log v2 (fix 5)

test('tester log v2: index-tip columns, emulator flag, line flips per guided step, update cost and dropped frames', () => {
  const log = new TesterLogger({}, 'test', 'dev');
  log.startSession(0, false);
  log.event(0, 'session', { emulator: false, frameRate: 72 });
  log.event(0.1, 'hand-found', { hand: 1, path: 'fillPoses', radii: 'fillJointRadii', meanRadiusMm: 9.4 });
  log.setLabel('stop', 0);
  for (let i = 0; i < 60; i++) log.sample(i / 30, 1, 0.01, 0.05, -0.04, 0.12, POSE_FLAT, 0.1, 0.02, 0.13, -0.05);
  for (let k = 0; k < 6; k++) log.event(2 + k * 0.5, 'line', { blocked: k % 2 === 0, by: 'hand-right' });
  log.setLabel('edge', 20);
  log.event(25, 'line', { blocked: true, by: 'hand-right' });
  log.event(1, 'fps', { fps: 72, worstMs: 16, updP95Ms: 0.4, drops: 1, frameRate: 72, redraws: 2 });
  log.event(2, 'fps', { fps: 71, worstMs: 20, updP95Ms: 0.9, drops: 3, frameRate: 72, redraws: 2 });
  log.event(40, 'cover-hand-lost', { hand: 'right' });
  const json = JSON.parse(log.toJSON());
  assert.equal(json.version, LOG_VERSION);
  assert.equal(LOG_VERSION, 2);
  assert.deepEqual(COLUMNS.slice(-3), ['ix', 'iy', 'iz']);
  assert.deepEqual(json.sessions[0].samples[0].slice(-3), [20, 130, -50], 'index tip in mm');
  assert.equal(json.emulator, false);
  const s = analyseLog(json);
  assert.equal(s.emulator, false);
  const stop = s.lineFlips.find((l) => l.label === 'stop')!;
  assert.equal(stop.flips, 6);
  assert.equal(stop.seconds, 20);
  assert.equal(stop.perMin, 18);
  assert.equal(s.lineFlips.find((l) => l.label === 'edge')!.flips, 1);
  assert.equal(s.fps!.updP95WorstMs, 0.9);
  assert.equal(s.fps!.drops, 4);
  assert.equal(s.fps!.dropsPerMin, 120);
  assert.equal(s.fps!.frameRate, 72);
  assert.equal(s.creature.coverHandLost, 1);
  assert.deepEqual(s.jointPaths, [{ hand: 1, path: 'fillPoses', radii: 'fillJointRadii', meanRadiusMm: 9.4 }]);
  log.startSession(50, true);
  assert.equal(JSON.parse(log.toJSON()).emulator, true, 'any emulated session marks the whole log');
});
