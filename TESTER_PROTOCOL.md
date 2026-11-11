# Cover: first session on a real Quest

About 35 minutes with one tester, plus 10 minutes with someone who has never
seen the game. Nothing to install. You need a Quest 3 (a 3S as well, if you
have one), a desk and a phone to note times.

Everything the game measures goes into a log file you download at the end.
We only need that file, your notes from the tables below, and the casting
video.

## Before you start (5 min)

- Write down the Horizon OS version and the Quest Browser version
  (Browser → Settings → About).
- Space Setup done, with your desk drawn as a table.
- Desk 72–76 cm high, clear in front of you. Put one plain mug on it (no
  logo; measure its height with a ruler and write it down) and one book.
- Normal room light, about 300–500 lux (any phone lux app). Sit down.
- If you have the OVR Metrics Tool, turn its overlay on (fps, CPU, GPU).
- Start casting the headset view to a phone or computer and record it.
- Open this URL in Quest Browser:
  **https://chainwright.github.io/cover-desk/?test=1&reset=1**

Please don't use the `/emu/` link on the headset: that one is the desktop
emulator build.

## Minutes 0–10: go / no-go

| # | Step | Time | What you do | Pass | Fail |
|---|---|---|---|---|---|
| 1 | No emulator | 1 min | Load the page, read the note under the Enter button, press Enter | Note says "Sit at a desk. Hands only, no controllers."; you see your real room and your real hands; no "Remote Control Active" pill; the tester panel's first line says **native**, not EMULATOR | Emulator UI, a furnished fake room, or EMULATOR on the panel → **stop and send us a photo** |
| 2 | Placement | 1 min | Wait a few seconds. Then point at the desk with one finger, tap it and hold still for about a second | The board sits on your desk within 5 s; after the tap the panel says `touch` | Tap ignored, or the board ends up off the desk |
| 3 | Frame rate | 2 min | Look at the board with a hand still in the light, then put both hands down | Median ≥ 72 fps, the slowest 5% ≥ 60, no frame over 40 ms (panel and OVR overlay) | Median under 60 fps |
| 4 | Crossings | 3 min | Five crossings: hold your hand up in the light near the lantern, like "stop", and slide it sideways to lead the creature across | At least 4 of 5 reach the trinket; it is never "spotted" while your hand stays up | Spotted twice or more with the hand held up |
| 5 | Still hand | 2 min | Hold the edge of your hand's shadow on the waiting creature for 60 s; then a flat hand for 60 s | Note: does the shadow edge shimmer, yes or no? | — (we read the flicker rate from the log) |
| 6 | Cover hand lost | 1 min | While the creature waits in your right hand's shadow, keep your left hand visible on the desk and move the right hand out of view (behind your back) | The creature stops and the card says "It waits for your hand."; it is **not** spotted; bring the hand back and it carries on | It gets spotted while your hand is out of view |

**Go if steps 1, 3 and 4 pass.** If step 1 fails, stop there.

## Minutes 10–25: measurements

| # | Step | What you do | We look for |
|---|---|---|---|
| 7 | Guided poses (1.5 min) | Follow the panel. It asks for: hand up like "stop", hand on its edge like a wall, a flat hand, then pointing down onto the mug | Tracked share, pose match and flicker per step (from the log) |
| 8 | Mug (3 min) | Point down onto the top of the mug and hold still, three times. Then point at the creature and pause in mid-air for a second, five times | Mug height in the log within ±10 mm of your ruler, 3 of 3. Mid-air pauses that wrongly register an object: please count them (we expect some; not fixed yet) |
| 9 | Anchor (3 min) | Leave the immersive view, move 1 m to the side, enter again. Put a small tape mark at a board corner first | Board back on the same spot within 4 s; how far it is from the tape mark |
| 10 | Restart (5 min) | Power the headset off and on, open the URL again **without** `&reset=1` | Board back on the same spot within 8 s, or note what happened |
| 11 | Low light (2 min) | Dim the room to about 50 lux, repeat step 4 twice | It is not spotted because tracking dropped |
| 12 | No room scan (3 min) | Clear Space Setup, reload the page, enter | The board floats in front of you, a tap on the desk places it, no error |
| 13 | Hand look (1 min) | Open the URL without `?test=1`, take a headset screenshot with your hand over the board | Your real hand shows over the board, offset about 2 cm or less |
| 14 | Export (1 min) | Leave the immersive view, press **Download log**, then **Copy summary** | The file is saved |

## Then a cold stranger (about 10 min)

Use the plain URL, no `?test=1`: **https://chainwright.github.io/cover-desk/**

Tell them only: "Sit at a desk, hands only. Open this link and press Enter."
Then stay silent and time each beat:

| Beat | Target |
|---|---|
| Presses Enter | within 20 s |
| Board on the real desk | within 5 s |
| Teaching | Was the pale ghost hand visible? Which pose did they try first? Their shadow on the path within 20 s |
| First dash | within 45 s of the board appearing |
| Leading it | They slide the hand sideways on their own within 10 s |
| Spotted | Can they say why it ran back? |
| First win | within 2:00; did they notice it was a win? |
| Replay | Two more rounds by choice |
| Hands in lap for 5 s | It waits; it is not spotted when the hands come back |
| At 3:00 say only "try using your mug" | Registered within 30 s |
| Headset off | Ask "Describe it in one sentence" and "What was annoying?" Write the answers down word for word |

## What to send back

1. The log file (`cover-tester-log-….json`) and the copied summary.
2. The casting video.
3. Your notes: OS and browser versions, mug height, lux, the pass/fail column
   above, the stranger's timings and their two answers.

We read the log with `npm run analyze -- <file>`. It prints the frame rate,
dropped frames, the app's own update time, pose stability and sight-line
flicker per guided step, and says whether the emulator was running (it must
say `emulator false`). The log holds hand motion and the browser's user agent
and nothing else; it stays on your headset until you send it.

When filming anything for us, keep brands and people out of frame: a plain
mug, books with no titles showing, only your hands.
