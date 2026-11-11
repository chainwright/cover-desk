# Evidence: what is shown, how, and what is not

Day 6, 11 Nov 2026. No Meta Quest has run this build yet. Every number below
comes from Node unit tests, the Immersive Web Emulator, or the author's
scripted runs, and says which. [CLAIMS.md](CLAIMS.md) lists each claim with
its proof level; this page holds the evidence itself.

## Per judging criterion

| Criterion | Shown | How to check | Not shown yet |
|---|---|---|---|
| Innovation | The tracked hand is cover in a line-of-sight game: 25 joints become 30 capsules and block the lantern's sight line, whatever the pose. Level 2 needs a real object and the hand together: a hand in the keeper's gaze wakes it, one object never covers the whole path, the mug holds the cover while the hand moves over | `npm test`: the case set below, "pose-agnostic", "spread fingers leave gaps"; `tests/day6.test.ts` (level 2) | That it reads as play rather than a chore on a real desk; level 2 with a real mug |
| Experience | First-run teaching on every placement path; the taught pose makes a lane you slide, not a blackout; a "slide your hand along" card; a win staged at desk scale (hop, warm flare, bead pop) followed by the ghost and an "again" card; a keeper that wakes when it spots, with a card that says why; a hand at the lantern wakes the keeper; pause, not "spotted", when the covering hand is lost; a desktop judge reaches the game in `/emu/` | `tests/day2.test.ts` … `tests/day5.test.ts`; the `/emu/` wiring check in `devlog/DAY5.md` | Cold-stranger timings on a headset ([TESTER_10MIN.md](TESTER_10MIN.md)); comfort |
| Technical | The drawn shadow equals the creature's sight test at 2,048 cell centres; the main build has no emulator; the mutation counts below; the tester log survives a simulated reload; its flush helpers and its write path (a failed write is written again by the next flush, 3 in a row switch storage off) are unit-tested on a fake IndexedDB, and the two flush call sites are checked in the built `/emu/` | `npm test`, `npm run build`, `python3 tools/mutations.py`, `node tools/emu/wiring_check.mjs` | Frame rate on a Quest, tracking shimmer, plane and anchor behaviour in real rooms, the hand mask |
| Polish | Synthesised sound (a win chime, the keeper's "hm?"); one material family | play `/emu/` | No video yet; untextured models |

## The labelled case set (main claim)

`tests/los-cases.test.ts`, 18/18 pass. Synthetic 25-joint hands
(`tests/hand-fixture.ts`) with the fixed proxy radius, in the level-1 board
frame; the creature's body centre 1.2 cm above the desk. These test the
geometry model, not tracked hands. Labels were written from the geometry in
the same commit as the test (`9155473`); there is no earlier record of them.

| Id | Expected | Setup |
|---|---|---|
| P1 | shadow (right hand) | "stop" palm 4.5 cm in front of the lantern, middle of the path |
| P2 | shadow | same palm, a point 10 cm left on the path |
| P3 | shadow | same palm, a point 10 cm right |
| P4 | shadow | hand on its edge, a wall across the light |
| P5 | shadow | flat hand lying beside the path |
| P6 | shadow | a fist held up near the lantern |
| P7 | shadow (left hand reported) | two hands, the left one covers |
| P8 | shadow (right hand reported) | two hands, the right one covers |
| P9 | shadow (object) | a registered 9 cm mug |
| N1 | seen | no hand (the light-on control) |
| N2 | seen | palm 6 cm to the side of the sight line |
| N3 | seen | flat hand lying low near the lantern (the line passes over it) |
| N4 | seen | "stop" palm in front of the path, toward the player |
| N5 | seen | the same palm lifted 20 cm (the light passes under it) |
| N6 | seen | palm behind the lantern |
| N7 | seen | an object only 1.5 cm tall |
| N8 | dark | the nook, outside the light's angle |
| N9 | dark | beyond the light's range |

Day 3 adds the cases behind the teaching copy (`tests/day3.test.ts`): a
"stop" hand standing on the desk anywhere between the lantern and the path
(z −8 … +3 cm) is cover (geometry only: since day 5 a hand within 6.3 cm of
the lantern also wakes the keeper); near the lantern the wrist may rise to 6.5 cm and
still cover, at 9 cm it does not; a hand standing in the lit area in front of
the path is not cover. Highest wrist that still covers the middle of the
path (same model, 7 mm minimum joint radius; real joint radii may shift
it), bisected by a test in `tests/day4.test.ts`: 7.7 cm at z −8 cm, 7.0 cm at
−6 cm, 5.9 cm at −3 cm, 4.8 cm at 0, 3.7 cm at +3 cm (each within 1 mm).

Day 4 adds the lane (`tests/day4.test.ts`): the "stop" hand where the ghost
hand stands (x −6.5 cm, z −2.5 cm) leaves litFraction strictly between 0 and
1 (the test checks 0.5–0.95; the emulator runs read 0.826); held still
there, or 1 cm off in any direction, the creature dashes into its shadow and
never reaches the trinket; slid along at the `/emu/` seat's speed it gets
home unspotted, and a 10× faster slide outruns it.

Day 5 (`tests/day5.test.ts`), all in the same model:
- **Slide speed:** from the ghost's spot every slide from 1 to 9 cm/s leads
  the creature home unspotted; 10, 12 and 15 cm/s outrun it.
- **The keeper wakes:** a hand right at the lantern shades nearly the whole
  light, so a hand with any joint within 6.3 cm of the lantern wakes the
  keeper, who then sees the whole path. The radius comes from a bisection:
  for each column of x (−5 … +5 cm in 2.5 mm steps) the farthest still
  "stop" hand that got the creature home without a slide; the largest of
  them had its nearest joint 6.1 cm from the lantern (6.08 cm at the test's
  step). The ghost's spot moved 1 cm toward the lantern is 6.5 cm away. With
  the rule, cupping the lantern never crosses, still or sliding.
- **Known, not closed:** a hand laid on its edge along the path, as a 17 cm
  wall a few centimetres before it, shades the whole lit path; the creature
  crosses without a slide. Pinned by a test.

Day 6, level 2 (`tests/day6.test.ts`, `src/level2.ts`), same model:
- **The gaze:** the path points within 10° of the lantern's axis (x about
  −3 … +3 cm). A hand wakes the keeper when it blocks the sight line to any
  of them; the test samples the stretch every 2 mm and pads every capsule by
  2 mm, so a hand can't shade a gaze point between samples unnoticed. A test
  checks it: every pose on a 1 cm grid (left- and right-handed "stop", edge,
  flat; three heights) that shades a gaze point by the creature's own test
  at 1 mm steps also trips the wake test.
- **Hand alone, never:** every still pose on a 1.5 cm grid (four poses, two
  heights) and careful or heedless slides at 1, 3, 6, 9 cm/s, either hand:
  no win. The same careful slide under level 1's rules does win.
- **Object alone, never:** the mug on its ghost spot (x 0, z −3 cm, 10 cm)
  covers the gaze; litFraction strictly between 0 and 1 and well below the
  empty board's; both ends of the lit path stay lit. One 8 cm object at each
  legal spot on a 1 cm grid, 30 cm tall: no win.
- **Together:** a careful slide (never into the gaze) plus the mug: home,
  unspotted, the keeper never woke, for either hand and with the mug moved
  ±1 cm (9/9). A still hand at each ghost (x ∓8 cm) wins with 11 mm joint
  radii; with the fixture's 7 mm floor it needs a nudge toward the mug. A
  hand slid straight into the gaze wakes the keeper and the creature is
  spotted.
- **The ghost spots:** ±1 cm either way, either hand, 7 or 11 mm radii: clear
  of the gaze; at 14 mm the corner 1 cm inward and 1 cm toward the lantern
  touches it (pinned by the test).
- **Two objects** can shade the whole path in the model, so level 2 counts
  one (a test pins both).

## Mutation table

`python3 tools/mutations.py` applies each edit, runs `npm test`, restores the
file. Counts below are from `devlog/day6_mutations_output.txt` (earlier:
`devlog/day5_mutations_output.txt`, `devlog/day4_mutations_output.txt`, `devlog/day3_mutations_output.txt`, `devlog/day2_mutations_output.txt`). O3
and O4 are the two outside mutations that survived day 2. O9 and O10 here
are helper-level versions of the day-3 flush survivors (they mutate the
tested helpers `flushOnPageHide` and `FlushTimer`); the app's call sites are
the outside run's O15/O16 in the second table. O12 (`/emu/` slide ×10) is
the day-3 mutation itself.

| Mutation | Tests that fail |
|---|---|
| D1 no pause on hand loss | 4 |
| D2 quick reject inverted | 18 |
| D3 no palm webs | 2 |
| D4 no "seen for 0.15 s" debounce | 1 |
| D5 light-map distance cull too aggressive | 1 |
| 2a ghost needs !listening again (day-1 bug) | 4 |
| 2b registration blocked while listening on a plane placement | 2 |
| 2c teaching prompt replaced by the old move prompt while listening | 5 |
| 2d knob label hidden on the first run | 2 |
| 4a pause only when both hands are lost (day-1 rule) | 4 |
| 4b cover-hand memory window = 0 | 4 |
| 4c never stop waiting when the hand is back | 1 |
| 4d also mark a still-tracked hand as lost (equivalent: the next line clears it) | 0: equivalent (the next line clears a tracked hand) |
| LOS capsule inflation removed (+4 mm -> 0) | 6 |
| LOS capsule radius halved | 10 |
| O3 object shade no longer clears the wait (branch body removed) | 1 |
| O4 late-desk window off (LATE_DESK_S 10 -> 0) | 1 |
| 3a anchor restore gives up at 4 s again | 1 |
| 3b log cursor never advances (every flush rewrites the session) | 5 |
| 3c a restored log of another store version is mixed in | 1 |
| 3d teaching copy back to day 2 | 2 |
| 3e searching floats the board at once (no desk wait) | 1 |
| O9 no log flush on page hide | 1 |
| O10 the 5 s log flush never fires | 4 |
| O12 `/emu/` seat slides 10x faster | 2 |
| 5a log cursor advances even when the write failed | 3 |
| 5b overlapping flushes not serialised | 1 |
| 5c teaching spot back by the lantern (day-3 `/emu/` spot) | 7 |
| 5d teaching spot centred on the light (the lane misses the creature) | 5 |
| 5e "tap your desk" card back during the desk search | 2 |
| 5f slide card never shown | 1 |
| 6a no wake rule (radius 0) | 4 |
| 6b wake radius 8 cm (the ghost spot wakes the keeper) | 3 |
| 6c log store gives up at the first failed write again | 2 |
| 6d log store never gives up | 1 |
| 6e a successful write does not reset the failure count | 2 |
| 6f log keeper writes to a store that gave up | 1 |
| 6g spotted card never shown | 1 |
| 6h "again" card never shown | 1 |
| 6i ghost not back after a win | 1 |
| 6j "again" cleared while the creature is still at home | 1 |
| 6k no win hop | 1 |
| 6l eyes stay shut when a hand is at the lantern | 1 |
| 6m a lifted hand counts as back at the start | 1 |
| 6n analyser counts every second as in view | 1 |
| 7a a hand in the gaze never wakes the keeper | 4 |
| 7b no padding in the gaze wake test (2 mm -> 0) | 1 |
| 7c gaze sampled every 2 cm instead of 2 mm | 3 |
| 7d gaze half-angle 10 -> 4 deg | 2 |
| 7e "the object covers the gaze" true when one sample is covered | 0 in the run; after the new partial-cover test, 1 (re-run) |
| 7f level 2 counts every object (no replace) | 1 |
| 7g a level-1 win never unlocks level 2 | 1 |
| 7h level 2 starts without an object | 1 |
| 7i "needs a real mug" card never shown | 1 |
| 7j ghost never moves to the right-hand spot | 1 |
| 7k unlock card replaces the day-5 "again" card | 1 |
| 7l level-2 ghosts back at 6 cm (too near the gaze) | 2 |
| 7m ghost mug off the gaze | 3 |

57 of 58 caught (7e after its new test); the other (4d) is equivalent. The
day-1 to day-5 rows above are the day-5 counts; on day 6 some of them fail
one or two more tests (the day-6 tests also catch them), see the output
file. Output: `devlog/day6_mutations_output.txt`.

The outside run's ten day-4 glue mutations, recreated at today's call sites
(`COVER_EMU_BASE=http://127.0.0.1:8799/ python3 tools/mutations.py outside`
with `dist/` served there; a mutation no unit test catches is built into
`/emu/` and run through `tools/emu/wiring_check.mjs`):

| Mutation | Caught by |
|---|---|
| O13 `/emu/` hand turned -90 deg (fingertips down) | unit tests (1 failing) |
| O14 `/emu/` grip-to-wrist offset ignored | unit tests (1 failing) |
| O15 frame-loop log flush call removed (cover-system) | emulator wiring check: flush-5s |
| O16 page-hide flush wiring removed (index.ts) | emulator wiring check: flush-hide |
| O17 win chime not played | emulator wiring check: win-chime |
| O18 bead row not updated | emulator wiring check: win-bead |
| O19 trinket not carried after a win | emulator wiring check: win-trinket |
| O20 keeper eyes never open | emulator wiring check: spotted-eyes-stare, spotted-hm, spotted-card, wake-holds |
| O21 stare line never shown | emulator wiring check: spotted-eyes-stare |
| O22 slide-card latch removed at the call site | emulator wiring check: slide-card |
| G1 gaze wake not wired | emulator wiring check: l2-no-object-no-win |
| G2 level never switches to 2 | emulator wiring check: l2-start and every later l2-* check |
| G3 a win does not unlock level 2 | emulator wiring check: l2-unlocked and every later l2-* check (this run also failed win-hop-flare, a sampling flake, below) |
| G4 "the object covers the gaze" never computed | emulator wiring check: l2-one-object |
| G5 ghost hand not moved to level 2's spots | emulator wiring check: l2-visuals, l2-ghost-right |
| G6 gaze and ghost mug never drawn | emulator wiring check: l2-unlocked, l2-visuals, l2-one-object |
| G7 level 2 keeps every object (one-object rule off at the call site) | emulator wiring check: l2-one-object |
| G8 `/emu/` O key registers nothing | emulator wiring check: l2-start, l2-visuals |
| G9 `/emu/` R key uses the left spot | unit tests (1 failing) |

19 of 19 caught (the ten above re-run on day 6 at today's call sites, and
G1–G9). The wiring check's hop reading is a sampling of 2–3 frames at 3–6
fps on a loaded machine: its floor went from 1 cm to 3 mm on day 6 after a
clean build read 0.9 cm, and it still failed once (during G3). It is weak
evidence on its own; the hop itself is unit-tested (6k).

Day-5 note: during that day's run the machine lost its network for a while;
O16–O22 also logged console errors then, not traced to a request. The clean
build's wiring check, run after the network came back, had none.

## Emulator runs

- Day 2, author's scripted walkthrough on the dev server: 24/24
  (`devlog/day2_walkthrough_output.txt`), on day-2 code (its copy checks
  are the day-2 wording); not re-run on later code, nor independently.
- Day 3, the built `/emu/` in headless Chromium (software rendering, a few
  frames per second): Enter → board on the emulated desk (`planeLabel: desk`);
  H → the creature dashes into the hand's shadow; → held → a win; L → spotted;
  tester log kept across a new URL; guided poses only after
  "Enter: guided poses"; no console errors. Details in `devlog/DAY3.md`.
- Day 4, the built `/emu/` with the fixed seat (the hand now stands fingers
  up, wrist on the desk where the ghost stands): H → litFraction 0.826, the
  creature dashes into the lane and stops; 30 s still → no win; → held → a
  win (12.6 s in the author's run; an outside run on the live URL took
  18.3 s: headless software rendering makes times machine-dependent); the
  win and spotted feedback read back; no console errors. Details in
  `devlog/DAY4.md`.
- Day 5, `tools/emu/wiring_check.mjs` on the built `/emu/` and on the live
  URL: the session asks for nothing as required; the log reaches
  IndexedDB by the 5 s timer and at once on pagehide; the slide card; a win
  with trinket, one bead, a chime, the hop and the flare; the "again" card
  and ghost until H stands the hand at the ghost's spot; L → spotted with
  eyes, stare, "hm?" and the spotted card; C → the keeper wakes, the card
  says so and the creature stays home; no console errors. Details in
  `devlog/DAY5.md`.

- Day 6, the wiring check with a level-2 phase on the built `/emu/`, and
  `tools/emu/replay.mjs` on the live URL; details and outputs in
  `devlog/DAY6.md`.

## Not shown yet (needs a Quest)

- Frame rate ≥ 72 fps (median) with passthrough and a hand in the light.
- Tracking good enough that the shadow edge doesn't shimmer and the creature
  isn't spotted unfairly.
- The board finding a real desk; taps on a desk whose Space Setup plane is
  drawn more than 3 cm low are rejected (known, not fixed).
- The anchor coming back after a power cycle.
- The real hand showing over the board (the default hand mask).
- A registered mug's height against a ruler; phantom mid-air registrations
  (known weakness; the protocol counts them).
- The log's download and the report form on Quest Browser.
- Level 2 with a real mug: registration on a real mug top, whether players
  find the gaze and the lift-over, and whether real joint radii keep the
  ghost spots clear of the gaze.
- No labelled case set on real tracked hands exists yet; a returned tester
  log is what would make one.
