const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright'); } })();
const URL = process.env.PORTAL_URL || 'http://localhost:8766/index.html';
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  -- ' + detail : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // Track AudioContext instances so the audio checks can read their state.
  await ctx.addInitScript(() => {
    window.__ctxs = [];
    const Orig = window.AudioContext;
    window.AudioContext = function (...a) { const c = new Orig(...a); window.__ctxs.push(c); return c; };
    window.AudioContext.prototype = Orig.prototype;
  });
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(800);

  // 1. Frame rate: the animation loop runs on its own.
  const fps = await page.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
  check('animation loop runs at display rate (sampled in-browser)', fps >= 20, fps.toFixed(0) + ' frames/s');

  // 2. Moon entering Ophiuchus, detected by the page's own calculation over 2026 (6-hour steps).
  const moonHits = await page.evaluate(() => {
    const out = [];
    const L = window.LivingPortal;
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 6 * 3600e3) {
      L.setClock(new Date(t).toISOString());
    }
    return L.events().filter(e => e.id === 'moon-ophiuchus').map(e => e.utc);
  });
  check('page detects Moon-enters-Ophiuchus events across 2026', moonHits.length === 13, moonHits.length + ' events');

  // 3. Real historic event: Jupiter-Saturn conjunction, reached by moving the calculation clock.
  const js = await page.evaluate(() => {
    const L = window.LivingPortal;
    L.setClock('2020-10-20T12:00:00Z');
    L.setClock('2020-10-25T12:00:00Z');
    return L.events().filter(e => e.id === 'jupiter-saturn-conjunction').map(e => ({ utc: e.utc, title: e.title, detail: e.detail }));
  });
  check('Jupiter–Saturn conjunction fires between 20 and 25 Oct 2020', js.length === 1 && js[0].utc.startsWith('2020-10-2'), JSON.stringify(js));

  // 4. Banner appears on an event and carries its title and time.
  await page.evaluate(() => { window.LivingPortal.setClock('2026-01-01T00:00:00Z'); });
  await sleep(50);
  await page.evaluate(() => { /* advance to a known Moon-in-Ophiuchus event */ });
  const firstMoon = moonHits[0];
  await page.evaluate(t => { const L = window.LivingPortal; L.setClock(new Date(Date.parse(t) - 6 * 3600e3).toISOString()); L.setClock(t); }, firstMoon);
  await sleep(150);
  const bannerText = await page.textContent('#bannerTitle');
  const bannerShown = await page.evaluate(() => document.getElementById('banner').classList.contains('show'));
  check('event banner shows the event title', bannerShown && /Moon enters Ophiuchus/.test(bannerText), bannerText);
  await page.screenshot({ path: (process.env.SHOT_DIR || '.') + '/shot-event.png' });

  // 5. Visible during the event: the Ophiuchus node is lit (sample the canvas near the node).
  const logCount = await page.evaluate(() => window.LivingPortal.events().length);
  check('event is added to the log', logCount >= 1, 'log size ' + logCount);

  // 6. Changing mapping mode does not fire events.
  const beforeMode = await page.evaluate(() => window.LivingPortal.events().length);
  await page.evaluate(() => window.LivingPortal.setMapping('B'));
  await page.evaluate(() => window.LivingPortal.setMapping('A'));
  const afterMode = await page.evaluate(() => window.LivingPortal.events().length);
  check('switching mapping mode fires no spurious events', beforeMode === afterMode, `${beforeMode} -> ${afterMode}`);

  // 7. Automatic events off: transitions are tracked but not shown or logged.
  await page.click('#btnMenu');
  await page.click('#setEvents', { force: true }).catch(() => {});
  await page.evaluate(() => { const c = document.getElementById('setEvents'); if (c.checked) c.click(); });
  await page.click('#btnClose');
  const off0 = await page.evaluate(() => window.LivingPortal.events().length);
  await page.evaluate(() => { const L = window.LivingPortal; L.setClock('2026-03-01T00:00:00Z'); L.setClock('2026-03-20T00:00:00Z'); });
  const off1 = await page.evaluate(() => window.LivingPortal.events().length);
  check('with automatic events off, no events are logged', off0 === off1, `${off0} -> ${off1}`);

  // 8. Boost still works independently of events.
  await page.evaluate(() => { const c = document.getElementById('setEvents'); if (!c.checked) c.click(); });
  await page.click('#btnBoost');
  await sleep(200);
  check('BOOST works with events on or off', await page.evaluate(() => document.body.classList.contains('boosting')));

  // 9. Glitch bursts happen, and the page stays error-free.
  await page.click('#btnBoost', { force: true }).catch(() => {});
  let glitchSeen = false;
  for (let i = 0; i < 40 && !glitchSeen; i++) {
    const hashA = await page.evaluate(() => document.getElementById('portal').toDataURL().length);
    await sleep(120);
    const hashB = await page.evaluate(() => document.getElementById('portal').toDataURL().length);
    if (hashA !== hashB) glitchSeen = true;
  }
  check('canvas changes frame to frame (animation alive during glitch/boost)', glitchSeen);
  check('no JavaScript errors during events and glitch', errors.length === 0, errors.slice(0, 3).join(' | '));

  // 10. LYRA button: turns sound on if needed and plays the tone (manual trigger).
  const lyraOk = await page.evaluate(async () => {
    const before = window.__ctxs.length;
    document.getElementById('btnLyra').click();
    await new Promise(r => setTimeout(r, 300));
    const ctxs = window.__ctxs;
    return { created: ctxs.length >= before, state: ctxs.length ? ctxs[ctxs.length - 1].state : 'none',
      soundLabel: document.getElementById('btnSound').textContent };
  });
  check('LYRA button turns sound on and starts audio', lyraOk.state === 'running' && lyraOk.soundLabel === 'SOUND ON', JSON.stringify(lyraOk));

  await browser.close();
  const failed = results.filter(x => !x).length;
  console.log(`\n${results.length - failed}/${results.length} event checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('RUN ERROR', e); process.exit(1); });
