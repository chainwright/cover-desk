"""Mutation check (days 2-5): applies each mutation to the source, runs `npm test`,
restores the file, and prints which tests failed. Run: python3 tools/mutations.py
A mutation that no test catches is printed with 0 failing.

Day 5: the ten "outside" mutations (O13-O22) an outside run made on day-4 glue
code are recreated at today's call sites. Glue that no unit test can reach
gets a second stage when COVER_EMU_BASE is set (a server serving dist/, e.g.
http://127.0.0.1:8799/): the emulator build is rebuilt with the mutation and
tools/emu/wiring_check.mjs is run against it; a failing check catches it.
Rebuild dist/ afterwards (npm run build)."""
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
 ('2a ghost needs !listening again (day-1 bug)','src/onboarding.ts','cues.ghost = i.placed && (!i.everDashed || !!i.again);','cues.ghost = i.placed && (!i.everDashed || !!i.again) && !i.listening;'),
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
 ('3d teaching copy back to day 2','src/onboarding.ts',"""teach: ["Stand your hand like 'stop'", '!between the lantern and the path'],""","""teach: ['Hold your hand up in the light,', "!like 'stop'"],"""),
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
 ('6i ghost not back after a win','src/onboarding.ts','cues.ghost = i.placed && (!i.everDashed || !!i.again);','cues.ghost = i.placed && !i.everDashed;'),
 ('6j "again" cleared while the creature is still at home','src/feedback.ts','if (this.again && mode !== MODE_HOME && handBackAtStart)','if (this.again && handBackAtStart)'),
 ('6k no win hop','src/feedback.ts','    out.hop = f.hop * k * Math.sin((Math.PI * (t % f.hopS)) / f.hopS);','    out.hop = 0;'),
 ('6l eyes stay shut when a hand is at the lantern','src/feedback.ts','out.eyes = spotted || awake ? EYES_OPEN : 1;','out.eyes = spotted ? EYES_OPEN : 1;'),
 ('6m a lifted hand counts as back at the start','src/feedback.ts','if (j[1] <= RETURN_MAX_Y && Math.hypot','if (Math.hypot'),
 ('6n analyser counts every second as in view','src/touch-log.ts','if (e.inView) inView.push(Number(e.fps));','inView.push(Number(e.fps));'),
]
# The outside run's ten day-4 glue mutations, recreated at today's call sites
# (marked 'emu': if no unit test catches them, the emulator wiring check is tried).
OUT=[
 ('O13 /emu/ hand turned -90 deg (fingertips down)','src/emu-seat.ts','const quaternion = mul(rotY(-yaw), rotX(Math.PI / 2));','const quaternion = mul(rotY(-yaw), rotX(-Math.PI / 2));'),
 ('O14 /emu/ grip-to-wrist offset ignored','src/emu-seat.ts','boardPoint(x - GRIP_TO_WRIST.x, z - GRIP_TO_WRIST.z, y - GRIP_TO_WRIST.y)','boardPoint(x, z, y)'),
 ('O15 frame-loop log flush call removed (cover-system)','src/cover-system.ts','    this.logKeeper?.frame(time);\n',''),
 ('O16 page-hide flush wiring removed (index.ts)','src/index.ts','  flushOnPageHide(window, document, () => void cover()?.flushLog());\n',''),
 ('O17 win chime not played','src/cover-system.ts','        lock();\n        chime();\n','        lock();\n'),
 ('O18 bead row not updated','src/cover-system.ts','    m.winBeads.count = pay.beads;\n',''),
 ('O19 trinket not carried after a win','src/cover-system.ts','    if (pay.trinketOnBack) {','    if (false) {'),
 ('O20 keeper eyes never open','src/cover-system.ts','    this.eyeOpen += (pay.eyes - this.eyeOpen) * Math.min(1, dt * 20);','    this.eyeOpen += (1 - this.eyeOpen) * Math.min(1, dt * 20);'),
 ('O21 stare line never shown','src/cover-system.ts','    m.beam.visible = pay.stare;','    m.beam.visible = false;'),
 ('O22 slide-card latch removed at the call site','src/cover-system.ts','this.round.frame(this.creature.mode, this.lineState === SHADOW && this.lineBy < OBJECT_OWNER,','this.round.frame(this.creature.mode, false,'),
]
EMU=os.environ.get('COVER_EMU_BASE')
ONLY=sys.argv[1] if len(sys.argv)>1 else None  # 'unit' or 'outside'
def emu_stage():
    b=subprocess.run(['node','tools/build-emu.mjs'],cwd=ROOT,capture_output=True,text=True)
    if b.returncode: return 'emu build failed'
    r=subprocess.run(['node','tools/emu/wiring_check.mjs',EMU],cwd=ROOT,capture_output=True,text=True)
    m=re.search(r'"failed": \[(.*?)\]',r.stdout,re.S)
    failed=[x.strip().strip('"') for x in (m.group(1).split(',') if m else []) if x.strip()]
    return f'emu: CAUGHT (checks failing: {", ".join(failed)})' if r.returncode else 'emu: survived'

todo=[(m,False) for m in M]*(ONLY!='outside') + [(m,True) for m in OUT]*(ONLY!='unit')
for (name, f, a, b), outside in todo:
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
            line+=' | '+(emu_stage() if EMU else 'emu: not run (set COVER_EMU_BASE)')
        print(line, flush=True)
    finally:
        open(p,'w').write(src)
