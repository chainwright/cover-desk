// Threshold sweep for touch versus hover, under a stated noise model.
//
//   node tools/sweep-thresholds.mjs [--out devlog/day2_threshold_sweep.json]
//
// Runs the app's own contact rule (src/contact.ts) over simulated fingertip
// tracks and reports, per threshold set, how often a touch is missed and how
// often a hover counts as a touch. The model (all in mm, per trial of 1.5 s at
// 72 Hz) is an assumption to be replaced by real Quest logs:
//   - height bias per trial  N(0, 3)   calibration residual + slow drift
//     (the desk height is measured with the same fingertip, so a constant
//     tip-to-pad offset cancels; what is left is drift and re-tracking)
//   - height jitter per frame AR(1), sd 2.5, correlation 0.8
//   - across-rod bias N(0, 5) + jitter sd 2.5; aim error N(0, 6)
//   - "touch a bead top" without haptics: N(-3, 6) around the bead top
//     (people tend to press slightly into a virtual surface), never below the desk
//   - "hold 2 cm above": N(20, 4) above the bead top
import { writeFileSync } from 'node:fs';
import { CONTACT, SURFACE, TIP_PAD, contactRod } from '../src/contact.ts';
import { ROD_SPACING, rodX } from '../src/soroban-layout.ts';

const FPS = 72;
const TRIAL_S = 1.5;
const TRIALS = 600;
const SETTLE_S = 0.2; // ignore the first frames of each trial

function rng(seed) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
}

const mm = (v) => v / 1000;
const INTENTS = {
  'slide-desk': { touch: true, y: () => TIP_PAD },
  'touch-top': { touch: true, y: (n) => Math.max(TIP_PAD, SURFACE + mm(-3 + 6 * n())) },
  'hover-2cm': { touch: false, y: (n) => SURFACE + mm(20 + 4 * n()) },
  'hover-3cm': { touch: false, y: (n) => SURFACE + mm(30 + 4 * n()) },
  'hover-5cm': { touch: false, y: (n) => SURFACE + mm(50 + 6 * n()) },
};

/** Simulates all intents for one threshold set with a fixed seed (common random numbers). */
function evaluate(p) {
  const out = {};
  for (const [name, intent] of Object.entries(INTENTS)) {
    const n = rng(1234 + name.length * 7919);
    let frames = 0, wrongFrames = 0, trialsWithFalse = 0, dropouts = 0, wrongRodTrials = 0;
    for (let trial = 0; trial < TRIALS; trial++) {
      const rod = 2;
      const yTrue = intent.y(n);
      const yBias = mm(3 * n());
      const xAim = rodX(rod) + mm(6 * n()) + mm(5 * n());
      let jy = 0, jx = 0, prev = -1, hadContact = false, falseHere = false, wrongHere = false;
      const steps = Math.round(TRIAL_S * FPS);
      for (let s = 0; s < steps; s++) {
        jy = 0.8 * jy + Math.sqrt(1 - 0.64) * mm(2.5 * n());
        jx = 0.8 * jx + Math.sqrt(1 - 0.64) * mm(2.5 * n());
        const r = contactRod(xAim + jx, yTrue + yBias + jy, prev, p);
        if (s / FPS >= SETTLE_S) {
          frames++;
          const ok = intent.touch ? r === rod : r < 0;
          if (!ok) wrongFrames++;
          if (!intent.touch && r >= 0) falseHere = true;
          if (r >= 0 && r !== rod) wrongHere = true;
          if (intent.touch && prev === rod && r !== rod && hadContact) dropouts++;
        }
        if (r === rod) hadContact = true;
        prev = r;
      }
      if (falseHere) trialsWithFalse++;
      if (wrongHere) wrongRodTrials++;
    }
    out[name] = {
      frameError: wrongFrames / frames,
      falseTrials: trialsWithFalse / TRIALS,
      dropoutsPerTrial: dropouts / TRIALS,
      wrongRodTrials: wrongRodTrials / TRIALS,
    };
  }
  return out;
}

const grid = [];
for (const enter of [0, 2, 4, 6, 8, 10, 12]) {
  for (const gap of [0, 4, 8, 12]) {
    for (const band of [19, 21, 23, 25]) {
      const p = { enter: mm(enter), exit: mm(enter + gap), floor: -0.03, band: mm(band), bandHold: mm(band + 4) };
      const r = evaluate(p);
      // Selection rule: a hover 2 cm above the beads may count as a touch in at most
      // 3% of trials (half of a 5% budget, kept as margin because the noise model is
      // a guess), 3 cm in at most 1%; among those, minimise missed-touch frames
      // (desk slide + bead top) plus drop-outs.
      const ok = r['hover-2cm'].falseTrials <= 0.03 && r['hover-3cm'].falseTrials <= 0.01;
      const cost =
        r['slide-desk'].frameError + r['touch-top'].frameError +
        0.05 * (r['slide-desk'].dropoutsPerTrial + r['touch-top'].dropoutsPerTrial) +
        r['slide-desk'].wrongRodTrials;
      grid.push({ enterMm: enter, exitMm: enter + gap, bandMm: band, ok, cost, r });
    }
  }
}

const pct = (v) => (v * 100).toFixed(1).padStart(5) + '%';
const row = (g) =>
  `| ${g.enterMm} | ${g.exitMm} | ${g.bandMm} | ${pct(g.r['touch-top'].frameError)} | ${pct(g.r['slide-desk'].frameError)} | ` +
  `${g.r['touch-top'].dropoutsPerTrial.toFixed(2)} | ${pct(g.r['hover-2cm'].falseTrials)} | ${pct(g.r['hover-3cm'].falseTrials)} | ` +
  `${pct(g.r['hover-5cm'].falseTrials)} | ${pct(g.r['slide-desk'].wrongRodTrials)} |${g.ok ? '' : ' fails hover limit'}`;

const ranked = grid.filter((g) => g.ok).sort((a, b) => a.cost - b.cost);
const find = (e, x, b) => grid.find((g) => g.enterMm === e && g.exitMm === x && g.bandMm === b);
const day1 = find(4, 4, 23); // day 1: enter = exit = +4 mm, band 23 mm
const current = find(Math.round(CONTACT.enter * 1000), Math.round(CONTACT.exit * 1000), Math.round(CONTACT.band * 1000));

console.log('| enter mm | exit mm | band mm | top: missed frames | desk: missed frames | top: drop-outs/trial | hover 2 cm: false trials | 3 cm | 5 cm | wrong rod |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
console.log(row(day1) + '  ← day 1');
if (current && current !== day1) console.log(row(current) + '  ← in src/contact.ts');
for (const g of ranked.slice(0, 8)) console.log(row(g));
console.log(`\nbest: enter ${ranked[0].enterMm} mm, exit ${ranked[0].exitMm} mm, band ${ranked[0].bandMm} mm`);
console.log(`rod spacing ${ROD_SPACING * 1000} mm, surface ${(SURFACE * 1000).toFixed(1)} mm above the desk`);

const outIdx = process.argv.indexOf('--out');
if (outIdx > 0) {
  writeFileSync(process.argv[outIdx + 1], JSON.stringify({ model: 'see tools/sweep-thresholds.mjs header', trials: TRIALS, best: ranked[0], day1, current, grid }, null, 1));
}
