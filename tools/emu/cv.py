"""Helpers for driving the Cover app in the IWSDK emulator (headless) through the CLI."""
import json, subprocess, time, math

def cli(*args, js=None, timeout=120):
    cmd = ['npx', 'iwsdk', *args] + (['--input-json', json.dumps(js)] if js is not None else [])
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
    try:
        d = json.loads(out)
    except Exception:
        raise SystemExit(f'CLI bad output: {args} {out[:400]}')
    if not d.get('ok', True):
        raise SystemExit(f'CLI failed: {args} {out[:600]}')
    return d['data'].get('result', d['data'])

def ev(body):
    with open('.tmp/_ev.mjs', 'w') as f:
        f.write('export default async function ({ frame, page }) { return await (frame ?? page).evaluate(() => { const f = window.__cover; return (%s); }); }' % body)
    return cli('browser', 'run', '.tmp/_ev.mjs')

def goto(search):
    with open('.tmp/_goto.mjs', 'w') as f:
        f.write("""export default async function ({ frame, page }) {
  const t = frame ?? page; const u = new URL(t.url()); u.search = %s;
  await t.goto(u.toString()); await t.waitForFunction(() => !!window.__cover, null, { timeout: 30000 });
  return t.url(); }""" % json.dumps(search))
    return cli('browser', 'run', '.tmp/_goto.mjs')

def state():
    return ev("{ placement: f.placement, listening: f.listening, creature: f.creature, line: f.line, hands: f.hands, objects: f.objects, lit: f.litFraction, info: f.placementInfo, anchor: f.anchorStatus, samples: f.logSamples() }")

results = []
def check(label, ok, detail=''):
    results.append((label, bool(ok)))
    print(('PASS' if ok else 'FAIL'), label, detail, flush=True)

def finish():
    failed = [r for r in results if not r[1]]
    print(f'{len(results) - len(failed)}/{len(results)} passed')
    return 1 if failed else 0
