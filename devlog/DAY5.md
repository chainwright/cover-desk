# Day 5 (11 Nov 2026): a tester kit that matches the platform, cards after every event, a keeper that wakes at its lantern, and claims made true in code

A fourth outside review (five reviewers, one checking the others) scored day
4 at 6.0 and said yes to one private Quest tester after the tester kit is
fixed, no to a public call. Its findings, each checked against the code or a
primary document before changing anything:

- the kit said a **right** palm pinch leaves the immersive view; Meta's
  "Hands in WebXR" page says the **left** palm pinch "takes the user out of
  the WebXR session" and the right one fills the Meta Quest icon (fetched
  today, https://developers.meta.com/horizon/documentation/web/webxr-hands/);
- two FALSE sentences ("a failed write is retried"): in the app the first
  failed write switched storage off for the page (`log-store.ts` marked the
  store failed, `cover-system.ts` dropped `storeReady`);
- "O9/O10 now fail a test" was overstated: they had been re-aimed at the new
  helpers, and removing the two call sites (the outside run's O15, O16)
  still passed every test; eight more glue mutations survived;
- after a spot the card still said "Slide your hand along"; after a win
  there was no card and the ghost never came back;
- a hand cupped at the lantern still crossed (lit 0.001, a win in 2.9 s);
- smaller text faults: "a lane about 10 cm" (no test), "a mug beside the
  path" (it shades nothing there), "0.83" (the test checks 0.5–0.95),
  "at the top" (only the form), 24/24 (day-2 code), CLAIMS pointing at the
  day-3 run, a test named "full refresh" that times the half refresh, and no
  record of the gitleaks runs;
- the business email address on the public page.

Nothing here has run on a Quest yet.

## Fixed

1. **Tester kit** (`TESTER_10MIN.md`, `TESTER_PROTOCOL.md`):
   - leaving: "look at your **left** palm at eye level, pinch thumb and
     index and hold until the menu icon fills" (the right hand opens the
     Meta menu instead);
   - step 4: "about a hand's width every 2 seconds" (≈ 4–5 cm/s; the model
     leads the creature home at 1–9 cm/s and loses it at 10, see below), and
     "after each win put your hand back where the ghost stood" (the game now
     shows it too);
   - Horizon OS and Quest Browser versions written down before starting;
   - fallbacks if the file can't be attached on the headset: copy it over
     USB from the Download folder, or paste **Copy summary** into the mail
     (the summary only);
   - "if the page or the panel ever said NOT kept, tell us";
   - optional: cup the lantern once and say what happened;
   - protocol step 8: the mug stands between the lantern and the path.
2. **Text** (README, CLAIMS, EVIDENCE, JUDGES, DAY3/DAY4 corrections): every
   FALSE or OVERSTATED item above, listed under "Text fixes" below.
3. **The address** is gone from the public page (`index.html`) and the
   public form; it stays only in the two tester protocols. (Older commits
   still carry it in history.)
4. **Cards after events** (`src/onboarding.ts`, `src/feedback.ts`):
   - spotted: "It saw it! / Keep your hand in the light's way", from the spot
     until the next dash (no more stale slide card);
   - a win, staged at desk scale: the creature hops twice with the trinket
     (4 cm, then 2.4 cm), the light's warm side flares (+40 % in 0.3 s,
     easing out over 1.6 s, the lantern glows with it), and the new bead
     pops in at 1.4× and settles in 0.25 s; the chime as before;
   - then "Home! Bring your hand back / to the ghost for another round" with
     the ghost hand, until a tracked wrist is within 4 cm of the ghost's spot
     and low (or the next dash);
   - the `/emu/` seat's **H** now always stands the hand at the ghost's spot.
5. **The cupped lantern** (`src/feedback.ts`, `src/cover-system.ts`): a hand
   with any joint within **6.3 cm** of the lantern wakes the keeper: eyes
   open, "hm?", a card "Too close: the keeper woke up. / Keep your hand off
   the lantern", and it sees the whole path, so the creature stays home (or
   is spotted if it is out). Chosen by bisection: for each column of x the
   farthest still "stop" hand that crossed without a slide; the largest had
   its nearest joint 6.1 cm from the lantern (1 mm sweep; the test's 2.5 mm
   sweep finds 6.08), and the ghost's spot moved 1 cm toward the lantern is
   6.5 cm away. The margin is about 2 mm each side, in the model.
   `tests/day4.test.ts`'s "known, not prevented" now asserts the keeper
   wakes; `tests/day5.test.ts` plays it out (still or sliding, never home).
   The day-3 copy ("between the lantern and the path covers") stays true as
   geometry; README, EVIDENCE and CLAIMS now add the wake rule next to it.
   **Found while doing it, not closed:** a hand laid on its edge along the
   path, as a 17 cm wall a few cm before it, shades the whole lit path and
   the creature crosses without a slide (pinned by a test, a "Not claimed"
   row in CLAIMS).
6. **Claims made true in code:**
   - the log store keeps going after a failed write: it stays `ready`, the
     cursor stays put, the next 5 s flush writes the same rows again; three
     failures in a row switch storage off (the panel says NOT kept); a
     success resets the count. `LogKeeper` now owns the whole write path, so
     the frame loop makes one call. Tested on a fake IndexedDB through the
     real `LogStore.write`;
   - pure, tested helpers for the payoff (`payoffFor`), the win effects
     (`winFx`), the round state behind the cards (`RoundCues`), the wake rule
     and the hand-back check, and the `/emu/` hand pose (`seatHandPose`:
     wrist, not grip, on the spot; fingers up; back toward the player, for
     any board yaw);
   - `tools/emu/wiring_check.mjs`: drives the built `/emu/` with the seat's
     keys and fails on any broken glue (below).
7. **#7, done:**
   - required vs optional: `iwsdk.config.json` sets `handTracking`,
     `anchors`, `planeDetection` to `true`, and IWSDK 1.1.0-rc.2 turns `true`
     into an optional feature (`node_modules/@iwsdk/core/dist/init/xr.js`
     lines 27-35 and 63-68); the wiring check captured the request in the
     emulator: `requiredFeatures: []`, optional `local-floor, bounded-floor,
     layers, hand-tracking, anchors, plane-detection`. So declining the
     spatial-data prompt should not stop Enter (not checked on a Quest);
   - `fps` events carry `inView` (board centre within 35° of the gaze) and
     `viewDeg`; the analyser reports in-view seconds, median and p5;
   - the move knob needs a pointing finger (a resting hand on it no longer
     triggers "move"; not unit-tested);
   - slide-speed sweep in the model: 1, 2, 3, 4, 4.5, 5, 6, 7, 8, 9 cm/s all
     home unspotted; 10, 12, 15 cm/s outrun it;
   - each `spotted` event logs `wristMmS` per hand (smoothed wrist speed) and
     `keeperAwake`; a new `keeper-woke` event logs the hand and distance.
   - Level 2 skipped (separate decision).

## Text fixes

Each against its primary pointer (code line, test, output file):

- "a failed write loses nothing (it is retried whole)" (CLAIMS, EVIDENCE):
  made true in code (above) and restated with its proof levels.
- "O9/O10 now fail a test" (README, EVIDENCE, CLAIMS, DAY4): O9/O10 are
  named as helper-level; the call sites are O15/O16, now caught by the
  wiring check; README's count line is replaced by today's counts.
- "a lane about 10 cm wide" (README, JUDGES, `level.ts` comment): "a few
  centimetres", with the `/emu/` numbers (light edge 3.3 cm, wait 10.4 cm).
- "a mug … beside the path" (README, the guided-pose text in
  `cover-system.ts`, protocol step 8): "standing between the lantern and the
  path".
- "0.83 in the model" (DAY4): the test checks 0.5–0.95; 0.826 is the
  emulator's reading.
- "at the top" (DAY4): only the form says it at the top.
- "24/24" (README, EVIDENCE): marked day-2 code, not re-run; README no
  longer leads with it.
- CLAIMS's `/emu/` row pointed at the day-3 run (the upside-down hand): now
  DAY4, the day-4 live replay and DAY5.
- `GRIP_TO_WRIST` "measured" (emu-seat comment, DAY4): "read from the
  emulator's joint poses, no record kept"; a test now checks the seat puts
  the wrist, not the grip, on the spot.
- the test "light map cost: a full refresh …" times the half refresh:
  renamed "the per-frame half refresh … stays under 2 ms".
- "gitleaks found nothing" (DAY3, DAY4): marked "author's run, output not
  kept"; today's runs are recorded below.
- the 12.6 s win time (EVIDENCE): an outside run took 18.3 s; times are
  machine-dependent.
- JUDGES: the left-palm exit added; the cupped-lantern line and the emulator
  steps now match the code (C key, H H back to the ghost).

## Tested

All gated by exit code:

- `npm run typecheck`: exit 0.
- `npm test`: 79/79, exit 0 (`day5_test_output.txt`).
- `npm run build`: main build without the emulator (3,182 KB), `/emu/` with
  it (6,158 KB), dist check green, exit 0.
- `python3 tools/mutations.py` with the emulator stage
  (`day5_mutations_output.txt`):
  - 45 mutations of the tested code: **44 fail a test**; the 45th is 4d, the
    same equivalent one as before. New for day 5: 6a–6n (wake radius off or
    too big, the store giving up at once or never, the failure count not
    reset, the keeper writing to a store that gave up, each new card, the
    ghost after a win, "again" cleared at home, the hop, the eyes on wake,
    a lifted hand counted as back, the in-view analyser). 6f survived the
    first run (equivalent in the app: `LogStore.write` refuses on its own);
    a test with a bare store now catches it.
  - The outside run's 10 day-4 glue mutations, recreated at today's call
    sites: **10 of 10 caught**. O13 and O14 (the `/emu/` hand turned −90°,
    the grip offset dropped) fail `tests/day5.test.ts`; O15–O22 pass every
    unit test (as on day 4) and fail the emulator wiring check: O15 the 5 s
    write, O16 the pagehide write, O17 the chime, O18 the bead, O19 the
    trinket, O20 the eyes (and the checks after it), O21 the stare, O22 the
    slide card. During that run the machine lost its network for a while,
    and O16–O22 also logged console errors (not traced to a request); the
    clean build's check afterwards had none.
- `tools/emu/wiring_check.mjs` on the clean local build
  (`day5_emu_wiring_local.json`, headless Chromium, software rendering):
  every check passed. Session request `requiredFeatures: []`; first log
  write by the 5 s timer 9.9 s after Enter (the board took ~6 s to land);
  pagehide wrote at once; H → litFraction 0.826, the slide card; → held → a
  win in 11.4 s, never spotted, trinket carried, 1 bead, 1 chime, hop up to
  2.3 cm sampled (4 cm peak, between frames), flare 0.29, bead 1.4×; the
  "again" card with the ghost, gone after H H; L → spotted, eyes 4.5, stare,
  one "hm?", the spotted card; C → the keeper wakes, the "Too close" card,
  the creature stays by the nook for 6 s; no console errors.
- Screenshots (emulator, simulated room): `day5_01_emu_win_hop.png`,
  `day5_02_emu_again_ghost.png` (the card and the ghost after a win),
  `day5_03_emu_cupped_lantern_wakes.png` (C: the "Too close" card).

## Deploy

Typecheck, tests and the full build (with the dist check) ran first, gated
by exit code; `dist/` and `dist/emu/` were built from `c90f3f6` (stamp
`c90f3f6b1544`) and pushed to `gh-pages` as `c1955a8`, fast-forward only
(`6f3c214..c1955a8`; `main` `10bf4ee..c90f3f6`). gitleaks 8.30.1 found no
leaks in either commit; its output is kept this time
(`day5_gitleaks_output.txt`). GitHub records the deploy at 2026-11-11
11:20:56 UTC. The return address is still in older commits' history.

## Public URL

- Main (Quest): https://chainwright.github.io/cover-desk/
- Desktop emulator: https://chainwright.github.io/cover-desk/emu/

After the deploy, against the live URLs (headless Chromium):
- `tools/emu/public_check.mjs` (`day5_public_check.json`): both 200, stamp
  `c90f3f6b1544` on both; the main bundle has no emulator code, `/emu/` has
  it; no console errors on either; the address is not on the page;
  `/emu/?test=1&reset=1` → board on the emulated desk, log store `ready`;
  H → s = 0.104, waiting in the hand's shadow.
- The day-4 replay (`day5_live_replay.txt`): H → litFraction 0.826, the
  slide card; **30 s still → no win**; → held → a win in 11.9 s with the
  "again" card; L → spotted with the spotted card; no console errors.
- The wiring check (`day5_emu_wiring_live.json`): every check passed,
  including C → the keeper wakes and the creature stays by its nook, and
  `requiredFeatures: []`; no console errors.

## Still open

- **A Quest run**: one private tester with the fixed kit (the author sends
  the test mail).
- The wake radius margin is about 2 mm in the model; real hands, with their
  own joint radii, may cross it either way. The tester's "cup the lantern
  once" step and the `keeper-woke` events will show it.
- A hand on its edge along the path still crosses without a slide.
- Not checked by any test or the wiring check: plane choice, the anchor
  flow, registration gating, the desk tap and the knob gate in
  `src/cover-system.ts`, `src/desk-anchor.ts`, `src/hand-joints.ts`.
- Level 2 with a real object required; the video.
