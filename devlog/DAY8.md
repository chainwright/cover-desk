# Day 8 (11 Nov 2026): fixes from the round-6 outside review

The day-7b build went to five outside judging seats (`judges_impl_d6/`, not
in this repository). Their scores did not move (panel about 5.6): the day-7
fixes landed, but the seats priced what was still missing (no video, no
text, no headset numbers, a flat level-2 ending, nothing kept between
visits) and found eight stale or wrong sentences in the judge files. Nothing
here has run on a Quest yet either; four Quest owners were asked today and
none has sent a log.

## 1. Judge-facing text (commit `e92f88b`)

Every item of the hound's list, each checked against the code or a test
first:

- 103 tests → 108 (the count on the day-7b commit); the mutation sentence
  now carries day 7b and the outside run's 0 of 5 (below);
- the case set: "so the wake rule cannot override the case set's verdict"
  (the cases are not run through the game loop), not "the game gives the
  same verdict";
- slide speeds as asserted (1, 3, 5, 7, 9 cm/s; 11, 12, 15 outrun it; 10 is
  printed, not asserted);
- the jitter count: the test asserted 0 with the dwell and "more than 0"
  without it and printed nothing. It prints both now: **9**, not the 10 the
  texts said (correction appended to DAY7.md);
- after the first win: the ghost mug and the level-2 card, not the gaze;
- level 2 "is where your desk joins in", the object registered, not sensed;
- the lift-over sentence (5 cm is the lowest that works, 11 mm joints; 1 cm
  wakes the keeper);
- Silhouette (2023) named as already guiding creatures with hand shadows;
- "where the pale hand shows" instead of "between the lantern and the path"
  on the landing page, README and the `/emu/` key list;
- JUDGES step 7 via `?level=2` (or O after a win), the 10 s fallback and the
  hop at low frame rates spelled out; CLAIMS/EVIDENCE headers; the day-7b
  row in PROVENANCE.

## 2. The keeper waits a quarter second (commit `a2cff29`)

The ghost's spot moved 1 cm toward the lantern clears the wake radius by
about 2 mm; hand tracking errs by about 1.7 cm at best. `LanternWake` now
wakes only after a hand has stayed inside 6.3 cm for 0.25 s without a break
(game time, the frame's clamped step). The radius, the bisection behind it
and the day-7 hysteresis are unchanged. In the model:

- a still hand 1 cm in front of the ghost's spot, joints jittering ±5 mm at
  30 Hz, ten 30 s runs: **0 wakes**; an instant rule at the same radius:
  1564 rising edges (`tests/day8.test.ts` prints both);
- at ±1 cm jitter the same hand still wakes it about 3 times in 5 minutes
  (scratch run, output not kept). The quarter second absorbs flicker, not a
  hand that really sits a centimetre too close;
- the cupped lantern still wakes the keeper and the creature never gets
  past the light's near edge. New: in that quarter second the creature can
  step out of its nook, and is then spotted and runs back (the wiring
  check's `wake-holds` now allows that second "hm?");
- every still hand inside the radius that would win with no rule still
  loses (the bisection's region, at least 20 hands).

The keeper-woke log event carries the wait (`afterMs`).

## 3. The rest of the list (commit `42d86ae`)

- **Level 2's own ending.** It ran level 1's handler, card and C-E-G chime.
  Now the creature hops, then tosses the trinket up onto the registered
  object's top; the keeper's eyes shut and its head nods; the lantern dims
  to a glow and stays dim until the next round; a soft falling lullaby and
  two snores; the card "Asleep! Your mug held the shade". Pure curve
  `l2WinFx(t)`, tested; the wiring check compares every recorded frame.
- **The first seconds.** On a first run the keeper stirs for 2 s before the
  teach card and the ghost (eyes half open, a look along the path, the
  lantern brightens, a sleepy rising "hm?", the creature shrinks into its
  nook). Visual and sound only.
- **A lane you can see.** The shade near black and denser, its edge drawn
  as a pale line. Drawing only: the light map and the sight test are the
  same. In `/emu/` the object is an opaque paper mug with a handle (it read
  as a glass), and it exists only in the `/emu/` build.
- **Kept progress.** Wins (the beads) and the level-2 unlock in
  localStorage; `?reset=1` forgets them.
- **The page's preview** shows the lesson before Enter: the light map from
  the pale ghost hand's own shape, the creature moved by the game's rules
  until it waits in the lane (it showed the creature in full light).
- **Tagline** on the page and the README; the README opens with a picture
  of the lane, the test counts moved down to "Checked so far".
- **TESTER_PROTOCOL**: steps 11 and 11b (level 1) before any registration;
  8b registers the box again on the ghost mug (after step 8 the game is
  already in level 2).

## 4. The outside run's five survivors (judges_impl_d6, ORGANISER_MUTATIONS)

Its five glue edits on day-7 code all survived typecheck, the tests and the
wiring check. Now:

| Id | Edit | Caught by |
|---|---|---|
| X1 | the main build draws the `/emu/` paper mug over a real object | `npm run build`: `tools/check-dist.mjs` fails when the paper mug's material name is in the main bundle (it is built only behind `__COVER_EMU__`) |
| X2 | the object column flattened | **not covered** (still only a headset shows it) |
| X3 | level 2 looks for the hand back at level 1's spot | wiring `l2-hand-back`: a hand 3.5 cm left of level 2's left ghost (5 cm from level 1's spot) must start the next round as "hand back" |
| X4 | the next round ignores the hand | wiring `next-round-hand`: H H 5 s after the win, the new `next-round` log event must say hand back, before 9.5 s |
| X5 | the "again" card never cleared by the hand | wiring `next-round-hand`: the game counts frames where the card outlived the hand coming back (`againStuck`), must be 0 |

`l2-hand-back` first also required the round to start before 9.5 s; two
unrelated mutations (G16, G21) failed it through timing under a load average
near 28, so it now keys on the hand-back flag alone, which is what tells
the spots apart. X3 was re-run against that version: caught.

## 5. Tests and checks (all gated by exit code)

- `npm run typecheck` 0; `npm test` **117/117**, exit 0
  (`day8_test_output.txt`); `npm run build` with the dist check 0 (main
  3,197 KB, no emulator, no `__cover`, no paper mug; `/emu/` 6,175 KB with
  all three).
- Unit mutations (`day8_mutations_unit_output.txt`): **79**, 78 fail a test,
  4d is the known equivalent. First pass: 10f (the level-2 lantern doesn't
  dim) survived, because the test compared the dim with its own constant; a
  test that the light ends at most half as bright was added and 10f re-run:
  caught.
- Glue mutations (`day8_mutations_glue_output.txt`), the twelve new ones,
  each by the check written for it: X1 (dist), X3, X4, X5, G15 (the wake's
  step at the call site), G16 (the climax light), G17 (chime instead of the
  lullaby), G18/G19 (progress not saved / not restored), G20 (the threat
  beat not passed to the cards), G21 (the trinket never flies), G22 (the
  preview not staged). 12 of 12. Two earlier ones were recreated at changed
  lines and re-run: O17 (no chime) by `win-chime`, R2 (lantern wake not
  wired) by `wake`, `wake-holds`, `woke-reason-lantern`
  (`day8_mutations_glue_recreated_output.txt`). The other 33 earlier glue
  mutations were not re-run today.
- Wiring check on the clean build, twice: **47/47** both
  (`day8_emu_wiring_local_run1.json`, `…run2.json`).

## 6. The video draft (not uploaded)

`tools/emu/record.mjs` records `/emu/` in a **headed** Chromium on the GPU
(ANGLE Metal, Apple M4): the game reported 60 fps the whole run (each beat
logs it), 3,552 frames in 59 s, no console errors. The page's own sound is
recorded in the page (everything the game sends to the speakers also goes
to a recorder). For the shots the emulated seat moves 45 cm left before the
board lands (otherwise it lands on the emulated keyboard, which hides the
lane) and the emulated head moves closer after; a judge can do the same
with the emulator's own controls (M). `video/d7/make_video.py` cuts it
(cuts only, real time) and overlays the six disclosures the hound asked
for. The draft (56 s), the submission text and the tagline are in
`video/d7/` (outside the repository) for Roma's approval; nothing was
uploaded or submitted.

## 7. Deploy

(filled in below once deployed)

## Still open

- Everything on a Quest (unchanged from day 7).
- X2 (the object column's height) has no check.
- The level-2 ending: the mug stands in front of the keeper, so from a
  seated view mostly its bowed head shows.
- A phantom registration also gets a depth-only column.
