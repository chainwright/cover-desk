# Day 1 (built 10–11 Nov 2026, overnight): sight lines, hand cover, level 1

## Where this code comes from

Cover grows out of the desk prototype built earlier in the competition window
(10 Nov). This repository was made with `git clone` of that prototype's
repository, so its four commits from 10 Nov stay in the history, with their
original dates, as the record of when the reused modules were written:

```
7af31ef 2026-11-10 17:19 -0600  desk prototype day 1
ec235cc 2026-11-10 17:22 -0600  devlog
d20aeef 2026-11-10 18:04 -0600  desk prototype day 2: desk tap calibration, desk anchor, touch thresholds, tester mode
2610fd1 2026-11-10 18:29 -0600  devlog
```

The prototype's own notes and screenshots moved to `devlog/fade-origin/`.
Its soroban (abacus) is removed: bead physics, rest reader, soroban model and
system, their tests and the threshold sweep. Reused as they were or extended:

| Module | From the prototype | In Cover |
|---|---|---|
| `calibration.ts` | one-touch desk tap | same; the tap now needs a pointing hand |
| `desk-anchor.ts` | persistent desk anchor | same, for the board (later: the trinket shelf) |
| `contact.ts` | fingertip pad offset, hysteresis | plus one-touch object registration |
| `touch-log.ts`, `?test=1` | touch log, tester panel, guided steps | new columns and events (below) |
| `flags.ts`, `click-sound.ts`, `text-card.ts` | URL options, synth click, text cards | plus `?proxy=1`; hum, footsteps, lock |
| hand mask (was inside `soroban-system.ts`) | depth-only hand mesh | extracted to `hand-mask.ts` |
| placement, plane search, move knob (in `soroban-system.ts`) | desk placement | carried into `cover-system.ts` |

## Built

- **Sight-line engine** (`src/sightline.ts`, pure). Segment-to-segment
  distance for capsules, an exact segment-against-upright-cylinder test for
  real objects, the lantern's cone (half-angle and range on the desk), and
  `look()`: seen, in shadow (and by what), or outside the light.
- **The hand as cover** (`src/hand-proxy.ts`, `src/hand-joints.ts`). All 25
  WebXR joints of each hand are read every frame (`fillPoses`, with a
  per-joint fallback). Each bone becomes a capsule, plus six palm webs across
  the knuckles and the metacarpal bases: 30 capsules per hand. The radius is
  the runtime's joint radius (at least 7 mm) plus 4 mm, because tracking is
  only good to about 1.7 cm at best and WebXR gives no per-joint confidence.
  Cover does not depend on the pose: flat, edge-on, "stop", fist and an open
  high-five all block what their capsules cover. Spread fingers let light
  through the gaps. A pose class (flat / edge / stop / other) is computed only
  for the log and the tutorial.
- **Light map** (`src/light-map.ts`). A 64 × 32 polar grid from the lantern
  (angle × distance), each cell tested with the same `look()` as the game, so
  the drawn shadow is exactly where the creature is safe. Half the columns are
  refreshed per frame; each column tests only occluders whose angle range
  covers it and that are near enough. It is uploaded as a tiny texture and
  drawn by a light-pool shader: warm light on the desk, a dark wedge where your
  hand's shadow falls.
- **One-touch object registration** (`src/contact.ts`, in `cover-system.ts`).
  Point down onto the top of a real object and hold still: the same
  tap-and-hold detector as the desk tap, held 0.8 s. The hold height above the
  calibrated desk becomes an upright cylinder with the default 8 cm footprint.
  Accepted only from a pointing hand (index tip clearly the lowest fingertip
  and below the wrist), for tops 3–30 cm above the desk, on or near the board,
  not on the path and not on the keeper. Touching an object again replaces it;
  up to four. A paper ring marks the footprint and a felt ring the top.
- **Level 1, "Hand wall"** (`src/level.ts`, `src/creature.ts`,
  `src/cover-model.ts`). A board 42 × 29 cm on the desk. A turned-wood keeper
  with a felt nightcap and a paper lantern sits at the back; its light (76°
  wide, 28 cm long) falls across the creature's path. The felt creature starts
  in a felt nook just outside the light, and its brass trinket waits just
  outside on the other side, so about 26 cm of path is lit. The creature only
  moves forward through shadow (it checks 1.5 and 3 cm ahead), waits in any
  shadow, is spotted after 0.15 s in the light (so a one-frame flicker doesn't
  count), freezes 0.7 s, then runs back. A full crossing in shadow takes about
  3 s, well inside the 8 s hold limit. Path dots show the state of the path:
  warm = the keeper sees it, blue = your shadow, paper = outside the light. A
  pale ghost hand shows the "stop" palm until the creature first stands in a
  hand's shadow. After a win the next round starts 3.5 s later.
- **When the headset loses the hands, the creature waits.** No movement, no
  verdict, a card says "It waits for your hand", and there is a 0.5 s grace
  when a hand comes back.
- **The desk tap now needs one pointing finger**, so a hand resting flat on
  the desk as cover never moves the board. Re-placing the board forgets the
  registered objects (they belonged to the old spot).
- **Sound**, synthesized: the keeper's hum (muffled while a hand or object
  shades the creature), soft footsteps while it runs, a low double click (the
  lock) when it gets its trinket back, a sharp click when it is spotted.
- **Tester log** `cover-tester-log` v1 (`src/touch-log.ts`):
  - samples at 30 Hz per hand, lost frames included: wrist in the board frame,
    fingertip height, pose class and palm normal;
  - events: `line` (the sight line to the creature became blocked or clear,
    and by which hand or object), `dash`, `spotted`, `home`, `pause`/`resume`,
    `hand-lost`/`hand-found`, `register`/`register-rejected` with the reason,
    `fps` once a second (with the worst frame), placement and calibration;
  - guided steps in tester mode: flat hand 20 s, edge-on 20 s, "stop" palm
    20 s, register an object 15 s;
  - `npm run analyze -- <log>` scores each step per hand: tracked share, pose
    match, pose flips per minute, wrist frame-to-frame motion and spread.

## Tested

### Unit tests: 29/29 (`npm test`)

Geometry: segment distance (crossing, parallel, skew, endpoints, degenerate),
the cylinder test (through, over the top, beside, stopping short, descending
lines), the cone, capsule radius as the exact boundary, the vertical quick
reject never changing an answer. Hand: 30 capsules; an edge-on wall and a
"stop" palm both shade the middle of the path; a flat hand shades the creature
right behind it but not from near the lantern; spread fingers leave gaps,
closed fingers do not; the palm stays solid with fingers spread; pose classes;
pointing detection. Light map: fully lit without cover; **equal to the sight
test at all 2,048 cell centres** with two hands and an object; two half
refreshes equal one full refresh; cost. Creature: waits out of the light, a
fully shaded path brings it home in under 8 s, it never steps into light,
spotted and back, a one-frame flicker is ignored, pause on hand loss with
grace. Registration verdicts, path distance, hysteresis, the reused desk tap
and placement, flags, the log summary.

Mutations (each one breaks the tests listed, so those tests guard real logic):

| Mutation | Tests that fail |
|---|---|
| quick reject inverted | 6 (capsule boundary, quick reject, flat-hand shadow, light map, …) |
| capsule radius halved | 3 (boundary, spread vs closed, light map) |
| no "seen for 0.15 s" debounce | single-frame flicker |
| no palm webs | 30 capsules; the palm stays solid with fingers spread |
| light-map distance cull too aggressive | light map equals the sight test |
| no pause on hand loss | hand-loss pause and grace |

Light-map half refresh with two hands and four objects: **0.11 ms** in Node on
the Mac. This is not a headset number.

### Emulator walkthrough: 36/36 (`devlog/day1_walkthrough_output.txt`)

Headless Chromium through the IWSDK CLI, emulated Quest 3 with hand tracking,
the emulator's furnished home office, hands driven by joint-anchored
transforms and named poses. One page, all phases in a row:

| Check | Result |
|---|---|
| First run: board placed on the detected desk, still listening for a tap | pass |
| A flat hand coming down and resting on the desk does not move the board | pass |
| One-finger tap + hold → placed by touch; desk height vs plane | −0.1 mm |
| No hand in the light: light map 100% lit, creature waits out of the light | pass |
| Middle of the path: "stop" palm, edge-on wall, flat hand by the path, fist held up, open high-five → shadow | 5/5 |
| Flat hand near the lantern → still seen (light passes over it) | pass |
| Pose classes in the emulator: stop, edge, flat | 3/3 |
| "Stop" palm near the lantern → the creature dashes into the shadow | pass |
| Sweeping the palm 8.5 cm sideways near the lantern guides it home, never spotted | pass |
| Lifting the hand while it stands in the light → spotted → back out of the light | pass |
| Hands lost (input switched to controllers) → paused; nothing moves or is judged; resumes | pass |
| Registration: on the path → rejected; at desk height → nothing; 9 cm up beside the path → registered with top 90 mm | pass |
| The object shades the path behind it (`shadow:object-0`) | pass |
| Touching near it again replaces it; a second object elsewhere is added | pass |
| Exit and re-enter from elsewhere in the room → board back at the same spot | 0.00 mm |
| Log export → `cover-tester-log` v1 with line, dash, fps and register events | pass |

A guided tester run (`?test=1`, the four steps with the emulated right hand in
each pose) was scored by the analyser: right hand tracked 100%, pose match
flat 100%, edge 96%, stop 91%. The misses are the script changing pose at step
edges. The emulator has no tracking noise (wrist step 0 mm), so this proves
the pipeline, not stability. Logs: `day1_emulator_log.json`,
`day1_emulator_guided_log.json`.

Found and fixed during testing:
- The light reached 40 cm and hung past the desk's front edge (into the air
  over the drawer). It now reaches 28 cm, which still covers the path with
  about 10 cm to spare.
- The analyser pooled both hands, so a hand resting elsewhere diluted pose
  match and inflated wrist spread. It now scores each hand separately.
- A system method named `play` shadowed the ECS system's own `play()`
  (caught by the typecheck), renamed.

Screenshots (emulator, leaning over the board):
- `day1_01_board_idle.png`: the board, the keeper's light, the creature waiting
  at the edge of the light, the ghost hand and the prompt
- `day1_02_stop_palm_shadow_lane.png`: a "stop" palm near the lantern; its
  shadow on the desk, the creature running through it, panel `shadow:hand-right`
- `day1_04_hand_lost_waits.png`: hands lost mid-crossing; the creature waits
  ("It waits for your hand")
- `day1_05_registered_object.png`: two registered objects (paper and felt
  rings) and the shadow wedge the first one casts
- `day1_06_tester_panel_proxy.png`: tester mode with the cover proxy dots and
  the first guided step
- `day1_07_public_url.png`: the deployed build in headless Chromium

## Not tested on hardware (no Quest 3 yet)

- **Frame rate.** The headless emulator runs at about 12 fps on software
  rendering, so its fps events mean nothing. The scene is small (no shadow
  maps, procedural meshes, one transparent light pool; draw calls not counted
  yet), and the light-map work is about 0.1 ms per frame in Node. All of that needs measuring on the
  device.
- **Real hand tracking.** How stable an edge-on hand and a "stop" palm are
  over 60 s, how often a hand resting on the desk drops out, and whether a
  hand close to the desk confuses tracking. The guided steps and the log exist
  for exactly this.
- **Registration on a real mug.** The height comes from where the fingertip
  stops; nothing confirms there is a surface. A pause in mid-air at mug height
  would also register (guarded only by: pointing pose, a tap, a 0.8 s hold
  within 6 mm). The real false-registration rate needs logs.
- **Hand mask alignment** over passthrough. The proxy and the mask follow the
  same joints, but the real hand can sit about 1–2 cm off them.
- **Audio** in the Quest browser (the hum starts after the Enter tap).
- **Plane detection and anchors** on Quest (carried over, also unproven on a
  device).

## Risks

1. **The fun is unproven.** "Hold your hand in the light" has to feel good. The
   leverage is strong: near the lantern, 8.5 cm of sideways hand travel covers
   the whole lit path. That may be too easy, or exactly right for level 1.
   Level 2+ needs real objects and moving light to stay interesting.
2. **A flat hand lying on the desk shades very little** (correct for a low
   light). Players told "rest your hand" may lay it flat near the lantern and
   see nothing happen. The ghost hand shows an upright palm. The first real
   players will show whether that is enough.
3. **The arm is not cover.** Only the hand is modelled. A forearm reaching
   across the light casts no shadow, which looks wrong if someone notices.
4. **Real objects on the path.** Registration refuses objects on the path, but
   a real mug standing there still shows the creature walking through it.
   Level 2 has to place the path around the player's objects.
5. **Emulator-only evidence.** Every number above is from the emulator or
   Node.
6. **Bundle.** The production build carries the emulator (about 1.5 MB) so
   judges without a headset can try it on a desktop. The Quest browser skips
   it, but it still downloads it.

## Public URL

https://chainwright.github.io/cover-desk/ (repository
https://github.com/chainwright/cover-desk).

Checked in headless Chromium with `?test=1&reset=1`: HTTP 200, no console
errors, title and intro card "Cover", tester block shown; Enter starts the
session through the bundled emulator, the intro hides, placement resolves to
`fallback` at the emulator's default standing pose and listens for a desk tap.
The creature is `paused` because the emulator starts with controllers and no
tracked hands, which is the intended "it waits for your hand". The log's build
stamp matches the deployed commit (`d5dd39c32d95`).

## Deploy

Public repository `chainwright/cover-desk`, GitHub Pages from the `gh-pages`
branch. Typecheck, the unit tests and the production build all run locally
first; only on green is `dist/` pushed to `gh-pages`. There is no CI workflow
yet; the build that is served is the one checked locally.

## Day 2 (Thu 12 Nov)

1. **Quest 3 session 1 (decisive):** `?test=1` on a real desk, the four guided
   steps, then 5 crossings, then a mug registration. From the log: pose
   stability flat/edge/stop over 20 s each, how often a hand drops out, fps
   with the light pool over passthrough, and the registered height against a
   ruler. Gate: edge/stop stable and ≥ 60 fps; otherwise flat-palm only,
   bigger capsules.
2. **Level 2 (hand + mug):** a path that only a real object can shade from a
   second angle, so the level needs the object.
3. Make the path avoid registered objects, and give the creature a peek
   animation at the edge of the light.
4. A failure replay (1 s, shows the line that caught it) and the
   hand-shadow-on-desk signature for the title card.
