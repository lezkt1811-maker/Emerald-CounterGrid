/*
 * THE LIVING PORTAL - local planetary positions (no network, no dependencies).
 *
 * Method
 *  - Sun, Moon, Mercury..Neptune: Paul Schlyter's low-precision orbital-element
 *    formulas (stjarnhimlen.se), with a short list of lunar perturbation terms.
 *  - Pluto: Standish (JPL) mean J2000 elements, linear century rates. Pluto is the
 *    least accurate body here (roughly 1-2 degrees over a century either side).
 *  - Output: geocentric ecliptic longitude, in two frames:
 *      lonDate    - ecliptic of date (tropical zodiac longitude)
 *      lonJ2000   - ecliptic of J2000 (the frame the IAU sun-date boundaries use)
 *
 * This is an approximation, not a NASA/JPL ephemeris. It is intended for a
 * visual portal, and every result carries an `approx` flag and a method label.
 */
(function (global) {
  'use strict';

  var RAD = Math.PI / 180;
  var DEG = 180 / Math.PI;

  // 13 positions in ecliptic order, starting at Aries. Index = node index on the ring.
  var SIGNS13 = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra',
    'Scorpio', 'Ophiuchus', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

  // Tropical 12-sign reference frame (30 degrees each, starting at 0 Aries of date).
  var TROPICAL12 = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra',
    'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

  // Sun-entry dates from the IAU/ecliptic constellation table (start of each band).
  // Boundaries are converted to ecliptic longitude once, at load time.
  var IAU_SUN_DATES = [
    ['Pisces', 3, 11], ['Aries', 4, 19], ['Taurus', 5, 14], ['Gemini', 6, 21],
    ['Cancer', 7, 20], ['Leo', 8, 10], ['Virgo', 9, 16], ['Libra', 10, 31],
    ['Scorpio', 11, 23], ['Ophiuchus', 11, 30], ['Sagittarius', 12, 18],
    ['Capricorn', 1, 19], ['Aquarius', 2, 16]
  ];

  function norm360(x) {
    var y = x % 360;
    return y < 0 ? y + 360 : y;
  }

  function julianDate(date) {
    return date.getTime() / 86400000 + 2440587.5;
  }

  // Kepler's equation, M in degrees, returns E in radians.
  function solveKepler(Mdeg, e) {
    var M = Mdeg * RAD;
    var E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
    for (var k = 0; k < 12; k++) {
      var dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-10) break;
    }
    return E;
  }

  // Position on an orbit from its elements (angles in degrees). Returns heliocentric
  // (or, for the Moon, geocentric) ecliptic rectangular coordinates.
  function conicPosition(N, i, w, a, e, Mdeg) {
    var E = solveKepler(Mdeg, e);
    var xv = a * (Math.cos(E) - e);
    var yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
    var v = Math.atan2(yv, xv);
    var r = Math.sqrt(xv * xv + yv * yv);
    var vw = v + w * RAD;
    var NR = N * RAD;
    var IR = i * RAD;
    return {
      x: r * (Math.cos(NR) * Math.cos(vw) - Math.sin(NR) * Math.sin(vw) * Math.cos(IR)),
      y: r * (Math.sin(NR) * Math.cos(vw) + Math.cos(NR) * Math.sin(vw) * Math.cos(IR)),
      z: r * Math.sin(vw) * Math.sin(IR),
      r: r
    };
  }

  // d = days since 2000 Jan 0.0 (UT)
  function sunPosition(d) {
    var w = norm360(282.9404 + 4.70935e-5 * d);
    var e = 0.016709 - 1.151e-9 * d;
    var M = norm360(356.0470 + 0.9856002585 * d);
    var E = solveKepler(M, e);
    var xv = Math.cos(E) - e;
    var yv = Math.sqrt(1 - e * e) * Math.sin(E);
    var v = Math.atan2(yv, xv) * DEG;
    return { lon: norm360(v + w), lat: 0, r: Math.sqrt(xv * xv + yv * yv), M: M };
  }

  var PLANET_ELEMENTS = {
    Mercury: function (d) {
      return { N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5.00e-8 * d, w: 29.1241 + 1.01444e-5 * d,
        a: 0.387098, e: 0.205635 + 5.59e-10 * d, M: 168.6562 + 4.0923344368 * d };
    },
    Venus: function (d) {
      return { N: 76.6799 + 2.46590e-5 * d, i: 3.3946 + 2.75e-8 * d, w: 54.8910 + 1.38374e-5 * d,
        a: 0.723330, e: 0.006773 - 1.302e-9 * d, M: 48.0052 + 1.6021302244 * d };
    },
    Mars: function (d) {
      return { N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d, w: 286.5016 + 2.92961e-5 * d,
        a: 1.523688, e: 0.093405 + 2.516e-9 * d, M: 18.6021 + 0.5240207766 * d };
    },
    Jupiter: function (d) {
      return { N: 100.4542 + 2.76854e-5 * d, i: 1.3030 - 1.557e-7 * d, w: 273.8777 + 1.64505e-5 * d,
        a: 5.20256, e: 0.048498 + 4.469e-9 * d, M: 19.8950 + 0.0830853001 * d };
    },
    Saturn: function (d) {
      return { N: 113.6634 + 2.38980e-5 * d, i: 2.4886 - 1.081e-7 * d, w: 339.3939 + 2.97661e-5 * d,
        a: 9.55475, e: 0.055546 - 9.499e-9 * d, M: 316.9670 + 0.0334442282 * d };
    },
    Uranus: function (d) {
      return { N: 74.0005 + 1.3978e-5 * d, i: 0.7733 + 1.9e-8 * d, w: 96.6612 + 3.0565e-5 * d,
        a: 19.18171 - 1.55e-8 * d, e: 0.047318 + 7.45e-9 * d, M: 142.5905 + 0.011725806 * d };
    },
    Neptune: function (d) {
      return { N: 131.7806 + 3.0173e-5 * d, i: 1.7700 - 2.55e-7 * d, w: 272.8461 - 6.027e-6 * d,
        a: 30.05826 + 3.313e-8 * d, e: 0.008606 + 2.15e-9 * d, M: 260.2471 + 0.005995147 * d };
    }
  };

  // Geocentric ecliptic longitude/latitude of a planet, using the Sun's vector to Earth.
  function geocentricPlanet(name, d, sun) {
    var el = PLANET_ELEMENTS[name](d);
    var p = conicPosition(norm360(el.N), el.i, norm360(el.w), el.a, el.e, norm360(el.M));
    var x = p.x + sun.r * Math.cos(sun.lon * RAD);
    var y = p.y + sun.r * Math.sin(sun.lon * RAD);
    var z = p.z;
    return {
      lon: norm360(Math.atan2(y, x) * DEG),
      lat: Math.atan2(z, Math.hypot(x, y)) * DEG
    };
  }

  // Moon: Schlyter's elements plus the main perturbation terms (degrees).
  function moonPosition(d, sun) {
    var N = norm360(125.1228 - 0.0529538083 * d);
    var w = norm360(318.0634 + 0.1643573223 * d);
    var M = norm360(115.3654 + 13.0649929509 * d);
    var p = conicPosition(N, 5.1454, w, 60.2666, 0.054900, M);
    var lon = Math.atan2(p.y, p.x) * DEG;
    var lat = Math.atan2(p.z, Math.hypot(p.x, p.y)) * DEG;

    var Ms = sun.M;
    var Ls = sun.lon;
    var Lm = M + w + N;
    var D = Lm - Ls;
    var F = Lm - N;
    var S = function (deg) { return Math.sin(deg * RAD); };
    lon += -1.274 * S(M - 2 * D) + 0.658 * S(2 * D) - 0.186 * S(Ms)
      - 0.059 * S(2 * M - 2 * D) - 0.057 * S(M - 2 * D + Ms) + 0.053 * S(M + 2 * D)
      + 0.046 * S(2 * D - Ms) + 0.041 * S(M - Ms) - 0.035 * S(D) - 0.031 * S(M + Ms)
      - 0.015 * S(2 * F - 2 * D) + 0.011 * S(M - 4 * D);
    return { lon: norm360(lon), lat: lat };
  }

  // Pluto: Standish mean elements (J2000 ecliptic). Returned in the J2000 frame.
  function plutoPosition(jd, sun, T, precDeg) {
    var a = 39.48168677 - 0.00076912 * T;
    var e = 0.24880766 + 0.00006465 * T;
    var inc = 17.14175;
    var L = 238.92881 + 145.20780 * T;
    var lonp = 224.06676 - 0.04062 * T;
    var lonN = 110.30347 - 0.01183 * T;
    var p = conicPosition(norm360(lonN), inc, norm360(lonp - lonN), a, e, norm360(L - lonp));
    var sunJ = norm360(sun.lon - precDeg);
    var x = p.x + sun.r * Math.cos(sunJ * RAD);
    var y = p.y + sun.r * Math.sin(sunJ * RAD);
    return {
      lonJ2000: norm360(Math.atan2(y, x) * DEG),
      lat: Math.atan2(p.z, Math.hypot(x, y)) * DEG
    };
  }

  // Sun-entry boundaries as J2000 ecliptic longitudes (sun's longitude on those dates in 2000).
  var BOUNDARIES = IAU_SUN_DATES.map(function (row) {
    var jd = Date.UTC(2000, row[1] - 1, row[2]) / 86400000 + 2440587.5;
    return { name: row[0], lon: sunPosition(jd - 2451543.5).lon };
  }).sort(function (a, b) { return a.lon - b.lon; });

  // Map a J2000 ecliptic longitude to one of the 13 sign bands.
  function mapTo13(lonJ2000) {
    var n = BOUNDARIES.length;
    var idx = n - 1;
    for (var i = 0; i < n; i++) {
      if (lonJ2000 >= BOUNDARIES[i].lon) idx = i;
    }
    var start = BOUNDARIES[idx].lon;
    var end = BOUNDARIES[(idx + 1) % n].lon;
    var x = lonJ2000;
    if (x < start) x += 360;
    if (end <= start) end += 360;
    var name = BOUNDARIES[idx].name;
    return { sign: name, node: SIGNS13.indexOf(name), frac: (x - start) / (end - start) };
  }

  // Tropical 12-sign reference frame, mapped onto the same 13 node positions.
  function mapTropical(lonDate) {
    var i = Math.floor(norm360(lonDate) / 30);
    var name = TROPICAL12[i];
    return { sign: name, node: SIGNS13.indexOf(name), frac: (norm360(lonDate) % 30) / 30 };
  }

  // Full calculation for a Date. Never throws silently: callers should wrap in try/catch.
  function computePositions(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error('computePositions: invalid date');
    }
    var jd = julianDate(date);
    var d = jd - 2451543.5;
    var T = (jd - 2451545.0) / 36525;
    var precDeg = 1.396971 * T + 0.0003086 * T * T;

    var sun = sunPosition(d);
    var moon = moonPosition(d, sun);
    var bodies = [{ name: 'Sun', lonDate: sun.lon, lat: 0, approx: false, method: 'Schlyter elements' },
      { name: 'Moon', lonDate: moon.lon, lat: moon.lat, approx: true, method: 'Schlyter + perturbations' }];

    ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].forEach(function (name) {
      var g = geocentricPlanet(name, d, sun);
      bodies.push({ name: name, lonDate: g.lon, lat: g.lat, approx: false, method: 'Schlyter elements' });
    });

    var pl = plutoPosition(jd, sun, T, precDeg);
    bodies.push({ name: 'Pluto', lonDate: norm360(pl.lonJ2000 + precDeg), lat: pl.lat, approx: true,
      method: 'Standish mean elements (low accuracy)' });

    bodies.forEach(function (b) {
      b.lonJ2000 = norm360(b.lonDate - precDeg);
    });

    return { utc: date.toISOString(), jd: jd, bodies: bodies };
  }

  var API = {
    SIGNS13: SIGNS13,
    TROPICAL12: TROPICAL12,
    BOUNDARIES: BOUNDARIES,
    computePositions: computePositions,
    mapTo13: mapTo13,
    mapTropical: mapTropical,
    sunPosition: sunPosition
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.LivingPortalAstro = API;
  }
})(typeof window !== 'undefined' ? window : globalThis);
