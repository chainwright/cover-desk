import { DepthSensingSystem, VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { unlockAudio } from './click-sound.ts';
import { CoverSystem, coverDebug } from './cover-system.ts';
import { installEmuSeat } from './emu-seat.ts';
import { flags } from './flags.ts';
import { flushOnPageHide } from './log-store.ts';

const intro = document.getElementById('intro') as HTMLDivElement;
const enter = document.getElementById('enter') as HTMLButtonElement;
const note = document.getElementById('note') as HTMLParagraphElement;
const tester = document.getElementById('tester') as HTMLDivElement;
const download = document.getElementById('download') as HTMLButtonElement;
const copy = document.getElementById('copy') as HTMLButtonElement;
const logInfo = document.getElementById('log-info') as HTMLParagraphElement;
const guided = document.getElementById('guided') as HTMLButtonElement;
const newLog = document.getElementById('new-log') as HTMLButtonElement;

// Depth occlusion is opt-in (?occlude=depth): requested as optional so a
// browser without it still starts the session.
if (flags.depth && projectOptions.xr) {
  projectOptions.xr.features = {
    ...projectOptions.xr.features,
    depthSensing: { required: false, usage: 'gpu-optimized', format: 'float32' },
  };
}

// Chief 12.11: the room's furniture from Space Setup casts shade (cover-system addSceneCover). Requested only on a
// headset: the desktop emulator (IWER) hangs its session start with mesh-detection on.
if (projectOptions.xr && !__COVER_EMU__ && !('IWER_DEVICE' in window)) {
  projectOptions.xr.features = { ...projectOptions.xr.features, meshDetection: true };
}
// Chief 12.11: the lantern's light cuts a hole in the night (stencil), see cover-model.ts / ambience.ts.
(projectOptions as { render?: Record<string, unknown> }).render = { ...((projectOptions as { render?: Record<string, unknown> }).render ?? {}), stencil: true };

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then(async (world) => {
  if (flags.depth) {
    world.registerSystem(DepthSensingSystem, {
      configData: { enableDepthTexture: true, enableOcclusion: true, useFloat32: true, blurRadius: 20 },
    });
  }
  world.registerSystem(CoverSystem);

  // The main build never contains the Immersive Web Emulator (IWER); the
  // desktop emulator build lives at ./emu/. This flag says which one runs here.
  const emulator = 'IWER_DEVICE' in window;
  console.info(`[cover] emulator: ${emulator}`);
  document.documentElement.dataset.emulator = String(emulator);

  const supported = (await navigator.xr?.isSessionSupported('immersive-ar').catch(() => false)) ?? false;
  if (supported && emulator) {
    enter.disabled = false;
    note.textContent =
      'Desktop emulator: a simulated room and hands. Enter seats you at its desk with hands; then H stands your hand like \'stop\' where the ghost hand shows, holding → slides it to lead the creature, L lifts it, C cups the lantern. Level 2 (after a win, or ?level=2): O stands an emulated mug in the keeper\'s gaze, H the hand at the left ghost, R lifts it up, over the gaze and down at the right ghost. On a Quest, open the main link instead.';
    installEmuSeat(cover);
  } else if (supported) {
    enter.disabled = false;
    note.textContent = 'Sit at a desk. Hands only, no controllers.';
  } else {
    note.textContent = 'Open this page in the browser of a Meta Quest 3 or 3S. No headset? ';
    const a = document.createElement('a');
    a.href = './emu/';
    a.textContent = 'Try it in the desktop emulator.';
    note.appendChild(a);
  }

  const start = () => {
    unlockAudio();
    Promise.resolve(world.launchXR()).catch((e: unknown) => {
      note.textContent = `Could not start: ${e instanceof Error ? e.message : String(e)}`;
    });
  };
  enter.addEventListener('click', start);
  guided.disabled = enter.disabled;
  guided.addEventListener('click', () => {
    cover()?.armGuide();
    start();
  });
  document.addEventListener('pointerdown', unlockAudio, { once: true });

  world.visibilityState.subscribe((state) => {
    intro.hidden = state !== VisibilityState.NonImmersive;
    if (state !== VisibilityState.NonImmersive) unlockAudio();
  });

  if (flags.test) setUpTester();
});

// Day 7b: the game's handle comes from the module; only the /emu/ build also puts it on window (checks).
const cover = coverDebug;

function setUpTester(): void {
  tester.hidden = false;
  const refresh = () => {
    const f = cover();
    const n = f?.logSamples() ?? 0;
    const store = f?.logStore;
    const sessions = store?.sessions ?? 0;
    download.disabled = copy.disabled = sessions === 0;
    newLog.disabled = sessions === 0;
    const kept =
      store?.status === 'ready'
        ? 'Kept on this headset until you start a new log; download it right after leaving the immersive view.'
        : store?.status === 'failed'
          ? `NOT kept on this headset (${store.error}): download it before you reload or restart.`
          : '';
    const full = store?.full ? ' The log is full: download it and start a new log.' : '';
    logInfo.textContent = sessions
      ? `Log: ${n} samples in ${sessions} session${sessions === 1 ? '' : 's'}. ${kept}${full}`
      : `No log yet. ${kept}`;
  };
  refresh();
  window.addEventListener('cover:session-end', refresh);
  window.addEventListener('cover:log-store', refresh);
  // Write the log's last seconds when the page goes away (reload, new URL, headset sleep).
  flushOnPageHide(window, document, () => void cover()?.flushLog());

  newLog.addEventListener('click', async () => {
    if (!confirm('Delete the log kept on this headset and start a new one? Download it first if you still need it.')) return;
    await cover()?.resetLog();
    refresh();
  });

  download.addEventListener('click', () => {
    const json = cover()?.exportLog();
    if (!json) return;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `cover-tester-log-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  });

  copy.addEventListener('click', async () => {
    const summary = JSON.stringify(cover()?.summary());
    try {
      await navigator.clipboard.writeText(summary);
      logInfo.textContent = 'Summary copied. Paste it into your email with the downloaded log file attached (or into the public tester form above).';
    } catch {
      logInfo.textContent = summary;
    }
  });
}
