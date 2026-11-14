// Regression check: no town name, star row or event-icon row may fall outside the visible map,
// for several days × screen sizes (portrait, Reddit post view, desktop, wide-and-short).
// Usage: npx vite build && (cd dist/client && python3 -m http.server 8765) & node scripts/ui/clipcheck.cjs
// Needs Playwright with Chromium. Exits 1 if anything is clipped.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); let bad = 0, checked = 0;
  const sizes = [['phone', 375, 700, true], ['phone-small', 360, 640, true], ['post', 720, 600, false], ['desk', 1280, 800, false], ['wide-short', 1000, 480, false]];
  for (const date of ['2026-11-13', '2026-11-14', '2026-11-16', '2026-11-21', '2026-12-02', '2026-12-09', '2026-12-21', '2027-01-05']) {
    for (const [name, w, h, touch] of sizes) {
      const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: touch });
      await p.clock.setFixedTime(new Date(date + 'T12:00:00Z'));
      await p.goto('http://localhost:8765/game.html'); await p.waitForTimeout(700);
      await p.evaluate(() => document.querySelector('#hintx')?.click()); await p.waitForTimeout(100);
      const res = await p.evaluate(() => {
        const m = document.querySelector('.mapwrap').getBoundingClientRect(); const out = [];
        for (const el of document.querySelectorAll('#map .tname, #map .tstars, #map .evrow')) {
          const r = el.getBoundingClientRect();
          if (r.left < m.left - 0.5 || r.right > m.right + 0.5 || r.top < m.top - 0.5 || r.bottom > m.bottom + 0.5) out.push((el.textContent || 'row').slice(0, 18) + ` [${Math.round(r.left - m.left)},${Math.round(m.right - r.right)},${Math.round(r.top - m.top)},${Math.round(m.bottom - r.bottom)}]`);
        }
        return { out, n: document.querySelectorAll('#map .tname').length, rot: document.querySelector('#map').getAttribute('viewBox') };
      });
      checked += res.n;
      if (res.out.length) { bad += res.out.length; console.log(date, name, 'CLIPPED:', res.out.join(' | ')); }
      await p.close();
    }
  }
  console.log("labels checked:", checked, "clipped:", bad); await b.close(); process.exit(bad ? 1 : 0);
})();
