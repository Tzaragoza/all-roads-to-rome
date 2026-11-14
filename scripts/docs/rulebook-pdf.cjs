// Print docs/rulebook.html to docs/rulebook.pdf (A4) and check that no page overflows.
//   node scripts/docs/rulebook-pdf.cjs
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.join(__dirname, '../../docs/rulebook.html'));
  await p.evaluate(() => document.fonts.ready);
  const over = await p.evaluate(() => [...document.querySelectorAll('.page')].map((pg, i) => {
    const inner = pg.querySelector('.inner'), box = inner.getBoundingClientRect();
    const bottom = Math.max(...[...inner.querySelectorAll('*')].map((e) => e.getBoundingClientRect().bottom));
    return bottom > box.bottom + 1 ? `page ${i + 1} overflows by ${Math.round(bottom - box.bottom)}px` : null;
  }).filter(Boolean));
  await p.pdf({ path: path.join(__dirname, '../../docs/rulebook.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await b.close();
  if (over.length) { console.error(over.join('\n')); process.exit(1); }
  console.log('docs/rulebook.pdf written, no page overflows');
})();
