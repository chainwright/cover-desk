// Live replay of the judges' emulator path (day 6), against a deployed or local /emu/:
//   level 1: H, 30 s still → no win; → held → a win; (day 7) 6 s later still home with the "again" card and
//            the ghost, the gaze not yet drawn; H H (the hand back at the start) → the next round
//   level 2 (?level=2): no object, H then → held for 30 s → no win (the hand reaches the keeper's gaze);
//            O (emulated mug), H, then R once the creature waits in the mug's shadow → a win
//   day 7b: level 1 after the unlock draws no gaze (only the ghost mug); R lifts the hand over the gaze as
//            one motion (the seat's per-frame trace: up 10 cm, across at that height, down)
// (The build stamp is checked by tools/emu/public_check.mjs.) Prints JSON and exits 1 if any step fails or the console shows an error.
//   node tools/emu/replay.mjs [base-url]          (base serves /emu/ under it)
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'https://chainwright.github.io/cover-desk/';
const steps = [];
const step = (name, pass, info) => steps.push({ name, pass: !!pass, info });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];

async function open(query) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const resp = await page.goto(BASE + 'emu/' + query);
  await page.waitForFunction(() => !!window.__cover && !document.getElementById('enter').disabled, null, { timeout: 60000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__cover.placement === 'desk', null, { timeout: 60000 });
  return { page, status: resp.status() };
}
const S = (page) => page.evaluate(() => {
  const f = window.__cover;
  return { creature: f.creature, cue: f.cues.prompt, lit: f.litFraction, level: f.level, objects: f.objects.length, awake: f.payoff.awake, ghost: f.cues.ghostVisible };
});
async function until(fn, ms, every = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(every);
  }
  return null;
}

try {
  // ---- level 1
  const a = await open('?reset=1');
  step('l1-open', a.status === 200, { status: a.status });
  await a.page.keyboard.press('h');
  await sleep(4000);
  const h = await S(a.page);
  await sleep(30000);
  let s = await S(a.page);
  step('l1-still-30s-no-win', s.creature.wins === 0 && s.creature.mode === 'wait', { afterH: { lit: h.lit, cue: h.cue }, after30s: s.creature });
  await a.page.keyboard.down('ArrowRight');
  const t0 = Date.now();
  const won = await until(async () => { const x = await S(a.page); return x.creature.wins > 0 ? x : null; }, 120000);
  await a.page.keyboard.up('ArrowRight');
  step('l1-slide-wins', !!won, won ? { afterS: (Date.now() - t0) / 1000, spotted: won.creature.spotted, unlocked: won.level.unlocked } : null);
  const tWon = Date.now();
  await sleep(6000);
  s = await S(a.page);
  step('l1-home-card-waits', s.creature.mode === 'home' && s.cue === 'again' && s.ghost && !s.level.gazeShown, { afterWinS: (Date.now() - tWon) / 1000, mode: s.creature.mode, cue: s.cue, ghost: s.ghost, gaze: s.level.gazeShown });
  await a.page.keyboard.press('h');
  await sleep(300);
  await a.page.keyboard.press('h');
  const next = await until(async () => { const x = await S(a.page); return x.creature.mode !== 'home' && x.cue !== 'again' ? x : null; }, 8000);
  step('l1-hand-back-next-round', !!next, next ? { mode: next.creature.mode, cue: next.cue, gaze: next.level.gazeShown } : null);
  // day 7b: in level 1 after the unlock the gaze is never drawn; the ghost mug shows (sampled for 3 s)
  let gazeSeen = false, mugGhostSeen = false, unlockedCue = false;
  for (const t3 = Date.now(); Date.now() - t3 < 3000; await sleep(100)) {
    const x = await S(a.page);
    gazeSeen ||= x.level.gazeShown;
    mugGhostSeen ||= x.level.mugGhostShown;
    unlockedCue ||= x.cue === 'unlocked';
  }
  step('l1-no-gaze-after-unlock', !gazeSeen && mugGhostSeen && unlockedCue, { gazeSeen, mugGhostSeen, unlockedCue });
  await a.page.close();

  // ---- level 2 (?level=2): no object → no win
  const b = await open('?reset=1&level=2');
  s = await S(b.page);
  step('l2-open', b.status === 200 && s.level.id === 2 && s.cue === 'need-object', { status: b.status, level: s.level, cue: s.cue });
  await b.page.keyboard.press('h');
  await sleep(3000);
  await b.page.keyboard.down('ArrowRight');
  let gazeWoke = false;
  const t1 = Date.now();
  while (Date.now() - t1 < 30000) {
    const x = await S(b.page);
    gazeWoke ||= x.level.gazeWake;
    await sleep(150);
  }
  await b.page.keyboard.up('ArrowRight');
  s = await S(b.page);
  step('l2-no-object-no-win', s.creature.wins === 0 && gazeWoke, { creature: s.creature, gazeWoke });
  // O + hand → win
  await b.page.keyboard.press('h'); // hand away
  await until(async () => { const x = await S(b.page); return x.creature.mode === 'nook' || x.creature.mode === 'wait' ? x : null; }, 15000);
  await b.page.keyboard.press('o');
  const withMug = await until(async () => { const x = await S(b.page); return x.objects === 1 && x.level.mugCovers ? x : null; }, 5000, 50);
  step('l2-o-registers', !!withMug, withMug ? { cue: withMug.cue, level: withMug.level } : null);
  await until(async () => (await S(b.page)).creature.mode !== 'retreat', 10000);
  await b.page.keyboard.press('h');
  const past = await until(async () => { const x = await S(b.page); return x.cue === 'l2-swap' && x.creature.mode === 'wait' ? x : null; }, 30000, 50);
  step('l2-waits-in-mug-shadow', !!past && !past.awake, past ? past.creature : null);
  await b.page.keyboard.press('r');
  const won2 = await until(async () => { const x = await S(b.page); return x.creature.wins > 0 ? x : null; }, 30000, 50);
  step('l2-mug-plus-hand-wins', !!won2, won2 ? { creature: won2.creature, level: won2.level.id } : null);
  const tr = await b.page.evaluate(() => window.__cover.seatTrace.map((r) => [...r]));
  const mid = tr.filter(([, x]) => x > -0.0799 && x < 0.0799);
  step('l2-r-is-a-motion', tr.length >= 10 && mid.length >= 3 && mid.every((r) => r[2] > 0.099) && tr.at(-1)[1] === 0.08 && tr.at(-1)[2] === 0,
    { frames: tr.length, acrossFrames: mid.length, maxHeightM: Math.max(...tr.map((r) => r[2])), first: tr[0], last: tr.at(-1), sample: tr.filter((_, i) => i % 4 === 0) });
  await b.page.close();
} catch (e) {
  step('ran', false, String(e));
}
step('no-console-errors', errors.length === 0, errors);
await browser.close();
const failed = steps.filter((x) => !x.pass).map((x) => x.name);
console.log(JSON.stringify({ base: BASE, steps, failed }, null, 1));
process.exit(failed.length ? 1 : 0);
