"""Mutation check (days 2-4): applies each mutation to the source, runs `npm test`,
restores the file, and prints which tests failed. Run: python3 tools/mutations.py
A mutation that no test catches is printed with 0 failing."""
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
 ('2a ghost needs !listening again (day-1 bug)','src/onboarding.ts','cues.ghost = i.placed && !i.everDashed;','cues.ghost = i.placed && !i.everDashed && !i.listening;'),
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
]
for name, f, a, b in M:
    p=f'{ROOT}/{f}'; src=open(p).read()
    assert src.count(a)==1, (name, src.count(a))
    open(p,'w').write(src.replace(a,b))
    try:
        r=subprocess.run(['npm','test'],cwd=ROOT,capture_output=True,text=True)
        out=r.stdout+r.stderr
        fails=re.findall(r'^✖ (.+?) \(\d', out, re.M)
        fails=[x for x in dict.fromkeys(fails) if not x.startswith('tests/')]
        print(f'{name}: exit {r.returncode}, {len(fails)} failing: ' + '; '.join(fails))
    finally:
        open(p,'w').write(src)
