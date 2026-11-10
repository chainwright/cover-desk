# Day 1 (10 Nov 2026): skeleton, desk placement, fingertip push

## Built

- IWSDK project scaffolded with `@iwsdk/create` 1.1.0-rc.2 (the current `latest`
  tag), as a mixed-reality (`immersive-ar`) app with hand tracking, plane
  detection and anchors. Locomotion, grabbing, physics, mesh detection and
  spatial UI are off.
- A procedural soroban: 5 rods, 1 upper and 4 lower bicone beads per rod. Each
  bead has a 2.4 cm face along the rod and 3 cm of travel, and there is a 2 cm
  finger gap between the resting beads and the frame. The frame is 30 × 26 cm.
- Desk placement: picks a horizontal plane 0.2–1.2 m below the eyes, preferring
  ones labelled table or desk, at the spot about 45° below eye level and
  within reach (0.35–0.55 m), clamped to the desk edges. The abacus turns to face
  you. If no plane fits within 2.5 s, it uses a fallback 0.45 m ahead and 0.45 m
  below the eyes. A desk found within 10 s of the fallback still wins, once.
- Fingertip contact using `player.indexTipSpaces`, only while an input source
  is tracked on that side. A 7 mm dot is drawn on top of everything and turns
  amber on contact.
- Bead physics (`src/bead-physics.ts`, pure and unit-tested), with two contact
  modes chosen when the finger first reaches a bead:
  - edge push: the finger shoves the bead and its neighbours ahead of it;
  - top drag: the finger lands on top of the bead and the bead follows it, like
    friction on a real soroban. Without this, a bead resting against the beam
    or the frame could not be moved at all.
  The contact side is remembered until the finger leaves, so a bead blocked at
  the end of the rod never jumps through the finger. Beads settle to a clean
  state 0.12 s after the last touch.
- Per-rod digit (0–9) on a small tilted label in front of the near rail.
  It changes only when the reading changes, and a synthesized click plays
  (no audio files).
- An intro card in the browser with an Enter button. The IWER emulator is
  injected into the production build for desktop browsers only; the Quest
  browser is excluded by user agent and keeps native WebXR.

## Tested (emulator, headless Chromium via the IWSDK CLI)

| Check | Result |
|---|---|
| Unit tests, bead physics (`npm test`) | 9/9 pass |
| Mutation: disable the contact-side memory | 2 tests fail (the guard is real) |
| Typecheck + production build | pass |
| Browser preview renders, no app errors in the console | pass (1 SDK deprecation warning) |
| Plane detection in the emulated home office | 13 planes; desk at 0.725 m found |
| Seated at the desk → placement `desk`, on the plane (+1 mm) | pass |
| Standing at the room centre, desk out of reach → `fallback` after ~2.5 s | pass |
| Edge-push 4 lower beads to the beam → rod reads 4 | pass (rod 2 and rod 0) |
| Edge-push the upper bead to the beam → 9 | pass (rod 2 and rod 0) |
| Top-drag one lower bead off the beam → 8 | pass (rod 2 and rod 0) |
| Fingertip hovering 3 cm above the beads → no change | pass |
| Neighbouring rods unchanged | pass |

The hand was driven with `iwsdk xr set-transform` / `animate-to`, anchored at
the index tip, in the `point` pose.

Screenshots:
- `01_preview_browser.png`: browser view before entering, with the intro card
- `02_xr_desk_placed.png`: seated at the emulated desk, abacus placed on it
- `03_xr_finger_on_bead.png`: hand on rod 3, digits reading 0 4 8 4 0
- `04_xr_close_contact.png`: closer view of the same state
- `05_xr_fallback_no_desk.png`: no desk in reach, fallback spot

## Not tested on hardware yet (no Quest 3 available today)

- Real fingertip accuracy against the real desk. Touch versus hover is the core
  risk. Contact needs the fingertip within the rod's band (±2.3 cm across) and
  below the bead tops plus about 1.2 cm.
- Frame rate. The scene is about 3k triangles and about 45 draw calls with no
  shadows, so it should be light, but it has not been measured on device.
- Plane detection on Quest: whether a real desk comes back as a horizontal plane
  labelled table/desk, how fast, and whether the room setup must include it.
- The permission prompts for hand tracking and spatial data in the Quest
  browser, and whether `Enter` (or the native prompt) starts the session.
- Whether the click sound plays (the audio unlock comes from the Enter tap).
- The rendered hand mesh over the real passthrough hand. It may need hiding or
  occlusion.

## Risks and notes

- Reach: on a desk the abacus centre lands about 0.47–0.6 m from the eyes (the
  whole frame must fit on the desk). The far upper beads may be a stretch for
  short arms. One-touch calibration (tomorrow) should place it where the hand is.
- In the fallback, the abacus floats with no surface under the finger, so there is
  nothing to press against.
- Bundle: about 1.3 MB gzipped for the app plus about 1.5 MB (uncompressed) of
  injected emulator. The emulator isn't run on Quest, but it is still downloaded. Measure
  load time on device, and if it's slow, ship the emulator only on a separate
  path.
- The SDK release is `1.1.0-rc.2` (a release candidate tagged `latest`). It is
  pinned exactly in package.json.
- An edge push from the user's side moves all four lower beads as a block (correct
  physics). To set 1–3, slide the beads from the top. The tutorial has to teach
  this without text.

## Tomorrow (plan step 2)

1. One-touch desk calibration: the user taps the desk once with an index
   finger. Average a few samples of fingertip height to set the surface to
   about 1 cm, and place the abacus under that hand. Keep plane detection as the
   automatic path.
2. Persistent anchor for the desk spot (the SDK's `XRAnchor` support), so the
   abacus returns to the same spot of the desk.
3. Hide or soften the rendered hand mesh in passthrough. Try soft depth occlusion.
4. A tuning pass on contact thresholds, driven by an emulator script that logs
   false touches during hover, plus a touch/hover log format ready for the
   Quest test on day 4.
5. Start the per-rod reading for the faded stages, where the value comes from where
   the finger rests rather than from bead meshes.
