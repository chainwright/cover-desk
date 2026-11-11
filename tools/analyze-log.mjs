// Scores a tester's touch log and re-runs the contact rule with other thresholds.
//
//   node tools/analyze-log.mjs fade-touch-log-XXXX.json
//
// Prints, per guided step, how often the contact result disagreed with what
// the tester was asked to do, the fingertip heights seen, and then the same
// scores for a small grid of enter/exit heights, so thresholds can be picked
// from real headset data instead of the simulated model.
import { readFileSync } from 'node:fs';
import { CONTACT } from '../src/contact.ts';
import { LOG_FORMAT, analyseLog } from '../src/touch-log.ts';

const path = process.argv[2];
if (!path) {
  console.error('usage: node tools/analyze-log.mjs <log.json>');
  process.exit(2);
}
const log = JSON.parse(readFileSync(path, 'utf8'));
if (log.format !== LOG_FORMAT) {
  console.error(`not a ${LOG_FORMAT} file`);
  process.exit(2);
}

const base = analyseLog(log);
console.log(`sessions ${base.sessions}, samples ${base.samples}, bead value changes ${base.valueChanges}`);
console.log('placement:', JSON.stringify(base.placement));
for (const s of log.sessions) if (s.calibration) console.log('calibration:', JSON.stringify(s.calibration));
console.log('\n| step | samples | error rate | bad events | height p10/p50/p90 mm |');
console.log('|---|---|---|---|---|');
for (const l of base.labels) {
  console.log(`| ${l.label} | ${l.samples} | ${(l.errorRate * 100).toFixed(1)}% | ${l.badEvents} | ${l.heightMm.join(' / ')} |`);
}

const rest = log.sessions.flatMap((s) => s.events.filter((e) => e.type === 'rest-value'));
if (rest.length) {
  const agree = rest.filter((e) => e.to === e.physics).length;
  console.log(`\nrest reader vs bead physics: ${agree}/${rest.length} strokes agree`);
}

console.log('\nthreshold grid (error rate per step):');
const steps = base.labels.map((l) => l.label);
console.log(`| enter | exit | ${steps.join(' | ')} |`);
console.log(`|---|---|${steps.map(() => '---').join('|')}|`);
for (const enter of [0, 2, 4, 6, 8, 10]) {
  for (const gap of [0, 8, 12, 16]) {
    const p = { ...CONTACT, enter: enter / 1000, exit: (enter + gap) / 1000 };
    const a = analyseLog(log, p);
    const cells = steps.map((s) => {
      const l = a.labels.find((x) => x.label === s);
      return l ? `${(l.errorRate * 100).toFixed(1)}%` : '-';
    });
    const mark = Math.abs(p.enter - CONTACT.enter) < 1e-9 && Math.abs(p.exit - CONTACT.exit) < 1e-9 ? ' ← current' : '';
    console.log(`| ${enter} | ${enter + gap} | ${cells.join(' | ')} |${mark}`);
  }
}
