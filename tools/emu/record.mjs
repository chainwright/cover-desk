// Records the /emu/ build for the submission video (day 8): a HEADED Chromium with the GPU (not headless:
// headless runs on software rendering at 2-5 fps and never showed the win's hop), driven by the seat's keys.
//   node tools/emu/record.mjs <base-url> <out-dir>
// Writes <out-dir>/frames/f_<n>.jpg (the page's frames as Chrome composited them, via the DevTools
// screencast, with their timestamps), <out-dir>/frames.json, <out-dir>/audio.webm (the game's own sound:
// every node the game connects to its AudioContext's speakers is also connected to a recorder) and
// <out-dir>/beats.json (wall-clock times of each beat, and the game's frame rate at each).
// Nothing in the game is changed for the recording; the emulated head is moved closer to the board after
// it has landed (the seat's default view shows the whole emulated office), which a judge can do too.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8799/';
const OUT = process.argv[3] ?? 'rec';
mkdirSync(`${OUT}/frames`, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 1920, H = 1080;

const browser = await chromium.launch({
  headless: false,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H + 120}`],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// The game's sound, recorded inside the page: whatever reaches the speakers also reaches a recorder.
await page.addInitScript(() => {
  const AC = window.AudioContext;
  window.AudioContext = class extends AC {
    constructor(...a) {
      super(...a);
      this.__cap = this.createMediaStreamDestination();
      window.__capCtx = this;
    }
  };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dst, ...rest) {
    const r = connect.call(this, dst, ...rest);
    if (dst instanceof AudioDestinationNode && this.context.__cap) connect.call(this, this.context.__cap);
    return r;
  };
});

const beats = [];
const S = () => page.evaluate(() => {
  const f = window.__cover;
  return { t: Date.now() / 1000, fps: f.fps, cue: f.cues.prompt, mode: f.creature.mode, s: f.creature.s, wins: f.creature.wins, level: f.level.id, objects: f.objects.length, onMug: f.payoff.trinketOnMug, renderer: document.querySelector('canvas') ? 'canvas' : 'none' };
});
const beat = async (name) => { const s = await S(); beats.push({ name, ...s }); console.log(name, JSON.stringify(s)); };
async function until(fn, ms, step = 50) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(step);
  }
  return null;
}

await page.goto(BASE + 'emu/?reset=1');
await page.waitForFunction(() => !!window.__cover && !document.getElementById('enter').disabled, null, { timeout: 60000 });
const gl = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('webgl2');
  const d = c && c.getExtension('WEBGL_debug_renderer_info');
  return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log('renderer', gl);
await sleep(1500);
await page.screenshot({ path: `${OUT}/landing.png` });

// frames: the DevTools screencast of the page as composited
const cdp = await ctx.newCDPSession(page);
const frames = [];
let n = 0;
let recording = false;
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  if (recording) {
    const name = `f_${String(n++).padStart(6, '0')}.jpg`;
    writeFileSync(`${OUT}/frames/${name}`, Buffer.from(data, 'base64'));
    frames.push({ name, t: metadata.timestamp });
  }
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});

await page.click('#enter');
// The seat sits in front of the emulated keyboard, so the board lands on it and the dark keyboard hides the
// shadow lane. Before the desk is found, move the seat 45 cm to the left: the board lands on plain wood.
await page.waitForFunction(() => window.__cover.placement !== 'preview', null, { timeout: 60000, polling: 'raf' });
await page.evaluate(() => { const d = window.IWER_DEVICE; d.position.set(d.position.x - 0.45, d.position.y, d.position.z); d.notifyStateChange?.(); });
await page.waitForFunction(() => window.__cover.placement === 'desk', null, { timeout: 60000 });
// the emulator seat's key list (the video names the keys itself)
await page.addStyleTag({ content: '#emu-keys{display:none!important}' });
// Bring the emulated head closer to the board (the seat looks at the whole emulated office): `up` above the
// desk and `toward` the player from the board's centre, looking at the board point `lookZ` (board frame).
const setCam = (up, toward, lookZ) => page.evaluate(({ up, toward, lookZ }) => {
  const d = window.IWER_DEVICE, f = window.__cover;
  const cam = f.boardPoint(0, toward, up), at = f.boardPoint(0, lookZ, 0);
  const dx = at[0] - cam[0], dy = at[1] - cam[1], dz = at[2] - cam[2];
  const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
  const qy = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], qx = [Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)];
  const q = [qy[3] * qx[0], qy[1] * qx[3], -qy[1] * qx[0], qy[3] * qx[3]];
  d.position.set(cam[0], cam[1], cam[2]);
  d.quaternion.set(q[0], q[1], q[2], q[3]);
  d.notifyStateChange?.();
}, { up, toward, lookZ });
await setCam(0.24, 0.17, -0.06);
recording = true;
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
await page.evaluate(() => {
  const c = window.__capCtx;
  window.__rec = new MediaRecorder(c.__cap.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000 });
  window.__chunks = [];
  window.__rec.ondataavailable = (e) => window.__chunks.push(e.data);
  window.__rec.start(250);
  window.__recAt = Date.now() / 1000;
});
await beat('rec-start');

// 1. the threat beat plays on its own, then the teach card and the ghost
await until(async () => (await S()).cue === 'teach', 8000);
await beat('teach');
await sleep(1200);
// 2. H: the hand stands where the ghost was; the lane opens, the creature dashes into it
await page.keyboard.press('h');
await beat('H');
await until(async () => { const x = await S(); return x.cue === 'slide' && x.mode === 'wait' ? x : null; }, 15000);
await beat('lane-wait');
await sleep(1500);
// 3. → held: it follows the shadow home; the win
await page.keyboard.down('ArrowRight');
await beat('slide');
await until(async () => (await S()).wins > 0, 60000);
await page.keyboard.up('ArrowRight');
await beat('win1');
await sleep(4000);
// 4. H H: hand back, next round; lead it into the light, then L: spotted
await page.keyboard.press('h');
await sleep(300);
await page.keyboard.press('h');
await beat('hand-back');
await until(async () => { const x = await S(); return x.mode === 'wait' && x.s > 0.06 ? x : null; }, 20000);
await page.keyboard.down('ArrowRight');
await until(async () => (await S()).s > 0.15, 30000);
await page.keyboard.up('ArrowRight');
await sleep(300);
await page.keyboard.press('l');
await beat('L');
await until(async () => (await S()).mode === 'spotted', 8000);
await beat('spotted');
await sleep(3500);
// 5. level 2: the hand away; O stands the emulated mug on the ghost mug; level 2 starts
await page.keyboard.press('h');
await until(async () => (await S()).mode === 'nook', 15000);
await sleep(800);
await beat('unlocked');
await page.keyboard.press('o');
await until(async () => (await S()).level === 2, 15000);
await beat('l2-start');
await sleep(2500);
// 6. the rule: no object, a hand into the gaze wakes the keeper
await page.keyboard.press('o');
await until(async () => (await S()).cue === 'need-object', 5000);
await beat('need-object');
await sleep(1500);
await page.keyboard.press('h');
await sleep(1500);
await page.keyboard.down('ArrowRight');
await until(async () => (await S()).cue === 'gaze', 20000);
await page.keyboard.up('ArrowRight');
await beat('gaze-wake');
await sleep(2500);
await page.keyboard.press('h');
await until(async () => (await S()).mode === 'nook', 15000);
// 7. the mug back; the hand leads it into the mug's shadow; R lifts the hand over; home; level 2's climax
// (the head a little higher from here, so the keeper shows above the mug; this is a cut in the video)
await setCam(0.33, 0.12, -0.08);
await sleep(300);
await page.keyboard.press('o');
await until(async () => (await S()).cue === 'l2-teach', 8000);
await beat('mug-back');
await sleep(1500);
await page.keyboard.press('h');
await until(async () => { const x = await S(); return x.cue === 'l2-swap' && x.mode === 'wait' ? x : null; }, 25000);
await beat('mug-holds');
await sleep(2500);
await page.keyboard.press('r');
await beat('R');
await until(async () => (await S()).wins > 1, 30000);
await beat('win2');
await until(async () => (await S()).onMug, 8000);
await beat('on-mug');
await sleep(5000);
await beat('end');

recording = false;
await cdp.send('Page.stopScreencast');
const audio = await page.evaluate(async () => {
  await new Promise((r) => { window.__rec.onstop = r; window.__rec.stop(); });
  const b = new Blob(window.__chunks, { type: 'audio/webm' });
  const u8 = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return { b64: btoa(s), at: window.__recAt };
});
writeFileSync(`${OUT}/audio.webm`, Buffer.from(audio.b64, 'base64'));
writeFileSync(`${OUT}/frames.json`, JSON.stringify({ frames, audioAt: audio.at }, null, 0));
writeFileSync(`${OUT}/beats.json`, JSON.stringify({ renderer: gl, beats, errors }, null, 1));
console.log(`frames ${frames.length}, audio at ${audio.at}, errors ${errors.length}`);
await browser.close();
