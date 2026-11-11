# Evidence: what is shown, how, and what is not

Day 4, 11 Nov 2026. No Meta Quest has run this build yet. Every number below
comes from Node unit tests, the Immersive Web Emulator, or the author's
scripted runs, and says which. [CLAIMS.md](CLAIMS.md) lists each claim with
its proof level; this page holds the evidence itself.

## Per judging criterion

| Criterion | Shown | How to check | Not shown yet |
|---|---|---|---|
| Innovation | The tracked hand is cover in a line-of-sight game: 25 joints become 30 capsules and block the lantern's sight line, whatever the pose | `npm test`: the case set below, "pose-agnostic", "spread fingers leave gaps" | That it reads as play rather than a chore on a real desk |
| Experience | First-run teaching on every placement path; the taught pose makes a lane you slide, not a blackout; a "slide your hand along" card; a visible win and a keeper that wakes when it spots; pause, not "spotted", when the covering hand is lost; a desktop judge reaches the game in `/emu/` | `tests/day2.test.ts`, `tests/day3.test.ts`, `tests/day4.test.ts`; the `/emu/` run in `devlog/DAY4.md` | Cold-stranger timings on a headset ([TESTER_10MIN.md](TESTER_10MIN.md)); comfort |
| Technical | The drawn shadow equals the creature's sight test at 2,048 cell centres; the main build has no emulator; 30 of 31 deliberate bugs make a test fail; the tester log survives a simulated reload, is written every 5 s and on page hide, and a failed write is retried | `npm test`, `npm run build`, `python3 tools/mutations.py` | Frame rate on a Quest, tracking shimmer, plane and anchor behaviour in real rooms, the hand mask |
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
(z −8 … +3 cm) is cover; near the lantern the wrist may rise to 6.5 cm and
still cover, at 9 cm it does not; a hand standing in the lit area in front of
the path is not cover. Highest wrist that still covers the middle of the
path (same model, 7 mm minimum joint radius; real joint radii may shift
it), bisected by a test in `tests/day4.test.ts`: 7.7 cm at z −8 cm, 7.0 cm at
−6 cm, 5.9 cm at −3 cm, 4.8 cm at 0, 3.7 cm at +3 cm (each within 1 mm).

Day 4 adds the lane (`tests/day4.test.ts`): the "stop" hand where the ghost
hand stands (x −6.5 cm, z −2.5 cm) leaves litFraction strictly between 0 and
1; held still there, or 1 cm off in any direction, the creature dashes into
its shadow and never reaches the trinket; slid along at the `/emu/` seat's
speed it gets home unspotted, and a 10× faster slide outruns it. A hand
standing right at the lantern still shades nearly the whole light (pinned
as known).

## Mutation table

`python3 tools/mutations.py` applies each edit, runs `npm test`, restores the
file. Counts below are from `devlog/day4_mutations_output.txt` (earlier:
`devlog/day3_mutations_output.txt`, `devlog/day2_mutations_output.txt`). O3
and O4 are the two outside mutations that survived day 2; O9, O10 and O12
the three that survived an outside run on day 3. All five now fail a test.

| Mutation | Tests that fail |
|---|---|
| D1 no pause on hand loss | 4 |
| D2 quick reject inverted | 13 |
| D3 no palm webs | 2 |
| D4 no "seen for 0.15 s" debounce | 1 |
| D5 light-map distance cull too aggressive | 1 |
| 2a ghost needs `!listening` again (the day-1 bug) | 3 |
| 2b registration blocked while listening after a plane placement | 2 |
| 2c teaching card replaced by the old move card while listening | 4 |
| 2d knob label never shown | 2 |
| 4a pause only when both hands are lost | 4 |
| 4b cover-hand memory window = 0 | 4 |
| 4c never stop waiting once the hand is back | 1 |
| 4d also mark a still-tracked hand as lost | 0: equivalent (the next line clears a tracked hand) |
| capsule inflation removed | 3 |
| capsule radius halved | 6 |
| O3 an object's shade no longer ends the wait for a lost hand | 1 |
| O4 late-desk window off (10 s → 0) | 1 |
| 3a anchor restore gives up at 4 s again | 1 |
| 3b the log store's cursor never advances | 4 |
| 3c a stored log of another version is mixed in | 1 |
| 3d teaching copy back to day 2 | 2 |
| 3e no desk wait before floating the board | 1 |
| O9 no log flush on page hide (outside run, day 3) | 1 |
| O10 the 5 s log flush never fires (outside run, day 3) | 1 |
| O12 `/emu/` seat slides 10× faster (outside run, day 3) | 1 |
| 5a log cursor advances although the write failed | 1 |
| 5b overlapping flushes not serialised | 1 |
| 5c teaching spot back by the lantern (day-3 `/emu/` spot) | 4 |
| 5d teaching spot centred on the light (the lane misses the creature) | 3 |
| 5e "tap your desk" card back during the desk search | 2 |
| 5f slide card never shown | 1 |

30 of 31 caught; the 31st is equivalent. Output: `devlog/day4_mutations_output.txt`.

## Emulator runs

- Day 2, author's scripted walkthrough on the dev server: 24/24
  (`devlog/day2_walkthrough_output.txt`). Not re-run independently.
- Day 3, the built `/emu/` in headless Chromium (software rendering, a few
  frames per second): Enter → board on the emulated desk (`planeLabel: desk`);
  H → the creature dashes into the hand's shadow; → held → a win; L → spotted;
  tester log kept across a new URL; guided poses only after
  "Enter: guided poses"; no console errors. Details in `devlog/DAY3.md`.
- Day 4, the built `/emu/` with the fixed seat (the hand now stands fingers
  up, wrist on the desk where the ghost stands): H → litFraction 0.826, the
  creature dashes into the lane and stops; 30 s still → no win; → held → a
  win; the win and spotted feedback read back; no console errors. Details in
  `devlog/DAY4.md`.

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
- No labelled case set on real tracked hands exists yet; a returned tester
  log is what would make one.
