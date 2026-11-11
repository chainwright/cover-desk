# Cover

A tiny felt creature has to cross your real desk to reach its trinket, past a
sleepy lantern-keeper. You never move it. You protect it: hold your hand up in
the keeper's light, and the creature dashes through your hand's shadow.

Mixed reality, hands only, seated. Built for Quest 3/3S; so far tested only in
the Immersive Web Emulator (no headset run yet, see [CLAIMS.md](CLAIMS.md)).
Built with the Immersive Web SDK (WebXR on Three.js).

**Live build (Quest browser):** https://chainwright.github.io/cover-desk/
**Desktop emulator build (no headset):** https://chainwright.github.io/cover-desk/emu/

Judges: the five-minute path is in [JUDGES.md](JUDGES.md); what is proven and
how is in [CLAIMS.md](CLAIMS.md).

Checked so far: line-of-sight case set **18/18** (9 cover cases, 9 negative
controls) · 43/43 unit tests · emulator walkthrough 24/24 (day 2) · frame rate
on a Quest: **not measured yet**.

## How it plays (level 1)

- **Your desk is the board.** The board appears on a detected desk by itself.
  To put it somewhere else, point at the desk with one finger, tap and hold
  still: the board goes on the desk near that spot, pulled within comfortable
  reach. On the same headset it comes back to the same spot next time (not in
  private browsing). Or hold a fingertip on the small knob at its near-left
  corner, then tap the new spot.
- **The light.** The keeper's lantern lights a fan of your desk, warm on the
  wood. The creature creeps out of its felt nook to the edge of the light and
  waits.
- **Your hand is cover.** Put a hand in the light and its shadow appears on
  the desk. A pale ghost hand shows the pose on your first run: hand up, like
  "stop". Cover doesn't depend on recognising a pose: whatever part of your
  hand stands between the lantern and the path casts shadow — an upright palm,
  a hand on its edge, a fist. Near the lantern a small hand shades a wide lane;
  a flat hand lying low only shades what is right behind it, as real light
  would.
- **The dash.** When the path ahead is in shadow, the creature runs. Lift your
  hand while it is out in the light and it is spotted: it freezes, then
  scurries back to its nook. Guide your shadow across and it reaches its
  trinket.
- **Real objects are cover too.** Tap down onto the top of a mug or a stack of
  books (3–30 cm tall, beside the path) and hold still: it becomes an 8
  cm-wide column of cover at the height you touched.
- **If the headset loses the hand that is shading the creature, it waits**
  (also when it loses both hands). Nothing moves and nothing is judged until
  that hand is back, or another hand or object shades it.

## URL options

| Option | What it does |
|---|---|
| `?test=1` | Tester mode: a live panel (fps, hand pose, what blocks the keeper's line of sight, emulator or native), three guided hand-pose steps and one object registration, and a log to download after exiting |
| `?guide=0` | With `?test=1`: no guided steps (free play, for scripted runs) |
| `?proxy=1` | Shows the hand's cover proxy, one dot per joint |
| `?hands=outline` / `?hands=off` | The SDK's hand outline, or no hand at all (default: an invisible mask, meant to let your real hand show over the board; not yet checked on a headset) |
| `?occlude=depth` | Also asks for depth sensing to soften virtual things behind real objects (more GPU work) |
| `?reset=1` | Forgets the saved desk spot |

## How the shadow works

Each tracked hand gives 25 joints. Every bone becomes a capsule, plus six
across the palm so a flat hand has no holes (30 capsules per hand). Registered
objects are upright cylinders. A point is safe for the creature when the
straight line from the lantern to it crosses a capsule or a cylinder.

The light on the desk is a 64 × 32 polar grid computed with the same
sight-line geometry and checked equal to it at every grid cell, so the shadow
you see matches where the creature is safe. Half the grid is refreshed each
frame (about 0.1 ms on a desktop; not yet measured on a headset).

The hand proxy is deliberately coarse: hand tracking is accurate to roughly
2 cm at best and WebXR reports no per-joint confidence. So the drawn shadow
comes from the same coarse proxy that judges the creature: what you see is
what counts. When the headset loses the hand that was shading the creature
(or both hands), the game pauses.

The labelled case set in `tests/los-cases.test.ts` states the main claim as
18 cases written from the geometry: 9 where a hand pose or an object stands in
the sight line (upright palm, edge-on hand, flat hand beside the path, fist,
two hands, a mug) and 9 negative controls (no hand, a hand beside, behind,
above or under the line, a flat hand near the lantern, an object too low, a
creature outside the light).

## Tester log

`?test=1` records, at 30 Hz per hand, the wrist and index-fingertip positions,
fingertip height and pose class, plus events: sight-line blocked/cleared (and
by what), dashes, spotted, home, pauses and their reason, object
registrations, the joint-reading path, the chosen plane label, the anchor's
time to localise, and once a second the frame rate, the worst frame, dropped
frames against the display rate and the 95th percentile of the app's own
update time. The log says whether the emulator was running (`emulator`). Format
`cover-tester-log` v2 is described in `src/touch-log.ts`; the protocol for a
first headset session is in [TESTER_PROTOCOL.md](TESTER_PROTOCOL.md).

```sh
npm run analyze -- cover-tester-log-XXXX.json
```

## Run locally

Requires Node.js 20.19+ to build, or 22.12+ / 24 (not 21 or 23); `npm test`
and `npm run analyze` need 22.18+ or 24.

```sh
npm ci
npm run dev        # dev server plus a browser with the XR emulator
npm test           # unit tests
npm run typecheck
npm run build      # dist/ (no emulator) and dist/emu/ (emulator), then checks both
npm run check      # all three
```

## Try it without a headset (emulator)

The main build has no emulator in it, so a Quest browser always gets its own
WebXR. A separate build at `/emu/` carries IWER, the Immersive Web Emulator,
for desktop browsers; it also skips itself when the user agent says
OculusBrowser or Quest. `npm run build` fails if the emulator ever turns up in
the main build. Open the `/emu/` link in desktop Chrome, press **Enter**,
switch the emulator input to **hands**, sit at the emulated desk and move a
hand into the lantern's light. The room you see there is the emulator's
simulated home office, not a real desk.

## Where the code comes from

Cover grew out of a desk prototype written inside the competition window on
10 Nov 2026; this repository was cloned from it, so the prototype's commits
keep their original dates in `git log`. See `devlog/DAY1.md`.

## Project layout

```
src/index.ts          creates the world, wires Enter and the tester buttons
src/cover-system.ts   placement, hands, registration, the game loop, tester panel
src/onboarding.ts     what the first run shows: ghost hand, prompt, knob label (pure, tested)
src/sightline.ts      capsule / cylinder occlusion and the light cone (pure, tested)
src/hand-proxy.ts     25 joints → capsules, pose classes (pure, tested)
src/light-map.ts      the shadow grid drawn on the desk (pure, tested)
src/creature.ts       the creature's behaviour and the cover-hand watch (pure, tested)
src/level.ts          board and level 1 layout, route
src/contact.ts        fingertip rules and object registration (pure, tested)
src/calibration.ts    one-touch desk tap (pure, tested)
src/desk-anchor.ts    persistent anchor for the desk spot
src/hand-joints.ts    reads the 25 joints from the WebXR frame
src/hand-mask.ts      the real hand shows over virtual things
src/cover-model.ts    keeper, lantern, light pool, creature, nook, trinket
src/touch-log.ts      tester log format, recorder and analyser
src/click-sound.ts    synthesized sounds (no audio files)
tests/                unit tests and the line-of-sight case set
tools/                log analyser, emulator build, dist check, mutation check, emulator walkthrough
devlog/               daily notes, emulator screenshots and logs
```

## License

MIT, see [LICENSE](LICENSE).
