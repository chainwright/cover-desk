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
(9 cover cases, 9 negative controls; not yet on real tracked hands) · 64/64
unit tests · 30 of 31 deliberate bugs caught (the 31st is equivalent), among
them the three an outside run left uncaught on day 3 (the log's 5 s and
page-hide flushes, the `/emu/` slide speed) · emulator walkthrough 24/24
(author's scripted run on the dev server, day 2) · frame rate on a Quest:
**not measured yet**.

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
  A pale ghost hand shows the pose and the place on your first run, halfway
  between the lantern and the path. The light reaches past the path toward
  you, but a hand there shades nothing on the path, and near the lantern the
  wrist must stay below about 7 cm (in the model; a test checks that 6.5 cm
  covers and 9 cm does not), or the light passes under the hand. Cover
  doesn't depend on recognising a pose: whatever part of your hand stands
  between the lantern and the path casts shadow — an upright palm, a hand on
  its edge, a fist. A flat hand lying low only shades what is right behind
  it, as real light would.
- **The lane.** Where the ghost stands, a standing hand shades a lane about
  10 cm wide on the path. The creature dashes into it and stops at its far
  edge; a still hand never gets it home. Slide the hand slowly toward the
  trinket and the creature follows your shadow across (a card says so after
  the first dash). Right at the lantern one standing hand still shades
  nearly the whole light and the creature runs straight home; that easy way
  is known and not prevented yet.
- **Spotted.** Lift your hand while the creature is out in the light and the
  keeper wakes: its eyes open, a thin line of light stares at the creature,
  and a low "hm?" sounds; the creature freezes, then scurries back to its
  nook. Moving the covering hand away while the headset still sees it counts
  as lifting it.
- **A win.** At the trinket a three-note chime plays, the creature carries
  the trinket on its back until the next round, and a brass bead joins the
  row along the near edge, one per win (up to ten).
- **Real objects are cover too.** Point down with one finger onto the top of
  a mug or a stack of books (3–30 cm tall, beside the path) and hold still: it
  becomes an 8 cm-wide column of cover at the height you touched.
- **If the headset loses the hand that was shading the creature in the last
  0.3 s, it waits** (also when it loses both hands). Nothing moves and nothing
  is judged until that hand is back, or another hand or object shades it.
  Moving that hand away while the headset still tracks it counts as lifting
  it: the creature is spotted.

## URL options

| Option | What it does |
|---|---|
| `?test=1` | Tester mode: a live panel (fps, hand pose, what blocks the keeper's line of sight, emulator or native), and a log kept on the headset until you start a new log, to download right after exiting. Guided hand-pose steps (three poses and one object registration) run only when started with **Enter: guided poses** |
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
frame (a Node test checks it stays under 2 ms; the author's desktop runs
print about 0.11 ms, `devlog/day4_test_output.txt`; not yet measured on a
headset).

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

`?test=1` records, at 30 Hz per hand during a session (positions while the board is placed; lost-hand rows always), the wrist and index-fingertip positions,
fingertip height and pose class, plus events: sight-line blocked/cleared (and
by what), dashes, spotted, home, pauses and their reason, object
registrations, the joint-reading path, the chosen plane label, the anchor's
time to localise, and once a second the frame rate, the worst frame, dropped
frames against the display rate and the 95th percentile of the app's own
update time. The log says whether the emulator was running (`emulator`). Format
`cover-tester-log` v2 is described in `src/touch-log.ts`. The log is kept on
the headset (IndexedDB, written in small chunks about every 5 s, when a
session ends and when the page is hidden, `src/log-store.ts`; a chunk counts
as written only after the write succeeds) until the tester presses **Start a
new log**. In the emulator it survived a new URL; reloads are covered by a
unit test; a reload and a power cycle on a Quest are not yet checked.
Testers email the downloaded file (TESTER_10MIN.md says where); the
[tester report form](https://github.com/chainwright/cover-desk/issues/new?template=tester-report.yml)
is an optional, public alternative.
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
Then **H** stands the right hand like "stop" where the ghost hand stands,
holding **→** slides it along to lead the creature home, **L** lifts it
(spotted), and **M** gives the emulator its own controls back. **H** alone,
without sliding, gets the creature only to the far edge of the lane. If the
board ever floats in the air instead, it is playable there too. The seat and
keys only run in the `/emu/` build: their code ships in both bundles but does
nothing without the emulator (`src/emu-seat.ts`). The room is the emulator's
simulated home office, not a real desk.

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
src/log-store.ts      keeps the tester log on the headset; chunking, flush timer and retry pure, tested
src/emu-seat.ts       runs only in /emu/: seated start with hands, keys to move the hand
src/click-sound.ts    synthesized sounds (no audio files)
tests/                unit tests and the line-of-sight case set
.github/ISSUE_TEMPLATE/tester-report.yml   the form testers send their log with
tools/                log analyser, emulator build, dist check, mutation check, emulator walkthrough
devlog/               daily notes, emulator screenshots and logs
```

## License

MIT, see [LICENSE](LICENSE).
