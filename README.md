# Cover

A tiny felt creature has to cross your real desk to take back its trinket
from a sleepy lantern-keeper. You never move it. You protect it: rest your
hand in the keeper's light, and the creature dashes through your hand's
shadow.

Mixed reality for Meta Quest 3 / 3S, hands only, seated. Built with the
Immersive Web SDK (WebXR on Three.js).

**Live build:** https://chainwright.github.io/cover-desk/

## How it plays (level 1)

- **Your desk is the board.** Point at the desk with one finger, tap and hold
  still: the board goes under your hand, and comes back to the same spot next
  time.
- **The light.** The keeper's lantern lights a fan of your desk, warm on the
  wood. The creature waits in its felt nook just outside the light.
- **Your hand is cover.** Put a hand in the light and its shadow appears on
  the desk. Any pose works: a flat hand, a hand on its edge like a wall, a
  "stop" palm, a fist. Near the lantern a small hand shades a wide lane; a flat
  hand lying low only shades what is right behind it, as real light would.
- **The dash.** When the path ahead is in shadow, the creature runs. Lift your
  hand while it is out in the light and it is spotted: it freezes, then
  scurries back to its nook. Guide your shadow across and it reaches its
  trinket.
- **Real objects are cover too.** Point down onto the top of a mug or a book
  and hold still. It becomes cover with an 8 cm footprint at the height you
  touched.
- **If the headset loses your hands, the creature waits.** Nothing moves and
  nothing is judged until a hand is back.

## URL options

| Option | What it does |
|---|---|
| `?test=1` | Tester mode: a live panel (fps, hand pose, what blocks the keeper's line of sight), four guided hand-pose steps, and a log to download after exiting |
| `?proxy=1` | Shows the hand's cover proxy, one dot per joint |
| `?hands=outline` / `?hands=off` | The SDK's hand outline, or no hand at all (default: an invisible mask, so your real hand shows over the board) |
| `?occlude=depth` | Also asks for depth sensing to soften virtual things behind real objects (more GPU work) |
| `?reset=1` | Forgets the saved desk spot |

## How the shadow works

Each tracked hand gives 25 joints. Every bone becomes a capsule, plus six
across the palm so a flat hand has no holes (30 capsules per hand). Registered
objects are upright cylinders. A point is safe for the creature when the
straight line from the lantern to it crosses a capsule or a cylinder.

The light on the desk is a 64 × 32 polar grid computed with that same test, so
the shadow you see is exactly where the creature is safe. Half the grid is
refreshed each frame (about 0.1 ms on a desktop; not yet measured on a
headset).

The hand proxy is deliberately coarse: hand tracking is accurate to roughly
2 cm at best and WebXR reports no per-joint confidence. So cover is generous,
and a hand the headset loses simply pauses the game.

## Tester log

`?test=1` records, at 30 Hz per hand, the wrist position, fingertip height and
pose class, plus events: sight-line blocked/cleared (and by what), dashes,
spotted, home, pauses, object registrations and the frame rate once a second.
Format `cover-tester-log` v1 is described in `src/touch-log.ts`.

```sh
npm run analyze -- cover-tester-log-XXXX.json
```

## Run locally

Requires Node.js 20.19+ (22.12+ or 24 recommended).

```sh
npm install
npm run dev        # dev server plus a browser with the XR emulator
npm test           # unit tests (Node 22.18+ or 24)
npm run typecheck
npm run build      # production build into dist/
npm run check      # all three
```

## Try it without a headset (emulator)

The build includes IWER, the Immersive Web Emulator, for desktop browsers
(the Quest browser keeps its real WebXR). Open the live build in desktop
Chrome, press **Enter**, switch the emulator input to **hands**, sit at the
emulated desk and move a hand into the lantern's light.

## Project layout

```
src/index.ts          creates the world, wires Enter and the tester buttons
src/cover-system.ts   placement, hands, registration, the game loop, tester panel
src/sightline.ts      capsule / cylinder occlusion and the light cone (pure, tested)
src/hand-proxy.ts     25 joints → capsules, pose classes (pure, tested)
src/light-map.ts      the shadow grid drawn on the desk (pure, tested)
src/creature.ts       the creature's behaviour (pure, tested)
src/level.ts          board and level 1 layout, route
src/contact.ts        fingertip rules and object registration (pure, tested)
src/calibration.ts    one-touch desk tap (pure, tested)
src/desk-anchor.ts    persistent anchor for the desk spot
src/hand-joints.ts    reads the 25 joints from the WebXR frame
src/hand-mask.ts      the real hand shows over virtual things
src/cover-model.ts    keeper, lantern, light pool, creature, nook, trinket
src/touch-log.ts      tester log format, recorder and analyser
src/click-sound.ts    synthesized sounds (no audio files)
tests/                unit tests
devlog/               daily notes, emulator screenshots and logs
```

## License

MIT, see [LICENSE](LICENSE).
