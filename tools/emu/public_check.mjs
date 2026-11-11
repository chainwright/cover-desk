// Day-2 public URL check: the main build has no emulator and points desktop
// visitors to /emu/; the /emu/ build runs the emulator and starts a session.
//   node tools/emu/public_check.mjs [base-url]
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'https://chainwright.github.io/cover-desk/';
const MARKERS = ['Activating IWER runtime', 'IWER_MCP'];
const out = {};

// 1) static: the served main bundle has no emulator code, /emu/ has it
async function bundleText(url) {
  const html = await (await fetch(url)).text();
  let text = html;
  for (const m of html.matchAll(/src="\.?\/?(assets\/[^"]+\.js)"/g)) text += await (await fetch(new URL(m[1], url))).text();
  return { status: (await fetch(url)).status, text };
}
const main = await bundleText(BASE);
const emu = await bundleText(new URL('emu/', BASE).toString());
out.static = {
  mainStatus: main.status,
  emuStatus: emu.status,
  mainHasEmulator: MARKERS.some((m) => main.text.includes(m)),
  emuHasEmulator: MARKERS.some((m) => emu.text.includes(m)),
  stamp: (main.text.match(/"([0-9a-f]{12})"/g) ?? []).find((s) => s.startsWith('"9155473')) ?? null,
};

const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function visit(url, enter) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const resp = await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__cover && document.getElementById('note').textContent !== 'Checking for a headset…', null, { timeout: 30000 });
  const before = await page.evaluate(() => ({
    status: 0,
    emulatorFlag: document.documentElement.dataset.emulator,
    iwer: 'IWER_DEVICE' in window,
    intro: document.querySelector('#intro p').textContent,
    note: document.getElementById('note').textContent,
    emuLink: document.querySelector('#note a')?.getAttribute('href') ?? null,
    enterDisabled: document.getElementById('enter').disabled,
  }));
  before.status = resp.status();
  let after = null;
  if (enter && !before.enterDisabled) {
    await page.click('#enter');
    await page.waitForTimeout(7000);
    after = await page.evaluate(() => {
      const f = window.__cover;
      const log = f.exportLog();
      return { introHidden: document.getElementById('intro').hidden, placement: f.placement, emulator: f.emulator, cues: f.cues, build: log ? JSON.parse(log).build : null, logEmulator: log ? JSON.parse(log).emulator : null };
    });
  }
  await page.close();
  return { before, after, errors };
}
out.main = await visit(BASE + '?test=1&reset=1', false);
out.emu = await visit(new URL('emu/?test=1&reset=1', BASE).toString(), true);
await browser.close();
console.log(JSON.stringify(out, null, 1));
