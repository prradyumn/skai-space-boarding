// Optional smoke test. Needs Playwright: npm i -D playwright && npx playwright install chromium
// Starts from the single-file build, taps the lock once (the only interaction), lets the tour play
// itself with reduced motion (instant jumps), screenshots every tagline and the finale at desktop
// and mobile sizes, and fails on any page error, a tagline that spills out of its box, or horizontal overflow.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const file = 'file://' + path.resolve(__dirname, '../dist-single/skai-space.html');
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    p.on('pageerror', e => errors.push(`${tag}: ${e.message}`));
    await p.goto(file);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: path.join(__dirname, `shots/${tag}-0-door.png`) });
    await p.click('#core');
    const seen = new Set(); const t0 = Date.now(); let done = false;
    while (!done && Date.now() - t0 < 150000) {
      const st = await p.evaluate(() => ({
        line: document.querySelector('#tag').classList.contains('show') ? document.querySelector('#tA').textContent : '',
        fin: document.querySelector('#launch').classList.contains('show'),
        spill: [...document.querySelectorAll('#tag p')].some(l => l.scrollWidth > l.clientWidth + 1)
      }));
      if (st.line && !seen.has(st.line)) {
        seen.add(st.line); if (st.spill) errors.push(`${tag}: tagline "${st.line}" spills out of its box`);
        await p.screenshot({ path: path.join(__dirname, `shots/${tag}-tag${seen.size}.png`) });
      }
      if (st.fin) { await p.waitForTimeout(800); await p.screenshot({ path: path.join(__dirname, `shots/${tag}-finale.png`) }); done = true; }
      await p.waitForTimeout(200);
    }
    if (!done) errors.push(`${tag}: finale never appeared (saw ${seen.size} taglines)`);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) errors.push(`${tag}: horizontal overflow`);
    await p.close();
  }
  await b.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('Smoke test passed. Screenshots in tests/shots/');
})();
