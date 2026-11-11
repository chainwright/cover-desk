"""Cover day-2 emulator walkthrough (headless IWSDK emulator, home_office room).

Run from the project root with the managed dev server up:
    npx @iwsdk/cli dev up --headless --timeout 45000
    python3 tools/emu/walk_day2.py firstrun register teach coverloss lifted tester

Default hand mode (the invisible mask), like a real player; no ?test=1 for the
first-run phases. Helpers in tools/emu/cv.py write a scratch file to .tmp/.
"""
import sys, json, time, math, os
sys.path.insert(0, os.path.dirname(__file__))
from cv import cli, ev, goto, state, check, finish

HEAD = {'x': 0, 'y': 1.18, 'z': -1.48}
DESK_Y = 0.725
SHOTS = 'devlog'

def seat():
    cli('xr', 'set-transform', js={'device': 'headset', 'position': HEAD})
    cli('xr', 'look-at', js={'device': 'headset', 'target': {'x': 0, 'y': DESK_Y, 'z': HEAD['z'] - 0.45}})

def basis():
    b = ev("{ o: f.boardPoint(0,0,0), x: f.boardPoint(1,0,0), z: f.boardPoint(0,1,0), y: f.boardPoint(0,0,1) }")
    o = b['o']
    return {'o': o, 'ex': [b['x'][i]-o[i] for i in range(3)], 'ez': [b['z'][i]-o[i] for i in range(3)], 'ey': [b['y'][i]-o[i] for i in range(3)]}

def W(b, x, z, y):
    return {k: b['o'][i] + x*b['ex'][i] + z*b['ez'][i] + y*b['ey'][i] for i, k in enumerate('xyz')}

def D(b, dx, dz, dy):
    v = [dx*b['ex'][i] + dz*b['ez'][i] + dy*b['ey'][i] for i in range(3)]
    n = math.sqrt(sum(c*c for c in v))
    return {k: v[i]/n for i, k in enumerate('xyz')}

def hand(dev, pos, fingers, palm, anchor='wrist', dur=None):
    js = {'device': dev, 'position': pos, 'anchor': anchor, 'orientation': {'fingers': fingers, 'palm': palm}}
    if dur:
        js['duration'] = dur; js['easing'] = 'minimum-jerk'
        cli('xr', 'animate-to', js=js); time.sleep(dur + 0.25)
    else:
        cli('xr', 'set-transform', js=js); time.sleep(0.3)

def hands_away(b):
    hand('hand-left', W(b, -0.5, 0.25, 0.15), D(b, 0, -1, 0), D(b, 0, 0, -1))
    hand('hand-right', W(b, 0.5, 0.25, 0.15), D(b, 0, -1, 0), D(b, 0, 0, -1))

def stop_palm(b, x, z, dev='hand-right', dur=None):
    cli('xr', 'set-hand-pose', js={'device': dev, 'poseId': 'flat'})
    hand(dev, W(b, x, z, 0.02), D(b, 0, 0, 1), D(b, 0, -1, 0), dur=dur)

def shot(name):
    b = basis()
    cli('xr', 'set-transform', js={'device': 'headset', 'position': W(b, 0.0, 0.3, 0.3)})
    cli('xr', 'look-at', js={'device': 'headset', 'target': W(b, 0.0, -0.02, 0.0)})
    time.sleep(0.5)
    cli('browser', 'screenshot', '--output-file', f'{SHOTS}/{name}')
    print('  shot', name)
    seat()

def wait_for(cond, timeout, every=0.25):
    t0 = time.time(); s = None
    while time.time() - t0 < timeout:
        s = state()
        if cond(s): return s, time.time() - t0
        time.sleep(every)
    return s, None

def cues():
    return ev('f.cues')

for phase in sys.argv[1:]:
    print(f'--- {phase}', flush=True)
    if phase == 'firstrun':
        goto('?reset=1')  # what a cold player opens: default hands (mask), no tester mode
        cli('xr', 'enter', js={}); time.sleep(0.5)
        cli('xr', 'set-input-mode', js={'mode': 'hand'})
        seat(); time.sleep(3.5)
        b = basis(); hands_away(b); time.sleep(0.6)
        s = state(); c = cues()
        check('emulator build reports emulator: true', ev('f.emulator') is True)
        check('first run: board placed automatically on the detected desk, still listening for a tap (the auto-desk path)',
              s['placement'] == 'desk' and s['listening'], f"{s['placement']} listening={s['listening']} {json.dumps(s['info'])}")
        check('auto-desk path: plane label logged in the placement', 'planeLabel' in (s['info'] or {}), json.dumps(s['info']))
        check('auto-desk path: the ghost "stop" hand is visible', c['ghostVisible'], json.dumps(c))
        check("auto-desk path: the teaching prompt reads \"Hold your hand up in the light, like 'stop'\"",
              c['promptVisible'] and c['promptText'] == "Hold your hand up in the light, like 'stop'", c['promptText'])
        check('auto-desk path: "tap & hold to move" is on the knob, not in the prompt', c['knobLabel'] and 'move' not in c['promptText'], json.dumps(c))
        check('auto-desk path: object registration is allowed without a desk tap', c['canRegister'])
        shot('day2_01_first_run_ghost_prompt.png')

    elif phase == 'register':
        b = basis(); hands_away(b)
        ev('f.clearObjects()')
        cli('xr', 'set-hand-pose', js={'device': 'hand-right', 'poseId': 'point'})
        fing = D(b, 0, -0.5, -0.866); palm = D(b, 0, 0.866, -0.5)
        top = 0.09
        hand('hand-right', W(b, 0.06, -0.01, top + 0.008 + 0.06), fing, palm, anchor='index-tip')
        hand('hand-right', W(b, 0.06, -0.01, top + 0.008), fing, palm, anchor='index-tip', dur=0.3)
        time.sleep(1.4)
        s = state()
        hand('hand-right', W(b, 0.06, -0.01, top + 0.2), fing, palm, anchor='index-tip')
        o = s['objects'][-1] if s['objects'] else {}
        check('no desk tap first: a pointing hold 9 cm up beside the path registers a real object on the auto-desk board',
              len(s['objects']) == 1 and abs(o.get('top', 0) - top) < 0.003 and s['placement'] == 'desk', json.dumps(s['objects']) + ' ' + s['placement'])
        ev('f.clearObjects()'); hands_away(b)

    elif phase == 'teach':
        b = basis(); hands_away(b)
        ev('f.restart()'); time.sleep(1.0)
        check('before the first shadow: ghost still visible', cues()['ghostVisible'])
        stop_palm(b, -0.035, -0.06)
        s, took = wait_for(lambda s: s['creature']['s'] > 0.08, 5, 0.2)
        c = cues()
        check("following the prompt: a 'stop' palm near the lantern and the creature dashes into its shadow", took is not None, json.dumps(s['creature']))
        check('after the first shadow: the ghost, the teaching prompt and the knob label go away',
              not c['ghostVisible'] and not c['promptVisible'] and not c['knobLabel'], json.dumps(c))
        hands_away(b)

    elif phase == 'coverloss':
        b = basis(); hands_away(b)
        ev('f.restart()'); time.sleep(1.2)
        stop_palm(b, -0.03, -0.06)
        s, took = wait_for(lambda s: s['creature']['mode'] == 'wait' and s['creature']['s'] > 0.09, 5, 0.15)
        check('setup: the creature waits in the right palm\'s shadow, the left hand rests in view', took is not None and s['hands'][0]['tracked'], json.dumps(s['creature']))
        before = s['creature']
        cli('xr', 'set-connected', js={'device': 'hand-right', 'connected': False}); time.sleep(1.0)
        s = state()
        check('the covering (right) hand is lost, the left is still tracked: the creature waits, not spotted',
              s['creature']['mode'] == 'paused' and s['hands'][0]['tracked'] and not s['hands'][1]['tracked'] and s['creature']['spotted'] == before['spotted'] and ev('f.coverWaitingFor') == 1,
              json.dumps(s['creature']) + f" waitingFor={ev('f.coverWaitingFor')}")
        c = cues()
        check('the pause card shows "It waits for your hand."', c['promptText'].startswith('It waits for your hand'), c['promptText'])
        shot('day2_02_cover_hand_lost_waits.png')
        s1 = state()['creature']; time.sleep(1.5); s2 = state()['creature']
        check('while waiting nothing moves and nothing is judged', s1['s'] == s2['s'] and s2['spotted'] == before['spotted'], f'{s1} -> {s2}')
        cli('xr', 'set-connected', js={'device': 'hand-right', 'connected': True}); time.sleep(0.2)
        b = basis(); stop_palm(b, -0.03, -0.06); time.sleep(1.2)
        s3 = state()['creature']
        check('the hand is back over the light: play resumes, still not spotted', s3['mode'] != 'paused' and s3['spotted'] == before['spotted'], json.dumps(s3))
        hands_away(b)

    elif phase == 'lifted':
        b = basis(); hands_away(b)
        ev('f.restart()'); time.sleep(1.2)
        stop_palm(b, -0.03, -0.06)
        s, took = wait_for(lambda s: s['creature']['mode'] == 'wait' and s['creature']['s'] > 0.09, 5, 0.15)
        before = s['creature']['spotted']
        hands_away(b)  # lifted away, still tracked
        s, took = wait_for(lambda s: s['creature']['spotted'] > before, 2.5, 0.1)
        check('control: the covering hand lifted away but still tracked: spotted (rule unchanged)', took is not None and ev('f.coverWaitingFor') == -1, json.dumps(s['creature']))

    elif phase == 'tester':
        goto('?test=1&guide=0&reset=1')
        cli('xr', 'enter', js={}); time.sleep(0.5)
        cli('xr', 'set-input-mode', js={'mode': 'hand'})
        seat(); time.sleep(3.5)
        b = basis(); hands_away(b)
        stop_palm(b, -0.03, -0.06)
        time.sleep(6.0)
        log = json.loads(ev('f.exportLog()'))
        open('devlog/day2_emulator_log.json', 'w').write(json.dumps(log))
        sess = log['sessions'][-1]
        ev_types = {e['type'] for e in sess['events']}
        fps = [e for e in sess['events'] if e['type'] == 'fps']
        found = [e for e in sess['events'] if e['type'] == 'hand-found']
        check('log v2 with emulator: true in the emulator build', log['version'] == 2 and log['emulator'] is True and sess['emulator'] is True)
        check('samples carry the index-tip xyz columns', sess['columns'][-3:] == ['ix', 'iy', 'iz'] and len(sess['samples'][-1]) == 12, str(sess['samples'][-1]))
        check('session event with the display frame rate', 'session' in ev_types, json.dumps([e for e in sess['events'] if e['type'] == 'session']))
        check('fps events carry update() p95, dropped frames, frame rate and panel redraws',
              fps and all(k in fps[-1] for k in ('updP95Ms', 'drops', 'frameRate', 'redraws')), json.dumps(fps[-1] if fps else None))
        check('tester panel redraws at most twice a second', fps and max(e['redraws'] for e in fps) <= 2, str([e['redraws'] for e in fps]))
        check('hand-found events name the joint path and radius source', found and all('path' in e and 'radii' in e for e in found), json.dumps(found[:2]))
        check('placement carries the chosen plane label', 'planeLabel' in (sess['placement'] or {}), json.dumps(sess['placement']))
        summ = ev('f.summary()')
        print('  summary.fps', json.dumps(summ['fps']), 'lineFlips', json.dumps(summ['lineFlips']))
        shot('day2_03_tester_panel_512px.png')

sys.exit(finish())
