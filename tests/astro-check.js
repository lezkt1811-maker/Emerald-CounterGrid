// Spot-check astro.js against well-known sky events. Run with: node tests/astro-check.js
'use strict';
const A = require('../astro.js');

const angDiff = (a, b) => {
  const d = Math.abs(((a - b) % 360 + 540) % 360 - 180);
  return d;
};

// [label, UTC date, check function returning {value, expect, tol}]
const cases = [
  ['Vernal equinox 2024-03-20 03:06 UT (Sun ~0 deg)', '2024-03-20T03:06:00Z',
    b => ({ value: angDiff(b.Sun, 0), tol: 0.1 })],
  ['June solstice 2024-06-20 20:51 UT (Sun ~90 deg)', '2024-06-20T20:51:00Z',
    b => ({ value: angDiff(b.Sun, 90), tol: 0.1 })],
  ['J2000 noon 2000-01-01 12:00 UT (Sun ~280.4 deg)', '2000-01-01T12:00:00Z',
    b => ({ value: angDiff(b.Sun, 280.37), tol: 0.1 })],
  ['New Moon 2024-01-11 11:57 UT (Moon ~ Sun)', '2024-01-11T11:57:00Z',
    b => ({ value: angDiff(b.Moon, b.Sun), tol: 1.0 })],
  ['Full Moon 2024-02-24 12:30 UT (Moon ~ Sun + 180)', '2024-02-24T12:30:00Z',
    b => ({ value: angDiff(b.Moon, b.Sun), tol: 1.0, expectSep: 180 })],
  ['Jupiter-Saturn conjunction 2020-12-21 18:20 UT (separation ~0.1 deg)', '2020-12-21T18:20:00Z',
    b => ({ value: angDiff(b.Jupiter, b.Saturn), tol: 0.5 })]
];

let failures = 0;
for (const [label, iso, check] of cases) {
  const res = A.computePositions(new Date(iso));
  const b = {};
  res.bodies.forEach(p => { b[p.name] = p.lonDate; });
  const c = check(b);
  const target = c.expectSep !== undefined ? c.expectSep : 0;
  const err = c.expectSep !== undefined ? angDiff(c.value, c.expectSep) : c.value;
  const ok = err <= c.tol;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n      error = ${err.toFixed(3)} deg (tolerance ${c.tol})`);
}

// Sign mapping sanity: every boundary sorted, 13 distinct signs, fractions in [0,1).
const ok13 = A.BOUNDARIES.length === 13 && new Set(A.BOUNDARIES.map(x => x.name)).size === 13;
console.log(`${ok13 ? 'PASS' : 'FAIL'}  13 distinct IAU sun-date boundaries`);
if (!ok13) failures++;
console.log('\nBoundaries (J2000 ecliptic longitude, deg):');
A.BOUNDARIES.forEach(x => console.log(`  ${x.name.padEnd(12)} ${x.lon.toFixed(2)}`));

const sample = A.computePositions(new Date());
console.log(`\nNow (${sample.utc}):`);
sample.bodies.forEach(p => {
  const m = A.mapTo13(p.lonJ2000);
  console.log(`  ${p.name.padEnd(8)} date ${p.lonDate.toFixed(2).padStart(7)}  J2000 ${p.lonJ2000.toFixed(2).padStart(7)}  13-sign ${m.sign} (${(m.frac * 100).toFixed(0)}%)`);
});

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
