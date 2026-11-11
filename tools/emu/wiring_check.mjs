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
//              (day 6: the hop counts from 3 mm, not 1 cm: at 3–6 fps on a loaded machine the
//              0.45 s hop gets two or three frames, and a 1 cm floor failed a clean build)
//   again      after a win the "again" card and the ghost, until H stands the hand at the ghost's spot
//   spotted-*  L: eyes open, stare line, "hm?", the spotted card (O20, O21)
//   wake-*     C cups the lantern: the keeper wakes, the card says so, the creature stays home
//   l2-*       day 6: after the level-1 win the unlock card and the gaze; O registers the emulated
//              mug and level 2 starts; H: the creature crosses into the mug's shadow and waits past
//              the gaze (the swap card, the ghost on the right); R: home (a level-2 win); O again:
//              no object, the "needs a real mug" card, and H + → held never wins (the hand in the
//              gaze wakes the keeper)
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
  return { placement: f.placement, creature: f.creature, lit: f.litFraction, cue: f.cues.prompt, promptText: f.cues.promptText, ghost: f.cues.ghostVisible, payoff: f.payoff, logStore: f.logStore, level: f.level, objects: f.objects.length, fps: f.fps };
});
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
  check('win-hop-flare', maxHop > 0.003 && maxFlare > 0.1, { maxHop, maxFlare, maxBead, fps: s.fps });
  await shot('day5_02_emu_again_ghost');
  check('again', s.cue === 'again' && s.ghost && /bring your hand back/i.test(s.promptText), { cue: s.cue, ghost: s.ghost });

  // next round: H away, H at the ghost's spot → the "again" card goes
  await until(async () => (await S()).creature.mode !== 'home', 8000);
  await page.keyboard.press('h');
  await sleep(300);
  await page.keyboard.press('h');
  const cleared = await until(async () => { const x = await S(); return x.cue !== 'again' ? x : null; }, 6000);
  check('again-cleared', cleared && !cleared.ghost, cleared ? { cue: cleared.cue, ghost: cleared.ghost } : null);

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

  // C: cup the lantern → the keeper wakes; the creature doesn't cross
  await page.keyboard.press('h'); // the hand away (L had lifted it)
  await until(async () => (await S()).creature.mode === 'nook', 15000);
  const hm1 = (await S()).payoff.sounds.hm;
  await page.keyboard.press('c');
  const aw = await until(async () => { const x = await S(); return x.payoff.awake ? x : null; }, 5000, 50);
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

  // Day 6: level 2. The level-1 win unlocked it; with no object the card says what it needs.
  await until(async () => (await S()).creature.mode === 'nook', 10000);
  s = await S();
  check('l2-unlocked', s.level.id === 1 && s.level.unlocked && s.cue === 'unlocked' && /level 2/i.test(s.promptText) && s.level.gazeShown && s.level.mugGhostShown, { level: s.level, cue: s.cue, text: s.promptText });
  await page.keyboard.press('o');
  const l2 = await until(async () => { const x = await S(); return x.level.id === 2 ? x : null; }, 5000, 50);
  check('l2-start', l2 && l2.objects === 1 && l2.level.mugCovers && l2.cue === 'l2-teach' && l2.level.ghostSpot === 'left', l2 ? { level: l2.level, cue: l2.cue, objects: l2.objects } : null);
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
  await page.keyboard.press('r');
  const won2 = await until(async () => { const x = await S(); return x.creature.wins > wins1 ? x : null; }, 30000, 50);
  check('l2-win', won2 && won2.level.id === 2 && won2.creature.spotted === s.creature.spotted, won2 ? { creature: won2.creature } : null);
  await shot('day6_03_emu_l2_win');
  // O again: the object is gone; level 2 stays and says so; H + → held never wins (the hand reaches the gaze)
  await page.keyboard.press('h'); // hand away
  await until(async () => (await S()).creature.mode === 'nook', 10000);
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
} catch (e) {
  check('ran', false, String(e));
}
check('errors', errors.length === 0, errors);
await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify({ checks, failed: failed.map((c) => c.name) }, null, 1));
process.exit(failed.length ? 1 : 0);
