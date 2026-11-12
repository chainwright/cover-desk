# Day 7 (11 Nov 2026): fixes from the day-6 outside review

The day-6 build went to six outside judging seats (`judges_impl_d5/`, not in
this repository). Their verdict on a private Quest tester: yes, with
conditions. A private tester (one person, contacted on the Meta forum today)
may run it soon, so the tester steps came first. Nothing here has run on a
Quest yet.

## 1. Tester steps (pushed to `main` first, as `19b286d`, before the code)

`TESTER_10MIN.md` and `TESTER_PROTOCOL.md`, written to be true for both the
day-6 build and this one:

- step 4: after a win, put the hand back where the ghost *first* stood
  (left of the middle); the ghost and a card *may* show where for a few
  seconds; after the first win a level-2 card and a wedge appear: ignore
  them until step 7;
- step 5: the book variant first (looking at the ceiling drops both hands
  and tests a different path);
- step 7: a book or a closed box (or an upside-down mug), finger on the
  **middle** of its top (the object's column is centred on the fingertip,
  and a rim touch by the lantern is refused as too close); first, one
  deliberate mid-air pointing hold over the ghost mug with nothing there,
  to measure whether a finger alone registers an object; lift the hand
  high, about a hand's length, over the gaze; if the creature still waits,
  edge toward the box, then slide;
- send: Copy summary as well as Download log (neither has been tried in
  Quest Browser); the USB route spelled out; an optional private casting
  recording (hands and desk only). Still 10 minutes, 12 with step 7.

## 2. Texts (the hound's A1–A6, B1–B8)

Applied in README, JUDGES, CLAIMS, EVIDENCE and the tester steps, with
corrections appended to DAY4 (A5), DAY5 (B3, B4) and DAY6 (A3, B6, B7, B9).
Where today's code changed the fact, the text follows the code:

- A1: "18/18 for the sight-line function"; the six cover poses that the
  game would have punished moved (fix 2, below).
- A2: level 2 needs a *registered* object; the headset doesn't see it, and
  a still finger in mid-air can register one. "Nothing is faked" is gone.
- A3: "can't get past the near edge of the light" (not "its nook").
- A4/B8: the ghost and card after a win now really wait for the hand
  (fix 4), so the texts say "until a hand stands there again (or about
  10 s)" rather than the hound's "for about 3.5 s".
- A6: the lift-over is now a continuous-motion test (fix 6); the texts say
  "lift your hand well up, about a hand's length".
- B1: re-measured with the day-7 dwell (fix 7): 1–9 cm/s home at 7–13 mm
  joints; 10 cm/s outruns at 7–11 mm, home at 13 mm; 11 cm/s and faster
  outrun at every radius (pinned in `tests/day7.test.ts`; the organiser's
  day-6 sweep, before the dwell, had 10 cm/s home at 9–13 mm).
- B2–B7, B12 as written by the hound.

## 3. The case set agrees with the game (fix 2)

P1–P3 and P6–P8 stood 4.5 cm in front of the lantern, where the day-5 wake
rule wakes the keeper. They now stand 8 cm in front of it (z −2.5 cm, the
ghost's depth): P1 a palm at the centre, P2/P3 palms 5 cm left/right of it
(the line to a point 10 cm along the path crosses z −2.5 cm at ±4.7 cm),
P6 a fist, P7/P8 two hands at −5 and +7 / +4 cm. Nearest joints 7.5–9.6 cm
from the lantern. A new test asserts that every hand in a cover case is
beyond the 7 cm sleep radius. 18/18 still pass.

## 4. The fixes in the game

- **Post-win flow** (`feedback.ts` `nextRoundDue`, `cover-system.ts`): the
  next round starts once a hand is back at the start (level 1's ghost spot,
  or level 2's left ghost), no sooner than 3.5 s, or after 10 s. Until then
  the creature stays home with its trinket, the ghost and "Home! Bring your
  hand back…" stay; the level-2 card comes after them, and in level 1 the
  gaze and ghost mug stay hidden until the "again" card is gone
  (`onboarding.ts`).
- **Teaching card** (`onboarding.ts`): "Stand your hand like 'stop' / right
  where the pale hand is". The old line sent hands to the middle of the
  light, where the lane misses the waiting creature (mutation 5d shows it).
- **Wake hysteresis** (`feedback.ts` `LanternWake`): wakes inside 6.3 cm,
  sleeps again only beyond 7 cm. In the model a hand jittering ±4 mm
  around 6.3 cm gives one rising edge in 300 frames instead of more than
  30 (each was an "hm?", the eyes, and a 1020 px card redraw).
- **A brief wait on a jittering edge** (`creature.ts`, `dwell: 0.1`):
  standing still, the creature moves on only after the way ahead has been
  dark for 0.1 s; mid-dash nothing changes. With a still hand whose joints
  jitter up to ±7 mm at 30 Hz (tracking's rate), ten 30 s runs: 10 spots
  before, 0 after, never a win. (At ±10 mm: 46 before, 3 after; scratch
  run.)
- **Occluder per registered object** (`cover-model.ts`, `cover-system.ts`):
  a depth-only column of the footprint up to the touched top, drawn first,
  so a real mug should hide the virtual keeper and light behind it, as the
  hand mask does for the hand. Not checked on a headset. A phantom
  (mid-air) registration also gets a column, which would hide board under
  it. In `/emu/`, where no real object exists, the column is a pale paper
  mug (a desktop judge used to see "the mug hides it" with no mug).
- **/emu/ intro note** lists O and R.

## 5. Tests and checks

- `tests/day7.test.ts` (13 tests): the post-win timing and cards; the hand
  back at either level's start; hysteresis; the jitter runs; the slide
  window at 7–13 mm; the lift-over as a continuous motion (left ghost → up
  10 cm in 0.2 s → over in 0.4 s → down in 0.2 s, mug on its ghost: home,
  the keeper never woke, either hand; at the 7 mm floor edging first and
  sliding after); a 1 cm lift wakes the keeper; the lowest lift that wakes
  nothing for both hands is 5 cm (11 mm joints); the pure pieces pulled out
  of the glue: `onKnob` (R3), `keepNewestObject` (R7), `boardInView` (R9).
- `tests/los-cases.test.ts`: every cover hand outside the wake radius.
- `tools/emu/wiring_check.mjs`:
  - `win-hop-flare` no longer samples the hop by polling (it failed a clean
    build about half the time at 3–6 fps): the game records every frame of
    the win (t since home, hop and flare applied) and the check compares
    each with the pure `winFx(t)` and needs one frame inside the hop and one
    inside the flare;
  - `again-waits`: 6 s after the win, the hand not back: still home, card,
    ghost, no gaze;
  - for the outside run's survivors: `spotted-log` (R10), `woke-reason-*`
    (R8), `l2-start` with two objects registered in one frame (R7),
    `l2-o-key` (G8 now caught directly), `l2-won-flag` (R11),
    `register-gate` (R4: a still flat hand over a legal spot registers
    nothing, a pointing one does; that second hold is in mid-air, so the
    emulator shows a phantom registration), `knob-gate` (R3: flat
    fingertips resting on the knob don't move the board, a pointing one
    does; both poses are IWER's built-in `flat` and `point`, placed by
    reading the fingertip back), `fps-inview` (R9: the head turned away
    logs `inView: false`).
- `tools/emu/replay.mjs`: also checks the post-win wait and H H → next round.
- Playwright is now a dev dependency (`playwright@1.65.0`, the version
  already in the tree).

## Results (all gated by exit code)

- `npm run typecheck`: exit 0. `npm test`: 103/103, exit 0
  (`day7_test_output.txt`). `npm run build` with the dist check: exit 0
  (main 3,189 KB, emulator absent; `/emu/` 6,166 KB, emulator present).
- Wiring check on the clean local build, final version, run twice in a row:
  39/39 checks both times, exit 0 (`day7_emu_wiring_local_run1.json`,
  `…run2.json`). The machine was loaded (load average 11–14); the emulator
  ran at 1.8 and 2.6 fps and `win-hop-flare` passed both times on 5
  recorded win frames, which is the point of the new check.
  - Found while writing the checks (fixed in the check, not the game): the
    ghost and the "needs a mug" flag follow the cue one frame later; the
    left emulated hand rests by the chair and is tracked, so its wrist speed
    is 0, not null; registering two objects with the creature out in the
    light let it hide in the mug's shadow mid-path, which is not a round
    boundary, so level 2 never started (real play can do this too: the hand
    has to lead it home first); the check now registers both in one frame
    while the creature sits in its nook.
- Mutations (`day7_mutations_output.txt`):
  - unit stage: 67 mutations, **66 fail a test**; 4d is the known
    equivalent one; the new 8a–8i are each caught;
  - glue stage: **33 of 33 caught**: O13, O14, G9 by unit tests; O15–O22,
    G1–G8, R1–R11 and G10–G12 by the wiring check. R1–R11 are the outside
    run's exact edits at today's call sites. R3 → `knob-gate`, R4 →
    `register-gate`, R7 → `l2-start`/`l2-mug-off`, R8 → `woke-reason-gaze`,
    R9 → `fps-inview`, R10 → `spotted-log`, R11 → `l2-won-flag`, G10 →
    `again-waits`. R5 (desk tap without the pointing gate) failed
    `fps-inview`; not traced, probably a non-pointing hold re-placing the
    board.
  - The glue stage took about 7 minutes per emulator run, so after O17 the
    author stopped it (SIGINT; the script restores the source) and split
    the rest over two working copies of the same commit on two ports.
    While R7 ran, the hop check still had a 2 mm floor and failed once at
    about 2 fps as well; the floor was removed, R7 re-run (only l2-start
    and l2-mug-off), and the final clean runs above use that version. Copy
    B ran O18–G12 with the earlier version.
- gitleaks 8.30.1 on `f818237..b117ac8` (main) and `a9613e1..3baf3c3`
  (gh-pages): no leaks, exit 0 both (`day7_gitleaks_output.txt`).

## Deploy

`dist/` built from `b117ac8` (stamp `b117ac8703bd`, `GITHUB_SHA` set),
after typecheck, tests, build and the two wiring runs of the version before
the hop-floor change; pushed to `gh-pages` as `3baf3c3`, fast-forward
(`a9613e1..3baf3c3`; `main` `19b286d..b117ac8`). GitHub records the deploy
at 2026-11-11 15:29:26 UTC. The wiring check is a tool, not part of the
build, so the later check change doesn't change what is deployed.

## Public URL

- `tools/emu/public_check.mjs` (`day7_public_check.json`): `/` and `/emu/`
  200, stamp `b117ac8703bd` on both, no emulator code in the main bundle,
  present in `/emu/`, no console errors on either; `/emu/?test=1&reset=1`:
  board on the emulated desk, the new card "Stand your hand like 'stop'
  right where the pale hand is", log store `ready`.
- `tools/emu/replay.mjs` on the live URL (`day7_live_replay.json`), 11 of 11
  steps, no console errors:
  - level 1: H → litFraction 0.826; 30 s still → no win (s = 0.104); →
    held → a win in 19.5 s, unspotted; **6.2 s after the win still home,
    the "again" card and the ghost showing, no gaze**; H H → the next round
    (card "unlocked", the gaze not yet drawn on that frame);
  - level 2 (`?level=2`): "needs a real mug or book"; H + → for 30 s → no
    win, the keeper woke at the gaze; O → the mug covers the gaze, ghost
    at −8 cm; H → the creature waits in the mug's shadow past the gaze
    (s = 0.267, keeper asleep); R → home.
- Screenshots (emulator, simulated room): `day7_01_emu_l2_paper_mug_holds_it.png`
  (the emulated mug now drawn as a pale column), `day7_02_emu_home_card_waits.png`.

## Still open

- Everything on a Quest: the tester run (fps, still-hand spots, wakes at
  the ghost spots, the box registration, the mid-air phantom, whether the
  object's column hides the light behind the real object, Download and
  Copy summary in Quest Browser).
- `/emu/` R still jumps; the continuous lift-over is checked in the model.
- Level 1 after the unlock still draws a gaze that doesn't apply there.
- A phantom registration also gets a depth-only column.
- `window.__cover` is exposed in the main build.
- The video.

## Day 7b (11 Nov, later): three small open items closed

- **`/emu/` R is a motion now** (`src/emu-seat.ts` `liftOverAt`, `LIFT_OVER`):
  up 10 cm in place (0.2 s), across at that height (0.4 s), down at the
  right ghost (0.2 s), stepped like the slide (≤ 0.05 s a frame, so at least
  16 frames at any frame rate). It is the same function the day-7 model
  test plays, so the model and the emulator can't drift apart. A hand
  already lifted with L stays at 20 cm across; any other key stops it where
  it is.
- **Level 1 no longer draws the gaze** (`src/onboarding.ts`): the gaze is
  drawn in level 2 only, where its rule applies. After the unlock, level 1
  shows the ghost mug (where the object that starts level 2 goes) and the
  card now reads "Level 2: stand a mug or a book / on the ghost mug; finger
  on top". README, JUDGES, CLAIMS and both tester sheets follow.
- **`window.__cover` only in `/emu/`** (`src/cover-system.ts` `coverDebug()`,
  `__COVER_EMU__` in `vite.config.ts`): the page's tester panel reads the
  handle from the module; the global is set only in the `/emu/` build and
  the dev server. `tools/check-dist.mjs` now fails if `__cover` appears in
  the main bundle or is missing from `/emu/`. Mutant check: a main build
  made with the flag on fails it (exit 1). `public_check.mjs` no longer
  waits for the handle on `/` and reports `mainHasDebugHandle`.
- Tests: `tests/day7b.test.ts` (5): the R motion (starts in place, crosses
  only at full height, ends standing at the right ghost, no step over 2 cm
  at 30 fps), R from a lifted hand, no wrist pose on R's way shades the
  gaze, level 1 never draws the gaze in nine states, the handle gate. Day 6
  and day 7 card tests updated for the hidden gaze; the day-7 lift-over model
  now calls `liftOverAt`.
- Wiring check: `l2-unlocked` now needs no gaze and the ghost mug; new
  `l2-r-motion` reads the seat's per-frame trace (16 frames, 7 of them
  across, all at 10 cm; ends at x 0.08, height 0) and needs no keeper wake
  between R and the win. `replay.mjs` adds `l1-no-gaze-after-unlock` and
  `l2-r-is-a-motion`.
- Mutations (`day7b_mutations_output.txt`): 8e retargeted (ghost mug during
  the "again" card), 9a–9e by unit tests, 5 of 5 caught; G13 (R jumps) and
  G14 (motion height not applied) by the wiring check, 2 of 2.

Results, gated by exit code: typecheck 0; `npm test` 108/108, exit 0
(`day7b_test_output.txt`); build with the dist check 0 (main 3,190 KB,
emulator and `__cover` absent; `/emu/` 6,167 KB, both present); wiring check
on the clean local build twice in a row, 40/40 both, exit 0
(`day7b_emu_wiring_local_run1.json`, `…run2.json`; load average 13–15).

Deploy: `dist/` built from `83fa065` (stamp `83fa06560abf`, `GITHUB_SHA`
set; dist check 0), pushed to `gh-pages` as `2ec6d6d`, fast-forward
(`3baf3c3..2ec6d6d`; `main` `3ab5601..83fa065`). gitleaks 8.30.1 on both
ranges before the push: no leaks, exit 0 (`day7b_gitleaks_output.txt`).
(Found while deploying: `rsync -a` into the gh-pages worktree skipped
`emu/index.html`, same size and same second as the checkout, so it still
named a removed bundle; caught before the push by reading it back, re-synced
with `--checksum`, `diff -r` identical, the unpushed commit amended.)

Public URL: `public_check.mjs` (`day7b_public_check.json`): `/` and `/emu/`
200, stamp `83fa06560abf` on both, no emulator and no `__cover` in the main
bundle (and `'__cover' in window` false on `/`), both present in `/emu/`,
no console errors. `replay.mjs` on the live URL (`day7b_live_replay.json`),
13 of 13, no console errors: level 1 as before (a win in 10.8 s,
unspotted; 6.1 s later still home with the "again" card and the ghost);
after the next round 3 s sampled: the gaze never drawn, the ghost mug and the
"unlocked" card shown; level 2: no object no win (keeper woke at the gaze),
O + H → waits in the mug's shadow, R → home, and R's trace: 16 frames, 7
across at 10 cm, down at x 0.08.

### Still open (after day 7b)

- Everything on a Quest (as above).
- A phantom registration also gets a depth-only column.
- The video.

## Corrections (day 8, after the round-6 outside review)

- §4 "ten 30 s runs: 10 spots before, 0 after": the test asserted 0 with the
  dwell and at least one without it; it did not print the count. Since day 8
  it prints both: 0 with the dwell and **9** without it (not 10)
  (`devlog/day8_test_output.txt`). The ±10 mm figures were a
  scratch run with no output kept.
- §"Day 7b" and README: after the first win, level 1 shows the ghost mug
  and the level-2 card, not the gaze (the gaze is level 2 only since 7b).
