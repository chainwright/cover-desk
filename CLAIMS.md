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

Last updated: day 4, 11 Nov 2026. The evidence per judging criterion, with
the mutation table and what is unproven, is in [EVIDENCE.md](EVIDENCE.md).

| Claim | Level | Evidence |
|---|---|---|
| A hand pose or a registered object between the lantern and the creature hides it; a hand beside, behind, above or under the line does not | Reproducible (geometry model, synthetic 25-joint hands; not real tracked hands) | `npm test`: line-of-sight case set 18/18 (9 cover cases, 9 negative controls), labels written from the geometry in `tests/los-cases.test.ts` (labels and test arrived in the same commit) |
| The teaching copy matches the light: a "stop" hand standing on the desk between the lantern and the path is cover; one held with the wrist above about 7 cm, or in the light in front of the path, is not | Reproducible (same model) | `tests/day3.test.ts` "teaching copy" |
| Where the ghost hand teaches, a standing hand shades a lane, not the whole light: the creature dashes into it and stops; a still hand never gets it home; sliding the hand along does | Reproducible (same model) + Emulator | `tests/day4.test.ts` (litFraction strictly between 0 and 1, still hand ±1 cm never wins, a slide at the `/emu/` speed wins unspotted); day-4 `/emu/` run: after H litFraction 0.826, 30 s still → no win, → held → a win (`devlog/DAY4.md`) |
| A hand standing right at the lantern is no longer an easy way across | **Not claimed** | it still shades nearly the whole light (`tests/day4.test.ts` pins this as known) |
| Cover doesn't depend on recognising a pose (upright palm, edge-on, fist, flat beside the path) | Reproducible | same case set, cases P1–P6 |
| The shadow drawn on the desk matches the creature's sight test | Reproducible | test "light map … equals the sight test at every cell centre" (2,048 cells, one scene with two hands and an object); between cell centres the texture is interpolated |
| Losing the hand that shades the creature pauses play instead of getting it spotted; a registered object taking over the shade ends the wait | Reproducible + Emulator | `tests/day2.test.ts` (4 cases), `tests/day3.test.ts` (object takes over); walkthrough phase `coverloss` (one hand disconnected, the other tracked) |
| Lifting a still-tracked hand still gets the creature spotted | Reproducible + Emulator | `tests/day2.test.ts`; walkthrough phase `lifted` |
| On the first run the ghost hand and the teaching card show, also after the automatic desk placement | Reproducible + Emulator | `tests/day2.test.ts` (first-run cues); day-2 walkthrough phase `firstrun`, screenshot `devlog/day2_01_first_run_ghost_prompt.png` (that screenshot shows the day-2 wording); day-3 `/emu/` run (`devlog/DAY3.md`) |
| Placement timing: a desk found up to 10 s after the board floats still wins; the saved spot is waited for up to 8 s | Reproducible | `tests/day3.test.ts` (placement); `src/placement.ts` |
| A mug can be registered without tapping the desk first | Reproducible + Emulator | `tests/day2.test.ts`; walkthrough phase `register` |
| The main build (`/`) contains no emulator, so a Quest browser can't be put into an emulated session | Reproducible | `npm run build` ends with `tools/check-dist.mjs`, which fails if the emulator runtime's marker strings are found in `dist/` outside `dist/emu/`; a deliberately leaky build made it fail (author's run, DAY2.md; its output was not kept) |
| The tests guard the pure core, the placement timing, the lane and the log's flush triggers | Reproducible | `python3 tools/mutations.py`: 30 of 31 mutations fail a test; the 31st is equivalent (`devlog/day4_mutations_output.txt`), including the outside run's day-3 survivors O9 (no flush on page hide), O10 (5 s flush never fires) and O12 (`/emu/` slide ×10). Not unit-tested: the `/emu/` seat's hand orientation (checked in the emulator run only), the win and spotted feedback, the rest of `src/cover-system.ts` (plane choice, the anchor flow, registration gating, the desk tap), `src/desk-anchor.ts`, `src/hand-joints.ts` |
| The light-map half refresh stays under 2 ms per frame on a desktop | Reproducible (desktop Node only) | test "light map cost" asserts < 2 ms; the author's runs printed about 0.11 ms (`devlog/day4_test_output.txt`) |
| The tester log records frame rate, dropped frames, update cost, flicker per step, joint path, plane label, anchor time and the emulator flag | Reproducible + Emulator | `tests/day2.test.ts`; walkthrough phase `tester`, `devlog/day2_emulator_log.json` |
| The tester log survives a reload, a new URL and a new build, and the guided poses never start by themselves | Reproducible + Emulator | `tests/day3.test.ts` (log store, a simulated reload); day-3 `/emu/` run: a new URL kept every session, a plain Enter logged no guided labels (`devlog/DAY3.md`). On a Quest, incl. a reload and a power cycle: **not shown yet** (TESTER_PROTOCOL step 10) |
| The log is written every 5 s and when the page is hidden, and a failed write loses nothing (it is retried whole) | Reproducible | `tests/day4.test.ts` (flush timer, page hide, flusher with a failing fake store, overlapping flushes) |
| A win and a spot are visible: chime, trinket carried, a bead per win; the keeper's eyes open and it stares | Emulator | day-4 `/emu/` run reads them from `window.__cover.payoff` (`devlog/DAY4.md`); not unit-tested; sound not heard on a headset |
| A desktop judge reaches the game in the `/emu/` build | Emulator | day-3 run on the built `/emu/` (headless Chromium): Enter → board on the emulated desk, H → dash, → held → a win, L → spotted, no console errors (`devlog/DAY3.md`) |
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
