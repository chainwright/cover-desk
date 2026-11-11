# Cover: a 10-minute test on your Quest

**Keep people and brands out of everything you send: no faces, no other
people, no logos (a plain mug, book titles hidden, only your hands). Please
don't post your footage publicly before 18 Nov 2026, and send it only by
email (below), never through the public GitHub form.**

You need a Meta Quest 3 or 3S, a desk and a chair. Nothing to install. This
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

## 2. Play and measure (6 min)

Press **Enter**.

| # | Do | Note down |
|---|---|---|
| 1 | Read the first line of the small panel above the board | Does it say **native**? If it says EMULATOR, stop and tell us. |
| 2 | Wait 5 s. If the board floats in the air, tap the desk **beside you** (not on the board) with one finger and hold still for a second | Seconds until the board sat on your desk; did you have to tap? |
| 3 | Stand your hand on the desk like "stop" **where the pale ghost hand shows** (between the lantern and the dotted path) | Did the creature dash into your shadow? |
| 4 | Hold the hand still for 5 s, then slide it sideways toward the trinket, slowly: **about a hand's width every 2 seconds**. After each win, **put your hand back where the ghost stood** (the ghost and a card show you where). Do five crossings | With the hand still, did the creature stop at the edge of your shadow? **Did you need to slide to get it home?** How many of 5 reached the trinket? Was it ever "spotted" (it flashes and runs back) while your hand stood still? Did you notice each win (what told you)? |
| 5 | With the creature waiting in your shadow, **keep that hand still** and hide it from the headset for 5 s: hold a book between your eyes and the hand, or look up at the ceiling. Then look back | Was the creature still where it was ("It waits for your hand" may show), or back in its nook (spotted)? Write "It waits" or "spotted". |
| 6 | Play freely for a minute. Optional, once: cup your hand right around the lantern | Does the shadow edge shimmer? Anything odd? What happened when you cupped the lantern? (We expect the keeper to wake up.) |

## 3. Send it (3 min)

1. Leave the immersive view: look at your **left** palm at eye level, pinch
   thumb and index finger together and hold until the menu icon fills, then
   let go. That takes you out of the immersive view, back to the page. (The
   same pinch on the right hand opens the Meta menu instead.)
2. **Right away**, before any reload, press **Download log**. The file
   `cover-tester-log-….json` goes to your Downloads. If the page or the
   panel ever said **NOT kept**, tell us in your email: the log was not being
   saved on the headset.
3. Email it as an attachment to **contact@automate-ai.live**, with your notes
   from the table above, your Horizon OS and Browser versions (and the
   casting video, if you made one, as an attachment or a private link).
   If you can't attach the file from the headset:
   - copy it to a computer over USB: plug the Quest in, allow file access
     when the headset asks, and take the file from its Download folder; or
   - press **Copy summary** on Cover's page and paste it into the email (the
     summary only, not the full log, but much better than nothing).

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
