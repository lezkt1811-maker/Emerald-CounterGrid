const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright'); } })();
const URL = process.env.PORTAL_URL || 'http://localhost:8766/index.html';
const results = [];
const check = (name, ok, detail) => { results.push([ok, name, detail || '']); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  -- ' + detail : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctxOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const context = await browser.newContext(ctxOpts);
  // Track every AudioContext and every network request.
  await context.addInitScript(() => {
    window.__ctxs = [];
    const Orig = window.AudioContext;
    window.AudioContext = function (...a) { const c = new Orig(...a); window.__ctxs.push(c); return c; };
    window.AudioContext.prototype = Orig.prototype;
  });
  const external = [];
  await context.route('**/*', route => {
    const u = route.request().url();
    if (!u.startsWith('http://localhost:8766/')) external.push(u);
    route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'load' });
  await sleep(800);

  // 1. Starts automatically, animates without interaction.
  const snap = () => page.evaluate(() => document.getElementById('portal').toDataURL());
  const a1 = await snap(); await sleep(700); const a2 = await snap();
  check('portal animates on load without interaction', a1 !== a2);
  check('no AudioContext created before a user gesture', (await page.evaluate(() => window.__ctxs.length)) === 0);
  check('sound starts OFF', (await page.textContent('#btnSound')) === 'SOUND OFF');

  // 2. Planetary positions are calculated, with a timestamp and a coordinate system.
  const mode = await page.textContent('#modeLine');
  check('timestamp and coordinate system are shown', /UTC/.test(mode) && /Mode A/.test(mode), mode);
  await page.click('#btnMenu');
  const rowsA = await page.$$eval('#planetTable tbody tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent)));
  check('all ten bodies are listed', rowsA.length === 10, 'rows=' + rowsA.length);
  const lons = rowsA.map(r => parseFloat(r[1]));
  check('longitudes are finite and not a flat/random placeholder', lons.every(x => isFinite(x) && x >= 0 && x < 360) && new Set(lons).size === lons.length);
  check('provisional Mode A status is shown', (await page.textContent('#planetTable')).includes('PROVISIONAL'));

  // 3. Mode switch updates the indicators: Mode B shows real constellations.
  await page.selectOption('#setMapping', 'B');
  await sleep(300);
  const rowsB = await page.$$eval('#planetTable tbody tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent)));
  const headB = await page.$$eval('#planetTable thead th', ths => ths.map(t => t.textContent));
  check('Mode B switches the table to constellation names', headB.includes('Constellation'), headB.join('|'));
  const constNames = rowsB.map(r => r[3]);
  check('Mode B reports IAU constellation names', constNames.every(n => n && !/\(\d+%\)/.test(n)), constNames.join(', '));
  const offRing = rowsB.filter(r => r[4] === 'off-ring').length;
  check('Mode B: planets outside the 13 zodiacal constellations are listed as off-ring', rowsB.every(r => r[4] === 'off-ring' || /^(Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Ophiuchus|Sagittarius|Capricorn|Aquarius|Pisces)$/.test(r[4])), 'off-ring=' + offRing);
  const modeLineB = await page.textContent('#modeLine');
  check('mode line reflects Mode B', /Mode B/.test(modeLineB), modeLineB);
  await page.selectOption('#setMapping', 'A');
  await sleep(200);
  const headA = await page.$$eval('#planetTable thead th', ths => ths.map(t => t.textContent));
  check('switching back to Mode A restores the band column', headA.includes('Band'));
  await page.click('#btnClose');

  // 4. Boost: visible indicator, intensifies, returns to normal, no stacking.
  const beforeBoost = await page.evaluate(() => document.body.className);
  await page.click('#btnBoost');
  await sleep(300);
  check('BOOST shows a visible active state', (await page.evaluate(() => document.body.classList.contains('boosting'))) === true);
  check('BOOST status line counts down', /BOOST ACTIVE/.test(await page.textContent('#coolLine')));
  await page.click('#btnBoost', { force: true }).catch(() => {});
  await sleep(200);
  const ready1 = await page.textContent('#coolLine');
  check('a second BOOST press during boost is ignored (no stacking)', /BOOST ACTIVE \d+s/.test(ready1));
  await sleep(8600);
  check('BOOST returns to normal after ~8 s', (await page.evaluate(() => document.body.classList.contains('boosting'))) === false, (await page.textContent('#coolLine')));
  check('boost cooldown is shown afterwards', /boost ready in \d+s/.test(await page.textContent('#coolLine')));

  // 5. Overdrive.
  await page.click('#btnOver');
  await sleep(300);
  check('OVERDRIVE shows a visible active state', (await page.evaluate(() => document.body.classList.contains('overdrive'))) === true);
  await sleep(4200);
  check('OVERDRIVE returns to normal after ~4 s', (await page.evaluate(() => document.body.classList.contains('overdrive'))) === false);
  const od = await page.textContent('#coolLine');
  check('overdrive cooldown is shown', /overdrive ready in/.test(od), od);

  // 6. Sound controls: on creates a running context, mute suspends it, leaving the page closes it.
  await page.click('#btnSound');
  await sleep(300);
  const st1 = await page.evaluate(() => window.__ctxs.map(c => c.state));
  check('sound ON creates and runs an AudioContext after a click', st1.length >= 1 && st1[st1.length - 1] === 'running', JSON.stringify(st1));
  await page.click('#btnSound');
  await sleep(600);
  const st2 = await page.evaluate(() => window.__ctxs.map(c => c.state));
  check('muting suspends audio (stops output)', st2[st2.length - 1] === 'suspended', JSON.stringify(st2));
  await page.click('#btnSound');
  await sleep(300);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await sleep(200);
  const st3 = await page.evaluate(() => window.__ctxs.map(c => c.state));
  check('leaving the page closes audio', st3.includes('closed'), JSON.stringify(st3));

  // 7. Pause/resume.
  await page.click('#btnPause');
  const p1 = await snap(); await sleep(400); const p2 = await snap();
  check('PAUSE freezes the animation', p1 === p2);
  await page.click('#btnPause');
  await sleep(300);
  const r1 = await snap(); await sleep(400); const r2 = await snap();
  check('RESUME restarts the animation', r1 !== r2);

  // 8. Mobile layout: no overflow, big targets.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('no horizontal scroll at 390px width', !overflow);
  const box = await page.$eval('#btnBoost', b => b.getBoundingClientRect().height);
  check('BOOST button is at least 56px tall (touch target)', box >= 56, box + 'px');
  await page.screenshot({ path: (process.env.SHOT_DIR || '.') + '/shot-mobile.png' });

  // 9. Calculation failure keeps the animation running and says so.
  const fail = await browser.newContext(ctxOpts);
  await fail.addInitScript(() => {
    let real;
    Object.defineProperty(window, 'LivingPortalAstro', {
      configurable: true,
      get() { return real && { ...real, computePositions() { throw new Error('test: ephemeris unavailable'); } }; },
      set(v) { real = v; }
    });
  });
  const fp = await fail.newPage();
  const ferr = [];
  fp.on('pageerror', e => ferr.push(e.message));
  await fp.goto(URL); await sleep(1200);
  const f1 = await fp.evaluate(() => document.getElementById('portal').toDataURL()); await sleep(500);
  const f2 = await fp.evaluate(() => document.getElementById('portal').toDataURL());
  check('when calculation fails, the animation keeps running', f1 !== f2);
  check('failure is flagged as needing refresh', /needs refreshing/.test(await fp.textContent('#modeLine')), await fp.textContent('#modeLine'));
  await fail.close();

  // 10. Low-power and reduced-motion settings load and run without errors.
  const lp = await browser.newContext(ctxOpts);
  await lp.addInitScript(() => localStorage.setItem('livingPortal.settings.v1', JSON.stringify({ battery: true, reduced: true, intensity: 'low', mapping: 'B' })));
  const lpp = await lp.newPage();
  const lerr = [];
  lpp.on('pageerror', e => lerr.push(e.message));
  await lpp.goto(URL); await sleep(900);
  await lpp.click('#btnOver'); await sleep(500);
  check('battery + reduced-motion + Mode B load and run without errors', lerr.length === 0, lerr.join('; '));
  await lp.close();

  // 11. No external requests and no page errors in the main session.
  check('no requests leave the page (everything served locally)', external.length === 0, external.slice(0, 3).join(' '));
  check('no JavaScript errors in the main session', errors.length === 0, errors.join(' | '));

  await browser.close();
  const failed = results.filter(r => !r[0]).length;
  console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST RUN ERROR', e); process.exit(1); });
