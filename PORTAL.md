# THE LIVING PORTAL: technical notes

The purpose of the project is described in the [README](README.md). This file covers how the portal runs, how the planetary positions are calculated, what the two mapping modes do, how to deploy and test it, and what it cannot do.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole application: canvas renderer, controls, Web Audio, settings. |
| `astro.js` | Planetary positions and the two mapping modes. Wraps the bundled library. |
| `events.js` | The astronomical event engine: event definitions and transition detection. |
| `vendor/astronomy.browser.min.js` | astronomy-engine 2.1.19 (MIT), unmodified. See `vendor/README.md`. |
| `tests/astro-check.js` | Node checks for the calculation and both mapping modes. |
| `tests/events-check.js` | Node checks for the event engine, including real sky events. |
| `tests/browser/e2e-full.js` | Playwright checks of the controls, modes, sound, failure path and layout (32 checks). |
| `tests/browser/e2e-events.js` | Playwright checks of events, banner, glitch and the event hook (10 checks). |

## Running it

Open `index.html` in a browser, or host the repository on GitHub Pages (below). The portal starts animating at once. The calculation runs on the same device and uses no network. Once the page has loaded, the portal keeps working without internet access.

## Planetary positions

- **Library:** astronomy-engine 2.1.19, bundled in `vendor/`. It provides the geocentric vectors for the Sun, Moon and planets, and the IAU constellation lookup.
- **Coordinates reported for each body:**
  - Ecliptic longitude of the date (the tropical zodiac frame).
  - Ecliptic longitude in the J2000 frame.
  - J2000 equatorial RA and Dec, used for constellation membership.
- **Time:** the current UTC instant, recalculated every 30 seconds. The timestamp is shown in the top line and in the data panel.
- **Failure:** if the calculation throws, the portal shows "needs refreshing" with the error text, hides the planet markers, and keeps animating. It never substitutes random or stale values silently. The RECALCULATE button retries.

## The two mapping modes

Switch between them in `DATA & SETTINGS → Mode`. The mode line at the top always names the mode in use.

### Mode A: my 13-sign system (provisional)

- Each planet's J2000 ecliptic longitude is matched against a set of sign bands, in ecliptic order from Aries.
- The bands live in `MODE_A_SIGNS` in `astro.js`. Each band has a name and either a start date `[month, day]` or a longitude `lon` in degrees.
- **The current bands are a placeholder.** They use the approximate IAU sun-entry dates, so the mode works end to end. The data panel labels them PROVISIONAL. Replace them with the bands you approve, and the label changes with the status line in `MODE_A_SIGNS.status`.
- Bands do not need equal widths. The node position depends only on the band's order, and the marker moves within the band according to where the planet falls.

### Mode B: actual constellations (IAU boundaries)

- Each planet's J2000 RA and Dec are passed to `Astronomy.Constellation`. That function uses the official IAU constellation boundaries.
- The 13 zodiacal constellations (Aries, Taurus, Gemini, Cancer, Leo, Virgo, Libra, Scorpio, Ophiuchus, Sagittarius, Capricorn, Aquarius, Pisces) each occupy one node.
- A planet in any other constellation (for example Cetus or Orion) is listed in the data panel with its constellation name and marked `off-ring`. It is not drawn on the ring.
- The ecliptic does not cross every constellation, and planets sit up to about 7° off it. Mode B therefore correctly places planets in constellations that Mode A, which uses only ecliptic longitude, can't represent.

Both modes use the same 13 fixed node positions. When a planet changes band or constellation, its marker glides to the new node and the nodes brighten and dim smoothly. Planets that share a node are fanned out slightly so each one stays readable.

## Accuracy and validation

All checks are in `tests/astro-check.js`. Run them with:

```bash
node tests/astro-check.js
```

What was checked, and the results when this was written:

| Check | Expected | Result |
|---|---|---|
| Vernal equinox 2024-03-20 03:06 UT | Sun at 0° | 0.005° error |
| June solstice 2024-06-20 20:51 UT | Sun at 90° | 0.006° error |
| New Moon 2024-01-11 11:57 UT | Moon ≈ Sun | 0.009° error |
| Full Moon 2024-02-24 12:30 UT | Moon ≈ Sun + 180° | 0.009° error |
| Jupiter–Saturn conjunction 2020-12-21 18:20 UT | ~0.1° apart | 0.000° error |
| Mode B: six bright stars (Betelgeuse, Polaris, Vega, Rasalhague, Antares, Kaus Australis) | Orion, Ursa Minor, Lyra, Ophiuchus, Scorpius, Sagittarius | All match |
| Mode B: one catalogue star in each of the 13 zodiacal constellations | Correct node for each | All match |
| Mode B: Sun's constellation, each day of 2024 | Within 3 days of the IAU sun-date table | Worst difference 2 days (Capricornus) |
| Repeated calculation for one instant | Identical output | Identical |
| Invalid date | Throws, no fallback values | Throws |

Notes on these results:

- The sun-date table in `MODE_A_SIGNS` is approximate. The Sun's real boundary dates in 2024 differ from it by 0–2 days. Mode B uses the real boundaries.
- The Sun, Moon and planet longitudes are checked against reference events, not against a live observatory feed.
- I also compared an earlier, simpler planetary model with astronomy-engine across 1950–2050. The two agreed within about 0.03° for the Sun, the inner planets, Uranus, Neptune and Pluto. They differed by up to about 0.3° for Jupiter and about 0.6° for Saturn. That shows where the simpler model disagrees with the library. It does not show which one is correct, so I chose the library, which is the standard for this kind of calculation. This comparison used a development-only copy of the library outside the repository, and it is not part of the test suite.
- I did not check the library against NASA JPL Horizons. That service was not reachable from the development environment.
- Pluto and the Moon have not been checked against reference data here, beyond the events in the table. Eclipses, retrograde stations and exact conjunction times are not claimed.

## Visual layers

The portal runs one animation loop. BOOST and OVERDRIVE change its inputs rather than starting new loops.

1. Starfield (drifts slowly; stronger under boost).
2. Central vortex and spiral arms (open wider under boost and overdrive).
3. Plasma ring (three colour bands, wobbling with time).
4. Sacred geometry (intensifies under boost).
5. Outer ring (rotates) and inner counter-rotating arcs.
6. 13 node indicators (Ophiuchus has a serpent treatment).
7. Planetary markers, each with a small effect: Sun pulse, Moon orbit, Mercury filaments, Venus rose pattern, Mars streaks, Jupiter rings, Saturn ellipse, Uranus flicker, Neptune mist, Pluto pulse.
8. Ophiuchus emblem at the centre.
9. Particle streams, flowing in toward the centre under boost.
10. Overdrive wave and burst, when active.

Planet colours are artistic. The palette is near-black, violet, hot pink, cyan and electric blue, with no yellow or lime green.

## Boost and overdrive

| | Length | Cooldown | Effect |
|---|---|---|---|
| BOOST | 8 s | 12 s after it starts | Faster rings, brighter plasma, more particle motion, sequential wave through the nodes, larger vortex, bass sweep sound. |
| OVERDRIVE | 4 s | 15 s after it starts | Wave around all 13 nodes, wider vortex, particle burst, screen wash, short chord. |

- Presses during a boost, or during its cooldown, are ignored. Intensity can't stack.
- Inputs are clamped to 0–1, and the particle burst is capped, so intensity has a fixed maximum.
- The status line counts down, and the title changes colour while a boost or overdrive is active.
- Neither control changes the astronomical calculation.

## Sound

- Sound is off on load. Browsers allow audio only after a user gesture, so nothing is created or played before the first click on SOUND.
- Everything is synthesised with the Web Audio API. There are no audio files.
- **Sound ON** resumes the audio context. **Sound OFF** suspends it, so nothing keeps playing.
- Ambient tone and activation sounds have separate switches. Turning ambient off stops its oscillators.
- Volume is a slider in the settings panel.
- Hiding the tab suspends audio. Leaving the page closes the audio context.

## Performance and accessibility

- `requestAnimationFrame` only. The loop stops when the page is hidden or paused.
- **Battery-friendly mode:** caps the frame rate at 30 fps, uses a device pixel ratio of 1, and halves particle and star counts.
- **Visual intensity:** Low, Normal or High particle and star density.
- **Reduced motion:** on by default when the system asks for it. It slows rotation and replaces the strobing node wave with a steady glow. Overdrive drops the particle burst and the screen wash.
- Settings are stored in `localStorage` under `livingPortal.settings.v1`. Storage errors are caught, so the page still works without it.

## Deploying to GitHub Pages

1. Make sure `index.html`, `astro.js` and `vendor/` are at the root of the branch you publish. Pages serves those files as they are.
2. On GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
4. Choose the branch and the folder `/ (root)`, then save.
5. After about a minute the site is live at `https://lezkt1811-maker.github.io/Emerald-CounterGrid/`.

There is no build step. Nothing is loaded from a CDN, so the page needs no external services.

## Testing

### Automated

```bash
node tests/astro-check.js
node tests/events-check.js
```

`astro-check.js` covers the calculation and both mapping modes, as in the table above. `events-check.js` covers the event engine.

Browser tests need Playwright and a local server:

```bash
python3 -m http.server 8766 &
PORTAL_URL=http://localhost:8766/index.html node tests/browser/e2e-full.js
PORTAL_URL=http://localhost:8766/index.html node tests/browser/e2e-events.js
```

Set `CHROMIUM_PATH` if Chromium is not on Playwright's default path. Set `PLAYWRIGHT_PATH` if Playwright is not installed locally.

### In a browser

The browser checks were run against the built page at 390 px width in headless Chromium, with mobile emulation. The results from the last run:

- Starts animating on load without interaction.
- No audio context is created before a user gesture. Sound starts off.
- Timestamp and coordinate system are displayed. All ten bodies are listed with distinct longitudes.
- Switching modes changes the table and the mode line.
- BOOST shows an active state, ignores a second press, and returns to normal after about 8 s, then shows its cooldown.
- OVERDRIVE shows an active state, returns to normal after about 4 s, and shows its cooldown.
- SOUND ON runs an audio context, muting suspends it, and leaving the page closes it.
- PAUSE freezes the animation and RESUME restarts it.
- No horizontal scroll at 390 px width. The BOOST button is 64 px tall.
- A forced calculation failure keeps the animation running and shows "needs refreshing".
- Battery mode, reduced motion and Mode B load and run without errors.
- No requests leave the page. Everything is served locally.
- No JavaScript errors.

These are automated checks in headless Chromium, not tests on a physical Samsung device. Audio, frame rate and battery drain on real hardware have not been measured.

### Manual, on a phone

1. Open the GitHub Pages address on the phone.
2. Confirm the portal is moving without touching anything.
3. Tap SOUND, then confirm there is sound. Tap it again to mute, and confirm the sound stops.
4. Tap BOOST and OVERDRIVE, and check the cooldown text.
5. Open DATA & SETTINGS, switch between Mode A and Mode B, and check the table changes.
6. Turn on battery-friendly mode and reduced motion, and check the portal still runs.

## Limitations

- Mode A's bands are a placeholder until you supply or approve your own.
- True constellation membership uses the IAU boundaries as bundled by astronomy-engine. The data panel shows the constellation name, so you can compare it with other sky charts.
- Pluto and the Moon have not been checked against reference data beyond the events listed above.
- Timers for boost and overdrive use wall-clock time, so they keep counting while the page is hidden. The animation itself does not run while hidden.
- The development checks did not include a physical Samsung device.

## Celestial events

The event engine (`events.js`) watches the calculated sky and fires when a condition becomes true. It fires on the transition, not on every calculation while the condition holds. Nothing in it is random, and it detects nothing outside the calculation.

| Event | Condition | Visual response |
|---|---|---|
| Moon enters Ophiuchus | Moon's IAU constellation changes to Ophiuchus | Ophiuchus node and serpent flare, sweep around the ring, bolts to the node |
| A planet enters Ophiuchus | Any planet's IAU constellation changes to Ophiuchus | Ophiuchus flare and bolt |
| Sun and Moon in conjunction | Angular separation ≤ 8° (haversine on J2000 RA/Dec) | Luminous line between the two markers, bolt |
| Jupiter and Saturn in conjunction | Angular separation ≤ 6° | Luminous line, sweep around the ring |
| Gathering | At least 3 of the 8 planets within 30° of one another | Bolts from the centre to each gathered planet |
| Sign crossing | A planet's sign band changes (current mapping mode) | Sweep around the ring |

- **Definitions are data.** Edit `DEFAULT_EVENTS` in `events.js` to add or change events. Each entry names its type (`enter`, `aspect`, `gather` or `signChange`), its bodies or constellation, and its visual effects.
- **Cooldown:** the same event is not repeated within 15 minutes. A clock that moves backwards is not treated as a repeat.
- **Mode switches** reset the engine, so changing mode never fires events by itself.
- **Automatic events** can be switched off in the settings. The engine keeps tracking while they are off, so turning them back on does not replay a backlog.
- **Timing:** events are detected at each recalculation, every 30 seconds. The event time is the calculation time, so it can lag the exact crossing by up to 30 seconds. The check on the Moon's 2026 entries used 6-hour steps and matched the independent count exactly.
- **Accuracy of the trigger:** an event is only as good as the position it is computed from. Moon events inherit the Moon's accuracy, and aspect events inherit both bodies' accuracy.

### Testing events

- `node tests/events-check.js` runs synthetic transition tests, a backwards-clock test, and real sky checks:
  - Jupiter–Saturn fires once, in October 2020.
  - Moon-enters-Ophiuchus events in 2026 match an independent count of 13.
  - Sun–Moon conjunctions within 8° in 2026 number 12.
  - Mode A sign crossings for the Moon in Jan–Mar 2026 match an independent count.
- In the browser, the calculation clock can be moved with `window.LivingPortal.setClock('2026-01-15T12:00:00Z')` (or `?at=` in the URL). This changes only the date used for the calculation. It does not change the sky, and it is for testing only.
- Browser checks run: the page finds the 13 Moon-enters-Ophiuchus events in 2026; the Jupiter–Saturn event fires between 20 and 25 October 2020; the banner shows the correct title; switching mode fires nothing; turning events off logs nothing; boost works with events on or off.

## Electric effects and safety

- **Electric glitch:** horizontal slice shifts, coloured glitch bars, lightning bolts, and a CSS scanline and vignette overlay. Turn off with *Electric glitch effects* in the settings.
- **Photosensitivity:** glitch bursts are at most about one every 1.2 seconds during a boost and about one every 2.5 to 6 seconds otherwise, each lasting under 0.3 seconds. Ambient arcs are limited to about two per second while boosting and one per second otherwise. The effects don't use full-screen brightness flashes. If you are sensitive to flashing light, turn off the glitch effects and use reduced motion.
- **Reduced motion** turns off the glitch, the ambient arcs and the event bolts. Events still show their banner and play their sound, if sound is on.
- **Battery-friendly mode** turns off the glitch and the ambient arcs.
- The effects are a visual and audio experience. They do not change the calculated sky, and nothing in the portal claims they do.
