/*
 * THE LIVING PORTAL - planetary positions and sign/constellation mapping.
 *
 * Calculation: astronomy-engine 2.1.19 (MIT), bundled locally in vendor/.
 * Nothing is fetched at runtime. The library supplies the Sun, Moon and planet
 * vectors (VSOP87/ELP-based models) and the IAU constellation lookup.
 *
 * Two coordinate outputs per body:
 *   lonDate   - ecliptic longitude of the date (tropical zodiac frame)
 *   lonJ2000  - ecliptic longitude in the J2000 frame
 * Plus the J2000 equatorial RA/Dec used for constellation membership.
 *
 * Two selectable mapping modes (see mapBody):
 *   'A' - MY 13-SIGN SYSTEM: sign bands from MODE_A_SIGNS (provisional until approved).
 *   'B' - ACTUAL CONSTELLATIONS: IAU boundaries via Astronomy.Constellation().
 */
(function (global) {
  'use strict';

  var AE = null;
  if (typeof module !== 'undefined' && module.exports) {
    AE = require('./vendor/astronomy.browser.min.js');
  } else {
    AE = global.Astronomy || null;
  }

  var RAD = Math.PI / 180;
  var DEG = 180 / Math.PI;
  var OBLIQUITY_J2000 = 23.4392911 * RAD;

  // The 13 node positions, in ecliptic order, starting at Aries.
  var SIGNS13 = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra',
    'Scorpio', 'Ophiuchus', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

  // IAU three-letter symbols for the 13 zodiacal constellations, keyed to the node names.
  var ZODIAC_SYMBOL_TO_NODE = {
    Ari: 'Aries', Tau: 'Taurus', Gem: 'Gemini', Cnc: 'Cancer', Leo: 'Leo', Vir: 'Virgo',
    Lib: 'Libra', Sco: 'Scorpio', Oph: 'Ophiuchus', Sgr: 'Sagittarius', Cap: 'Capricorn',
    Aqr: 'Aquarius', Psc: 'Pisces'
  };

  /*
   * MODE A - MY 13-SIGN SYSTEM.
   * PROVISIONAL. The bands below are a placeholder built from the approximate
   * IAU sun-entry dates, so the mode works end to end. Replace `date` with your
   * own [month, day] start dates, or set `lon` (J2000 ecliptic degrees) directly,
   * once you have approved them. Bands must be listed in ecliptic order from Aries.
   */
  var MODE_A_SIGNS = {
    status: 'PROVISIONAL - placeholder bands pending your approval',
    bands: [
      { name: 'Aries', date: [4, 19] },
      { name: 'Taurus', date: [5, 14] },
      { name: 'Gemini', date: [6, 21] },
      { name: 'Cancer', date: [7, 20] },
      { name: 'Leo', date: [8, 10] },
      { name: 'Virgo', date: [9, 16] },
      { name: 'Libra', date: [10, 31] },
      { name: 'Scorpio', date: [11, 23] },
      { name: 'Ophiuchus', date: [11, 30] },
      { name: 'Sagittarius', date: [12, 18] },
      { name: 'Capricorn', date: [1, 19] },
      { name: 'Aquarius', date: [2, 16] },
      { name: 'Pisces', date: [3, 11] }
    ]
  };

  function norm360(x) {
    var y = x % 360;
    return y < 0 ? y + 360 : y;
  }

  // Ecliptic longitude/latitude (J2000 frame) from a J2000 equatorial vector.
  function eclipticJ2000(v) {
    var ye = v.y * Math.cos(OBLIQUITY_J2000) + v.z * Math.sin(OBLIQUITY_J2000);
    var ze = -v.y * Math.sin(OBLIQUITY_J2000) + v.z * Math.cos(OBLIQUITY_J2000);
    return {
      lon: norm360(Math.atan2(ye, v.x) * DEG),
      lat: Math.atan2(ze, Math.hypot(v.x, ye)) * DEG
    };
  }

  // Sun's J2000 ecliptic longitude on a given calendar date (used to place Mode A bands).
  function sunLonJ2000On(year, month, day) {
    var v = AE.GeoVector(AE.Body.Sun, new Date(Date.UTC(year, month - 1, day, 12)), false);
    return eclipticJ2000(v).lon;
  }

  // Resolve Mode A bands to ecliptic longitudes, sorted ascending.
  function resolveModeA() {
    return MODE_A_SIGNS.bands.map(function (b) {
      var lon = typeof b.lon === 'number' ? norm360(b.lon) : sunLonJ2000On(2000, b.date[0], b.date[1]);
      return { name: b.name, lon: lon };
    }).sort(function (a, b) { return a.lon - b.lon; });
  }

  var MODE_A_BANDS = resolveModeA();

  // Locate a J2000 ecliptic longitude within the Mode A bands.
  function mapModeA(lonJ2000) {
    var bands = MODE_A_BANDS;
    var n = bands.length;
    var idx = n - 1;
    for (var i = 0; i < n; i++) {
      if (lonJ2000 >= bands[i].lon) idx = i;
    }
    var start = bands[idx].lon;
    var end = bands[(idx + 1) % n].lon;
    var x = lonJ2000;
    if (x < start) x += 360;
    if (end <= start) end += 360;
    var name = bands[idx].name;
    return { sign: name, node: SIGNS13.indexOf(name), frac: (x - start) / (end - start), kind: 'A' };
  }

  // Mode B: IAU constellation membership. Only the 13 zodiacal constellations have a node.
  function mapModeB(ra, dec) {
    var c = AE.Constellation(ra / 15, dec); // Constellation() takes RA in hours
    var node = ZODIAC_SYMBOL_TO_NODE[c.symbol];
    return {
      sign: node || c.name,
      constellation: c.name,
      symbol: c.symbol,
      node: node ? SIGNS13.indexOf(node) : -1,
      frac: 0.5,
      kind: 'B'
    };
  }

  var BODIES = [
    ['Sun', 'Sun'], ['Moon', 'Moon'], ['Mercury', 'Mercury'], ['Venus', 'Venus'], ['Mars', 'Mars'],
    ['Jupiter', 'Jupiter'], ['Saturn', 'Saturn'], ['Uranus', 'Uranus'], ['Neptune', 'Neptune'], ['Pluto', 'Pluto']
  ];

  // Full calculation for a Date. Throws on any failure: callers must show the failure, not random data.
  function computePositions(date) {
    if (!AE) throw new Error('astronomy library not loaded');
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error('invalid date');
    }
    var jd = date.getTime() / 86400000 + 2440587.5;
    var T = (jd - 2451545.0) / 36525;
    var precDeg = 1.396971 * T + 0.0003086 * T * T;

    var bodies = BODIES.map(function (pair) {
      var name = pair[0];
      var vec = AE.GeoVector(AE.Body[pair[1]], date, false); // J2000 equatorial, geocentric
      if (!vec || !isFinite(vec.x) || !isFinite(vec.y) || !isFinite(vec.z)) {
        throw new Error('non-finite position for ' + name);
      }
      var ecl = eclipticJ2000(vec);
      var raDeg = norm360(Math.atan2(vec.y, vec.x) * DEG);
      var decDeg = Math.atan2(vec.z, Math.hypot(vec.x, vec.y)) * DEG;
      var lonDate = AE.Ecliptic(vec).elon;
      var con = AE.Constellation(raDeg / 15, decDeg);
      return {
        name: name,
        lonDate: norm360(lonDate),
        lonJ2000: ecl.lon,
        lat: ecl.lat,
        raDeg: raDeg,
        decDeg: decDeg,
        constellation: con.name,
        constellationSymbol: con.symbol,
        precession: precDeg
      };
    });

    return { utc: date.toISOString(), jd: jd, bodies: bodies, library: 'astronomy-engine 2.1.19 (bundled)' };
  }

  // Map one body onto the 13 nodes using the chosen mode ('A' or 'B').
  function mapBody(body, mode) {
    return mode === 'B' ? mapModeB(body.raDeg, body.decDeg) : mapModeA(body.lonJ2000);
  }

  var API = {
    SIGNS13: SIGNS13,
    MODE_A_SIGNS: MODE_A_SIGNS,
    MODE_A_BANDS: MODE_A_BANDS,
    computePositions: computePositions,
    mapBody: mapBody,
    mapModeA: mapModeA,
    mapModeB: mapModeB,
    isLoaded: function () { return !!AE; }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.LivingPortalAstro = API;
  }
})(typeof window !== 'undefined' ? window : globalThis);
