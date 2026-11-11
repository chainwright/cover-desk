"""Day-2 mutation check: applies each mutation to the source, runs `npm test`,
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
