// Regression check: no town name, star row or event-icon row may fall outside the visible map,
// for several days × screen sizes (portrait, Reddit post view, desktop, wide-and-short).
// Usage: npx vite build && (cd dist/client && python3 -m http.server 8765) & node scripts/ui/clipcheck.cjs
// Also counts town names covered by an event pill or event art (overlaps), reported and failing above 2%.
// Needs Playwright with Chromium. Exits 1 if anything is clipped or overlaps exceed the budget.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); let bad = 0, checked = 0, covered = 0;
  const sizes = [['phone', 375, 700, true], ['phone-small', 360, 640, true], ['post', 720, 600, false], ['desk', 1280, 800, false], ['wide-short', 1000, 480, false]];
  for (const date of ['2026-11-13', '2026-11-14', '2026-11-16', '2026-11-21', '2026-12-02', '2026-12-09', '2026-12-21', '2027-01-05']) {
    for (const [name, w, h, touch] of sizes) {
      const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: touch });
      await p.clock.setFixedTime(new Date(date + 'T12:00:00Z'));
      await p.addInitScript(() => { localStorage.setItem('arlr.pinch', '1'); localStorage.setItem('arlr.pinch2', '9'); });
      await p.goto('http://localhost:8765/game.html'); await p.waitForTimeout(700);
      await p.evaluate(() => document.querySelector('#hintx')?.click()); await p.waitForTimeout(100);
      const res = await p.evaluate(() => {
        const m = document.querySelector('.mapwrap').getBoundingClientRect(); const out = [];
        for (const el of document.querySelectorAll('#map .tname, #map .tstars, #map .evrow, #map .shorebadge')) {
          const r = el.getBoundingClientRect();
          if (r.left < m.left - 0.5 || r.right > m.right + 0.5 || r.top < m.top - 0.5 || r.bottom > m.bottom + 0.5) out.push((el.textContent || 'row').slice(0, 18) + ` [${Math.round(r.left - m.left)},${Math.round(m.right - r.right)},${Math.round(r.top - m.top)},${Math.round(m.bottom - r.bottom)}]`);
        }
        // names covered by event art or event pills (small shapes only: tribe rims and clip paths are not art)
        const art = [...document.querySelectorAll('#map .evrow, #map g[data-ev] *')].filter((e) => e.tagName !== 'g' && !e.closest('defs')).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 3 && r.width < 40 && r.height < 40);
        const hit = (a, c) => a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1;
        const cov = [...document.querySelectorAll('#map .tname')].filter((t) => { const r = t.getBoundingClientRect(); return art.some((x) => hit(r, x)); }).map((t) => t.textContent);
        // road prices (milestones, rubble badges) covered by a town's port/frontier badge or its event pill
        const cover = (sel) => { const tags = [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()); return [...document.querySelectorAll('#map .mile, #map .ruinbadge')].filter((m) => tags.some((t) => hit(m.getBoundingClientRect(), t))).length; };
        const own = (e) => e.closest('#map > g > g, #map g[transform]');
        const rows = [...document.querySelectorAll('#map .tstars, #map .tcoin')];
        const onRows = [...document.querySelectorAll('#map .tname')].filter((n) => { const r = n.getBoundingClientRect(), g = n.parentElement; return rows.some((o) => o.parentElement?.parentElement !== g && !g.contains(o) && hit(r, o.getBoundingClientRect())); }).map((n) => n.textContent);
        const byBadge = cover('#map .shorebadge'), byPill = cover('#map .evrow rect.pill'), prices = byBadge + byPill;
        return { onRows, prices, byBadge, byPill, out, cov, n: document.querySelectorAll('#map .tname').length, rot: document.querySelector('#map').getAttribute('viewBox') };
      });
      checked += res.n;
      if (res.out.length) { bad += res.out.length; console.log(date, name, 'CLIPPED:', res.out.join(' | ')); }
      if (res.onRows.length) { covered += res.onRows.length; console.log(date, name, 'names on a neighbour\'s stars:', res.onRows.join(', ')); }
      if (res.prices) { covered += res.prices; console.log(date, name, 'road prices covered:', res.prices, `(badges ${res.byBadge}, event pills ${res.byPill})`); }
      if (res.cov.length) { covered += res.cov.length; console.log(date, name, 'covered:', res.cov.join(', ')); }
      await p.close();
    }
  }
  console.log("labels checked:", checked, "clipped:", bad, "names or road prices covered:", covered); await b.close(); process.exit(bad || covered > checked * 0.02 ? 1 : 0);
})();
