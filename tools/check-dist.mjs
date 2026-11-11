// Fails the build unless the main build (dist/, served at /) is free of the
// Immersive Web Emulator and the emulator build (dist/emu/) carries it; day 7b:
// the same for the game's debug handle (window.__cover).
// The markers are strings only the emulator runtime contains (its activation
// log line and its MCP client global). Not 'IWER_DEVICE': the app's own
// emulator check (src/index.ts) names that global in every build.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MARKERS = ['Activating IWER runtime', 'IWER_MCP'];
// Day 7b: the game's debug handle (window.__cover) is for the emulator checks only: the main build must
// not carry it, the /emu/ build must (the checks drive it there).
const HANDLE = '__cover';

function files(dir, skip) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (skip && p === skip) continue;
    if (statSync(p).isDirectory()) out.push(...files(p, skip));
    else if (/\.(js|html)$/.test(name)) out.push(p);
  }
  return out;
}
function scan(dir, skip) {
  let bytes = 0;
  const hits = [];
  const handle = [];
  for (const f of files(dir, skip)) {
    const text = readFileSync(f, 'utf8');
    bytes += text.length;
    if (MARKERS.some((m) => text.includes(m))) hits.push(f);
    if (text.includes(HANDLE)) handle.push(f);
  }
  return { bytes, hits, handle };
}

let ok = true;
const fail = (msg) => {
  console.error(`FAIL ${msg}`);
  ok = false;
};
if (!existsSync('dist/index.html')) fail('dist/index.html missing');
if (!existsSync('dist/emu/index.html')) fail('dist/emu/index.html missing');
const main = scan('dist', join('dist', 'emu'));
const emu = existsSync('dist/emu') ? scan('dist/emu') : { bytes: 0, hits: [], handle: [] };
if (main.hits.length) fail(`emulator found in the main build: ${main.hits.join(', ')}`);
if (!emu.hits.length) fail('emulator missing from the emulator build (dist/emu)');
if (main.handle.length) fail(`debug handle ${HANDLE} found in the main build: ${main.handle.join(', ')}`);
if (!emu.handle.length) fail(`debug handle ${HANDLE} missing from the emulator build (dist/emu)`);
const config = JSON.parse(readFileSync('iwsdk.config.json', 'utf8'));
if (config.dev?.emulator?.injectOnBuild !== false) fail('iwsdk.config.json: injectOnBuild must stay false');
console.log(`main build /: ${(main.bytes / 1024).toFixed(0)} KB js+html, emulator: ${main.hits.length ? 'PRESENT' : 'absent'}, ${HANDLE}: ${main.handle.length ? 'PRESENT' : 'absent'}`);
console.log(`emulator build /emu/: ${(emu.bytes / 1024).toFixed(0)} KB js+html, emulator: ${emu.hits.length ? 'present' : 'MISSING'}, ${HANDLE}: ${emu.handle.length ? 'present' : 'MISSING'}`);
process.exit(ok ? 0 : 1);
