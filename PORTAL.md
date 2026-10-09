# THE LIVING PORTAL

A continuously animated cosmic gateway driven by locally calculated planetary positions.
Static HTML, CSS, JavaScript and Canvas. No frameworks, no CDNs, no API keys, no backend, no tracking.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole application: canvas renderer, controls, Web Audio, settings. |
| `astro.js` | Local low-precision planetary ephemeris and sign mapping. Loaded by `index.html`. |
| `tests/astro-check.js` | Node script that checks `astro.js` against known sky events. |

## What it does

- Animates immediately on load. There is no splash screen.
- Layers: outer rotating ring, counter-rotating inner ring, plasma ring, sacred geometry, central vortex with a spiral gateway, Ophiuchus emblem, 13 nodes, planetary markers, particle streams, and background stars.
- **BOOST** (8 s, then a 12 s cooldown): faster rings, brighter plasma, inward particle streams, a sequential wave through the 13 nodes, and a rising bass sound.
- **OVERDRIVE** (4 s, then a 15 s cooldown): a light wave around the nodes, a wider vortex, a burst of particles, a screen wash, and a short chord.
- Neither control changes the astronomical calculation.
- Sound is off until you turn it on. The browser requires that gesture before audio can play.
- **DATA & SETTINGS** shows UTC time, each body's ecliptic longitude, its sign band, the lit nodes, the mapping mode, and the accuracy status.

## Deploying to GitHub Pages

1. Push this branch (or merge it) to `lezkt1811-maker/Emerald-CounterGrid`. `index.html` must sit at the root of the published branch.
2. On GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
4. Choose the branch that contains `index.html` (for example `ccr-e4967119-rqu0c5` or `main`) and the folder `/ (root)`, then save.
5. After about a minute the site is live at `https://lezkt1811-maker.github.io/Emerald-CounterGrid/`.

Pages serves the files as they are. No build step is needed. The page works offline once it has loaded, because everything is bundled in the repo.

## Testing

### Astronomy (no browser needed)

```bash
node tests/astro-check.js
```

This prints PASS/FAIL for each reference event, the 13 sign boundaries, and the current positions. The current positions are approximate.

Reference events currently checked and the errors measured when this was written:

| Event (UT) | Expected | Error |
|---|---|---|
| Vernal equinox 2024-03-20 03:06 | Sun 0° | 0.008° |
| June solstice 2024-06-20 20:51 | Sun 90° | 0.007° |
| J2000 noon 2000-01-01 12:00 | Sun ≈ 280.37° | 0.011° |
| New Moon 2024-01-11 11:57 | Moon ≈ Sun | 0.08° |
| Full Moon 2024-02-24 12:30 | Moon ≈ Sun + 180° | 0.04° |
| Jupiter–Saturn conjunction 2020-12-21 18:20 | separation ≈ 0.1° | 0.07° |

These checks cover the Sun and the two lights. Other planets and Pluto have not been checked against reference data in this repo.

### In the browser

- Open the page on a phone or in a desktop browser.
- Keyboard shortcuts for desktop: **B** boosts, **O** triggers overdrive, **Esc** closes the data panel.
- Check the `DATA & SETTINGS` panel: the UTC clock should advance, and the table should show ten bodies.
- To simulate a calculation failure, make `A.computePositions` throw. The page should show "Planetary data unavailable" and keep animating.

## Accuracy and honesty

- The positions come from low-precision analytic formulas, not from NASA/JPL ephemerides. They are fine for a visual portal and are labelled **APPROXIMATE** in the app.
- **Sun and Mercury through Neptune:** Schlyter's orbital-element method. Only the events listed above were checked, and only the Sun and the two lights were tested against reference times. The planets have not been validated across a wider date range.
- **Moon:** Schlyter's elements with the main perturbation terms. It is less precise than the Sun and is marked *approx*.
- **Pluto:** Standish mean J2000 elements with linear rates. It is the least precise body here and is marked *approx*. It has not been checked against reference data in this repo.
- The visual effects are artistic associations. They do not represent physical energy from planets.

## Mapping modes

The portal has two modes. Choose one in `DATA & SETTINGS → Mapping`.

### 1. 13-sign ecliptic (default)

- Each planet's **J2000 ecliptic longitude** is compared with the ecliptic longitude at which the Sun enters each constellation band. Those dates come from the IAU sun-date table: Pisces 11 Mar, Aries 19 Apr, Taurus 14 May, Gemini 21 Jun, Cancer 20 Jul, Leo 10 Aug, Virgo 16 Sep, Libra 31 Oct, Scorpio 23 Nov, Ophiuchus 30 Nov, Sagittarius 18 Dec, Capricorn 19 Jan, Aquarius 16 Feb.
- Those dates are converted once, at load, to longitudes using the Sun's position in 2000.
- The result is accurate to about a day of the Sun's motion (roughly 1°).
- It is **not** true constellation membership. Real IAU constellations are irregular polygons in equatorial coordinates, and planets sit up to about 7° off the ecliptic. Latitude is ignored here.

### 2. Tropical 12-sign reference

- Each planet's **ecliptic longitude of date** is divided into twelve 30° arcs.
- This is the familiar zodiac reference. It is not a list of real constellations.
- Ophiuchus stays dimmed in this mode, because the 12 tropical signs don't include it.

### Not yet built: true IAU constellation polygons

Real membership would use the IAU boundary polygons (the Delporte boundaries in B1875 equatorial coordinates). Those tables are large and must be transcribed carefully, so they are left as a documented extension. A later version can add a third mode that uses them, with the same node layout.

## The 13 nodes

Nodes sit at fixed interface positions in this order, clockwise from the top: Aries, Taurus, Gemini, Cancer, Leo, Virgo, Libra, Scorpio, **Ophiuchus**, Sagittarius, Capricorn, Aquarius, Pisces. Each planet marker sits at its sign's node, offset within that sign by its position in the band. A node glows more when more planets are in its band. The Sun and Moon add the most weight, and Ophiuchus has a serpent-shaped treatment.

## Performance and accessibility

- Canvas drawing with `requestAnimationFrame`. The loop stops when the page is hidden, and audio is suspended.
- **Battery-friendly mode:** caps the frame rate at 30 fps, uses a device-pixel ratio of 1, and halves particle and star counts.
- **Visual intensity:** Low, Normal, or High particle and star density.
- **Reduced motion:** on by default when the system asks for it. Slows rotation and swaps the strobing node wave for a steady glow. Overdrive removes the particle burst and the screen wash.
- Settings are stored in `localStorage` under one key, `livingPortal.settings.v1`. Storage errors are caught, and the page still works without it.

## Known limitations

- Pluto and the Moon are approximate. Eclipses, retrograde stations, and exact conjunction times are not claimed.
- Overdrive and boost timers use wall-clock time, so they keep running while the page is hidden. The loop itself stops.
- The `index.html` file is a single document of roughly 1,200 lines. It is intentionally not split further.
