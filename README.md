# Cover

A tiny felt creature has to cross your real desk to reach its trinket, past a
sleepy lantern-keeper. You never move it. You protect it: stand your hand on
the desk like "stop", between the keeper's lantern and the path, and the
creature dashes through your hand's shadow.

Mixed reality, hands only, seated. Built for Quest 3/3S; so far tested only in
the Immersive Web Emulator (no headset run yet, see [CLAIMS.md](CLAIMS.md)).
Built with the Immersive Web SDK (WebXR on Three.js).

**Live build (Quest browser):** https://chainwright.github.io/cover-desk/
**Desktop emulator build (no headset):** https://chainwright.github.io/cover-desk/emu/

Judges: the five-minute path is in [JUDGES.md](JUDGES.md); what is proven and
how is in [CLAIMS.md](CLAIMS.md); the evidence per criterion, with what is
still unproven, is in [EVIDENCE.md](EVIDENCE.md).

Checked so far: line-of-sight case set **18/18** on synthetic 25-joint hands
(9 cover cases, 9 negative controls; not yet on real tracked hands) · 51/51
unit tests · 21 of 22 deliberate bugs caught (the 22nd is equivalent) ·
emulator walkthrough 24/24 (author's scripted run on the dev server, day 2) ·
frame rate on a Quest: **not measured yet**.

## How it plays (level 1)

- **Your desk is the board.** If your Space Setup includes the desk and you
  face it, the board appears on it by itself; otherwise it floats in front of
  you until you tap the desk. Until you have placed it yourself, point at the
  desk with one finger (beside the board), tap and hold still: the board goes
  on the desk near that spot, pulled within comfortable reach. After that,
  hold a fingertip on the small knob at its near-left corner, then tap the
  new spot. It is designed to come back to the same spot next time on the
  same headset (not in private browsing); so far this is checked only in the
  emulator, from the same viewpoint.
- **The light.** The keeper's lantern lights a fan of your desk, warm on the
  wood. The creature creeps out of its felt nook to the edge of the light and
  waits.
- **Your hand is cover.** Put a hand in the light between the lantern and the
  path, standing on the desk like "stop", and its shadow appears on the desk.
  A pale ghost hand shows the pose and the place on your first run. The light
  reaches past the path toward you, but a hand there shades nothing on the
  path, and near the lantern the wrist must stay below about 7 cm, or the
  light passes under the hand. Cover doesn't depend on recognising a pose: whatever part of your
  hand stands between the lantern and the path casts shadow — an upright palm,
  a hand on its edge, a fist. Near the lantern a small hand shades a wide lane;
  a flat hand lying low only shades what is right behind it, as real light
  would.
- **The dash.** When the path ahead is in shadow, the creature runs. Lift your
  hand while it is out in the light and it is spotted: it freezes, then
  scurries back to its nook. Guide your shadow across and it reaches its
  trinket.
- **Real objects are cover too.** Point down with one finger onto the top of
  a mug or a stack of books (3–30 cm tall, beside the path) and hold still: it
  becomes an 8 cm-wide column of cover at the height you touched.
- **If the headset loses the hand that was shading the creature in the last
  0.3 s, it waits** (also when it loses both hands). Nothing moves and nothing
  is judged until that hand is back, or another hand or object shades it.

## URL options

| Option | What it does |
|---|---|
| `?test=1` | Tester mode: a live panel (fps, hand pose, what blocks the keeper's line of sight, emulator or native), and a log kept on the headset across reloads, to download after exiting. Guided hand-pose steps (three poses and one object registration) run only when started with **Enter: guided poses** |
| `?guide=0` | With `?test=1`: the guided steps never run, even from that button (for scripted runs) |
| `?proxy=1` | Shows the hand's cover proxy, one dot per joint |
| `?hands=outline` / `?hands=off` | The SDK's hand outline, or no hand at all (default: an invisible mask, meant to let your real hand show over the board; not yet checked on a headset) |
| `?occlude=depth` | Also asks for depth sensing to soften virtual things behind real objects (more GPU work) |
| `?reset=1` | Forgets the saved desk spot |

## How the shadow works

Each tracked hand gives 25 joints. Every bone becomes a capsule, plus six
across the palm so a flat hand has no holes (30 capsules per hand). Registered
objects are upright cylinders. A point is safe for the creature when the
straight line from the lantern to it crosses a capsule or a cylinder.

The light on the desk is a 64 × 32 polar grid computed with the same segment
and cylinder tests and checked equal to the creature's sight test at all
2,048 cell centres in a test scene with two hands and an object; between
centres the drawn shadow is interpolated. Half the grid is refreshed each
frame (about 0.1 ms on a desktop; not yet measured on a headset).

The hand proxy is deliberately coarse: hand tracking is accurate to roughly
2 cm at best and WebXR reports no per-joint confidence. So the drawn shadow
comes from the same coarse proxy that judges the creature: what you see is
what counts. When the headset loses the hand that was shading the creature
(or both hands), the game pauses.

The labelled case set in `tests/los-cases.test.ts` states the main claim for
the geometry model, with synthetic 25-joint hands, as 18 cases written from
the geometry (labels and test arrived in the same commit): 9 where a hand pose or an object stands in
the sight line (upright palm, edge-on hand, flat hand beside the path, fist,
two hands, a mug) and 9 negative controls (no hand, a hand beside, behind,
above or under the line, a flat hand near the lantern, an object too low, a
creature outside the light). No case set on real tracked hands exists yet.

## Tester log

`?test=1` records, at 30 Hz per hand while the board is placed, the wrist and index-fingertip positions,
fingertip height and pose class, plus events: sight-line blocked/cleared (and
by what), dashes, spotted, home, pauses and their reason, object
registrations, the joint-reading path, the chosen plane label, the anchor's
time to localise, and once a second the frame rate, the worst frame, dropped
frames against the display rate and the 95th percentile of the app's own
update time. The log says whether the emulator was running (`emulator`). Format
`cover-tester-log` v2 is described in `src/touch-log.ts`. The log is kept on
the headset (IndexedDB, written in small chunks every 5 s and when a session
ends, `src/log-store.ts`) through reloads, a new URL and a power cycle, until
the tester downloads it or presses **Start a new log**. Testers send it back
with the [tester report form](https://github.com/chainwright/cover-desk/issues/new?template=tester-report.yml).
The protocols for a headset session: [TESTER_10MIN.md](TESTER_10MIN.md) (10
minutes, for anyone with a Quest) and [TESTER_PROTOCOL.md](TESTER_PROTOCOL.md)
(the full first session).

```sh
npm run analyze -- cover-tester-log-XXXX.json
```

## Run locally

Tested on Node.js 24. The engines field allows 20.19+ or 22.12+ to build (not
21 or 23); `npm test` and `npm run analyze` need 22.18+ or 24.

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
OculusBrowser or Quest (not yet checked on a device). `npm run build` fails
if the emulator's runtime markers ever turn up in the main build.

Open `/emu/` in desktop Chrome and press **Enter**. The emulator seats you at
its desk with hands, and the board lands on the emulated desk by itself.
Then **H** stands the right hand like "stop" between the lantern and the
path, holding **→** slides it along to lead the creature home, **L** lifts it
(spotted), and **M** gives the emulator its own controls back. If the board
ever floats in the air instead, it is playable there too. The seat and keys
exist only in the `/emu/` build (`src/emu-seat.ts`). The room is the
emulator's simulated home office, not a real desk.

## Where the code comes from

Cover grew out of a desk prototype written inside the competition window on
10 Nov 2026; this repository was cloned from it, so the prototype's commits
keep their original dates in `git log`. See `devlog/DAY1.md`. Commit dates
are set by the author; GitHub's own repository and deploy timestamps are
listed in [PROVENANCE.md](PROVENANCE.md).

## Project layout

```
src/index.ts          creates the world, wires Enter and the tester buttons
src/cover-system.ts   placement, hands, registration, the game loop, tester panel
src/placement.ts      when the board goes where: desk wait, late desk, anchor wait (pure, tested)
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
src/hand-mask.ts      meant to let the real hand show over virtual things (not yet checked on a headset)
src/cover-model.ts    keeper, lantern, light pool, creature, nook, trinket
src/touch-log.ts      tester log format, recorder and analyser
src/log-store.ts      keeps the tester log on the headset across reloads (chunking pure, tested)
src/emu-seat.ts       /emu/ only: seated start with hands, keys to move the hand
src/click-sound.ts    synthesized sounds (no audio files)
tests/                unit tests and the line-of-sight case set
.github/ISSUE_TEMPLATE/tester-report.yml   the form testers send their log with
tools/                log analyser, emulator build, dist check, mutation check, emulator walkthrough
devlog/               daily notes, emulator screenshots and logs
```

## License

MIT, see [LICENSE](LICENSE).
