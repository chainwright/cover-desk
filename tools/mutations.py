"""Mutation check (days 2-8): applies each mutation to the source, runs `npm test`,
restores the file, and prints which tests failed. Run: python3 tools/mutations.py
A mutation that no test catches is printed with 0 failing.

Day 5: the ten "outside" mutations (O13-O22) an outside run made on day-4 glue
code are recreated at today's call sites. Glue that no unit test can reach
gets a second stage when COVER_EMU_BASE is set (a server serving dist/, e.g.
http://127.0.0.1:8799/): the emulator build is rebuilt with the mutation and
tools/emu/wiring_check.mjs is run against it; a failing check catches it.
Rebuild dist/ afterwards (npm run build).

Day 6: 7a-7m mutate the level-2 code (unit tests); G1-G9 its glue (cover-system.ts,
emu-seat.ts), tried against the emulator wiring check's l2-* phase when no unit test
catches them.

Day 7: 8a-8i mutate the day-7 code (post-win flow, wake hysteresis, the creature's
dwell, the gaze during the win card, the teach copy, and the pure pieces pulled out of
the glue). R1-R11 are the outside run's eleven day-6 glue mutations (judges_impl_d5,
ORGANISER_CHECKS section 5), recreated at today's call sites; G10-G12 the day-7 glue.

Day 7b: 9a-9e the gaze only in level 2, the /emu/ R lift-over (pure), the debug handle
gate; G13-G14 the R motion's glue (wiring check l2-r-motion).

Day 8: 10a-10g the wake dwell, the threat beat, level 2's card and light, kept progress;
X1, X3-X5 the outside run's day-7 glue survivors (judges_impl_d6), X1 through a main build
and tools/check-dist.mjs (stage 'dist'); G15-G22 the day-8 glue."""
import subprocess, shutil, re, sys
import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
M=[
 # day-1 mutations (exact edits recorded this time)
 ('D1 no pause on hand loss','src/creature.ts','if (!w.handPresent) {','if (false) {'),
 ('D2 quick reject inverted','src/sightline.ts','if (cminY > maxY) continue;','if (cminY <= maxY) continue;'),
 ('D3 no palm webs','src/hand-proxy.ts','  [6, 11], [11, 16], [16, 21],\n  [5, 10], [10, 15], [15, 20],\n',''),
 ('D4 no "seen for 0.15 s" debounce','src/creature.ts','c.seenFor >= p.spot','c.seenFor >= 0'),
 ('D5 light-map distance cull too aggressive','src/light-map.ts','if (this.dMin[i] > d) continue;','if (this.dMin[i] > d * 0.5) continue;'),
 # day-2 mutations
 ('2a ghost needs !listening again (day-1 bug)','src/onboarding.ts','cues.ghost = i.placed && (!i.everDashed || !!i.again) && !i.intro;','cues.ghost = i.placed && (!i.everDashed || !!i.again) && !i.intro && !i.listening;'),
 ('2b registration blocked while listening on a plane placement','src/onboarding.ts',"(!i.listening || i.placement === 'desk')",'!i.listening'),
 ('2c teaching prompt replaced by the old move prompt while listening','src/onboarding.ts',"if (i.moveRequested) cues.prompt = 'tap-new-spot';","if (i.moveRequested || i.listening) cues.prompt = 'tap-new-spot';"),
 ('2d knob label hidden on the first run','src/onboarding.ts','cues.knobLabel = onDesk && !i.everDashed && !i.moveRequested;','cues.knobLabel = false;'),
 ('4a pause only when both hands are lost (day-1 rule)','src/creature.ts','return (tracked[0] || tracked[1]) && this.waitingFor < 0;','return tracked[0] || tracked[1];'),
 ('4b cover-hand memory window = 0','src/creature.ts','time - this.lastAt <= window','time - this.lastAt <= 0'),
 ('4c never stop waiting when the hand is back','src/creature.ts','if (this.waitingFor >= 0 && tracked[this.waitingFor]) this.waitingFor = -1;',''),
 ('4d also mark a still-tracked hand as lost (equivalent: the next line clears it)','src/creature.ts','&& !tracked[this.lastHand]) {','&& true) {'),
 ('LOS capsule inflation removed (+4 mm -> 0)','src/hand-proxy.ts','export const INFLATE = 0.004;','export const INFLATE = 0;'),
 ('LOS capsule radius halved','src/hand-proxy.ts','const r = Math.max(MIN_RADIUS, (ra + rb) / 2) + inflate;','const r = (Math.max(MIN_RADIUS, (ra + rb) / 2) + inflate) / 2;'),
 # day-3: the two outside mutations that survived day 2 (O3, O4), plus new code
 ('O3 object shade no longer clears the wait (branch body removed)','src/creature.ts','this.waitingFor = -1; // shaded by an object','// shaded by an object'),
 ('O4 late-desk window off (LATE_DESK_S 10 -> 0)','src/placement.ts','export const LATE_DESK_S = 10;','export const LATE_DESK_S = 0;'),
 ('3a anchor restore gives up at 4 s again','src/placement.ts','export const RESTORE_WAIT_S = 8;','export const RESTORE_WAIT_S = 4;'),
 ('3b log cursor never advances (every flush rewrites the session)','src/log-store.ts','    for (const c of chunks) this.done.set(c.from, { s: c.toS, e: c.toE });\n',''),
 ('3c a restored log of another store version is mixed in','src/log-store.ts','if (!meta || meta.storeVersion !== STORE_VERSION) return null;','if (!meta) return null;'),
 ('3d teaching copy back to day 2','src/onboarding.ts',"""teach: ["Stand your hand like 'stop'", '!right where the pale hand is'],""","""teach: ['Hold your hand up in the light,', "!like 'stop'"],"""),
 ('3e searching floats the board at once (no desk wait)','src/placement.ts',"return c.time - c.searchStart > DESK_WAIT_S ? 'fallback' : 'none';","return 'fallback';"),
 # day-4: the three outside mutations that survived day 3 (O9, O10, O12), plus new code
 ('O9 no log flush on page hide','src/log-store.ts',"  win.addEventListener('pagehide', flush);\n",''),
 ('O10 the 5 s log flush never fires','src/log-store.ts','    if (time - this.last < this.every) return false;','    return false;'),
 ('O12 /emu/ seat slides 10x faster','src/emu-seat.ts','export const SLIDE_SPEED = 0.03;','export const SLIDE_SPEED = 0.3;'),
 ('5a log cursor advances even when the write failed','src/log-store.ts','    if (ok) this.cursor.commit(chunks);','    this.cursor.commit(chunks);'),
 ('5b overlapping flushes not serialised','src/log-store.ts','    this.chain = this.chain.then(run, run);\n    return this.chain;','    return run();'),
 ('5c teaching spot back by the lantern (day-3 /emu/ spot)','src/level.ts','export const TEACH_SPOT = { x: -0.065, z: -0.025 } as const;','export const TEACH_SPOT = { x: -0.035, z: -0.06 } as const;'),
 ('5d teaching spot centred on the light (the lane misses the creature)','src/level.ts','export const TEACH_SPOT = { x: -0.065, z: -0.025 } as const;','export const TEACH_SPOT = { x: 0, z: -0.025 } as const;'),
 ('5e "tap your desk" card back during the desk search','src/onboarding.ts',"if (i.listening && i.placement === 'fallback') {","if (i.listening && i.placement !== 'restoring' && i.placement !== 'preview') {"),
 ('5f slide card never shown','src/onboarding.ts',"  else if (i.leading) cues.prompt = 'slide';\n",''),
 # day-5 code
 ('6a no wake rule (radius 0)','src/feedback.ts','export const WAKE_RADIUS = 0.063;','export const WAKE_RADIUS = 0;'),
 ('6b wake radius 8 cm (the ghost spot wakes the keeper)','src/feedback.ts','export const WAKE_RADIUS = 0.063;','export const WAKE_RADIUS = 0.08;'),
 ('6c log store gives up at the first failed write again','src/log-store.ts','if (this.failures >= MAX_WRITE_FAILURES) this.status = \'failed\';','this.status = \'failed\';'),
 ('6d log store never gives up','src/log-store.ts','if (this.failures >= MAX_WRITE_FAILURES) this.status = \'failed\';','if (false) this.status = \'failed\';'),
 ('6e a successful write does not reset the failure count','src/log-store.ts','          this.failures = 0;\n          resolve(true);','          resolve(true);'),
 ('6f log keeper writes to a store that gave up','src/log-store.ts','if (!log || !this.kept) return','if (!log) return'),
 ('6g spotted card never shown','src/onboarding.ts',"  else if (i.spotted) cues.prompt = 'spotted';\n",''),
 ('6h "again" card never shown','src/onboarding.ts',"  else if (i.again) cues.prompt = 'again';\n",''),
 ('6i ghost not back after a win','src/onboarding.ts','cues.ghost = i.placed && (!i.everDashed || !!i.again) && !i.intro;','cues.ghost = i.placed && !i.everDashed && !i.intro;'),
 ('6j "again" cleared while the creature is still at home','src/feedback.ts','if (this.again && mode !== MODE_HOME && handBackAtStart)','if (this.again && handBackAtStart)'),
 ('6k no win hop','src/feedback.ts','    out.hop = f.hop * k * Math.sin((Math.PI * (t % f.hopS)) / f.hopS);','    out.hop = 0;'),
 ('6l eyes stay shut when a hand is at the lantern','src/feedback.ts','out.eyes = spotted || awake ? EYES_OPEN : 1;','out.eyes = spotted ? EYES_OPEN : 1;'),
 ('6m a lifted hand counts as back at the start','src/feedback.ts','if (j[1] <= RETURN_MAX_Y && Math.hypot','if (Math.hypot'),
 ('6n analyser counts every second as in view','src/touch-log.ts','if (e.inView) inView.push(Number(e.fps));','inView.push(Number(e.fps));'),
 # day-6 code: level 2 (src/level2.ts, the level-2 cards in src/onboarding.ts)
 ('7a a hand in the gaze never wakes the keeper','src/level2.ts','      if (blockedBy(o, l.x, l.y, l.z, p[2 * i], CREATURE_Y, p[2 * i + 1]) !== BY_NONE) return true;\n',''),
 ('7b no padding in the gaze wake test (2 mm -> 0)','src/level2.ts','export const GAZE_PAD = 0.002;','export const GAZE_PAD = 0;'),
 ('7c gaze sampled every 2 cm instead of 2 mm','src/level2.ts','export const GAZE_STEP = 0.002;','export const GAZE_STEP = 0.02;'),
 ('7d gaze half-angle 10 -> 4 deg','src/level2.ts','export const GAZE_HALF = 10 * DEG;','export const GAZE_HALF = 4 * DEG;'),
 ('7e "the object covers the gaze" true when one sample is covered','src/level2.ts','      if (blockedBy(objects, l.x, l.y, l.z, p[2 * i], CREATURE_Y, p[2 * i + 1]) === BY_NONE) return false;','      if (blockedBy(objects, l.x, l.y, l.z, p[2 * i], CREATURE_Y, p[2 * i + 1]) !== BY_NONE) return true;'),
 ('7f level 2 counts every object (no replace)','src/level2.ts','  if (level2) return { slot: 0, count: 1, shift: false };\n',''),
 ('7g a level-1 win never unlocks level 2','src/level2.ts','    if (this.level === 1) this.unlocked = true;','    if (this.level === 1) this.unlocked = false;'),
 ('7h level 2 starts without an object','src/level2.ts','this.level === 1 && this.unlocked && objects > 0 && atBoundary','this.level === 1 && this.unlocked && atBoundary'),
 ('7i "needs a real mug" card never shown','src/onboarding.ts',"  else if (!i.objects) cues.prompt = 'need-object';\n",''),
 ('7j ghost never moves to the right-hand spot','src/onboarding.ts',"    cues.ghostSpot = 'right';","    cues.ghostSpot = 'left';"),
 ('7k unlock card replaces the day-5 "again" card','src/onboarding.ts',"if (i.unlocked && !i.objects && cues.prompt === 'none' && !i.intro)","if (i.unlocked && !i.objects && (cues.prompt === 'none' || cues.prompt === 'again') && !i.intro)"),
 ('7l level-2 ghosts back at 6 cm (too near the gaze)','src/level2.ts','export const L2_LEFT = { x: -0.08, z: -0.025 } as const;','export const L2_LEFT = { x: -0.06, z: -0.025 } as const;'),
 ('7m ghost mug off the gaze','src/level2.ts','export const MUG_SPOT = { x: 0, z: -0.03 } as const;','export const MUG_SPOT = { x: 0.05, z: -0.03 } as const;'),
 # day-7 code
 ('8a the next round no longer waits for the hand (3.5 s again)','src/feedback.ts','return sinceHome > NEXT_ROUND_MAX_S || (handBack && sinceHome > NEXT_ROUND_S);','return sinceHome > NEXT_ROUND_S;'),
 ('8b no wake hysteresis (sleeps at 6.3 cm again)','src/feedback.ts','this.hand = handAtLantern(local, tracked, l, SLEEP_RADIUS);','this.hand = handAtLantern(local, tracked, l, WAKE_RADIUS);'),
 ('8c creature dwell 0 (day-6 creature)','src/creature.ts','  dwell: 0.1,','  dwell: 0,'),
 ('8d dwell check removed in stepCreature','src/creature.ts','      if (c.clearFor < p.dwell) return EV_NONE; // standing still: the way ahead must stay dark a moment\n',''),
 ('8e ghost mug drawn during the win\'s "again" card (day 7b: the gaze is level 2 only)','src/onboarding.ts','cues.mugGhost = i.placed && (l2 || (!!i.unlocked && !i.again))','cues.mugGhost = i.placed && (l2 || !!i.unlocked)'),
 ('8f teach copy back to "between the lantern and the path"','src/onboarding.ts',"""teach: ["Stand your hand like 'stop'", '!right where the pale hand is'],""","""teach: ["Stand your hand like 'stop'", '!between the lantern and the path'],"""),
 ('8g knob: pointing gate removed (pure; R3 in the function)','src/contact.ts','  return pointing && Math.hypot(lx - knob.x','  return Math.hypot(lx - knob.x'),
 ('8h level switch keeps every object (pure; R7 in the function)','src/level2.ts','  if (lastSlot !== 0) objects.copyWithin(0, lastSlot * 3, lastSlot * 3 + 3);\n  return 1;','  return count;'),
 ('8i fps inView always true (pure; R9 in the function)','src/touch-log.ts','  return placed && viewDeg < IN_VIEW_DEG;','  return true;'),
 # day-7b code
 ('9a gaze drawn in level 1 after the unlock again','src/onboarding.ts','cues.gaze = i.placed && l2;','cues.gaze = i.placed && (l2 || !!i.unlocked);'),
 ('9b lift-over crosses low (no height while moving across)','src/emu-seat.ts','return { x: fromX + (toX - fromX) * ((t - upS) / overS), dy: top, done: false };','return { x: fromX + (toX - fromX) * ((t - upS) / overS), dy: 0, done: false };'),
 ('9c lift-over jumps (R moves the hand at once)','src/emu-seat.ts','  if (t < upS) return','  if (t < 0) return'),
 ('9d level-1 card points at the gaze again','src/onboarding.ts',"'!on the ghost mug; finger on top'","'!in the gaze; hold a finger on top'"),
 ('9e debug handle on window in every build','src/cover-system.ts',"    if (__COVER_EMU__) (window","    if (true) (window"),
 # day-8 code
 ('10a no wake dwell (the keeper wakes on the first frame inside)','src/feedback.ts','export const WAKE_DWELL_S = 0.25;','export const WAKE_DWELL_S = 0;'),
 ('10b the wake dwell is not reset when the hand leaves (brushes add up)','src/feedback.ts','this.inside = h >= 0 ? this.inside + dt : 0;','this.inside = this.inside + (h >= 0 ? dt : 0);'),
 ('10c teach card shown during the threat beat','src/onboarding.ts',"cues.prompt = i.intro ? 'none' : 'teach';","cues.prompt = 'teach';"),
 ('10d level 2\'s own card never shown','src/onboarding.ts',"cues.prompt = i.l2Home ? 'l2-home' : 'again';","cues.prompt = 'again';"),
 ('10e kept progress of any version accepted','src/progress-store.ts','v.v !== 1) return none;','false) return none;'),
 ('10f the level-2 lantern does not dim','src/feedback.ts','  dim: -0.6,','  dim: 0,'),
 ('10g threat beat on every visit (ignores a learned lesson)','src/feedback.ts','return placed && !everDashed && sincePlaced >= 0','return placed && sincePlaced >= 0'),
]
# The outside run's ten day-4 glue mutations, recreated at today's call sites
# (marked 'emu': if no unit test catches them, the emulator wiring check is tried).
OUT=[
 ('O13 /emu/ hand turned -90 deg (fingertips down)','src/emu-seat.ts','const quaternion = mul(rotY(-yaw), rotX(Math.PI / 2));','const quaternion = mul(rotY(-yaw), rotX(-Math.PI / 2));'),
 ('O14 /emu/ grip-to-wrist offset ignored','src/emu-seat.ts','boardPoint(x - GRIP_TO_WRIST.x, z - GRIP_TO_WRIST.z, y - GRIP_TO_WRIST.y)','boardPoint(x, z, y)'),
 ('O15 frame-loop log flush call removed (cover-system)','src/cover-system.ts','    this.logKeeper?.frame(time);\n',''),
 ('O16 page-hide flush wiring removed (index.ts)','src/index.ts','  flushOnPageHide(window, document, () => void cover()?.flushLog());\n',''),
 ('O17 win chime not played','src/cover-system.ts','        else chime();\n',''),
 ('O18 bead row not updated','src/cover-system.ts','    m.winBeads.count = pay.beads;\n',''),
 ('O19 trinket not carried after a win','src/cover-system.ts','    if (pay.trinketOnBack) {','    if (false) {'),
 ('O20 keeper eyes never open','src/cover-system.ts','    this.eyeOpen += (pay.eyes - this.eyeOpen) * Math.min(1, dt * 20);','    this.eyeOpen += (1 - this.eyeOpen) * Math.min(1, dt * 20);'),
 ('O21 stare line never shown','src/cover-system.ts','    m.beam.visible = pay.stare;','    m.beam.visible = false;'),
 ('O22 slide-card latch removed at the call site','src/cover-system.ts','this.round.frame(this.creature.mode, this.lineState === SHADOW && this.lineBy < OBJECT_OWNER,','this.round.frame(this.creature.mode, false,'),
 # day-6 glue in cover-system.ts (level 2), checked by the wiring check's l2-* phase
 ('G1 gaze wake not wired','src/cover-system.ts','const g = placed && this.level.needsObject ? this.gaze.handInGaze(this.local, this.joints.radii, this.joints.tracked) : -1;','const g = -1;'),
 ('G2 level never switches to 2','src/cover-system.ts','    this.updateLevel(time);\n',''),
 ('G3 a win does not unlock level 2','src/cover-system.ts','        this.progress.onWin();\n',''),
 ('G4 "the object covers the gaze" never computed','src/cover-system.ts','    this.mugCovers = this.gaze.coveredBy(this.objOcc);','    this.mugCovers = this.objectCount > 0;'),
 ('G5 ghost hand not moved to level 2\'s spots','src/cover-system.ts','      m.ghostHand.position.set(spot.x, 0, spot.z);\n',''),
 ('G6 gaze and ghost mug never drawn','src/cover-system.ts','    m.gaze.visible = this.cues.gaze;\n    m.mugGhost.visible = this.cues.mugGhost;','    m.gaze.visible = false;\n    m.mugGhost.visible = false;'),
 ('G7 level 2 keeps every object (one-object rule off at the call site)','src/cover-system.ts','objectSlot(this.level.needsObject, this.objects,','objectSlot(false, this.objects,'),
 ('G8 /emu/ O key registers nothing','src/emu-seat.ts','      else console.info(`[cover] emulated object: ${f.registerAt(EMU_MUG.x, EMU_MUG.z, EMU_MUG.top)}`);','      else console.info(\'[cover] emulated object: off\');'),
 ('G9 /emu/ R key uses the left spot','src/emu-seat.ts',"  if (level === 2) return key === 'r' ? L2_RIGHT.x : L2_LEFT.x;","  if (level === 2) return L2_LEFT.x;"),
 # day 7: the outside run's eleven day-6 glue mutations (judges_impl_d5, ORGANISER_CHECKS section 5), at today's call sites
 ('R1 an awake keeper no longer sees the whole path','src/cover-system.ts','seen: (s: number) => this.keeperAwake || this.seenAt(s),','seen: (s: number) => this.seenAt(s),'),
 ('R2 lantern wake not wired at the call site (updateWake)','src/cover-system.ts','const h = placed ? this.lanternWake.update(this.local, this.joints.tracked, this.lantern, dt) : -1;','const h = -1;'),
 ('R3 move knob: pointing gate removed at the call site','src/cover-system.ts','const on = onKnob(this.pointing[h], lx, ly, lz, KNOB);','const on = onKnob(true, lx, ly, lz, KNOB);'),
 ('R4 registration call site: any hand counts as pointing','src/cover-system.ts','      pointing: this.pointing[h],\n','      pointing: true,\n'),
 ('R5 desk tap: pointing gate removed','src/cover-system.ts','const blocked = !this.pointing[h] ||','const blocked = false ||'),
 ('R6 level-2 round boundary back to nook/home only','src/cover-system.ts','const boundary = c.mode === MODE_NOOK || c.mode === MODE_HOME || (c.mode === MODE_WAIT && this.lineState === DARK);','const boundary = c.mode === MODE_NOOK || c.mode === MODE_HOME;'),
 ('R7 level 2 keeps every earlier object at the switch','src/cover-system.ts','if (this.objectCount > 1 || this.lastSlot !== 0) {','if (false) {'),
 ('R8 keeper-woke log event always says reason lantern','src/cover-system.ts',"reason: h >= 0 ? 'lantern' : 'gaze',","reason: 'lantern',"),
 ('R9 fps log: inView always true','src/cover-system.ts','inView: boardInView(this.isPlaced(), viewDeg),','inView: true,'),
 ('R10 spotted log: wrist speeds dropped','src/cover-system.ts','wristMmS: [0, 1].map((h) => (this.joints.tracked[h] ? Math.round(this.wristSpeed[h] * 1000) : null)),','wristMmS: [null, null],'),
 ('R11 a level-2 win is never recorded as one (l2Won)','src/cover-system.ts','        if (this.level.needsObject) this.l2Won = true;\n',''),
 # day-7 glue
 ('G10 the next round starts 3.5 s after a win again (call site)','src/cover-system.ts','nextRoundDue(time - this.homeAt, this.handBack)','time - this.homeAt > 3.5'),
 ('G11 the win hop not applied to the creature (call site)','src/cover-system.ts','      bob = this.fx.hop; // the win','      bob = 0; // the win'),
 ('G12 the win flare not applied to the light (call site)','src/cover-system.ts','    (m.poolMat.uniforms.uFlare as { value: number }).value = this.fx.flare;\n','    (m.poolMat.uniforms.uFlare as { value: number }).value = 0;\n'),
 # day-7b glue
 ('G13 /emu/ R jumps again (the motion starts at its end)','src/emu-seat.ts','      over = { t: 0, fromX,','      over = { t: LIFT_OVER_S, fromX,'),
 ('G14 /emu/ R motion not applied to the hand height','src/emu-seat.ts','    const y = STOP.y + (over ? dy : lifted ? STOP.lift : 0);','    const y = STOP.y + (lifted ? STOP.lift : 0);'),
 # day-8 glue
 ('G15 the wake dwell gets a whole second per frame at the call site (instant wake)','src/cover-system.ts','this.lanternWake.update(this.local, this.joints.tracked, this.lantern, dt)','this.lanternWake.update(this.local, this.joints.tracked, this.lantern, 1)'),
 # the outside run's five day-7 glue survivors (judges_impl_d6/ORGANISER_MUTATIONS.md), at today's call sites
 ('X1 the main build draws the /emu/ paper mug over a real object (no occluder)','src/cover-system.ts','      if (__COVER_EMU__ && this.emulator) dressEmulatedMug(','      if (true) dressEmulatedMug(','dist'),
 ('X3 level 2 looks for the hand back at level 1\'s ghost spot','src/cover-system.ts','this.level.needsObject ? L2_LEFT : TEACH_SPOT','TEACH_SPOT'),
 ('X4 the next round ignores the hand (always the 10 s fallback)','src/cover-system.ts','nextRoundDue(time - this.homeAt, this.handBack)','nextRoundDue(time - this.homeAt, false)'),
 ('X5 the "again" card never cleared by the hand coming back','src/cover-system.ts','this.lineState === SHADOW && this.lineBy < OBJECT_OWNER, this.handBack);','this.lineState === SHADOW && this.lineBy < OBJECT_OWNER, false);'),
 # day-8 glue
 ('G16 level 2\'s climax light not applied (level 1\'s flare)','src/cover-system.ts','    if (this.l2Climax) this.fx.flare = l2WinFx(','    if (false) this.fx.flare = l2WinFx('),
 ('G17 level 2 plays the tutorial chime again','src/cover-system.ts','        if (this.l2Climax) lullaby();','        if (this.l2Climax) chime();'),
 ('G18 progress not saved after a win','src/cover-system.ts','        saveProgress({ wins: this.wins, unlocked: this.progress.unlocked });\n',''),
 ('G19 kept progress not restored at load','src/cover-system.ts','    else this.restoreProgress();','    else void 0;'),
 ('G20 the threat beat not passed to the cues','src/cover-system.ts','    i.intro = introActive(i.placed, this.everDashed, this.lastTime - this.placedAt);','    i.intro = false;'),
 ('G21 the trinket never flies to the mug','src/cover-system.ts','      if (this.l2Climax && this.l2fx.arc > 0 && this.objectCount > 0) {','      if (false) {'),
 ('G22 the page preview not staged (the creature in full light again)','src/cover-system.ts','    this.stagePreview();\n',''),
]
EMU=os.environ.get('COVER_EMU_BASE')
ONLY=sys.argv[1] if len(sys.argv)>1 else None  # 'unit' or 'outside'
PICK=sys.argv[2:]  # day 7: optional mutation ids to run (e.g. R1 R2 G10), so long glue runs can be split
def dist_stage():
    # day 8 (X1): the main build plus tools/check-dist.mjs (npm run build), for what only the main bundle shows
    b=subprocess.run(['npm','run','build'],cwd=ROOT,capture_output=True,text=True)
    fails=[l for l in (b.stdout+b.stderr).splitlines() if l.startswith('FAIL')]
    return f'dist: CAUGHT ({"; ".join(fails)[:200]})' if b.returncode else 'dist: survived'
def emu_stage():
    b=subprocess.run(['node','tools/build-emu.mjs'],cwd=ROOT,capture_output=True,text=True)
    if b.returncode: return 'emu build failed'
    r=subprocess.run(['node','tools/emu/wiring_check.mjs',EMU],cwd=ROOT,capture_output=True,text=True)
    m=re.search(r'"failed": \[(.*?)\]',r.stdout,re.S)
    failed=[x.strip().strip('"') for x in (m.group(1).split(',') if m else []) if x.strip()]
    return f'emu: CAUGHT (checks failing: {", ".join(failed)})' if r.returncode else 'emu: survived'

todo=[(m,False) for m in M]*(ONLY!='outside') + [(m,True) for m in OUT]*(ONLY!='unit')
if PICK: todo=[(m,o) for m,o in todo if m[0].split(' ')[0] in PICK]
for m, outside in todo:
    name, f, a, b = m[:4]
    stage = m[4] if len(m) > 4 else 'emu'
    p=f'{ROOT}/{f}'; src=open(p).read()
    assert src.count(a)==1, (name, src.count(a))
    open(p,'w').write(src.replace(a,b))
    try:
        r=subprocess.run(['npm','test'],cwd=ROOT,capture_output=True,text=True)
        out=r.stdout+r.stderr
        fails=re.findall(r'^✖ (.+?) \(\d', out, re.M)
        fails=[x for x in dict.fromkeys(fails) if not x.startswith('tests/')]
        line=f'{name}: exit {r.returncode}, {len(fails)} failing: ' + '; '.join(fails)
        if outside and r.returncode==0:
            line+=' | '+(dist_stage() if stage=='dist' else emu_stage() if EMU else 'emu: not run (set COVER_EMU_BASE)')
        print(line, flush=True)
    finally:
        open(p,'w').write(src)
