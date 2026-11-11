# Cover in five minutes

## With a Quest 3 or 3S (the real thing)

1. Sit at a desk. Open **https://chainwright.github.io/cover-desk/** in Quest
   Browser and press **Enter**. Hands only; put the controllers down.
2. The board appears on your desk by itself: a keeper with a paper lantern at
   the back, a felt creature in its nook on the left, its trinket on the right.
3. Do what the card and the pale ghost hand show: **hold your hand up in the
   light, like "stop"**, near the lantern. Your hand's shadow opens a lane on
   the desk and the creature dashes into it.
4. Slide your hand sideways. The creature follows your shadow; lift your hand
   while it is in the light and the keeper spots it.
5. Point down onto the top of a mug and hold still for a second: the mug
   becomes cover too and throws its own shadow.

This build has no emulator in it. Nothing in it has run on a Quest yet; see
[CLAIMS.md](CLAIMS.md) for what is proven and how.

## Without a headset (desktop emulator)

Open **https://chainwright.github.io/cover-desk/emu/** in desktop Chrome,
press **Enter**, switch the emulator's input to **hands** and move a hand into
the lantern's light. The room you see is the emulator's simulated home office,
not a real desk, and its frame rate says nothing about a headset.

## Checking the code (about 2 minutes)

```sh
git clone https://github.com/chainwright/cover-desk && cd cover-desk
npm ci
npm test           # 43 tests, including the 18-case line-of-sight set
npm run build      # main build without the emulator, /emu/ with it, then a check of both
python3 tools/mutations.py   # 15 deliberate bugs: 14 make a test fail, 1 changes nothing (see DAY2.md)
```

Node 22.18+ or 24 for `npm test`.

## Where each judging criterion is answered

| Criterion | Where to look |
|---|---|
| Innovation | Your tracked hand is a line-of-sight occluder against a watcher, not a gesture trigger: `src/hand-proxy.ts`, `src/sightline.ts`, the case set in `tests/los-cases.test.ts` |
| Experience | First-run teaching (`src/onboarding.ts`), pause when the covering hand is lost (`CoverWatch` in `src/creature.ts`), `devlog/day2_01_first_run_ghost_prompt.png` (emulator) |
| Technical | Tests, mutation check, emulator walkthrough (`devlog/day2_walkthrough_output.txt`), the tester log and its analyser; Quest frame rate is still open (CLAIMS.md) |
| Polish | Synthesised sound, felt/wood/paper models; video still to come |
