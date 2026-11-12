# Cover: a 10-minute test on your Quest (12 with the optional level 2)

**Keep people and brands out of everything you send: no faces, no other
people, no logos (a plain mug, book titles hidden, only your hands). Please
don't post your footage publicly before 18 Nov 2026, and send it only by
email (below), never through the public GitHub form.**

You need a Meta Quest 3 or 3S, a desk and a chair; for the optional step 7,
a book or a closed box (or a mug turned upside down) about 8–15 cm tall, with
a flat top. Nothing to install. This
build has not run on a Quest before you: if something is broken, that is
exactly what we need to know.

## 1. Before you start (1 min)

- Clear a patch of desk in front of you, about 45 × 30 cm (a sheet of A3
  paper): the board lands there.
- Use a normal Quest Browser tab, **not private browsing** (a private tab
  keeps neither the log nor the saved desk spot).
- If the headset asks whether this page may use spatial data (your room's
  surfaces), **allow it**, and note that it asked.
- Write down the Horizon OS version (Quest settings, About) and the Quest
  Browser version (Browser → Settings → About).

In Quest Browser open
**https://chainwright.github.io/cover-desk/?test=1**
(not the `/emu/` link: that one is the desktop emulator). Sit at your desk and
put the controllers down.

The log of your session is kept on the headset until you press **Start a new
log** (sending it doesn't delete it). It is written every few seconds; to be
safe, download it right after you leave the immersive view (step 3 below).

## 2. Play and measure (6 min, plus 2 for the optional step 7)

Press **Enter**.

| # | Do | Note down |
|---|---|---|
| 1 | Read the first line of the small panel above the board | Does it say **native**? If it says EMULATOR, stop and tell us. |
| 2 | Wait 5 s. If the board floats in the air, tap the desk **beside you** (not on the board) with one finger and hold still for a second | Seconds until the board sat on your desk; did you have to tap? |
| 3 | On the first run the keeper stirs for about 2 s, then the pale ghost hand shows. Stand your hand on the desk like "stop" **where the pale ghost hand shows** (between the lantern and the dotted path) | Did the creature dash into your shadow? Did you notice the keeper stir before the ghost hand came? |
| 4 | Hold the hand still for 5 s, then slide it sideways toward the trinket, slowly: **about a hand's width every 2 seconds**. After each win, **put your hand back where the ghost first stood** (left of the lantern's middle, between the lantern and the path); the ghost and a card may show you where for a few seconds. After the first win a card about level 2 and a ghost mug appear (an earlier build also drew a pale wedge): **ignore them until step 7** and keep crossing. Do five crossings | With the hand still, did the creature stop at the edge of your shadow? **Did you need to slide to get it home?** How many of 5 reached the trinket? Was it ever "spotted" (it flashes and runs back) while your hand stood still? Did you notice each win (what told you)? |
| 5 | With the creature waiting in your shadow, **keep that hand still** and hide it from the headset for 5 s: hold a book between your eyes and the hand (if you have no book at hand, look up at the ceiling instead and say so). Then look back | Was the creature still where it was ("It waits for your hand" may show), or back in its nook (spotted)? Write "It waits" or "spotted". |
| 6 | Play freely for a minute. Optional, once: cup your hand right around the lantern | Does the shadow edge shimmer? Anything odd? What happened when you cupped the lantern? (We expect the keeper to wake up about a quarter second after your hand gets there.) |
| 7 | **Optional, 2 min: level 2.** After your wins a ghost mug appears; the pale wedge (the keeper's gaze) shows once level 2 starts, after the box is registered. **First, with nothing there:** point one finger down in mid-air above the ghost mug, about 10 cm above the desk, lower it a few cm and hold it still for a second (this checks whether a finger alone can fake an object). **Then** stand the book or box on the ghost mug, point down at the **middle** of its top and hold still about a second. Then: hand at the ghost on the left, edge it toward the box; when the creature waits in the box's shadow, **lift your hand high, about a hand's length, then move it over the wedge** to the ghost on the right and put it down there (if the creature still waits, edge the hand a little toward the box, then slide it along). Try once to slide your hand straight into the wedge, too | Did the mid-air finger register (a click and a ring)? Did the box register, and on which try? Did the creature cross with box + hand? Did the keeper wake while your hand went over? What happened when your hand slid into the wedge (we expect the keeper to wake)? Box height, roughly |

## 3. Send it (3 min)

1. Leave the immersive view: look at your **left** palm at eye level, pinch
   thumb and index finger together and hold until the menu icon fills, then
   let go. That takes you out of the immersive view, back to the page. (The
   same pinch on the right hand opens the Meta menu instead.)
2. **Right away**, before any reload, press **Download log**. The file
   `cover-tester-log-….json` goes to your Downloads. Then press **Copy
   summary** too and paste it into your email (neither button has been tried
   in Quest Browser before you, so we'd like to know whether each one worked).
   If the page or the panel ever said **NOT kept**, tell us in your email: the
   log was not being saved on the headset.
3. Email it as an attachment to **contact@automate-ai.live**, with your notes
   from the table above and your Horizon OS and Browser versions.
   If you can't attach the file from the headset:
   - copy it to a computer over USB: plug the Quest in with a USB-C cable,
     allow file access when the headset asks, and take the file from the
     headset's Download folder; or
   - send just the copied summary from step 2 (not the full log, but much
     better than nothing).
4. Optional: if you can cast the headset view to a phone or computer while
   you play, a private recording helps us a lot (your hands and the desk
   only, no faces, people or logos), as an attachment or a private link.
   Not needed for the test.

Optional, if you prefer GitHub: the tester report form,
https://github.com/chainwright/cover-desk/issues/new?template=tester-report.yml
(a free GitHub account is needed). **This issue is public**: anyone can read
it and download what you attach. Attach the log only, never a video.

What the log holds: hand motion (wrist and index fingertip positions), game
and frame-rate events, timestamps, the build id and your browser's user
agent. No images, no audio, no account data. **Start a new log** on the page
deletes it.

The full first session, with frame-rate tools and more steps, is
[TESTER_PROTOCOL.md](TESTER_PROTOCOL.md).
