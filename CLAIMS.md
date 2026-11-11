# What Cover claims, and how far each claim is proven

Three levels:

- **Reproducible**: anyone can check it from this repository with the
  command shown.
- **Emulator**: we ran it in the Immersive Web Emulator (headless, simulated
  room and hands); the script and its output are in the repo, but it says
  nothing about real tracking or a headset's frame rate.
- **Not shown yet**: designed and coded, no evidence yet. These are the
  points the first Quest session ([TESTER_PROTOCOL.md](TESTER_PROTOCOL.md))
  has to settle.

Last updated: day 5, 11 Nov 2026. The evidence per judging criterion, with
the mutation table and what is unproven, is in [EVIDENCE.md](EVIDENCE.md).

| Claim | Level | Evidence |
|---|---|---|
| A hand pose or a registered object between the lantern and the creature hides it; a hand beside, behind, above or under the line does not | Reproducible (geometry model, synthetic 25-joint hands; not real tracked hands) | `npm test`: line-of-sight case set 18/18 (9 cover cases, 9 negative controls), labels written from the geometry in `tests/los-cases.test.ts` (labels and test arrived in the same commit) |
| The teaching copy matches the light: a "stop" hand standing on the desk between the lantern and the path is cover; one held with the wrist above about 7 cm, or in the light in front of the path, is not (geometry only; since day 5 a hand within 6.3 cm of the lantern also wakes the keeper) | Reproducible (same model) | `tests/day3.test.ts` "teaching copy" |
| Where the ghost hand teaches, a standing "stop" hand shades a lane, not the whole light: the creature dashes into it and stops; a still hand there never gets it home; sliding the hand along does, at any speed from 1 to 9 cm/s; 10 cm/s or faster outruns it | Reproducible (same model, synthetic hand, 7 mm joint radius) + Emulator | `tests/day4.test.ts` (litFraction strictly between 0 and 1, still hand ±1 cm never wins), `tests/day5.test.ts` (slide-speed sweep 1–15 cm/s); `/emu/` runs on days 4 and 5: after H litFraction 0.826, 30 s still → no win, → held → a win (`devlog/DAY4.md`, `devlog/DAY5.md`) |
| A hand right at the lantern is no longer an easy way across: within 6.3 cm of it the keeper wakes, sees the whole path, and says so on a card | Reproducible (same model) + Emulator | `tests/day5.test.ts` (the radius bisected against every still "stop" hand that crossed without a slide; cupping still or sliding never crosses; the ghost's spot ±1 cm stays clear); day-5 `/emu/` wiring check, key C (`devlog/DAY5.md`). The margin is about 2 mm on each side in the model; real hands not checked |
| Any still hand pose never crosses | **Not claimed** | a hand laid on its edge along the path, as a long wall, shades the whole lit path and the creature crosses without a slide (`tests/day5.test.ts` pins it as known) |
| Cover doesn't depend on recognising a pose (upright palm, edge-on, fist, flat beside the path) | Reproducible | same case set, cases P1–P6 |
| The shadow drawn on the desk matches the creature's sight test | Reproducible | test "light map … equals the sight test at every cell centre" (2,048 cells, one scene with two hands and an object); between cell centres the texture is interpolated |
| Losing the hand that shades the creature pauses play instead of getting it spotted; a registered object taking over the shade ends the wait | Reproducible + Emulator | `tests/day2.test.ts` (4 cases), `tests/day3.test.ts` (object takes over); walkthrough phase `coverloss` (one hand disconnected, the other tracked) |
| Lifting a still-tracked hand still gets the creature spotted | Reproducible + Emulator | `tests/day2.test.ts`; walkthrough phase `lifted` |
| On the first run the ghost hand and the teaching card show, also after the automatic desk placement | Reproducible + Emulator | `tests/day2.test.ts` (first-run cues); day-2 walkthrough phase `firstrun`, screenshot `devlog/day2_01_first_run_ghost_prompt.png` (that screenshot shows the day-2 wording); day-3 `/emu/` run (`devlog/DAY3.md`) |
| Placement timing: a desk found up to 10 s after the board floats still wins; the saved spot is waited for up to 8 s | Reproducible | `tests/day3.test.ts` (placement); `src/placement.ts` |
| A mug can be registered without tapping the desk first | Reproducible + Emulator | `tests/day2.test.ts`; walkthrough phase `register` |
| The main build (`/`) contains no emulator, so a Quest browser can't be put into an emulated session | Reproducible | `npm run build` ends with `tools/check-dist.mjs`, which fails if the emulator runtime's marker strings are found in `dist/` outside `dist/emu/`; a deliberately leaky build made it fail (author's run, DAY2.md; its output was not kept) |
| The tests guard the pure core, the placement timing, the lane, the wake rule, the cards, the win effects, the log's write path and the `/emu/` hand pose | Reproducible | `python3 tools/mutations.py` (`devlog/day5_mutations_output.txt`): 44 of 45 mutations fail a test; the 45th (4d) is equivalent. O9 and O10 there are helper-level versions of the day-3 flush survivors; the app's call sites are the outside run's O15/O16, below |
| The glue that unit tests can't reach (the frame-loop and page-hide flush calls, the win and spotted feedback on the models, the slide-card latch) is checked | Reproducible + Emulator | `COVER_EMU_BASE=… python3 tools/mutations.py`: the outside run's ten day-4 glue mutations O13–O22, recreated at today's call sites: 10 of 10 caught: O13 and O14 (the `/emu/` hand turned the wrong way, the grip offset dropped) by `tests/day5.test.ts`, O15–O22 (the frame-loop flush call, the page-hide flush wiring, chime, bead, trinket, eyes, stare, slide-card latch) by `tools/emu/wiring_check.mjs` (`devlog/day5_mutations_output.txt`). Still not checked by either: plane choice, the anchor flow, registration gating, the desk tap and the knob in `src/cover-system.ts`, `src/desk-anchor.ts`, `src/hand-joints.ts` |
| The light-map half refresh stays under 2 ms per frame on a desktop | Reproducible (desktop Node only) | test "light map cost" asserts < 2 ms; the author's runs printed about 0.11 ms (`devlog/day4_test_output.txt`) |
| The tester log records frame rate, dropped frames, update cost, flicker per step, joint path, plane label, anchor time and the emulator flag | Reproducible + Emulator | `tests/day2.test.ts`; walkthrough phase `tester`, `devlog/day2_emulator_log.json` |
| The tester log survives a reload, a new URL and a new build, and the guided poses never start by themselves | Reproducible + Emulator | `tests/day3.test.ts` (log store, a simulated reload); day-3 `/emu/` run: a new URL kept every session, a plain Enter logged no guided labels (`devlog/DAY3.md`). On a Quest, incl. a reload and a power cycle: **not shown yet** (TESTER_PROTOCOL step 10) |
| The log is written every 5 s and when the page is hidden; a failed write leaves storage on and the next flush writes the same rows again; 3 failures in a row switch storage off for the page and the panel says NOT kept | Reproducible + Emulator | `tests/day4.test.ts` (flush timer, page hide, flusher, overlapping flushes); `tests/day5.test.ts` (the real `LogStore` write path on a fake IndexedDB that fails: retried on the next 5 s timer, nothing lost, gives up after 3 in a row); the day-5 wiring check sees the 5 s write and the page-hide write in the built `/emu/`. A real IndexedDB failure on a Quest: **not shown yet** |
| A win and a spot are visible at desk scale: the creature hops (4 cm), the light flares warm, a chime, the new bead pops in, the trinket rides home, then the ghost and an "again" card; the keeper's eyes open and it stares, and a card says why it saw the creature | Reproducible + Emulator | `tests/day5.test.ts` (cards, round state, payoff, win effects); day-5 wiring check reads them from `window.__cover` (`devlog/DAY5.md`); sound not heard on a headset (the check counts the calls) |
| A desktop judge reaches the game in the `/emu/` build | Emulator | day-4 run on the built `/emu/` and on the live URL (`devlog/DAY4.md`, `devlog/day4_live_replay.txt`); day-5 wiring check and live replay (`devlog/DAY5.md`): Enter → board on the emulated desk, H → dash into the lane, → held → a win, L → spotted, C → the keeper wakes, no console errors |
| Declining the spatial-data prompt doesn't stop the session | Reproducible (code trace) + Emulator | `iwsdk.config.json` sets `handTracking`, `anchors`, `planeDetection` to `true`, which IWSDK 1.1.0-rc.2 requests as optional (`node_modules/@iwsdk/core/dist/init/xr.js:27-35, 63-68`); the wiring check captured the request: `requiredFeatures: []`. On a Quest: **not shown yet** |
| Hands only, end to end | **Not shown yet** | in code there is no controller action anywhere (controllers pause the game); on a Quest: TESTER_PROTOCOL step 1 |
| Audio, plane detection and anchors work in Quest Browser | **Not shown yet** | steps 2, 9, 10 |
| Runs at 72 fps or better on Quest 3 | **Not shown yet** | needs TESTER_PROTOCOL step 3 |
| Hand tracking is stable enough that the shadow doesn't shimmer and the creature doesn't stutter | **Not shown yet** | steps 5 and 7 |
| The real hand shows over the board (default mask) | **Not shown yet** | step 13; every emulator screenshot so far uses the emulator's hands |
| The board comes back to the same desk spot next session | Emulator (same viewpoint only) | day-1 walkthrough and the day-3 `/emu/` run; on a headset: steps 9 and 10 |
| A registered mug's height matches a ruler | **Not shown yet** | step 8 |
| A pause in mid-air never registers a phantom object | **Not claimed** | known weakness, measured in step 8 (a mid-air pause beside the path passes every registration rule, `tests/day3.test.ts`, so the count can be non-zero) |
| The forearm casts a shadow | **Not claimed** | only the hand is modelled |

All screenshots in `devlog/` come from the emulator's simulated room unless a
file name says otherwise. No frame-rate or tracking number from the emulator
is a headset number.
