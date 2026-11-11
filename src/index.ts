import { DepthSensingSystem, VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { unlockAudio } from './click-sound.js';
import { flags } from './flags.ts';
import { SorobanSystem, type FadeDebug } from './soroban-system.js';

const intro = document.getElementById('intro') as HTMLDivElement;
const enter = document.getElementById('enter') as HTMLButtonElement;
const note = document.getElementById('note') as HTMLParagraphElement;
const tester = document.getElementById('tester') as HTMLDivElement;
const download = document.getElementById('download') as HTMLButtonElement;
const copy = document.getElementById('copy') as HTMLButtonElement;
const logInfo = document.getElementById('log-info') as HTMLParagraphElement;

// Depth occlusion is opt-in (?occlude=depth): requested as optional so a
// browser without it still starts the session.
if (flags.depth && projectOptions.xr) {
  projectOptions.xr.features = {
    ...projectOptions.xr.features,
    depthSensing: { required: false, usage: 'gpu-optimized', format: 'float32' },
  };
}

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then(async (world) => {
  if (flags.depth) {
    world.registerSystem(DepthSensingSystem, {
      configData: { enableDepthTexture: true, enableOcclusion: true, useFloat32: true, blurRadius: 20 },
    });
  }
  world.registerSystem(SorobanSystem);

  const supported =
    (await navigator.xr?.isSessionSupported('immersive-ar').catch(() => false)) ?? false;
  if (supported) {
    enter.disabled = false;
    note.textContent = 'Sit at a desk. Hands only, no controllers.';
  } else {
    note.textContent = 'Open this page in the browser of a Meta Quest 3 or 3S.';
  }

  enter.addEventListener('click', () => {
    unlockAudio();
    world.launchXR();
  });
  // A native "enter" prompt can also start the session; any tap unlocks audio.
  document.addEventListener('pointerdown', unlockAudio, { once: true });

  world.visibilityState.subscribe((state) => {
    intro.hidden = state !== VisibilityState.NonImmersive;
    if (state !== VisibilityState.NonImmersive) unlockAudio();
  });

  if (flags.test) setUpTester();
});

function setUpTester(): void {
  tester.hidden = false;
  const fade = () => (window as unknown as { __fade?: FadeDebug }).__fade;
  const refresh = () => {
    const n = fade()?.logSamples() ?? 0;
    download.disabled = copy.disabled = n === 0;
    logInfo.textContent = n ? `Log ready: ${n} samples.` : 'No log yet.';
  };
  refresh();
  window.addEventListener('fade:session-end', refresh);

  download.addEventListener('click', () => {
    const json = fade()?.exportLog();
    if (!json) return;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `fade-touch-log-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  });

  copy.addEventListener('click', async () => {
    const summary = JSON.stringify(fade()?.summary());
    try {
      await navigator.clipboard.writeText(summary);
      logInfo.textContent = 'Summary copied. Paste it in a message to us.';
    } catch {
      logInfo.textContent = summary; // clipboard blocked: show it to select by hand
    }
  });
}
