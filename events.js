/*
 * THE LIVING PORTAL - Astronomical Event Engine (pure logic, no DOM).
 *
 * An event fires when a CALCULATED condition becomes true: a planet enters a
 * constellation, two bodies come within an angle, a group gathers, or a planet
 * crosses a sign boundary. It fires on the transition, not every frame while the
 * condition holds. Nothing here is random or detected from outside the sky.
 *
 * Event definitions are plain data (DEFAULT_EVENTS below). Add your own there.
 * Sun, Moon and planet positions come from astro.js; this file only compares them.
 */
(function (global) {
  'use strict';

  var RAD = Math.PI / 180;
  var DEG = 180 / Math.PI;
  var COOLDOWN_MS = 15 * 60 * 1000; // suppress repeats of the same event for 15 minutes
  var PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];

  /*
   * Event definitions.
   *   enter      - a body (or '*' for any planet) enters the constellation with this IAU symbol.
   *   aspect     - two bodies are within `orb` degrees of an angle `angle` (0 = conjunction).
   *   gather     - at least `minBodies` of `bodies` lie within `span` degrees of one another.
   *   signChange - a body moves from one sign band to another (uses the current mapping mode).
   * `effects` names the visual responses: ophi, wave, lightning, aspect, gather.
   */
  var DEFAULT_EVENTS = [
    { id: 'moon-ophiuchus', type: 'enter', body: 'Moon', constellation: 'Oph',
      title: 'Moon enters Ophiuchus', effects: ['ophi', 'wave', 'lightning'] },
    { id: 'planet-ophiuchus', type: 'enter', body: '*', constellation: 'Oph',
      title: 'A planet enters Ophiuchus', effects: ['ophi', 'lightning'] },
    { id: 'sun-moon-conjunction', type: 'aspect', bodies: ['Sun', 'Moon'], angle: 0, orb: 8,
      title: 'Sun and Moon in conjunction (within 8°)', effects: ['aspect', 'lightning'] },
    { id: 'jupiter-saturn-conjunction', type: 'aspect', bodies: ['Jupiter', 'Saturn'], angle: 0, orb: 6,
      title: 'Jupiter and Saturn in conjunction (within 6°)', effects: ['aspect', 'wave'] },
    { id: 'gathering', type: 'gather', bodies: PLANETS, minBodies: 3, span: 30,
      title: 'Three or more planets gather within 30°', effects: ['gather', 'lightning'] },
    { id: 'sign-crossing', type: 'signChange', body: '*',
      title: 'A planet crosses a sign boundary', effects: ['wave'] }
  ];

  // Angular separation (degrees) between two J2000 equatorial positions, haversine form.
  function angularSeparation(ra1, dec1, ra2, dec2) {
    var d1 = dec1 * RAD, d2 = dec2 * RAD, dra = (ra2 - ra1) * RAD;
    var h = Math.pow(Math.sin((d2 - d1) / 2), 2) + Math.cos(d1) * Math.cos(d2) * Math.pow(Math.sin(dra / 2), 2);
    return 2 * Math.asin(Math.min(1, Math.sqrt(h))) * DEG;
  }

  // Build the state the engine compares. `bodies` items:
  //   { name, raDeg, decDeg, constellationSymbol, constellation, node, sign }
  function buildState(bodies) {
    var s = {};
    bodies.forEach(function (b) {
      s[b.name] = {
        name: b.name, raDeg: b.raDeg, decDeg: b.decDeg,
        constSymbol: b.constellationSymbol, constName: b.constellation,
        node: typeof b.node === 'number' ? b.node : -1, sign: b.sign
      };
    });
    return s;
  }

  function namesFor(def, s, wildcardList) {
    var list = def.body === '*' || def.bodies === '*' ? (wildcardList || Object.keys(s)) : [def.body || null];
    return list.filter(function (n) { return n && s[n]; });
  }

  // Current state of each condition, keyed so transitions can be tracked per body or group.
  function activeHits(def, s) {
    var out = {};
    if (def.type === 'enter') {
      namesFor(def, s, PLANETS.concat(['Sun', 'Moon'])).forEach(function (n) {
        var b = s[n];
        out[n] = { active: b.constSymbol === def.constellation, names: [n], nodes: [b.node],
          detail: n + ' in ' + b.constName };
      });
    } else if (def.type === 'aspect') {
      var a = s[def.bodies[0]], b2 = s[def.bodies[1]];
      if (a && b2) {
        var sep = angularSeparation(a.raDeg, a.decDeg, b2.raDeg, b2.decDeg);
        out.pair = { active: Math.abs(sep - def.angle) <= def.orb, names: [a.name, b2.name],
          nodes: [a.node, b2.node], detail: sep.toFixed(2) + '° apart' };
      }
    } else if (def.type === 'gather') {
      var present = def.bodies.filter(function (n) { return s[n]; });
      var best = [];
      present.forEach(function (i) {
        var members = [i];
        present.forEach(function (j) {
          if (j !== i && angularSeparation(s[i].raDeg, s[i].decDeg, s[j].raDeg, s[j].decDeg) <= def.span) members.push(j);
        });
        if (members.length > best.length) best = members;
      });
      if (best.length) {
        out.group = { active: best.length >= def.minBodies, names: best,
          nodes: best.map(function (n) { return s[n].node; }), detail: best.join(', ') };
      }
    }
    return out;
  }

  // Transitions between two states: the things that have just become true.
  function transitions(def, p, c) {
    var fired = [];
    if (def.type === 'signChange') {
      namesFor(def, c, PLANETS.concat(['Sun', 'Moon'])).forEach(function (n) {
        var before = p[n], now = c[n];
        if (before && before.node >= 0 && now.node >= 0 && before.sign !== now.sign) {
          fired.push({ key: n, names: [n], nodes: [before.node, now.node], detail: before.sign + ' → ' + now.sign });
        }
      });
      return fired;
    }
    var nowHits = activeHits(def, c), beforeHits = activeHits(def, p);
    Object.keys(nowHits).forEach(function (k) {
      var h = nowHits[k];
      var was = beforeHits[k] && beforeHits[k].active;
      if (h.active && !was) fired.push({ key: k, names: h.names, nodes: h.nodes, detail: h.detail });
    });
    return fired;
  }

  /*
   * Engine: call update(state, utcMs, modeKey) on each calculation.
   * The first call, and any call after the mapping mode changes, only records the state.
   * That stops mode switches from firing spurious events.
   */
  function createEngine(defs) {
    defs = defs || DEFAULT_EVENTS;
    var prev = null, prevKey = null, lastFired = {};
    return {
      update: function (state, utcMs, modeKey) {
        if (prev === null || modeKey !== prevKey) {
          prev = state; prevKey = modeKey;
          return [];
        }
        var events = [];
        defs.forEach(function (def) {
          transitions(def, prev, state).forEach(function (t) {
            var id = def.id + ':' + t.key;
            // Suppress only a repeat within the cooldown. A clock that jumps backwards must not look "recent".
            var gap = lastFired[id] === undefined ? Infinity : utcMs - lastFired[id];
            if (gap >= 0 && gap < COOLDOWN_MS) return;
            lastFired[id] = utcMs;
            events.push({
              id: def.id, title: def.title, utc: new Date(utcMs).toISOString(),
              detail: t.detail || '', names: t.names,
              nodes: t.nodes.filter(function (n) { return n >= 0; }),
              effects: def.effects.slice()
            });
          });
        });
        prev = state;
        return events;
      },
      reset: function () { prev = null; prevKey = null; lastFired = {}; }
    };
  }

  var API = {
    DEFAULT_EVENTS: DEFAULT_EVENTS,
    COOLDOWN_MS: COOLDOWN_MS,
    angularSeparation: angularSeparation,
    buildState: buildState,
    createEngine: createEngine
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.LivingPortalEvents = API;
  }
})(typeof window !== 'undefined' ? window : globalThis);
