# Day 3 (11 Nov 2026, early morning): a tester session that returns its data, copy that matches the light, a desktop path that reaches the game

A second outside review (five reviewers, one of them checking the others)
scored day 2 at 5.75 and said no to a public call for Quest testers yet. Its
top fixes that need no headset are below. Each finding was checked against
the code first; seven reviewer statements were wrong and were left alone (for
example, the "dash nobody caused" in the floating board is the creature's
designed creep to the edge of the light, and a hand raised "a few cm" still
covers: the real limit is about 7 cm near the lantern). Nothing here has run
on a Quest yet.

## Fixed

1. **A tester session now returns its data.**
   - The log is kept on the headset (`src/log-store.ts`): IndexedDB, written
     in small append-only chunks every 5 s, at every session end and when
     the page is hidden or unloaded. It is meant to survive a reload, a new
     URL, a new build and a power cycle (corrected day 4: the emulator run
     below shows a new URL; a reload only in a unit test; a power cycle not
     yet); the next `?test=1` page continues the
     same log, and each session records its build. Versioned twice (database
     name `cover-tester-log-v2`, `storeVersion` 1); a stored log of another
     version is never mixed in. If storage fails, the page and the panel say
     "NOT kept: download before reload". **Start a new log** deletes it
     (with a confirmation). The cap is now 120,000 samples (about 33 min of
     both hands) for the whole log.
   - **A return channel:** an issue form on the public repository,
     `.github/ISSUE_TEMPLATE/tester-report.yml`
     (https://github.com/chainwright/cover-desk/issues/new?template=tester-report.yml),
     linked from the tester page, the "Copy summary" message and both
     protocols. It was meant to be filled in on the headset, attaching the
     log from Downloads (corrected day 4: not tried yet; and the issue is
     public, which the form now says; email is now the main channel); it
     opens with the no-faces/no-people/no-logos rule and says what the log
     holds.
   - **Three false protocol steps fixed:**
     - the guided poses no longer start by themselves 3 s after the board
       lands (they ran during the frame-rate and crossing steps and labelled
       that data `stop`/`edge`/`flat`); they start only from a separate
       **Enter: guided poses** button, and each session records `guided`;
     - step 2 now taps the desk **beside** the board (a tap on the board is
       ignored on purpose after an automatic placement);
     - step 8's phantom count now pauses 6–12 cm beside the path, where a
       mid-air hold passes every registration rule, so the count can be
       non-zero (pointing at the creature was rejected as "on the path", so
       it read 0 by construction); a test pins that band.
   - **Step 10 timing:** the code gave up on the saved anchor after 4 s, the
     protocol allowed 8 s. The code was wrong: after a power cycle the
     headset may need longer, and giving up early is costly, because the
     automatic desk placement that follows saves a new anchor over the old
     spot. `RESTORE_WAIT_S` is now 8 s; step 9 (same session) keeps its 4 s
     target.
   - Step 12 (clear Space Setup) is optional; step 13 says its session is not
     logged and to go back to the `?test=1` page for the export.
   - **A 10-minute stranger version**, `TESTER_10MIN.md`, with the
     no-brands/no-people line on top. `TESTER_PROTOCOL.md` has it on top too.

2. **The instruction matches the light.** "Hold your hand up in the light"
   sent hands where they do nothing: the lit fan reaches past the path toward
   the player, and a hand there shades nothing on the path; and near the
   lantern the wrist must stay below about 7 cm (in the model). A test
   checks that at z −6 cm a wrist 6.5 cm up still covers and one 9 cm up
   does not (same model, 7 mm minimum joint radius; real joint radii may
   shift this). (Corrected day 4: a finer table quoted here had no test
   behind it; day 4 adds a bisection test, see DAY4.md.) Now:
   - card on the board: "Stand your hand like 'stop' / between the lantern
     and the path" (the card is 0.34 m wide, was 0.3, so it fits at the same
     letter size);
   - page intro: "Stand your hand on the desk between the lantern and the
     path, like 'stop'";
   - README, JUDGES.md, the guided step and both protocols say the same;
   - a test checks the copy against the geometry: standing on the desk
     between the lantern and the path covers (z −8 … +3 cm), a wrist at 9 cm
     or a hand in the lit area in front of the path does not.

3. **The desktop path reaches the game** (`src/emu-seat.ts`; it only runs
   in the `/emu/` build, its code ships in both and is inert without the
   emulator). On Enter the emulated headset sits at the emulated desk, looking
   down, with hands; the board lands on the desk by itself. Keys: **H**
   stands the right hand like "stop" between the lantern and the path,
   holding **→ / ←** slides it at 3 cm/s (the shadow then moves a little
   slower than the creature, so it follows), **L** lifts it, **M** gives the
   emulator its own controls back. A key list shows at the top. In the
   emulator the SDK's hand outline stays visible (the default invisible mask
   is for a real hand in passthrough). On day 2 an outside reviewer could not
   seat the emulator through its menus, and setting its pose from script did
   nothing: the emulator ignores scripted poses while its own controls are
   in charge, so the seat switches it to programmatic control first. JUDGES.md
   and the README give the exact steps and say the floating board is
   playable too.

4. **Judge-facing text.** The README takes the fact checker's eleven
   replacement sentences (synthetic hands, the move rule after the first
   placement, the anchor checked only in the emulator, "between the lantern
   and the path", "point down", the 0.3 s window, cell centres, "no case set
   on real tracked hands yet", the `/emu/` recipe, author-set dates, the
   unchecked hand mask). New: `EVIDENCE.md` (evidence per criterion, the
   labelled case set, the mutation table, what is unproven) and
   `PROVENANCE.md` (commit dates are author-set; GitHub's own repository and
   deploy timestamps, and how to query them). `CLAIMS.md` gains rows for the
   copy, placement timing, the kept log, the desktop path, and "not shown
   yet" rows for hands-only end to end and audio/planes/anchors on a Quest.

5. **Tests for the two mutations that survived.** The placement timing moved
   out of `cover-system.ts` into `src/placement.ts` (pure; the system calls
   `placementStep` each frame and carries out its answer). New tests: a desk
   found within 10 s of floating still wins, after that it is not looked
   for; the desk wait; the 8 s anchor wait; an object taking over the shade
   ends the wait for a lost hand (O3). Both O3 and O4 now fail a test.

## Tested

### Unit tests: 51/51 (`npm test`, exit 0)

The 43 from day 2 (one updated for the new copy) plus `tests/day3.test.ts`:
CoverWatch object take-over; placement late-desk window, desk wait, anchor
wait; the teaching copy against the geometry; the step-8 band; the log store
round trip across a "reload" and a new build, version mismatch, a stray
chunk, a new log.

### Mutations: 21 of 22 caught (`python3 tools/mutations.py`)

Output in `day3_mutations_output.txt`. The 15 day-2 mutations plus O3, O4
and five for day-3 code (anchor wait back to 4 s, a cursor that never
advances, a stored log of another version mixed in, the day-2 copy, no desk
wait). Only 4d survives, and it is equivalent (as on day 2). Table in
`EVIDENCE.md`.

### Emulator: the built `/emu/` (`day3_emu_output.txt`)

Served from `dist/` locally, headless Chromium with software rendering (a
few frames per second; not a headset number):
- Enter → board on the emulated desk after about 7 s (`planeLabel: desk`),
  teaching card and ghost shown, key list shown;
- H → the creature dashes into the hand's shadow; → held → a win; a new
  round; L with the creature in the light → spotted; no console errors;
- `?test=1`: a plain Enter logs no guided labels; "Enter: guided poses"
  logs `prep`, `stop`; after leaving and a new URL the page still says "278
  samples in 2 sessions"; after "Start a new log", a reload shows the log
  empty (corrected day 4: no reload with data kept was recorded);
- the second session in the same page came back on the saved anchor.

Screenshot: `day3_01_emu_seat_hand_stop.png` (emulator, simulated room;
the hand outline by the lantern, the board on the desk, the key list).

The day-2 scripted walkthrough (`tools/emu/walk_day2.py`) was not re-run
today; its copy check was updated to the new wording.

## Still open

- **A Quest run** (P0-2): frame rate, tracking, plane and anchor behaviour,
  the hand mask, the log download and the report form on Quest Browser. The
  public tester call should wait for one private run with
  `TESTER_10MIN.md`.
- The win payoff, the keeper waking to show why it spotted the creature, the
  "slide it along" lesson (P1-5).
- Real-room placement: a desk plane drawn more than 3 cm low still rejects
  taps silently; phantom mid-air registration (P1-7).
- Creature ×1.5 and styled cards (P1-9); a level that needs the real room
  (P1-10).
- The rest of `cover-system.ts` (plane choice, the anchor flow, registration
  gating, the desk tap) still has no unit test.
- The form needs a GitHub account.
- `day2_01_first_run_ghost_prompt.png` still shows the day-2 card wording.

## Deploy

Typecheck, tests and the full build (with the dist check) ran locally
first; only on green were `dist/` and `dist/emu/` (built from `2f1f81a`)
pushed to `gh-pages` as `6a08219`, fast-forward only; gitleaks (author's run, output not kept; corrected day 5) found nothing
in either commit. GitHub records the deploy at 2026-11-11 08:30:35 UTC.

## Public URL

- Main (Quest): https://chainwright.github.io/cover-desk/
- Desktop emulator: https://chainwright.github.io/cover-desk/emu/
- Tester report form: https://github.com/chainwright/cover-desk/issues/new?template=tester-report.yml

Checked after the deploy with `tools/emu/public_check.mjs` (now takes the
commit as an argument and drives the `/emu/` seat; headless Chromium; result
in `day3_public_check.json`):
- both return HTTP 200 and carry the build stamp `2f1f81a5086c`; the served
  main bundle contains no emulator code, the `/emu/` bundle does; no console
  errors on either;
- both intros read "Stand your hand on the desk between the lantern and the
  path, like 'stop'"; the tester block links the report form;
- `/emu/?test=1&reset=1`, Enter: seated, board on the emulated desk after
  6.5 s (`planeLabel: desk`), the card reads "Stand your hand like 'stop'
  between the lantern and the path", key list shown, log store `ready`;
  then **H**: the creature dashes into the hand's shadow (`line: shadow` by
  the right hand).
