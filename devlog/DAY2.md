# Day 2 (built 10 Nov 2026, evening): desk calibration, anchor, touch thresholds, tester mode

## Built

- **One-touch desk calibration** (`src/calibration.ts`, pure). The fingertip is
  sampled into a ring buffer. A calibration fires when the tip has come down
  at least 2.5 cm within the last second and then stays still for 0.6 s
  (height spread ≤ 6 mm, sideways ≤ 12 mm), 0.2–1.0 m below the eyes and
  0.12–0.8 m in front. The desk height is the mean tip height over the hold
  minus 8 mm (tip joint to finger pad). A ring closes in on the fingertip while
  the hold builds up, and a click marks the placement.
  - The abacus goes under the finger, turned to face the user. A touch beyond
    comfortable reach is pulled in toward the user (aim: centre ≤ 0.45 m from
    the eyes). If the headset has a desk plane under the finger, the frame is
    then kept inside that plane. Without a plane the pull is limited to 5 cm,
    because the touch proves there is desk under the finger, not between the
    finger and the user.
  - If a detected desk lies more than 3 cm below a hold, the hold was in the
    air and is ignored (found in testing, see below).
  - Taps inside the abacus are bead touches, not calibration.
  - Plane detection and the no-desk fallback are kept. A plane-placed abacus
    keeps listening for a tap until the first bead is moved. The fallback spot
    is now 0.32 m ahead and 0.32 m below the eyes (centre 0.45 m away).
  - A small knob outside the near-left corner: hold a fingertip on it for
    0.8 s, then tap the desk somewhere else to move the abacus.
  - A short prompt card ("Tap your desk where you want it / and hold your
    fingertip still") shows while the app is listening.
- **Persistent desk anchor** (`src/desk-anchor.ts`). Our own WebXR anchor sits
  exactly at the abacus pose and has a persistent handle saved in
  localStorage. Next session it is restored and the abacus follows it. Placing
  the abacus again deletes the old persistent anchor, so only one of ours
  exists (the browser caps persistent anchors per site). `?reset=1` forgets it.
  - I did not reuse the SDK's own anchor (one anchor at the session origin).
    For a few frames after a failed restore its stored ID still names the old
    anchor, so it could not tell "restored" from "new".
- **Hand visuals.** The SDK draws the tracked hand as a white outline plus an
  invisible depth mask that renders after the opaque abacus, so it hid nothing.
  By default (`?hands=mask`) the hand mesh now writes depth only and renders
  first: virtual beads behind the hand are not drawn, and the passthrough hand
  shows through. The outline is hidden. `?hands=outline` restores the SDK
  look, and `?hands=off` hides both.
- **Depth occlusion behind a flag** (`?occlude=depth`). It requests depth
  sensing as optional (not required, so a browser without it still starts),
  registers `DepthSensingSystem`, and adds soft `DepthOccludable` to the
  abacus. It's off by default until the frame cost is measured on a headset.
- **Touch versus hover with hysteresis** (`src/contact.ts`, pure). Contact
  starts below the bead-top surface + 4 mm and ends only above + 16 mm, with a
  rod band of ±23 mm (±27 mm once in contact). The fingertip dot has three
  colours: pale over the abacus, light amber at touch height, amber while
  moving a bead.
- **Rest reader behind a flag** (`src/rest-reader.ts`, `?read=rest`). Each
  stroke on a rod becomes start point, rest point (lift-off or 0.35 s still)
  and contact mode (on a bead top or at desk level). It is replayed as a
  straight line on a clean layout of the rod's value, using the same bead
  physics. With the flag, this value drives the digit and the beads snap to it.
  Without the flag it runs in the shadow and logs every stroke beside the bead
  reading.
  - My first version inferred the count from the rest point alone, and the
    unit test against bead physics caught it on a push that carries the whole
    stack (0 vs 4). Replaying the stroke keeps the visible and faded stages
    consistent.
- **Tester mode** (`?test=1`). The intro card shows three plain lines and two
  buttons after exit: Download log (JSON) and Copy summary (a short scored
  summary to paste into a message). In the headset, a panel behind the abacus
  shows the placement and anchor state, each fingertip's height in mm with its
  state and rod, both readings, and four timed guided steps: slide along the
  desk under the middle rod (8 s), hold 2 cm above it (6 s), move back and
  forth 5 cm above (6 s), rest on a bead top (6 s). There is a 2.5 s "next"
  card between steps, then free play. `?guide=0` turns the steps off for
  scripted runs.
- **Touch log format** `fade-touch-log` v1 (`src/touch-log.ts`). Per session:
  placement, calibration (spread, sample count, difference from the detected
  plane), events (contact start and end, bead value, rest value with the bead
  value next to it, label, move, rejected calibration), and samples at 30 Hz
  while a hand is over the abacus:
  `[t s, hand, x mm, y mm, z mm, rod, state, label]` in the abacus frame.
  `npm run analyze -- <log>` scores each guided step and re-runs a grid of
  thresholds on the real samples.
- Tests: 23 unit tests (9 from day 1, 14 new). The CI build stamps the commit
  into each log.

## Threshold tuning

`npm run sweep` runs the app's contact rule over simulated fingertip tracks:
600 trials × 1.5 s at 72 Hz per intent, with fixed seeds.

The noise model is an assumption, and real logs replace it. Height bias per
touch is SD 3 mm: calibration uses the same fingertip, so a constant pad offset
cancels and what's left is drift. Frame jitter is SD 2.5 mm, correlated (0.8).
Across the rods, bias is SD 5 mm, jitter SD 2.5 mm and aim error SD 6 mm. A bead
top touched with no haptics lands at −3 ± 6 mm, and "2 cm above" means 20 ± 4 mm.

Selection rule, fixed before choosing: a 2 cm hover may count as a touch in at
most 3% of trials (half of a 5% budget, kept as margin for a guessed model),
and a 3 cm hover in at most 1%. Within that, minimise missed touch frames plus
drop-outs.

| enter mm | exit mm | band mm | bead top: missed frames | desk: missed frames | bead top: drop-outs per touch | 2 cm hover counted | 3 cm | 5 cm | wrong rod |
|---|---|---|---|---|---|---|---|---|---|
| 4 | 4 | 23 | 16.4% | 0.2% | 1.98 | 2.5% | 0% | 0% | 0.2% |
| **4** | **16** | **23** | **4.0%** | **0.2%** | **0.01** | **2.5%** | **0%** | **0%** | **0.2%** |
| 4 | 16 | 25 | 3.9% | 0.2% | 0.01 | 2.5% | 0% | 0% | 0.2% |
| 6 | 14 | 23 | 2.6% | 0.2% | 0.03 | 4.8% | 0% | 0% | 0.2% |
| 6 | 18 | 25 | 1.7% | 0.2% | 0.01 | 5.0% | 0% | 0% | 0.2% |

The first row is day 1 (no hysteresis).

**Chosen: enter +4 mm, exit +16 mm, band 23 mm (27 mm while in contact).**
Heights are above the bead-top surface, which sits 57 mm above the desk for the
tip joint. Hysteresis is the big win: a fingertip resting on a bead no longer
flickers out of contact about twice per touch, and each flicker could restart
the push from the other side. Enter 6 mm misses fewer bead-top frames but sits
on the 5% hover limit. Band 25 mm is 0.1 point better in the model but halves
the empty gap between rods (10 → 6 mm), so I kept 23 mm. Full grid:
`day2_threshold_sweep.md` and `.json`.

## Tested (emulator, headless Chromium via the IWSDK CLI)

| Check | Result |
|---|---|
| Unit tests (`npm test`) | 23/23 pass |
| Mutation: contact without hysteresis | hysteresis test fails (guard is real) |
| Mutation: calibration without the tap descent | "resting hand doesn't calibrate" test fails |
| Typecheck + production build | pass |
| A resting hand that slides in at desk level, no tap → no calibration | pass |
| A still pause 6 cm above the detected desk after moving down → ignored | pass |
| Tap + hold on free desk → placement `touch`, desk height vs plane | −0.1 mm |
| Touch spot kept on the desk (near rail z −1.731 behind the edge at −1.68) | pass |
| Day 1 bead checks (edge push 4, upper → 9, top drag → 8, hovers at 20 and 10 mm change nothing, other rods unchanged) | 6/6 pass |
| Rest reader in the shadow equals the bead reading on every rod | pass |
| Hold the knob 0.8 s → listening; tap elsewhere → moved 0.27 m | pass |
| Height × offset sweep (9 heights from −49 to +40 mm × 5 offsets 0–30 mm), app state vs the rule | 45/45 match, 0 false, 0 missed |
| Hysteresis in motion: lifted to +10 mm stays in contact, +25 mm lets go | pass |
| Exit, re-enter standing elsewhere → placement `anchor`, same spot | 0.00 mm |
| Full page reload → placement `anchor`, same spot | 0.00 mm |
| Log export → `fade-touch-log` v1, analyser scores the sweep log | 0% error per step at the chosen thresholds |
| `?occlude=depth`: session starts, depth system live, abacus has soft occlusion, no errors | pass (visual effect not provable in the emulator) |
| Intro card fits a 756×469 viewport with the tester block (title at y = 80 px) | pass |

On the analyser re-run of the sweep log, enter 8 mm turns the 6 mm hover into
touches (32.8%), and enter ≤ 2 mm misses the +3 mm bead-top points (34–68%).
That is the trade-off the real logs need to settle.

Rest reader vs bead physics for every lower-deck change (0–4 → 0–4), 25 seeds,
with jitter along the rod:

| Jitter SD | Rest reader correct | Bead physics correct |
|---|---|---|
| 0–2 mm | 100% | 100% |
| 4 mm | 97.0% | 94.2% |
| 6 mm | 89.2% | 74.8% |

Screenshots:
- `day2_01_touch_placed.png`: seated, abacus placed by a desk tap; tester
  panel behind it
- `day2_02_finger_push_hand_mask.png`: pushing beads on rod 2. The hand's depth
  mask hides the virtual parts behind the hand (in the headset the real hand
  shows there).
- `day2_03_depth_occlusion_flag.png`: the `?occlude=depth` build, abacus
  restored from the anchor
- `day2_04_tester_intro.png`: the browser card in tester mode
- `day2_05_tester_panel_step.png`: tester panel during a guided step
- `day2_06_first_run_prompt.png`: first run after reset, plane-placed, with
  the tap prompt

Data: `day2_emulator_sweep.json` (sweep rows) and
`day2_emulator_touch_log.json` (the log of the labelled sweep, in the tester
format).

## Found and fixed during testing

- The plane lookup took the highest plane over the finger, which was the
  ceiling (desk height "off by 1975 mm"). It now takes the plane nearest in
  height and ignores floor and ceiling.
- Pulling the touch spot toward the user put the near rail about 9 cm past the
  emulated desk edge. Pulling in is now limited to 5 cm unless a desk plane
  says it is safe.
- A pause in the air after a downward move calibrated the desk 6 cm (then
  14 cm) too high. Holds above a detected desk are now rejected.
- The intro card's top was cut off on a short screen once the tester block was
  added.

## Open risks

- **Reach vs desk edge.** In the emulated office, the eyes are 0.45 m above the
  desk and 0.20 m behind its edge. Any spot that keeps the 26 cm deep frame on
  the desk is at least 0.57 m from the eyes (placed: 0.59–0.61 m). The 0.45 m
  aim is geometrically impossible there. Options: a shallower frame, letting
  the near rail overhang a little, or trusting that people lean in. Decide
  after seeing a real desk.
- **Mid-air tap without a detected desk.** With no plane there is no way to
  tell a pause in the air from a tap on wood. The abacus would then float at
  the pause height, and the knob fixes it. Real logs will show how often this
  happens.
- **All thresholds come from a model.** The emulator has no tracking noise
  (measured tip = commanded tip, 0.0 mm). The first real Quest logs replace
  the model.
- **Depth occlusion cost and look** are unmeasured. It stays off by default.
- **Hand mask alignment.** The tracked hand mesh is about 1 cm off the real
  hand, so the mask edge may show a sliver of desk or bead around the finger.
- **Anchor persistence on the Quest browser** (restore and delete) is only
  proven in the emulator. It isn't kept in private browsing.
- **Getting the log off a headset.** Download saves a file on the Quest. Copy
  summary is the easy path for a tester, but it carries rates, not samples.
- Bundle is about the same as day 1 (≈1.1 MB gzipped main chunk plus the
  injected emulator for desktop).

## Next (plan step 3)

1. The four fade stages on top of the rest reader. The digit and click keep
   working when the beads are gone.
2. No-text tutorial and the first taste of the empty desk at about 60 s, plus a
   judge shortcut to the empty desk.
3. Public test build with `?test=1` for headset testers. Fold their logs back
   into `src/contact.ts` with `npm run analyze`.
