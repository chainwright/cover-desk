# Fade

A soroban (Japanese abacus) that lies on your real desk in mixed reality.
You slide its beads with your fingertip, no controllers. This is the first
build of a daily mental-math habit: as you get better, the abacus fades away,
and you keep sliding beads that are no longer there.

Built with the Immersive Web SDK (WebXR on Three.js) for Meta Quest 3 / 3S.

**Live build:** https://chainwright.github.io/fade-abacus/

## What works today

- **One-touch desk calibration.** Tap the desk with an index fingertip and hold
  it still for a moment. The app averages the fingertip height over the hold,
  takes the desk to be just below it, and puts the abacus under that hand,
  turned to face you. If the headset has detected the desk, the frame is kept
  on it and a pause in mid-air above the desk is not taken as a tap.
- **Automatic placement as a fallback.** Without a tap, the app looks for a
  horizontal surface at desk height in front of you (plane detection). If there
  is none within about 2.5 seconds, it floats at a comfortable spot within reach.
- **Same spot next time.** The desk spot is saved with a persistent anchor, so
  the abacus comes back to the same place on your desk in the next session. To
  move it, hold a fingertip on the small knob at its near-left corner, then tap
  the desk somewhere else.
- **Big beads.** Five rods with one upper bead (worth 5) and four lower beads
  (worth 1 each). Each bead has a 2.4 cm face and 3 cm of travel, because
  hand-tracked fingertips are accurate to roughly a centimetre.
- **Fingertip push.** A dot follows each index fingertip: pale when you are
  above the abacus, light amber at touch height, amber while moving a bead.
  Push a bead from its side (sliding along the desk) or put your fingertip on
  top of a bead and slide it. Touch and release use different heights
  (hysteresis), so a resting finger does not flicker in and out of contact.
- **Your real hand in front.** The tracked hand hides the virtual beads behind
  it instead of drawing an outline, so the passthrough hand shows over the
  abacus.
- **Per-rod readout.** A small digit in front of each rod shows its value (0–9).

Not built yet: the fading stages, the tutorial, and the daily exercises.

## URL options

| Option | What it does |
|---|---|
| `?test=1` | Tester mode: a live panel with fingertip height and contact state, four short guided steps, and a touch log you can download after exiting |
| `?read=rest` | Reads each rod from where the finger comes to rest (the reader for the faded stages) instead of from bead collisions |
| `?hands=outline` / `?hands=off` | The SDK's white hand outline, or no hand at all (default: an invisible mask) |
| `?occlude=depth` | Also asks for depth sensing and softens the abacus behind real objects (more GPU work) |
| `?reset=1` | Forgets the saved desk spot |

## Touch log

Tester mode records the fingertip (in the abacus's frame, in millimetres), the
contact state and the guided step, at 30 Hz, while the hand is over the
abacus. Format `fade-touch-log` v1 is described in `src/touch-log.ts`.

```sh
npm run analyze -- fade-touch-log-XXXX.json   # scores a log, re-runs other thresholds
npm run sweep                                  # threshold sweep under a noise model
```

## Run locally

Requires Node.js 20.19+ (22.12+ or 24 recommended).

```sh
npm install
npm run dev        # starts the dev server and opens a browser with the XR emulator
```

Other scripts:

```sh
npm test           # unit tests: bead physics, contact, calibration, rest reader, log (Node 22.18+ or 24)
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
Then tap the desk where you want the abacus and hold your fingertip still for a
moment. Persistent anchors are not kept in private browsing.

## Project layout

```
iwsdk.config.json        XR mode (passthrough), features, emulator settings
src/index.ts             creates the world, wires Enter and the tester buttons
src/soroban-system.ts    placement, calibration, contact, readout, tester panel
src/calibration.ts       tap-and-hold detection and desk spot (pure, unit-tested)
src/contact.ts           touch versus hover thresholds (pure, unit-tested)
src/rest-reader.ts       reading a rod from where the finger rests (pure, unit-tested)
src/desk-anchor.ts       persistent anchor for the desk spot
src/touch-log.ts         touch log format, recorder and analyser
src/bead-physics.ts      one-dimensional bead model (pure, unit-tested)
src/soroban-layout.ts    dimensions
src/soroban-model.ts     procedural frame, rods, beads and digit labels
src/text-card.ts         small text panels drawn to a canvas
src/flags.ts             URL options
src/click-sound.ts       synthesized click (no audio files)
tools/                   threshold sweep and log analyser (Node)
tests/                   unit tests
devlog/                  daily notes, emulator screenshots and logs
```

## License

MIT, see [LICENSE](LICENSE).
