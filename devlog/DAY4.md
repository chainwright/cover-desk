# Day 4 (11 Nov 2026, morning): a lane, not a blackout; a tester kit that returns data privately; a win you can see

A third outside review (five reviewers, one checking the others) scored day 3
at about 5.5 and said yes to one private Quest tester only after the tester
kit is fixed, and no to a public call. Its two biggest findings: the taught
pose solved level 1 without any skill (the whole light went dark, the
creature ran home with no slide), and tester step 5 would read "spotted" by
design. Each finding was checked against the code first. Nothing here has
run on a Quest yet.

## Fixed

1. **Tester kit (P0-1).** `TESTER_10MIN.md`, `TESTER_PROTOCOL.md`, the form
   and the tester page:
   - step 5 / protocol step 6: keep the hand still and hide it for 5 s with
     a book or by looking at the ceiling, then note "It waits" or spotted
     (moving the hand away while it is still tracked counts as lifting it,
     which is the designed "spotted" rule, so the old step could only fail);
   - step 4 asks "did you need to slide to get it home?";
   - download the log right after leaving the immersive view, before any
     reload; leaving is the palm-up pinch (the hand version of the Meta
     button);
   - before starting: allow the spatial-data prompt and note it, no private
     browsing, clear about 45 × 30 cm of desk;
   - **the return channel is email** (the business address shown on
     automate-ai.live), attachment or private link for video; the GitHub
     form stays optional, and the form, both protocols and the tester page
     now say at the top that **the issue is public**, with a second
     required checkbox; no video in the form, in line with "don't post
     footage publicly before 18 Nov".
   - protocol step 5 no longer claims the flicker rate comes from the log
     (that session is labelled `free`); it asks for clock times.

2. **A lane, not a blackout (P0-3).**
   - The geometry, checked first: in the emulator, the `/emu/` seat's "stop"
     hand was **upside down** (fingertips down into the lantern, wrist 13.7
     cm up; a −90° turn where +90° was meant) and placed by the emulator's
     grip point, not its wrist. That is why one key press blacked out the
     whole light (litFraction 0). A correct synthetic "stop" hand at the
     old ghost spot (7 cm in front of the lantern, centred) leaves a lane in
     the middle of the path that misses the creature's waiting spot; nearer
     the lantern (−8 cm) it shades nearly everything (0.1 % lit).
   - Chosen fix: move the teaching spot, not add a new rule. The ghost hand
     and the `/emu/` hand now stand at one shared spot, `TEACH_SPOT` in
     `src/level.ts`: halfway between the lantern and the path (z −2.5 cm),
     6.5 cm left of centre so the lane starts at the creature. The `/emu/`
     hand now stands fingers up with its wrist on that spot (measured offset
     from grip to wrist, `GRIP_TO_WRIST`). The other option, waking the
     keeper when a hand comes within N cm of the lantern, would add a rule
     the teaching never shows and make the day-3 copy test ("anywhere
     between the lantern and the path covers") false; the lane keeps the
     teaching honest.
   - The ghost is now a right hand (thumb on the left seen from behind).
   - A card after the first dash: "Slide your hand along, slowly: it follows
     your shadow" (until the first win).
   - Still true and stated: a hand cupped right at the lantern shades nearly
     the whole light; a test pins it as known, the README says it.
   - Tests (`tests/day4.test.ts`): the taught pose gives 0 < litFraction < 1
     (0.83 in the model) with the creature's waiting spot in shadow and the
     far path lit; held still there, or 1 cm off in any direction, the
     creature dashes into the lane and never reaches home in 30 s; slid at
     the `/emu/` speed it gets home unspotted, and 10× faster outruns it.
   - Every "slide it" sentence now matches: README, JUDGES.md, both tester
     protocols, the emulator note and key list.

3. **Judge-facing text (P1-4).** The hound's R1–R9: mutation counts with
   the outside survivors named; the light-map time as "a test asserts under
   2 ms, the author's runs print about 0.11 ms"; the log kept "in the
   emulator across a new URL, reloads in a unit test, a reload and a power
   cycle on a Quest not yet checked"; the seat code "ships in both bundles,
   runs only in /emu/"; lost-hand rows logged outside placement; "moving the
   hand away while tracked counts as lifting it"; "(in the model)" on the
   7 cm limit. The label bullet is gone from DAY3.md; "reload" became "new
   URL" in CLAIMS.md and EVIDENCE.md; DAY3.md's false and unbacked lines
   carry corrections. The wrist-height table is now backed by a bisection
   test (7.7 / 7.0 / 5.9 / 4.8 / 3.7 cm at z −8 / −6 / −3 / 0 / +3 cm; the
   day-3 numbers were a coarser sweep with no test, so they changed
   slightly). PROVENANCE.md now says GitHub's timestamps prove pushes, not
   writing.

4. **Log and first-run wiring (P2).**
   - The flush triggers are pure and tested: `FlushTimer` (every 5 s of
     frame time, checked every frame now, not inside the once-a-second fps
     block) and `flushOnPageHide` (pagehide, hidden tab). The day-3 outside
     survivors O9 and O10 now fail a test; O12 (`/emu/` slide ×10) fails the
     slide test.
   - The log cursor advances only after a successful write
     (`LogCursor.take` + `commit`, `LogFlusher`); flushes are serialised, so
     a page-hide flush during a timed one doesn't write rows twice.
   - The "Tap your desk" card no longer shows while the desk is still being
     searched for; it shows once the board floats. The tester panel says
     "Looking for your desk..." meanwhile.

5. **Payoff (P1-5).** A win: a rising three-note chime, the creature carries
   the trinket on its back until the next round, and a brass bead joins a
   row by the nook, one per win (up to ten). Spotted: the keeper's eyes open,
   a thin line of light stares from the lantern at the creature during its
   freeze, and a low "hm?" sounds. Level 2 was skipped.

## Tested

- `npm run typecheck`: exit 0.
- `npm test`: 64/64, exit 0 (`day4_test_output.txt`; the light-map half
  refresh printed 0.114 ms).
- `python3 tools/mutations.py`: 30 of 31 caught; 4d is the same equivalent
  one as before (`day4_mutations_output.txt`). New: O9, O10, O12, and 5a–5f
  for day-4 code (cursor commit, serialised flushes, teaching spot by the
  lantern, teaching spot centred, tap card during the search, no slide
  card). Not unit-tested: the seat's hand orientation (emulator run only)
  and the win/spotted feedback (read back in the emulator run).
- `npm run build`: main build without the emulator, `/emu/` with it, dist
  check green.

### Emulator: the built `/emu/` (`day4_emu_output.txt`)

Served from `dist/` locally, headless Chromium with software rendering (a
few frames per second; not a headset number):
- during the search the card stays hidden (`searching:none`), then the
  teaching card on the desk after 5.5 s;
- **H** → litFraction 0.826, the creature dashes into the lane and stops at
  s = 0.104 m of 0.380, the card says "Slide your hand along";
- **30 s with the hand still → no win** (s still 0.104);
- **→ held → a win** after 12.6 s, never spotted; trinket carried, 1 bead;
- a new round, **L** mid-path → spotted, keeper's eyes open (×4.5), the
  stare line shown;
- no console errors.

Screenshots (emulator, simulated room): `day4_01_emu_lane_slide_card.png`
(the lane after H and the slide card), `day4_02_emu_spotted_keeper_stares.png`
(spotted: the stare line from the lantern, the first win's bead by the nook).

## Still open

- **A Quest run** (P0-2): one private tester with the fixed kit.
- A hand cupped right at the lantern is still an easy crossing.
- Level 2 with a real object required (P1-6); the video (P1-7).
- The win and spotted feedback have no unit test; sound not heard on a
  headset.
- Real-room placement: a desk plane drawn more than 3 cm low still rejects
  taps silently; phantom mid-air registration.
