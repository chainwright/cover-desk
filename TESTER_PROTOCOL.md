# Cover: first session on a real Quest

**Keep people and brands out of everything you film or photograph for us:
no faces, no other people, no logos (a plain mug, book titles hidden, only
your hands). Please don't post the footage publicly before 18 Nov 2026, and
send it only by email (below), never through the public GitHub form.**

Short on time? The [10-minute version](TESTER_10MIN.md) is enough to tell
us whether Cover works on your headset. This page is the full first session:
about 35 minutes with one tester, plus 10 minutes with someone who has never
seen the game. Nothing to install. You need a Quest 3 (a 3S as well, if you
have one), a desk and a phone to note times.

**Where the data goes.** Everything the game measures goes into a log that
is **kept on the headset** in this browser's storage for the site, written
every few seconds and when you leave the immersive view, until you press
**Start a new log** (private browsing doesn't keep it). In the emulator it
survived a new URL; a power cycle on a Quest is what step 10 checks. To be
safe, press **Download log** right after you leave the immersive view,
before any reload. At the end you email that file, your notes from the
tables below and, if you can, the casting video to
**contact@automate-ai.live**. A GitHub form exists as an option (see "What
to send back"); it is public, so no video there.

## Before you start (5 min)

- Write down the Horizon OS version and the Quest Browser version
  (Browser → Settings → About).
- Space Setup done, with your desk drawn as a table.
- Desk 72–76 cm high, clear in front of you. Put one plain mug on it (no
  logo; measure its height with a ruler and write it down) and one book.
- Normal room light, about 300–500 lux (any phone lux app). Sit down.
- Clear about 45 × 30 cm of desk in front of you (the board's footprint).
- A normal Quest Browser tab, **not private browsing**.
- If the headset asks whether the page may use spatial data, **allow it** and
  write down that it asked.
- If you have the OVR Metrics Tool, turn its overlay on (fps, CPU, GPU).
- Start casting the headset view to a phone or computer and record it.
- Open this URL in Quest Browser:
  **https://chainwright.github.io/cover-desk/?test=1&reset=1**
  (`reset=1` only forgets a saved desk spot; it never deletes the log).
- If the page says "Log: … sessions" from someone else's run, press
  **Start a new log** first.

Please don't use the `/emu/` link on the headset: that one is the desktop
emulator build.

## Minutes 0–10: go / no-go

Press **Enter** (not "Enter: guided poses"; those come later, step 7).

| # | Step | Time | What you do | Pass | Fail |
|---|---|---|---|---|---|
| 1 | No emulator | 1 min | Load the page, read the note under the Enter button, press Enter | Note says "Sit at a desk. Hands only, no controllers."; you see your real room and your real hands; no "Remote Control Active" pill; the tester panel's first line says **native**, not EMULATOR | Emulator UI, a furnished fake room, or EMULATOR on the panel → **stop and send us a photo** |
| 2 | Placement | 1 min | Wait 5 s: the board should sit on your desk by itself. Then point with one finger at the desk **beside the board** (a hand's width to its left or right, not on it: a tap on the board is ignored on purpose), tap and hold still for about a second | The board sits on your desk within 5 s; after the tap it moves near that spot and the panel says `touch` | Tap beside the board ignored, or the board ends up off the desk |
| 3 | Frame rate | 2 min | Look at the board with a hand standing in the light, then put both hands down | Median ≥ 72 fps, the slowest 5% ≥ 60, no frame over 40 ms (panel and OVR overlay) | Median under 60 fps |
| 4 | Crossings | 3 min | Five crossings: stand your hand on the desk like "stop" where the ghost hand showed (between the lantern and the dotted path), hold it still 5 s, then slide it sideways to lead the creature across, about a hand's width every 2 seconds. After each win put the hand back where the ghost stood (the ghost and a card come back to show you) | With the hand still, the creature stops at the edge of your shadow (say whether you needed to slide to get it home); at least 4 of 5 reach the trinket; it is never "spotted" while your hand stays standing | Spotted twice or more with the hand standing still |
| 5 | Still hand | 2 min | Hold the edge of your hand's shadow on the waiting creature for 60 s; then a flat hand for 60 s. Note the clock time when each minute starts | Note: does the shadow edge shimmer, yes or no? | — (this session is labelled `free` in the log, so your clock times are how we find the two minutes; step 7 measures flicker per pose) |
| 6 | Cover hand hidden | 1 min | While the creature waits in your right hand's shadow, **keep the hand still** and hide it from the headset for 5 s: hold a book between your eyes and the hand, or look up at the ceiling. Then look back | The creature is still where it was (the card may say "It waits for your hand."), not back in its nook | It was spotted (flashed and ran back to its nook). Moving the hand away while the headset still sees it counts as lifting it, which gets the creature spotted by design: keep the hand where it is |

**Go if steps 1, 3 and 4 pass.** If step 1 fails, stop there.

## Minutes 10–25: measurements

| # | Step | What you do | We look for |
|---|---|---|---|
| 7 | Guided poses (1.5 min) | Leave the immersive view and press **Enter: guided poses** (they never start by themselves, so steps 1–6 are not mislabelled). Follow the panel: a "stop" hand between the lantern and the path, a hand on its edge like a wall, a flat hand (measurement only), then pointing down onto the mug | Tracked share, pose match and flicker per step (from the log) |
| 8 | Mug (3 min) | Stand the mug between the lantern and the dotted path (not on the path; on your side of the path it would shade nothing). Point down onto its top and hold still, three times. Then, with nothing under your finger, point down and pause in mid-air **beside the path**: 6–12 cm from the dotted path on your side of it (still over the board's near edge or just past it), 5–20 cm above the desk; lower the finger a few cm and stop for a second. Five times | Mug height in the log within ±10 mm of your ruler, 3 of 3. Mid-air pauses that wrongly register an object (a ring appears; the panel's `objects` count goes up): count them (we expect some; not fixed yet) |
| 9 | Anchor (3 min) | Put a small tape mark at a board corner. Leave the immersive view, move 1 m to the side, enter again | Board back on the same spot within 4 s; how far it is from the tape mark |
| 10 | Restart (5 min) | Optional belt and braces: press **Download log** and keep the file. Power the headset off and on, open **https://chainwright.github.io/cover-desk/?test=1** (without `reset`), check the page still says "Log: … sessions", enter | Board back on the same spot within 8 s (the app waits up to 8 s for the saved spot, then searches for the desk again), or note what happened |
| 11 | Low light (2 min) | Dim the room to about 50 lux, repeat step 4 twice | It is not spotted because tracking dropped |
| 11b | Cupped lantern (1 min, optional) | Once: cup your hand right around the lantern and hold it there | Write what happened (we expect the keeper to wake up and the creature not to cross) |
| 12 | No room scan (3 min, **optional**) | Only if you don't mind redoing your Space Setup afterwards: clear Space Setup, reload the page, enter | The board floats in front of you, a tap on the desk places it, no error |
| 13 | Hand look (1 min) | Open **https://chainwright.github.io/cover-desk/** (without `?test=1`; this session is not logged), take a headset screenshot with your hand over the board. Then go back to the `?test=1` link | Your real hand shows over the board, offset about 2 cm or less |
| 14 | Export (1 min) | Right after leaving the immersive view (look at your **left** palm at eye level, pinch thumb and index and hold until the menu icon fills, then let go; the same pinch on the right hand opens the Meta menu instead), on the `?test=1` page press **Download log** (it holds every session above), then **Copy summary** | The file is saved; the page says how many sessions it holds. If the page or the panel ever said **NOT kept**, write it down |

## Then a cold stranger (about 10 min)

Use the plain URL, no `?test=1`: **https://chainwright.github.io/cover-desk/**
Their session is not logged; only your notes count. Don't film their face.

Tell them only: "Sit at a desk, hands only. Open this link and press Enter."
Then stay silent and time each beat:

| Beat | Target |
|---|---|
| Presses Enter | within 20 s |
| Board on the real desk | within 5 s |
| Teaching | Was the pale ghost hand visible? Where did their hand go first: between the lantern and the path, in the light in front of the path, flat on the desk, held high? Their shadow on the path within 20 s |
| First dash | within 45 s of the board appearing |
| Leading it | They slide the hand sideways on their own within 10 s |
| Spotted | Can they say why it ran back? |
| First win | within 2:00; did they notice it was a win? |
| Replay | Two more rounds by choice |
| Hands in lap for 5 s | It waits; it is not spotted when the hands come back |
| At 3:00 say only "try using your mug" | Registered within 30 s |
| Headset off | Ask "Describe it in one sentence" and "What was annoying?" Write the answers down word for word |

## What to send back

Email **contact@automate-ai.live** with:

1. The log file (`cover-tester-log-….json`) as an attachment. If you can't
   attach it from the headset, copy it to a computer over USB (plug the Quest
   in, allow file access when the headset asks, take the file from its
   Download folder), or paste the copied summary into the email instead (the
   summary only, not the full log).
2. The casting video, if you can (no faces, people or logos in it), as an
   attachment or a private link.
3. Your notes: OS and browser versions, mug height, lux, whether the
   spatial-data prompt appeared, whether the page or panel ever said **NOT
   kept**, the pass/fail column above, the stranger's timings and their two
   answers.

Optional, without email: the tester report form
(https://github.com/chainwright/cover-desk/issues/new?template=tester-report.yml,
a free GitHub account is needed). **That issue is public**: anyone can read
it and download its attachments. Attach the log and notes only, never the
video.

We read the log with `npm run analyze -- <file>`. It prints the frame rate,
dropped frames, the app's own update time, pose stability and sight-line
flicker per guided step, and says whether the emulator was running (it must
say `emulator false`).

What the log holds: hand motion (wrist and index fingertip positions), game
and frame-rate events, the placement and desk geometry, timestamps, the build
id and the browser's user agent. No images, no audio, no account data. It
stays on your headset until you send it; **Start a new log** on the page
deletes it.
