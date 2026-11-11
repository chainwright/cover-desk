// Builds the desktop emulator version into dist/emu/.
//
// The main build (dist/, served at /) never contains the Immersive Web
// Emulator, so a Quest browser can't end up in an emulated session: that is the
// build judges open on a headset. Desktop judges without a headset use /emu/.
//
// iwsdk.config.json is the IWSDK project authority and the plugin refuses
// emulator options from vite.config.ts, so this script flips
// dev.emulator.injectOnBuild to true for one `vite build`, then restores the
// file byte for byte (also on failure).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const CONFIG = 'iwsdk.config.json';
const original = readFileSync(CONFIG, 'utf8');
const config = JSON.parse(original);
if (config.dev?.emulator?.injectOnBuild !== false) {
  console.error(`${CONFIG}: dev.emulator.injectOnBuild must be false (the main build must not carry the emulator)`);
  process.exit(1);
}
config.dev.emulator.injectOnBuild = true;
let status = 1;
try {
  writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n');
  const r = spawnSync('node_modules/.bin/vite', ['build', '--outDir', 'dist/emu', '--emptyOutDir'], {
    stdio: 'inherit',
    env: { ...process.env, COVER_VARIANT: 'emu' },
  });
  status = r.status ?? 1;
} finally {
  writeFileSync(CONFIG, original);
}
if (readFileSync(CONFIG, 'utf8') !== original) {
  console.error(`${CONFIG} was not restored`);
  process.exit(1);
}
process.exit(status);
