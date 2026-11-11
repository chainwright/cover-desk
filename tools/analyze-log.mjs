// Scores a tester's log from the headset.
//
//   node tools/analyze-log.mjs cover-tester-log-XXXX.json
//
// Per guided step: how often the hand was tracked, how often its pose matched
// what the step asked for, how often the pose class flipped, and how much the
// wrist moved while the tester tried to hold still. Then the sight-line
// events, the creature's runs, object registrations and the frame rate.
import { readFileSync } from 'node:fs';
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

const s = analyseLog(log);
console.log(`build ${log.build}, emulator ${s.emulator}, ${log.userAgent}`);
if (s.emulator) console.log('WARNING: this log comes from the Immersive Web Emulator, not a headset: its fps and tracking numbers mean nothing.');
console.log(`sessions ${s.sessions}, samples ${s.samples}`);
console.log('placement:', JSON.stringify(s.placement));
for (const x of log.sessions) if (x.calibration) console.log('calibration:', JSON.stringify(x.calibration));

console.log('\n| step | hand | samples | tracked | pose match | pose flips/min | wrist step mm (median) | wrist SD mm |');
console.log('|---|---|---|---|---|---|---|---|');
for (const l of s.labels) {
  const match = l.poseMatch == null ? '-' : `${(l.poseMatch * 100).toFixed(1)}%`;
  console.log(`| ${l.label} | ${l.hand ? 'R' : 'L'} | ${l.samples} | ${(l.tracked * 100).toFixed(1)}% | ${match} | ${l.poseFlipsPerMin} | ${l.wristStepMm} | ${l.wristSdMm} |`);
}
console.log('\nsight lines to the creature:', JSON.stringify(s.lines));
console.log('\n| step | seconds | line flips | flips/min |');
console.log('|---|---|---|---|');
for (const l of s.lineFlips) console.log(`| ${l.label} | ${l.seconds} | ${l.flips} | ${l.perMin} |`);
console.log('joint paths:', JSON.stringify(s.jointPaths));
console.log('creature:', JSON.stringify(s.creature));
console.log('registrations:', JSON.stringify(s.registrations));
console.log('fps:', JSON.stringify(s.fps));
