# Day 6 (11 Nov 2026): level 2, the keeper's gaze, needs a real object

The day-4 review's finding 11: sponsor necessity was partial. Level 1 is
`needsObject: false` and plays the same on any flat surface; Silhouette
(2023) already plays with hand shadows. Its fix #8 (and day 3's P1-6): a
level 2 with `needsObject: true`, so mixed reality is the reason the level
exists. Nothing here has run on a Quest yet.

## The design

Same board, lantern and path as level 1 (level 1 is unchanged until its
first win), plus one rule (`src/level2.ts`):

- **The keeper's gaze** is the stretch of path within 10° of the lantern's
  axis (x about −3 … +3 cm). A tracked hand that blocks the sight line to any
  point of it wakes the keeper, who then sees the whole path (level 1's
  lantern rule, extended). A still object there doesn't wake it.
- So a **hand alone** can lead the creature to the edge of the gaze and no
  further: every gaze point is either lit or shaded by a hand that woke the
  keeper.
- **One object alone** (the registration footprint is 8 cm; registration
  refuses closer than 7 cm to the lantern) shades the gaze and a good part
  of the light but never both ends of the lit path, so the creature can't
  leave its nook.
- **Together:** hand at the left ghost (x −8 cm), edged toward the mug; the
  creature runs through the hand's shadow into the mug's and waits past the
  gaze; the hand lifts over the gaze (above the sight lines it shades
  nothing, so it wakes nothing) to the right ghost (x +8 cm) and leads the
  creature home. The object frees the hand at the moment the hand can't do
  the job, which a hand-shadow game alone doesn't have.
- **Level 2 counts one object** (a new registration replaces it): in the
  model two legal objects can shade the whole path between them and replace
  the hand (pinned by a test).
- **Unlock and honesty:** the first level-1 win unlocks it. The gaze wedge
  and a ghost mug appear with the card "Level 2: stand a mug or a book / in
  the gaze; hold a finger on top", and level 1 plays on until an object is
  registered; level 2 then starts at the next round boundary (the creature
  out of the light). If the object is forgotten (the board moved), the card
  says "Level 2 needs a real mug or book" and there is no win. Cards for a
  hand in the gaze ("A hand in its gaze wakes it. / Only the mug may stand
  there"), a mug that doesn't cover the gaze, the teach step and the swap
  step (the ghost moves to the right). `?level=2` starts there directly.
- **`/emu/`:** **O** registers an emulated 10 cm mug on the ghost mug
  through `judgeRegistration` (the same rules as a fingertip registration);
  **H** stands the hand at level 2's left ghost, **R** at the right one.
- **README:** one line on Silhouette (2023), hedged ("as far as we can
  tell") because we have not played it.

Choices made by measurement in the model (scratch scripts, then fixed in
`tests/day6.test.ts`): a 12° gaze left level 1's ghost spot 1 cm from waking
it with the thumb in; 10° with ghosts at ±8 cm keeps them clear ±1 cm
either way, either hand, at 7 and 11 mm joint radii. With ghosts at ±7 cm
the emulator's own hand (its thumb reaches 7.2 cm inward) woke the keeper at
the right ghost; at ±8 cm it doesn't. The ghost mug sits at z −3 cm (7.5 cm
from the lantern, 5 mm inside what registration allows) so its shadow
overlaps the hands' lanes.

Found and fixed while wiring it:
- the unlock card first replaced day 5's "again" card (the wiring check's
  `again` failed); now it only shows when no other card does;
- level 2 waited for the creature to be in its nook, but with no hand it
  waits at the light's edge, so registering the object did nothing for a
  long time; a round boundary is now "home, in its nook, or waiting out of
  the light";
- the level-2 card code repeated two day-2/day-5 mutation anchors, which made
  `tools/mutations.py` refuse to run; rewritten.
- The wiring check's hop floor went from 1 cm to 3 mm: on a loaded machine
  (load average 14–19) the emulator ran at 3–6 fps, the 0.45 s hop got two
  or three frames, and a clean build read 0.9 cm. The live day-5 build
  showed the same frame rate on the same machine, so this is sampling, not
  a regression.

## Tested

All gated by exit code:

- `npm run typecheck`: exit 0.
- `npm test`: 89/89, exit 0 (`day6_test_output.txt`); `tests/day6.test.ts`
  holds the three asked-for claims (no win without an object; the object
  shades 0 < lit < 1 and never all of the path; a win needs the
  combination), the wake test's coverage, the ghost spots, the one-object
  rule, unlock, cards and the `/emu/` keys.
- `npm run build`: main build without the emulator (3,188 KB), `/emu/` with
  it (6,164 KB), dist check green, exit 0.
- `python3 tools/mutations.py` with the emulator stage
  (`day6_mutations_output.txt`):
  - 58 mutations of the tested code: **57 fail a test**, 4d is the same
    equivalent one. New: 7a–7m. 7e (the object "covers the gaze" once it
    covers one sample) survived the run; a test with a mug that covers only
    part of the gaze was added and 7e, re-run alone, fails it.
  - 19 glue mutations: the outside run's O13–O22 at today's call sites and
    G1–G9 in the level-2 glue: **19 of 19 caught**. O13, O14, G9 by unit
    tests; O15–O22 and G1–G8 by the wiring check (G1 the gaze wake, G2 the
    level switch, G3 the unlock, G4 "covers the gaze", G5 the ghost's spots,
    G6 the drawn gaze and ghost mug, G7 the one-object rule, G8 the O key).
    During G3 the hop check also failed (sampling, above).
  - Catch rate overall: 76 of 77, the 77th equivalent.
- `tools/emu/wiring_check.mjs` on the clean local build
  (`day6_emu_wiring_local.json`, headless Chromium, software rendering, 29
  checks, all pass): the day-5 checks (session request `requiredFeatures:
  []`, the 5 s and pagehide writes, the slide card at litFraction 0.826, a
  win in 10.8 s, the "again" card, spotted, the keeper waking at its
  lantern), then level 2: the unlock card with the gaze and the ghost mug;
  O → level 2, the mug covers the gaze, the ghost at x −8 cm; a second
  registration elsewhere replaces the mug and the card says it must cover
  the gaze; H → the creature waits in the mug's shadow past the gaze, the
  ghost moves to +8 cm, the keeper asleep; R → home (a level-2 win, not
  spotted); O again → "Level 2 needs a real mug or book"; H + → held for
  20 s → no win, and the keeper woke at the gaze. No console errors.
- `tools/emu/replay.mjs` (new; the judges' path) on the local build first:
  every step passed.
- Screenshots (emulator, simulated room): `day6_01_emu_l2_mug_ghost_left.png`
  (O: the gaze, the mug, the ghost on the left), `day6_02_emu_l2_mug_holds_it.png`
  (the creature in the mug's shadow, the swap card),
  `day6_03_emu_l2_win.png`.
