// Checks for events.js against synthetic states and real sky data. Run: node tests/events-check.js
'use strict';
const A = require('../astro.js');
const E = require('../events.js');

let failures = 0;
const report = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '\n      ' + detail : ''}`);
};
const DAY = 86400000;

// Build the engine's state for one instant, using the same mapping the portal uses.
function stateAt(ms, mode) {
  const res = A.computePositions(new Date(ms));
  const bodies = res.bodies.map(b => {
    const m = A.mapBody(b, mode);
    return { name: b.name, raDeg: b.raDeg, decDeg: b.decDeg, constellationSymbol: b.constellationSymbol,
      constellation: b.constellation, node: m.node, sign: m.sign };
  });
  return E.buildState(bodies);
}

// --- 1. Synthetic: transitions only, first call silent, cooldown, mode reset ---
{
  const eng = E.createEngine([E.DEFAULT_EVENTS[0]]); // Moon enters Oph
  const base = Date.UTC(2026, 0, 1);
  const st = (sym, sign) => E.buildState([{ name: 'Moon', raDeg: 250, decDeg: -20, constellationSymbol: sym,
    constellation: sym === 'Oph' ? 'Ophiuchus' : 'Sagittarius', node: sym === 'Oph' ? 8 : 9, sign: sign || 'x' }]);
  report(eng.update(st('Sgr'), base, 'A').length === 0, 'first update records state and fires nothing');
  const e1 = eng.update(st('Oph'), base + 3600e3, 'A');
  report(e1.length === 1 && e1[0].id === 'moon-ophiuchus', 'Moon entering Ophiuchus fires once', JSON.stringify(e1.map(e => e.title)));
  report(eng.update(st('Oph'), base + 7200e3, 'A').length === 0, 'staying inside Ophiuchus does not re-fire');
  // Cooldown counts from the last firing (base+1h). Leave and re-enter 10 minutes later: suppressed.
  eng.update(st('Sgr'), base + 1.1 * 3600e3, 'A');
  report(eng.update(st('Oph'), base + 1.2 * 3600e3, 'A').length === 0, 're-entry within 15 minutes of the last firing is suppressed');
  // Leave and re-enter after the cooldown: fires again.
  eng.update(st('Sgr'), base + 3 * 3600e3, 'A');
  report(eng.update(st('Oph'), base + 4 * 3600e3, 'A').length === 1, 're-entry after the cooldown fires again');
  eng.update(st('Sgr'), base + 5 * 3600e3, 'A');
  report(eng.update(st('Oph'), base + 6 * 3600e3, 'B').length === 0, 'changing mapping mode resets the engine (no spurious events)');
}

// --- 1b. Clock moving backwards (e.g. a date is set earlier) is not mistaken for a repeat ---
{
  const eng = E.createEngine([E.DEFAULT_EVENTS[0]]);
  const base = Date.UTC(2026, 0, 1);
  const st = sym => E.buildState([{ name: 'Moon', raDeg: 250, decDeg: -20, constellationSymbol: sym,
    constellation: sym === 'Oph' ? 'Ophiuchus' : 'Sagittarius', node: sym === 'Oph' ? 8 : 9, sign: 'x' }]);
  eng.update(st('Sgr'), base + 10 * 86400e3, 'A');
  const late = eng.update(st('Oph'), base + 10 * 86400e3 + 60e3, 'A'); // fires at day 10
  eng.update(st('Sgr'), base + 20 * 86400e3, 'A');
  const early = eng.update(st('Oph'), base + 5 * 86400e3, 'A');     // clock jumps back to day 5
  report(late.length === 1 && early.length === 1, 'a backwards clock jump does not suppress a real transition', `${late.length} then ${early.length}`);
}

// --- 2. Angular separation sanity ---
{
  const sep = E.angularSeparation(0, 0, 90, 0);
  report(Math.abs(sep - 90) < 1e-9, 'angular separation: 90° along the equator', `got ${sep}`);
  const pole = E.angularSeparation(0, 90, 180, 90);
  report(Math.abs(pole) < 1e-9, 'angular separation: both at the pole are 0°', `got ${pole}`);
}

// --- 3. Real sky: Jupiter-Saturn conjunction of 2020 fires once, in the right window ---
{
  const eng = E.createEngine(E.DEFAULT_EVENTS);
  const fires = [];
  for (let t = Date.UTC(2020, 5, 1); t <= Date.UTC(2021, 3, 1); t += DAY) {
    const evs = eng.update(stateAt(t, 'B'), t, 'B');
    evs.filter(e => e.id === 'jupiter-saturn-conjunction').forEach(e => fires.push(e.utc));
  }
  report(fires.length === 1, 'Jupiter–Saturn (within 6°) fires exactly once across Jun 2020–Apr 2021', fires.join(', '));
  const when = fires[0] ? Date.parse(fires[0]) : 0;
  report(when >= Date.UTC(2020, 9, 1) && when <= Date.UTC(2020, 11, 31), 'the firing date falls in the 2020 conjunction window (Oct–Dec)', fires[0]);
}

// --- 4. Real sky: Moon entering Ophiuchus, engine vs independent transition count (2026, 6-hour steps) ---
{
  const eng = E.createEngine(E.DEFAULT_EVENTS);
  const step = 6 * 3600e3;
  let independent = 0, prevSym = null, engineHits = [];
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += step) {
    const s = stateAt(t, 'B');
    const sym = s.Moon.constSymbol;
    if (prevSym !== null && sym === 'Oph' && prevSym !== 'Oph') independent++;
    prevSym = sym;
    eng.update(s, t, 'B').filter(e => e.id === 'moon-ophiuchus').forEach(e => engineHits.push(e.utc));
  }
  report(engineHits.length === independent, `Moon-enters-Ophiuchus events (2026) match the independent count`,
    `engine ${engineHits.length}, independent ${independent}`);
  report(independent > 0, 'the Moon does enter Ophiuchus during 2026 (so the check is not vacuous)', `${independent} entries`);
}

// --- 5. Real sky: Sun-Moon conjunction within 8° fires about once per lunation (2026) ---
{
  const eng = E.createEngine(E.DEFAULT_EVENTS);
  let n = 0;
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 6 * 3600e3) {
    n += eng.update(stateAt(t, 'B'), t, 'B').filter(e => e.id === 'sun-moon-conjunction').length;
  }
  report(n >= 11 && n <= 13, 'Sun–Moon conjunction (within 8°) fires about 12 times in 2026', `count ${n}`);
}

// --- 6. Real sky: sign-boundary crossings (Mode A) match an independent count ---
{
  const eng = E.createEngine(E.DEFAULT_EVENTS);
  const step = 6 * 3600e3;
  let independent = 0, prevSign = null, hits = 0;
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2026, 3, 1); t += step) {
    const s = stateAt(t, 'A');
    const sign = s.Moon.sign;
    if (prevSign !== null && sign !== prevSign) independent++;
    prevSign = sign;
    hits += eng.update(s, t, 'A').filter(e => e.id === 'sign-crossing' && e.names[0] === 'Moon').length;
  }
  report(hits === independent && independent > 0, 'Moon sign-boundary crossings (Mode A, Jan–Mar 2026) match the independent count',
    `engine ${hits}, independent ${independent}`);
}

// --- 7. Information only: gathering events over 2026 (no pass/fail on count) ---
{
  const eng = E.createEngine(E.DEFAULT_EVENTS);
  let g = 0;
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 6 * 3600e3) {
    g += eng.update(stateAt(t, 'B'), t, 'B').filter(e => e.id === 'gathering').length;
  }
  console.log(`INFO  gathering (3+ planets within 30°) events in 2026: ${g}`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll event checks passed');
process.exit(failures ? 1 : 0);
