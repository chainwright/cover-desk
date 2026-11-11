# What Cover claims, and how far each claim is proven

Three levels:

- **Reproducible**: anyone can check it from this repository with the
  command shown.
- **Emulator**: we ran it in the Immersive Web Emulator (headless, simulated
  room and hands); the script and its output are in the repo, but it says
  nothing about real tracking or a headset's frame rate.
- **Not shown yet**: designed and coded, no evidence yet. These are the
  points the first Quest session ([TESTER_PROTOCOL.md](TESTER_PROTOCOL.md))
  has to settle.

Last updated: day 2, 11 Nov 2026.

| Claim | Level | Evidence |
|---|---|---|
| A hand pose or a registered object between the lantern and the creature hides it; a hand beside, behind, above or under the line does not | Reproducible | `npm test`: line-of-sight case set 18/18 (9 cover cases, 9 negative controls), labels written from the geometry in `tests/los-cases.test.ts` |
| Cover doesn't depend on recognising a pose (upright palm, edge-on, fist, flat beside the path) | Reproducible | same case set, cases P1–P6 |
| The shadow drawn on the desk matches the creature's sight test | Reproducible | test "light map … equals the sight test at every cell centre" (2,048 cells); between cell centres the texture is interpolated |
| Losing the hand that shades the creature pauses play instead of getting it spotted | Reproducible + Emulator | `tests/day2.test.ts` (4 cases); walkthrough phase `coverloss` (one hand disconnected, the other tracked) |
| Lifting a still-tracked hand still gets the creature spotted | Reproducible + Emulator | `tests/day2.test.ts`; walkthrough phase `lifted` |
| On the first run the ghost hand and "Hold your hand up in the light, like 'stop'" show, also after the automatic desk placement | Reproducible + Emulator | `tests/day2.test.ts` (first-run cues); walkthrough phase `firstrun`, screenshot `devlog/day2_01_first_run_ghost_prompt.png` |
| A mug can be registered without tapping the desk first | Reproducible + Emulator | `tests/day2.test.ts`; walkthrough phase `register` |
| The main build (`/`) contains no emulator, so a Quest browser can't be put into an emulated session | Reproducible | `npm run build` ends with `tools/check-dist.mjs`, which fails if emulator code is found in `dist/` outside `dist/emu/`; a deliberately leaky build made it fail (DAY2.md) |
| The tests guard real logic | Reproducible | `python3 tools/mutations.py`: 14 of 15 mutations fail a test; the 15th is equivalent (DAY2.md) |
| The light-map refresh costs about 0.1 ms per frame | Reproducible (desktop Node only) | test "light map cost" prints it |
| The tester log records frame rate, dropped frames, update cost, flicker per step, joint path, plane label, anchor time and the emulator flag | Reproducible + Emulator | `tests/day2.test.ts`; walkthrough phase `tester`, `devlog/day2_emulator_log.json` |
| Runs at 72 fps or better on Quest 3 | **Not shown yet** | needs TESTER_PROTOCOL step 3 |
| Hand tracking is stable enough that the shadow doesn't shimmer and the creature doesn't stutter | **Not shown yet** | steps 5 and 7 |
| The real hand shows over the board (default mask) | **Not shown yet** | step 13; every emulator screenshot so far uses the emulator's hands |
| The board comes back to the same desk spot next session | Emulator (same viewpoint only) | day-1 walkthrough; on a headset: steps 9 and 10 |
| A registered mug's height matches a ruler | **Not shown yet** | step 8 |
| A pause in mid-air never registers a phantom object | **Not claimed** | known weakness, measured in step 8 |
| The forearm casts a shadow | **Not claimed** | only the hand is modelled |

All screenshots in `devlog/` come from the emulator's simulated room unless a
file name says otherwise. No frame-rate or tracking number from the emulator
is a headset number.
