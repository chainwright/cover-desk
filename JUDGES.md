# Cover in five minutes

## With a Quest 3 or 3S (the real thing)

1. Sit at a desk. Open **https://chainwright.github.io/cover-desk/** in Quest
   Browser and press **Enter**. Hands only; put the controllers down.
2. If your Space Setup includes the desk and you face it, the board appears
   on it by itself: a keeper with a paper lantern at the back, a felt creature
   in its nook on the left, its trinket on the right. Otherwise it floats in
   front of you until you point at the desk with one finger, tap and hold
   still. (Not yet run on a Quest; see [CLAIMS.md](CLAIMS.md).)
3. Do what the card and the pale ghost hand show: **stand your hand on the
   desk like "stop", between the lantern and the path, where the ghost
   stands.** Your hand's shadow opens a lane a few centimetres wide on the
   path and the creature dashes into it, then stops at its far edge. (Held
   high, or in the light in front of the path, the hand casts no shadow on
   the path.)
4. Slide your hand toward the trinket, about a hand's width every 2 seconds.
   The creature follows your shadow home: it hops with the trinket, the
   light flares, a chime, a bead pops in; then the ghost shows where to put
   your hand for the next round. Lift your hand while it is in the light and
   the keeper wakes and spots it (a card says why). Cup the lantern and the
   keeper wakes too: that shortcut is closed.
5. Point down onto the top of a mug standing between the lantern and the
   path and hold still for a second: the mug becomes cover too and throws
   its own shadow.

To leave the immersive view: look at your **left** palm at eye level and
pinch thumb and index until the menu icon fills.

This build has no emulator in it. Nothing in it has run on a Quest yet; see
[CLAIMS.md](CLAIMS.md) for what is proven and how, and
[EVIDENCE.md](EVIDENCE.md) for the evidence per criterion.

## Without a headset (desktop emulator)

Open **https://chainwright.github.io/cover-desk/emu/** in desktop Chrome.

1. Press **Enter**. The emulator seats you at its desk, looking down at it,
   with hands instead of controllers, and the board lands on the emulated
   desk by itself (a few seconds; longer if the machine renders slowly). A
   key list appears at the top.
2. Press **H**: the right hand stands like "stop" where the ghost hand
   stands. Its shadow opens a lane, the creature dashes into it and stops at
   its far edge; with the hand still it goes no further (a card says "Slide
   your hand along").
3. Hold **→** to slide the hand along: the creature follows the shadow to its
   trinket (it hops with it, the light flares, a chime, a brass bead pops in
   by the nook; a new round starts 3.5 s later, and the ghost and a card ask
   for the hand back at the start: press **H** twice).
4. Press **L** to lift the hand while the creature is in the light: the
   keeper's eyes open and a thin line of light stares at the creature; it
   flashes and runs back, and a card says "It saw it!". **H** again takes the
   hand away; **H** once more stands it back at the ghost's spot.
5. Press **C** to cup the lantern: the keeper wakes, a card says "Too close",
   and the creature stays in its nook. **C** again takes the hand away.
6. **M** hands the emulator back to its own menus and gizmos, if you want to
   pose the hands yourself.

Even if the board floats in the air instead (no desk found), it is playable
where it floats; the game is the same. The room is the emulator's simulated
home office, not a real desk, and its frame rate says nothing about a
headset. The seat and the keys only run in the `/emu/` build (their code
ships in both bundles and does nothing without the emulator). This recipe
is what `tools/emu/wiring_check.mjs` runs on the `/emu/` build in headless
Chromium; on day 5, on the live URL: board on the desk, H → dash into the
lane and stop, → held → a win, H H → the ghost's spot, L → spotted, C → the
keeper wakes, no console errors (`devlog/DAY5.md`).

## Checking the code (about 2 minutes)

```sh
git clone https://github.com/chainwright/cover-desk && cd cover-desk
npm ci
npm test           # 79 tests, including the 18-case line-of-sight set
npm run build      # main build without the emulator, /emu/ with it, then a check of both
python3 tools/mutations.py unit   # deliberate bugs in the tested code (see devlog/DAY5.md)
# the glue: serve dist/ (python3 -m http.server 8799 --directory dist), then
COVER_EMU_BASE=http://127.0.0.1:8799/ python3 tools/mutations.py outside
```

Node 22.18+ or 24 for `npm test`.

## Where each judging criterion is answered

| Criterion | Where to look |
|---|---|
| Innovation | Your tracked hand is a line-of-sight occluder against a watcher, not a gesture trigger: `src/hand-proxy.ts`, `src/sightline.ts`, the case set in `tests/los-cases.test.ts` |
| Experience | First-run teaching and the cards after a spot, a win and a hand at the lantern (`src/onboarding.ts`, `src/feedback.ts`), pause when the covering hand is lost (`CoverWatch` in `src/creature.ts`), `devlog/day5_*.png` (emulator) |
| Technical | Tests, mutation check, the emulator wiring check (`tools/emu/wiring_check.mjs`), the tester log and its analyser; Quest frame rate is still open ([EVIDENCE.md](EVIDENCE.md)) |
| Polish | Synthesised sound; untextured models in felt, wood and paper tints; video still to come |

How the repository's history and dates can be checked: [PROVENANCE.md](PROVENANCE.md).
