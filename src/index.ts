import { VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { unlockAudio } from './click-sound.js';
import { SorobanSystem } from './soroban-system.js';

const intro = document.getElementById('intro') as HTMLDivElement;
const enter = document.getElementById('enter') as HTMLButtonElement;
const note = document.getElementById('note') as HTMLParagraphElement;

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then(async (world) => {
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
});
