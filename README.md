# Fade

A soroban (Japanese abacus) that lies on your real desk in mixed reality.
You slide its beads with your fingertip, no controllers. This is the first
build of a daily mental-math habit: as you get better, the abacus fades away,
and you keep sliding beads that are no longer there.

Built with the Immersive Web SDK (WebXR on Three.js) for Meta Quest 3 / 3S.

**Live build:** https://chainwright.github.io/fade-abacus/

## What works today

- **Desk placement.** In passthrough, the app looks for a horizontal surface at
  desk height in front of you (plane detection) and lays the abacus on it,
  turned to face you. If there is no desk within about 2.5 seconds, it floats at a
  comfortable spot about 45° below eye level, within reach.
- **Big beads.** Five rods with one upper bead (worth 5) and four lower beads
  (worth 1 each). Each bead has a 2.4 cm face and 3 cm of travel, because
  hand-tracked fingertips are accurate to roughly a centimetre.
- **Fingertip push.** A dot follows each index fingertip and turns amber on contact.
  You can push a bead from its side (from below or above on the rod), or put
  your fingertip on top of a bead and slide it, the way you would on a real
  soroban. Beads push their neighbours and stop at the frame and the beam.
  After you let go they settle into a clean position, and a soft click marks
  each change.
- **Per-rod readout.** A small digit in front of each rod shows its value
  (0–9), lying on the desk where it stays in view without blocking anything.

Not built yet: the fading stages, the one-touch desk calibration, the
persistent desk anchor, hand occlusion, and the daily exercises.

## Run locally

Requires Node.js 20.19+ (22.12+ or 24 recommended).

```sh
npm install
npm run dev        # starts the dev server and opens a browser with the XR emulator
```

Other scripts:

```sh
npm test           # bead physics unit tests (Node 22.18+ or 24)
npm run typecheck
npm run build      # production build into dist/
npm run check      # all three
```

## Try it without a headset (emulator)

The build includes IWER, the Immersive Web Emulator, for desktop browsers
(it is skipped automatically in the Quest browser, which has real WebXR).

1. Open the live build (or `npm run dev`) in desktop Chrome.
2. Press **Enter**. The emulator loads a furnished home office with a desk.
3. In the emulator panel, switch the input to **hands**.
4. Move the emulated head toward the desk to sit at it, then move the right hand
   so its index fingertip meets a bead, and drag it along the rod.

Emulator controls: https://iwsdk.dev/guides/02-testing-experience.html#iwer-controls

## On a Quest 3 / 3S

Open the live build in the Quest browser, sit at a desk, put the controllers
down, and press **Enter**. Allow the requests for hand tracking and spatial data.

## Project layout

```
iwsdk.config.json        XR mode (passthrough), features, emulator settings
src/index.ts             creates the world, wires the Enter button
src/soroban-system.ts    desk placement, fingertip contact, readout, sound
src/bead-physics.ts      one-dimensional bead model (pure, unit-tested)
src/soroban-layout.ts    dimensions
src/soroban-model.ts     procedural frame, rods, beads and digit labels
src/click-sound.ts       synthesized click (no audio files)
tests/                   bead physics tests
devlog/                  daily notes and emulator screenshots
```

## License

MIT, see [LICENSE](LICENSE).
