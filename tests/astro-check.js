// Checks for astro.js. Run with: node tests/astro-check.js
'use strict';
const A = require('../astro.js');
const AE = require('../vendor/astronomy.browser.min.js');

let failures = 0;
const report = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '\n      ' + detail : ''}`);
};
const angDiff = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
const byName = res => Object.fromEntries(res.bodies.map(b => [b.name, b]));

// 1. Library loads and the calculation runs.
report(A.isLoaded(), 'bundled astronomy library loads');

// 2. Reference sky events (ecliptic longitude of date).
const events = [
  ['Vernal equinox 2024-03-20 03:06 UT: Sun ~0 deg', '2024-03-20T03:06:00Z', b => angDiff(b.Sun.lonDate, 0), 0.05],
  ['June solstice 2024-06-20 20:51 UT: Sun ~90 deg', '2024-06-20T20:51:00Z', b => angDiff(b.Sun.lonDate, 90), 0.05],
  ['New Moon 2024-01-11 11:57 UT: Moon ~ Sun', '2024-01-11T11:57:00Z', b => angDiff(b.Moon.lonDate, b.Sun.lonDate), 1],
  ['Full Moon 2024-02-24 12:30 UT: Moon ~ Sun + 180', '2024-02-24T12:30:00Z', b => Math.abs(angDiff(b.Moon.lonDate, b.Sun.lonDate) - 180), 1],
  ['Jupiter-Saturn conjunction 2020-12-21 18:20 UT: ~0.1 deg apart', '2020-12-21T18:20:00Z', b => angDiff(b.Jupiter.lonDate, b.Saturn.lonDate), 0.5]
];
for (const [label, iso, err, tol] of events) {
  const e = err(byName(A.computePositions(new Date(iso))));
  report(e <= tol, label, `error ${e.toFixed(3)} deg (tolerance ${tol})`);
}

// 3. Mode B: IAU constellation lookup on known stars (J2000 RA/Dec, degrees).
const stars = [
  ['Betelgeuse', 88.79, 7.41, 'Orion'], ['Polaris', 37.95, 89.26, 'Ursa Minor'],
  ['Vega', 279.23, 38.78, 'Lyra'], ['Rasalhague (alpha Oph)', 263.73, 12.56, 'Ophiuchus'],
  ['Antares', 247.35, -26.43, 'Scorpius'], ['Kaus Australis', 276.04, -34.38, 'Sagittarius']
];
for (const [n, ra, dec, want] of stars) {
  const got = A.mapModeB(ra, dec).constellation;
  report(got === want, `Mode B: ${n} is in ${want}`, `got ${got}`);
}

// 4. Each of the 13 zodiacal constellations maps to its node (catalogue stars inside each).
const zodiacStars = [
  ['Ari', 'Hamal', 31.79, 23.46, 'Aries'], ['Tau', 'Aldebaran', 68.98, 16.51, 'Taurus'],
  ['Gem', 'Pollux', 116.33, 28.03, 'Gemini'], ['Cnc', 'Acubens', 134.62, 11.86, 'Cancer'],
  ['Leo', 'Regulus', 152.09, 11.97, 'Leo'], ['Vir', 'Spica', 201.30, -11.16, 'Virgo'],
  ['Lib', 'Zubenelgenubi', 222.72, -16.04, 'Libra'], ['Sco', 'Antares', 247.35, -26.43, 'Scorpio'],
  ['Oph', 'Rasalhague', 263.73, 12.56, 'Ophiuchus'], ['Sgr', 'Kaus Australis', 276.04, -34.38, 'Sagittarius'],
  ['Cap', 'Deneb Algedi', 326.76, -16.13, 'Capricorn'], ['Aqr', 'Sadalsuud', 322.89, -5.57, 'Aquarius'],
  ['Psc', 'Alrescha', 30.51, 2.76, 'Pisces']
];
for (const [sym, star, ra, dec, node] of zodiacStars) {
  const m = A.mapModeB(ra, dec);
  report(m.node === A.SIGNS13.indexOf(node) && m.symbol === sym, `Mode B: ${star} (${sym}) -> node ${node}`, `got ${m.symbol} node ${m.sign}`);
}

// 5. Non-zodiacal constellations have no node (Mode B leaves them off the ring).
const orion = A.mapModeB(88.79, 7.41);
report(orion.node === -1, 'Mode B: a non-zodiacal constellation (Orion) has no node', `node ${orion.node}`);

// 6. Sun's constellation through 2024 versus the approximate IAU sun-date table.
const table = {
  Pisces: [3, 11], Aries: [4, 19], Taurus: [5, 14], Gemini: [6, 21], Cancer: [7, 20], Leo: [8, 10], Virgo: [9, 16],
  Libra: [10, 31], Scorpio: [11, 23], Ophiuchus: [11, 30], Sagittarius: [12, 18], Capricorn: [1, 19], Aquarius: [2, 16]
};
const seen = {};
let prev = null;
for (let t = Date.UTC(2024, 0, 1, 12); t < Date.UTC(2025, 0, 1); t += 86400000) {
  const d = new Date(t);
  const eq = AE.Equator(AE.Body.Sun, d, new AE.Observer(0, 0, 0), false, false);
  const c = A.mapModeB(eq.ra * 15, eq.dec).sign;
  if (c !== prev && A.SIGNS13.includes(c)) (seen[c] = seen[c] || []).push(new Date(t).toISOString().slice(0, 10));
  prev = c;
}
let worst = 0;
const rows = [];
for (const [name, [m, dd]] of Object.entries(table)) {
  const target = Date.UTC(2024, m - 1, dd);
  const hits = seen[name] || [];
  if (!hits.length) { rows.push(`${name}: not found in 2024`); worst = Infinity; continue; }
  // Compare with the nearest transition: Sagittarius also starts the year already inside it.
  const nearest = hits.reduce((a, b) => (Math.abs(Date.parse(b) - target) < Math.abs(Date.parse(a) - target) ? b : a));
  const first = nearest;
  const diff = Math.abs((Date.parse(first) - target) / 86400000);
  worst = Math.max(worst, diff);
  rows.push(`${name.padEnd(12)} table ${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}  real ${first}  (${diff} day(s))`);
}
// The table is approximate, so allow a few days. Anything larger means a boundary bug.
report(worst <= 3, 'Sun constellation dates in 2024 agree with IAU table within 3 days', rows.join('\n      '));

// 7. Mode A bands: 13 distinct, ascending, fractions in range.
const bands = A.MODE_A_BANDS;
const distinct = new Set(bands.map(b => b.name)).size;
report(bands.length === 13 && distinct === 13, 'Mode A: 13 distinct bands');
const sample = [0, 45, 100, 190, 250, 300, 359.9].map(l => A.mapModeA(l));
report(sample.every(m => m.frac >= 0 && m.frac < 1 && m.node >= 0), 'Mode A: sample longitudes map to a node with fraction in [0,1)');

// 8. Determinism: the same instant gives the same result (no randomness).
const d0 = new Date('2026-10-09T22:00:00Z');
const r1 = JSON.stringify(A.computePositions(d0).bodies);
const r2 = JSON.stringify(A.computePositions(d0).bodies);
report(r1 === r2, 'calculation is deterministic for a fixed time');

// 9. Failure path: invalid input throws instead of returning fake values.
let threw = false;
try { A.computePositions(new Date('not a date')); } catch (e) { threw = true; }
report(threw, 'invalid date throws (no silent fallback)');

// 10. Current positions, for the record.
const now = A.computePositions(new Date());
console.log(`\nNow (${now.utc}), ${now.library}`);
for (const b of now.bodies) {
  const mb = A.mapBody(b, 'B');
  const ma = A.mapBody(b, 'A');
  console.log(`  ${b.name.padEnd(8)} date ${b.lonDate.toFixed(2).padStart(7)}  J2000 ${b.lonJ2000.toFixed(2).padStart(7)}  ` +
    `B: ${mb.constellation.padEnd(12)} A: ${ma.sign}`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
