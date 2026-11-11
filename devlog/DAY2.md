# Day 2 (11 Nov 2026, morning): fixes before the first headset session

An outside review of the day-1 build (five independent reviewers plus a fact
checker) found faults that don't need a headset to fix. This is that list,
done before the first Quest session. Nothing here has run on a Quest yet.

## Fixed

1. **The instruction.** Day 1 said "rest your hand in the light", but a flat
   hand resting near the lantern casts almost no shadow, so the first thing a
   player tried did nothing. Every place now says **"Hold your hand up in the
   light, like 'stop'"**: the page intro, the card on the board, the README.
   In tester mode the guided steps start with that pose; the flat hand moved
   to third place as a measurement step.

2. **The first run now teaches on every path** (`src/onboarding.ts`, pure and
   tested). The ghost hand and the teaching card needed `!listening`; after
   the automatic placement on a detected desk (the likely first run) the app
   keeps listening for a desk tap, so a new player saw neither, and could not
   register a mug until they tapped the desk. Now:
   - ghost and teaching card show whenever the board is placed and the
     creature has never stood in a hand's shadow, whatever `listening` is,
     with no 25 s cut-off;
   - "tap & hold to move" is a small label by the knob, no longer in the main
     card; holding the knob now also changes the card to "Tap the desk where
     you want it";
   - registration works after a plane placement.

3. **The emulator can no longer reach a Quest.** `/` is built with
   `injectOnBuild: false`, so it contains no emulator at all; the desktop
   emulator build lives at `/emu/` (`tools/build-emu.mjs`, which flips the
   flag for one build and restores `iwsdk.config.json` byte for byte). The
   emulator's user-agent exception is now explicit (`OculusBrowser|Quest`).
   `npm run build` ends with `tools/check-dist.mjs`, which fails if emulator
   code appears in the main build or is missing from `/emu/`. Proof that the
   check bites: a main build made with the flag on failed it (exit 1,
   "emulator found in the main build"). Its first version also flagged our
   own `'IWER_DEVICE' in window` check, so the markers are now strings only
   the emulator runtime contains. The page and the log report
   `emulator: true/false`, the tester panel's first line says `native` or
   `EMULATOR`, and on a desktop without WebXR the main page links to `/emu/`.
   Sizes from the check: main build 3,164 KB of JS and HTML, no emulator;
   `/emu/` 6,141 KB, including the emulator's lazily loaded rooms.

4. **Losing the covering hand pauses** (`CoverWatch` in `src/creature.ts`).
   Day 1 paused only when both hands were lost, so with one hand shading the
   creature and the other resting in view, a tracking drop of the shading hand
   got the creature "spotted by the headset". Now the hand that shaded the
   creature in the last 0.3 s is remembered; if it is lost while the creature
   stands in the light, play waits for it (or for another hand or object to
   shade the creature). A hand that is lifted but still tracked still gets the
   creature spotted, as before. The log gets `cover-hand-lost` and a reason on
   every `pause`.

5. **The session measures itself.** The tester panel is now 512 px wide (was
   1140) and redraws at most twice a second (was up to ~7), so it no longer
   biases the frame-rate numbers it shows. Log format v2 adds:
   - per second: the 95th percentile of the app's own `update()` time,
     dropped frames (longer than 1.5 display frames, against
     `session.frameRate`), the frame rate itself and the panel redraws;
   - a `session` event with the display rate and supported rates;
   - index fingertip x, y, z in every sample (fingertip jitter);
   - which joint path ran (`fillPoses` or `getJointPose`) and where the
     radii came from, with the mean radius, on every `hand-found`;
   - the chosen plane's label in the placement and in the desk tap;
   - the anchor's time to localise (and the time a failed restore took);
   - `emulator` in the header and per session.
   The analyser prints sight-line flips per guided step and per minute, the
   update-cost p95, dropped frames and the joint paths.

6. **Fact fixes.** README and DAY1.md now use the fact checker's replacement
   sentences; the prototype's commit subjects are quoted word for word. Six
   sentences were false (for example "the board goes under your hand": it is
   pulled toward you and kept on the desk; "waits in its nook": it creeps out
   to the edge of the light; "−0.1 mm": the log says −0.2).

Also, small: a failed `launchXR()` now shows its error under the Enter button
instead of nothing; the prompt no longer builds new arrays every frame.

New judge-facing files: `JUDGES.md` (five-minute path), `CLAIMS.md` (each
claim with how far it is proven), `TESTER_PROTOCOL.md` (the first headset
session, ready to hand to a Quest owner).

## Tested

### Unit tests: 43/43 (`npm test`, exit 0)

The 29 from day 1, plus 14 new:
- first-run cues on the automatic desk, touch, anchor, move-request, paused,
  searching, fallback and restoring paths; the teaching copy itself;
- the cover-hand watch: covering hand lost with the other tracked (waits, not
  spotted, resumes), lifted but tracked (spotted), the other hand taking over,
  the lost hand coming back out of the light, and the 0.3 s window;
- log v2: columns, emulator flag, line flips per step, update p95, drops;
- **a labelled line-of-sight case set, 18/18** (`tests/los-cases.test.ts`):
  9 cover cases (upright palm at three points of the path, edge-on hand, flat
  hand beside the path, a fist, two hands with the right owner reported, a
  mug) and 9 negative controls (no hand, a hand beside, behind, above or
  under the line, a flat hand near the lantern, an object too low, the nook
  outside the light, a point beyond its range). Every expected verdict was
  written from the geometry before the test was run.

### Mutations: 14 of 15 caught (`python3 tools/mutations.py`)

Exact edits are in the script; output in `day2_mutations_output.txt`.

| Mutation | Tests that fail |
|---|---|
| D1 no pause on hand loss | 4 |
| D2 quick reject inverted | 8 |
| D3 no palm webs | 2 |
| D4 no "seen for 0.15 s" debounce | 1 |
| D5 light-map distance cull too aggressive | 1 |
| 2a ghost needs `!listening` again (the day-1 bug) | 3 |
| 2b registration blocked while listening after a plane placement | 2 |
| 2c teaching card replaced by the old move card while listening | 3 |
| 2d knob label never shown | 2 |
| 4a pause only when both hands are lost (the day-1 rule) | 3 |
| 4b cover-hand memory window set to 0 | 3 |
| 4c never stop waiting once the hand is back | 1 |
| 4d also mark a still-tracked hand as lost | 0: equivalent, the next line clears a tracked hand, so behaviour can't change |
| capsule inflation removed (+4 mm → 0) | 2 |
| capsule radius halved | 3 |

4c first survived: no test had the lost hand come back *without* shading the
creature. The test "the lost cover hand comes back but out of the light" was
added for it.

### Emulator walkthrough: 24/24 (`tools/emu/walk_day2.py`)

Headless Chromium through the IWSDK CLI on the dev server (emulator
injected, as in `/emu/`), emulated Quest 3 in the emulator's simulated home office. Unlike day 1, the
first-run phases use the default URL (no `?test=1`, default hand mode).
Output: `day2_walkthrough_output.txt`.

| Check | Result |
|---|---|
| Emulator flag true in the emulator build | pass |
| First run: board on the detected desk, still listening for a tap (the path the ghost used to miss) | pass (`planeLabel: "desk"`) |
| Ghost hand visible; card reads "Hold your hand up in the light, like 'stop'"; "tap & hold to move" on the knob | pass |
| Registration allowed without a desk tap; a 9 cm hold beside the path registers a 90 mm object, board still on the desk | pass |
| Following the card: a "stop" palm by the lantern → the creature dashes; then ghost, card and knob label go away | pass |
| Covering right hand disconnected, left still tracked → paused, waiting for the right hand, not spotted; nothing moves for 1.5 s; "It waits for your hand." | pass |
| Right hand back over the light → resumes, still not spotted | pass |
| Control: the covering hand lifted away but tracked → spotted | pass |
| Tester log v2: emulator true, 12 columns with the fingertip, `session` event (90 Hz, supported 72/80/90/120), fps events with `updP95Ms`, `drops`, `frameRate`, `redraws`; panel redraws ≤ 2 per second; joint path `fillPoses` / `fillJointRadii`; plane label | pass |

In the emulator, `update()` p95 was about 1.1 ms (worst second 3 ms) on
software rendering at ~13 fps. That is not a headset number.

Screenshots (emulator, simulated room, leaning over the board):
- `day2_01_first_run_ghost_prompt.png`: the first run on the automatic desk
  placement: teaching card, ghost palm by the lantern, knob label
- `day2_02_cover_hand_lost_waits.png`: the covering hand disconnected, the
  creature waiting mid-path, "It waits for your hand."
- `day2_03_tester_panel_512px.png`: tester mode with the smaller panel

## Not done (needs the headset session first)

The rest of the review's list waits for real numbers: joint smoothing if the
shadow shimmers, the win payoff, teaching the sideways sweep, showing why the
creature was spotted, phantom mid-air registration and visible reasons for
rejected taps, a bigger creature, the hand-shaped shadow, levels 2 and 3.

## Public URL

- Main (Quest): https://chainwright.github.io/cover-desk/
- Desktop emulator: https://chainwright.github.io/cover-desk/emu/

Checked after the deploy with `tools/emu/public_check.mjs` (headless
Chromium; result in `day2_public_check.json`):
- both return HTTP 200; the served main bundle contains no emulator code, the
  `/emu/` bundle does; both carry the build stamp `91554733f31e` (commit
  `9155473`); no console errors on either;
- main page in a desktop browser without WebXR: `emulator: false`, Enter
  disabled, the note links to `./emu/`, and the intro reads "Hold your hand up
  in the light, like 'stop'";
- `/emu/?test=1&reset=1`: `emulator: true` on the page and in the log; Enter
  starts a session. The emulator starts standing with controllers, away from
  the desk, so the board goes to the `fallback` spot in the air with the
  ghost hand and "Tap your desk with one finger and hold it still". A desktop
  judge has to switch to hands and sit at the desk first; JUDGES.md says so.
  Making that first emulator minute smoother is still open.

## Deploy

Same as day 1: typecheck, tests and the full build (with the dist check) run
locally first; only on green are `dist/` (and `dist/emu/` inside it) pushed
to `gh-pages`.

## Next

Quest session 1 with `TESTER_PROTOCOL.md`. Go if steps 1 (no emulator), 3
(frame rate) and 4 (crossings) pass.
