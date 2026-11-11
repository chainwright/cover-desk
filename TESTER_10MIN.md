# Cover: a 10-minute test on your Quest

**Keep people and brands out of everything you send: no faces, no other
people, no logos (a plain mug, book titles hidden, only your hands). Please
don't post your footage publicly before 18 Nov 2026.**

You need a Meta Quest 3 or 3S, a desk and a chair. Nothing to install. This
build has not run on a Quest before you: if something is broken, that is
exactly what we need to know.

## 1. Open it (1 min)

In Quest Browser open
**https://chainwright.github.io/cover-desk/?test=1**
(not the `/emu/` link: that one is the desktop emulator). Sit at your desk and
put the controllers down.

The log of your session is kept on the headset, through reloads and
restarts, until you send it.

## 2. Play and measure (6 min)

Press **Enter**.

| # | Do | Note down |
|---|---|---|
| 1 | Read the first line of the small panel above the board | Does it say **native**? If it says EMULATOR, stop and tell us. |
| 2 | Wait 5 s. If the board floats in the air, tap the desk **beside you** (not on the board) with one finger and hold still for a second | Seconds until the board sat on your desk; did you have to tap? |
| 3 | Stand your hand on the desk like "stop", **between the lantern and the dotted path** (the pale ghost hand shows where) | Did the creature dash into your shadow? |
| 4 | Keep the hand standing and slide it slowly sideways to lead the creature to its trinket. Do five crossings | How many of 5 reached the trinket? Was it ever "spotted" (it flashes and runs back) while your hand stood still? |
| 5 | With the creature waiting in your shadow, move that hand behind your back for 5 s, then bring it back | Did it wait ("It waits for your hand"), or was it spotted? |
| 6 | Play freely for a minute | Does the shadow edge shimmer? Anything odd? |

## 3. Send it (3 min)

1. Leave the immersive view (press the Meta button, then Exit or Back to the page).
2. Press **Download log**. The file `cover-tester-log-….json` goes to your
   Downloads.
3. Open the tester report form, on the headset itself if you like:
   **https://github.com/chainwright/cover-desk/issues/new?template=tester-report.yml**
   (a free GitHub account is needed). Attach the log file from Downloads in
   the "Log file" box (if GitHub refuses `.json`, rename it to `.txt`), and
   fill in your notes from the table. If attaching fails, press **Copy
   summary** on Cover's page and paste it into the form instead.

What the log holds: hand motion (wrist and index fingertip positions), game
and frame-rate events, timestamps, the build id and your browser's user
agent. No images, no audio, no account data. It stays on your headset until
you send it; **Start a new log** on the page deletes it.

The full first session, with frame-rate tools and more steps, is
[TESTER_PROTOCOL.md](TESTER_PROTOCOL.md).
