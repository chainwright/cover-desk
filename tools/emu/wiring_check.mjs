// Wiring check on the built /emu/ (day 5): drives the game with the seat's
// keys in headless Chromium and checks the glue that unit tests can't reach.
// Exits 1 if any check fails, so tools/mutations.py can use it for the
// glue mutations (O15–O22).
//   node tools/emu/wiring_check.mjs [base-url] [screenshot-dir]     (base serves dist/: /emu/ under it)
// Checks:
//   session    the XR session asks for hand tracking, anchors and planes as optional, nothing required
//   flush-5s   the tester log reaches IndexedDB by the 5 s timer alone (O15: frame-loop call)
//   flush-hide a pagehide writes the log at once (O16: index.ts wiring)
//   slide-card after H the card says "Slide your hand along" (O22: latch)
//   win-*      after a slide: trinket carried, one bead, a chime, the hop, the flare (O17–O19)
//              (day 7: win-hop-flare no longer samples the hop from outside: the game records each
//              frame of the win (t since home, the hop and flare it applied) and the check compares
//              every recorded frame with the pure winFx(t); at 3–6 fps polling missed the hop's peak
//              and the day-6 check failed a clean build about half the time)
//   again      after a win the "again" card and the ghost, until H stands the hand at the ghost's spot
//   again-waits (day 7) 6 s after the win, the hand not back: still home, the card and the ghost, no gaze yet
//   spotted-*  L: eyes open, stare line, "hm?", the spotted card (O20, O21)
//   wake-*     C cups the lantern: the keeper wakes, the card says so, the creature stays home
//   l2-*       day 6: after the level-1 win the unlock card and the ghost mug (day 7b: no gaze drawn in
//              level 1, it has no gaze rule); O registers the emulated
//              mug and level 2 starts; H: the creature crosses into the mug's shadow and waits past
//              the gaze (the swap card, the ghost on the right); R: home (a level-2 win); O again:
//              no object, the "needs a real mug" card, and H + → held never wins (the hand in the
//              gaze wakes the keeper)
//   day 7, checks for an outside run's glue mutations that survived both stages (R3, R4, R7–R11):
//   spotted-log      the 'spotted' log event carries the tracked hand's wrist speed (R10)
//   woke-reason-*    'keeper-woke' says 'lantern' after C and 'gaze' in level 2 (R8)
//   l2-start         two objects registered in level 1 (O, then one elsewhere): level 2 keeps the newest (R7)
//   l2-o-key         O takes the object away and puts the emulated mug back on the ghost mug (G8)
//   l2-won-flag      a level-2 win is recorded as one (R11)
//   register-gate    a still, not-pointing hand over a legal spot registers nothing; a pointing one does (R4);
//                    note: that pointing hold is in mid-air, so it also shows a phantom registration
//   knob-gate        a flat hand resting its fingertips on the knob doesn't move the board; a pointing one does (R3)
//   l2-r-motion      (day 7b) R lifts the hand over the gaze as one motion: the seat's per-frame trace rises
//                    in place, crosses only at full height (10 cm), comes down at the right ghost; the
//                    keeper never wakes between R and the win
//   fps-inview       with the head turned away the 'fps' log says inView false, looking at the board true (R9)
//   errors     no console errors
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8799/';
const SHOTS = process.argv[3];
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, info });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
const S = () => page.evaluate(() => {
  const f = window.__cover;
  return { placement: f.placement, creature: f.creature, lit: f.litFraction, cue: f.cues.prompt, promptText: f.cues.promptText, ghost: f.cues.ghostVisible, payoff: f.payoff, logStore: f.logStore, level: f.level, objects: f.objects.length, objs: f.objects, fps: f.fps, hands: f.hands };
});
const events = (type) => page.evaluate((type) => {
  const log = JSON.parse(window.__cover.exportLog() ?? 'null');
  return log ? log.sessions.flatMap((x) => x.events).filter((e) => e.type === type) : [];
}, type);
/**
 * Puts the emulator's right hand in a built-in pose (e.g. 'flat', 'point'), fingers down, so that its
 * index fingertip lands on board point (x, y, z): sets the pose, reads the fingertip back from the game
 * and corrects the hand position (the grip offset depends on the pose), a few times.
 */
async function handTipAt(poseId, x, y, z) {
  for (let i = 0; i < 4; i++) {
    await page.evaluate(({ poseId, x, y, z, first }) => {
      const d = window.IWER_DEVICE, f = window.__cover, r = d.hands.right;
      const o = f.boardPoint(0, 0, 0), ax = f.boardPoint(1, 0, 0);
      const yaw = Math.atan2(ax[2] - o[2], ax[0] - o[0]);
      // fingers down: −90° about x (the 'stop' hand is +90°), then the board's turn about y
      const a = -Math.PI / 4, b = -yaw / 2;
      const qx = [Math.sin(a), 0, 0, Math.cos(a)], qy = [0, Math.sin(b), 0, Math.cos(b)];
      const q = [qy[3] * qx[0], qy[1] * qx[3], -qy[1] * qx[0], qy[3] * qx[3]]; // qy * qx
      r.poseId = poseId;
      r.quaternion.set(q[0], q[1], q[2], q[3]);
      const target = f.boardPoint(x, z, y);
      if (first) r.position.set(target[0], target[1] + 0.09, target[2]);
      else {
        const j = f.joints(1);
        if (j) r.position.set(r.position.x + target[0] - j[27], r.position.y + target[1] - j[28], r.position.z + target[2] - j[29]);
      }
      d.notifyStateChange?.();
    }, { poseId, x, y, z, first: i === 0 });
    await sleep(500);
  }
  return page.evaluate(() => {
    const j = window.__cover.joints(1);
    return j ? window.__cover.toBoard(j[27], j[28], j[29]) : null;
  });
}
const chunks = () => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('cover-tester-log-v2');
  r.onsuccess = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains('chunks')) { db.close(); res(-1); return; }
    const q = db.transaction('chunks', 'readonly').objectStore('chunks').count();
    q.onsuccess = () => { res(q.result); db.close(); };
    q.onerror = () => { res(-2); db.close(); };
  };
  r.onerror = () => res(-3);
}));
async function until(fn, ms, step = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(step);
  }
  return null;
}

try {
  const resp = await page.goto(BASE + 'emu/?test=1&reset=1');
  check('status', resp.status() === 200, resp.status());
  await page.waitForFunction(() => !!window.__cover && !document.getElementById('enter').disabled && window.__cover.logStore.status === 'ready', null, { timeout: 40000 });
  await page.evaluate(() => {
    const xr = navigator.xr;
    const orig = xr.requestSession.bind(xr);
    xr.requestSession = (mode, init) => { window.__sessionInit = { mode, init: JSON.parse(JSON.stringify(init ?? {})) }; return orig(mode, init); };
  });
  const before = await chunks();
  await page.click('#enter');
  const tEnter = Date.now();
  await page.waitForFunction(() => window.__cover.placement === 'desk', null, { timeout: 40000 });
  const init = await page.evaluate(() => window.__sessionInit);
  const req = init?.init?.requiredFeatures ?? [];
  const opt = init?.init?.optionalFeatures ?? [];
  check('session', init && req.length === 0 && ['hand-tracking', 'anchors', 'plane-detection'].every((f) => opt.includes(f)), init);

  // O15: the 5 s timer writes the log (no session end, no page hide yet)
  const firstWrite = await until(async () => ((await chunks()) > 0 ? Date.now() : null), 15000);
  check('flush-5s', before === 0 && firstWrite, { before, afterS: firstWrite ? (firstWrite - tEnter) / 1000 : null });

  // O16: pagehide writes at once (right after a timer flush, so the next timer is ~5 s away)
  const n0 = await chunks();
  await until(async () => (await chunks()) > n0, 8000, 50);
  await sleep(1200);
  const n1 = await chunks();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await sleep(800);
  const n2 = await chunks();
  check('flush-hide', n2 > n1, { n1, n2 });

  // O22: the slide card after H
  await page.keyboard.press('h');
  await sleep(4000);
  let s = await S();
  check('slide-card', s.cue === 'slide' && /slide your hand along/i.test(s.promptText) && s.lit > 0 && s.lit < 1 && s.creature.mode === 'wait', { cue: s.cue, lit: s.lit, creature: s.creature });
  check('teach-spot-not-awake', !s.payoff.awake, s.payoff);

  // → held to a win; sample the win's effects
  const chime0 = s.payoff.sounds.chime;
  let maxHop = 0, maxFlare = 0, maxBead = 1, carried = false, won = null, shotWin = false;
  await page.keyboard.down('ArrowRight');
  const tSlide = Date.now();
  while (Date.now() - tSlide < 120000) {
    s = await S();
    if (s.creature.wins > 0) {
      won ??= Date.now();
      maxHop = Math.max(maxHop, s.payoff.hop);
      maxFlare = Math.max(maxFlare, s.payoff.flare);
      maxBead = Math.max(maxBead, s.payoff.bead);
      carried ||= s.payoff.trinketCarried;
      if (!shotWin && maxHop > 0.003 && maxFlare > 0.1 && s.payoff.hop > 0.003) { shotWin = true; await shot('day5_01_emu_win_hop'); }
      if (Date.now() - won > 1500) break;
    }
    await sleep(30);
  }
  await page.keyboard.up('ArrowRight');
  check('win', !!won, { afterS: won ? (won - tSlide) / 1000 : null, spotted: s.creature.spotted });
  check('win-trinket', carried, null);
  check('win-bead', s.payoff.beads === 1, s.payoff.beads);
  check('win-chime', s.payoff.sounds.chime === chime0 + 1, s.payoff.sounds);
  // Every frame the game recorded during the win: the hop it applied to the creature and the flare it
  // applied to the light equal the pure winFx(t) at that frame's t; at least one frame fell inside the hop.
  const trace = s.payoff.winTrace;
  const expect = await page.evaluate((ts) => ts.map((t) => window.__cover.winFxAt(t)), trace.map((r) => r[0]));
  const bad = trace.filter((r, i) => Math.abs(r[1] - expect[i].hop) > 2e-4 || Math.abs(r[2] - expect[i].flare) > 2e-3);
  // Frames whose expected hop/flare is not zero (only a frame rate under about 1 fps leaves none in the
  // 0.9 s hop; day 7: a 2 mm floor here still failed once at about 2 fps, so the floor is gone).
  const inHop = trace.filter((r, i) => expect[i].hop > 1e-4).length;
  const inFlare = trace.filter((r, i) => expect[i].flare > 1e-3).length;
  check('win-hop-flare', trace.length > 0 && bad.length === 0 && inHop + inFlare > 0, { frames: trace.length, inHop, inFlare, bad: bad.slice(0, 3), polledMaxHop: maxHop, polledMaxFlare: maxFlare, fps: s.fps });
  await shot('day5_02_emu_again_ghost');
  check('again', s.cue === 'again' && s.ghost && /bring your hand back/i.test(s.promptText), { cue: s.cue, ghost: s.ghost });

  // Day 7: the next round waits for the hand. 6 s after the win (day 6 restarted at 3.5 s and the card and
  // ghost were gone), the hand still at the end of its slide: still home, the card and the ghost, no gaze yet.
  await sleep(Math.max(0, 6000 - (Date.now() - won)));
  s = await S();
  check('again-waits', s.creature.mode === 'home' && s.cue === 'again' && s.ghost && !s.level.gazeShown && !s.level.mugGhostShown, { mode: s.creature.mode, cue: s.cue, ghost: s.ghost, gaze: s.level.gazeShown, sinceWinS: (Date.now() - won) / 1000 });
  // next round: H away, H at the ghost's spot → the round starts and the "again" card goes
  await page.keyboard.press('h');
  await sleep(300);
  await page.keyboard.press('h');
  let cleared = await until(async () => { const x = await S(); return x.cue !== 'again' ? x : null; }, 6000);
  if (cleared) { await sleep(400); cleared = await S(); } // the ghost follows the cue on the next frame
  check('again-cleared', cleared && cleared.cue !== 'again' && !cleared.ghost && cleared.creature.mode !== 'home', cleared ? { cue: cleared.cue, ghost: cleared.ghost, mode: cleared.creature.mode } : null);

  // lead it into the path, then L: spotted
  await until(async () => (await S()).creature.s > 0.06, 15000);
  await page.keyboard.down('ArrowRight');
  await until(async () => (await S()).creature.s > 0.15, 30000);
  await page.keyboard.up('ArrowRight');
  const hm0 = (await S()).payoff.sounds.hm;
  await page.keyboard.press('l');
  const sp = await until(async () => { const x = await S(); return x.creature.mode === 'spotted' && x.payoff.eyes > 2 ? x : null; }, 10000, 50);
  check('spotted-eyes-stare', sp && sp.payoff.stare, sp?.payoff);
  check('spotted-hm', sp && sp.payoff.sounds.hm === hm0 + 1, sp?.payoff.sounds);
  check('spotted-card', sp && sp.cue === 'spotted' && /saw it/i.test(sp.promptText), sp ? { cue: sp.cue, text: sp.promptText } : null);
  const spEv = (await events('spotted')).at(-1);
  // both emulated hands are tracked (the left one rests by the chair), so both speeds are numbers
  check('spotted-log', spEv && Array.isArray(spEv.wristMmS) && spEv.wristMmS.length === 2 && spEv.wristMmS.every(Number.isFinite), spEv);

  // C: cup the lantern → the keeper wakes; the creature doesn't cross
  await page.keyboard.press('h'); // the hand away (L had lifted it)
  await until(async () => (await S()).creature.mode === 'nook', 15000);
  const hm1 = (await S()).payoff.sounds.hm;
  await page.keyboard.press('c');
  const aw = await until(async () => { const x = await S(); return x.payoff.awake ? x : null; }, 10000, 50);
  await shot('day5_03_emu_cupped_lantern_wakes');
  check('wake', aw && aw.cue === 'too-close' && /lantern/.test(aw.promptText), aw ? { cue: aw.cue, text: aw.promptText } : null);
  let maxS = 0;
  const tc = Date.now();
  while (Date.now() - tc < 6000) {
    const x = await S();
    maxS = Math.max(maxS, x.creature.s);
    await sleep(200);
  }
  s = await S();
  check('wake-holds', s.payoff.awake && s.payoff.eyes > 2 && maxS < 0.04 && s.creature.wins === 1 && s.payoff.sounds.hm === hm1 + 1, { maxS, wins: s.creature.wins, eyes: s.payoff.eyes, hm: s.payoff.sounds.hm });
  await page.keyboard.press('c');
  const asleep = await until(async () => { const x = await S(); return !x.payoff.awake ? x : null; }, 5000);
  check('wake-ends', !!asleep, null);
  const wokeL = await events('keeper-woke');
  // day 8: the keeper waited 0.25 s (game time) with the hand inside the radius before it woke (G15: the call site's step)
  check('woke-reason-lantern', wokeL.length > 0 && wokeL.at(-1).reason === 'lantern' && wokeL.at(-1).afterMs >= 249 && wokeL.at(-1).afterMs < 400, wokeL.at(-1));

  // Day 6: level 2. The level-1 win unlocked it; with no object the card says what it needs.
  await until(async () => (await S()).creature.mode === 'nook', 10000);
  s = await S();
  check('l2-unlocked', s.level.id === 1 && s.level.unlocked && s.cue === 'unlocked' && /level 2/i.test(s.promptText) && /ghost mug/i.test(s.promptText) && !s.level.gazeShown && s.level.mugGhostShown, { level: s.level, cue: s.cue, text: s.promptText });
  // Day 7 (R7): two objects registered in level 1 before the switch, in one page task (so in the same
  // frame): the O key puts the mug in the gaze, then one more object stands elsewhere. At the switch
  // (the creature is in its nook, a round boundary) level 2 keeps only the newest.
  const { v1, before2 } = await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o' }));
    const v1 = window.__cover.registerAt(0.12, -0.04, 0.1);
    return { v1, before2: window.__cover.objects.length };
  });
  const l2 = await until(async () => { const x = await S(); return x.level.id === 2 ? x : null; }, 15000, 50);
  check('l2-start', l2 && before2 === 2 && v1 === 'ok' && l2.objects === 1 && Math.abs(l2.objs[0].x - 0.12) < 1e-3 /* mugCovers follows a frame later: l2-mug-off */, l2 ? { before2, v1, level: l2.level, objs: l2.objs, cue: l2.cue } : { before2, v1 });
  await until(async () => (await S()).creature.mode === 'nook', 15000);
  await sleep(300);
  check('l2-mug-off', (await S()).cue === 'mug-off', (await S()).cue);
  // O takes that object away; O again stands the emulated mug on the ghost mug (G8)
  await page.keyboard.press('o');
  await until(async () => (await S()).objects === 0, 3000, 50);
  await page.keyboard.press('o');
  const mug = await until(async () => { const x = await S(); return x.objects === 1 && x.level.mugCovers && x.cue === 'l2-teach' ? x : null; }, 5000, 50);
  check('l2-o-key', mug && Math.abs(mug.objs[0].x) < 1e-3 && mug.level.ghostSpot === 'left', mug ? { objs: mug.objs, cue: mug.cue, level: mug.level } : null);
  await sleep(300);
  s = await S();
  check('l2-visuals', s.level.gazeShown && !s.level.mugGhostShown && s.ghost && Math.abs(s.level.ghostAt[0] + 0.08) < 1e-3, s.level);
  // level 2 counts one object: a second registration elsewhere replaces the mug (and the card says it no longer covers the gaze)
  const v2 = await page.evaluate(() => window.__cover.registerAt(0.12, -0.04, 0.1));
  const off = await until(async () => { const x = await S(); return x.cue === 'mug-off' && x.level.mugGhostShown ? x : null; }, 3000, 50);
  check('l2-one-object', v2 === 'ok' && off && off.objects === 1 && !off.level.mugCovers && off.level.mugGhostShown, off ? { v2, objects: off.objects, level: off.level } : v2);
  await page.evaluate(() => window.__cover.registerAt(0, -0.03, 0.1));
  await until(async () => (await S()).cue === 'l2-teach', 3000, 50);
  await shot('day6_01_emu_l2_mug_ghost_left');
  await page.keyboard.press('h');
  const past = await until(async () => { const x = await S(); return x.cue === 'l2-swap' && x.creature.mode === 'wait' ? x : null; }, 20000, 50);
  check('l2-swap', past && past.level.ghostSpot === 'right' && !past.payoff.awake && past.creature.spotted === s.creature.spotted, past ? { creature: past.creature, ghostSpot: past.level.ghostSpot } : null);
  await sleep(300);
  check('l2-ghost-right', Math.abs((await S()).level.ghostAt[0] - 0.08) < 1e-3, (await S()).level.ghostAt);
  await shot('day6_02_emu_l2_mug_holds_it');
  const wins1 = (await S()).creature.wins;
  const woke0 = (await events('keeper-woke')).length;
  await page.keyboard.press('r');
  const won2 = await until(async () => { const x = await S(); return x.creature.wins > wins1 ? x : null; }, 30000, 50);
  {
    // Day 7b: R is a motion, not a jump. The seat's trace, one row per frame: [t s, wrist x m, height above standing m].
    const tr = await page.evaluate(() => window.__cover.seatTrace.map((r) => [...r]));
    const L = -0.08, R = 0.08, between = tr.filter(([, x]) => x > L + 1e-4 && x < R - 1e-4);
    const last = tr.at(-1);
    const maxDy = Math.max(...tr.map((r) => r[2]));
    const wokeR = (await events('keeper-woke')).length - woke0;
    check('l2-r-motion', tr.length >= 10 && maxDy > 0.099 && between.length >= 3 && between.every((r) => r[2] > 0.099) && tr[0][2] < 0.05 && Math.abs(tr[0][1] - L) < 0.03 && last && Math.abs(last[1] - R) < 1e-4 && last[2] === 0 && wokeR === 0,
      { frames: tr.length, maxDy, between: between.length, first: tr[0], last, wokeR });
  }
  check('l2-win', won2 && won2.level.id === 2 && won2.creature.spotted === s.creature.spotted, won2 ? { creature: won2.creature } : null);
  check('l2-won-flag', won2 && won2.level.l2Won === true, won2?.level);
  await shot('day6_03_emu_l2_win');
  // O again: the object is gone; level 2 stays and says so; H + → held never wins (the hand reaches the gaze)
  await page.keyboard.press('h'); // hand away (it is not back at the start, so the next round starts after 10 s)
  await until(async () => (await S()).creature.mode === 'nook', 16000);
  await page.keyboard.press('o');
  const none = await until(async () => { const x = await S(); return x.objects === 0 && x.cue === 'need-object' ? x : null; }, 5000, 50);
  check('l2-need-object', none && none.level.id === 2 && /needs a real mug/i.test(none.promptText), none ? { cue: none.cue, text: none.promptText } : null);
  await page.keyboard.press('h');
  await sleep(3000);
  await page.keyboard.down('ArrowRight');
  let gazeWoke = false;
  const wins2 = (await S()).creature.wins;
  const tn = Date.now();
  while (Date.now() - tn < 20000) {
    const x = await S();
    gazeWoke ||= x.level.gazeWake;
    await sleep(100);
  }
  await page.keyboard.up('ArrowRight');
  s = await S();
  check('l2-no-object-no-win', s.creature.wins === wins2 && gazeWoke, { wins: s.creature.wins, gazeWoke });
  const wokeG = (await events('keeper-woke')).filter((e) => e.level === 2);
  check('woke-reason-gaze', wokeG.length > 0 && wokeG.every((e) => e.reason === 'gaze'), wokeG.slice(-3));

  // R4: registration needs a pointing finger. Level 2, no object: a still flat hand (fingers down, not
  // pointing) comes down onto a legal spot 10 cm up and holds; then the same with a pointing hand.
  await page.keyboard.press('h'); // the seat's hand away; from here the check poses the hand itself
  await sleep(500);
  const hold = async (poseId) => {
    await handTipAt(poseId, 0.12, 0.14, -0.04);
    for (let k = 0; k < 5; k++) { await handTipAt(poseId, 0.12, 0.13 - k * 0.01, -0.04); }
    const at = await handTipAt(poseId, 0.12, 0.09, -0.04);
    const pointing = (await S()).hands[1].pointing;
    await sleep(1500);
    return { at, pointing, objects: (await S()).objects };
  };
  const flat = await hold('flat');
  const point = await hold('point');
  check('register-gate', flat.pointing === false && flat.objects === 0 && point.pointing === true && point.objects === 1, { flat, point });

  // R3: the move knob needs a pointing finger. A flat hand's fingertips resting on the knob for 2 s: no move;
  // a pointing fingertip there: "tap the new spot".
  const KNOB = { x: -0.23, z: 0.11 };
  await handTipAt('flat', KNOB.x, 0.05, KNOB.z);
  await handTipAt('flat', KNOB.x, 0.02, KNOB.z);
  const flatKnob = await S();
  await sleep(2000);
  const flatAfter = await S();
  await handTipAt('point', KNOB.x, 0.05, KNOB.z);
  const pk = await handTipAt('point', KNOB.x, 0.021, KNOB.z);
  const moved = await until(async () => { const x = await S(); return x.cue === 'tap-new-spot' ? x : null; }, 4000, 50);
  check('knob-gate', !flatKnob.hands[1].pointing && flatAfter.cue !== 'tap-new-spot' && !!moved, { flatCue: flatAfter.cue, flatPointing: flatKnob.hands[1].pointing, pointTip: pk, moved: !!moved });

  // R9: the fps log's inView. Turn the emulated head to look up and back for 3 s, then back at the board.
  const fps0 = (await events('fps')).length;
  await page.evaluate(() => { const d = window.IWER_DEVICE; d.quaternion.set(0.3826834, 0, 0, 0.9238795); d.notifyStateChange?.(); });
  await sleep(3500);
  await page.evaluate(() => { const d = window.IWER_DEVICE; const a = (-52 * Math.PI) / 360; d.quaternion.set(Math.sin(a), 0, 0, Math.cos(a)); d.notifyStateChange?.(); });
  await sleep(2500);
  const fpsEv = (await events('fps')).slice(fps0);
  const away = fpsEv.filter((e) => e.viewDeg > 60);
  const seen = fpsEv.filter((e) => e.viewDeg < 30);
  check('fps-inview', away.length > 0 && away.every((e) => e.inView === false) && seen.length > 0 && seen.every((e) => e.inView === true), fpsEv.map((e) => [e.viewDeg, e.inView]));
} catch (e) {
  check('ran', false, String(e));
}
check('errors', errors.length === 0, errors);
await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify({ checks, failed: failed.map((c) => c.name) }, null, 1));
process.exit(failed.length ? 1 : 0);
