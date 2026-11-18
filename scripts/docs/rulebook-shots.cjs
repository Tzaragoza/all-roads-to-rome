// Screenshots for the rulebook, taken from the real game (dist/client must be built: `npx vite build`).
// Writes docs/img/rulebook/*.png. Needs Playwright with Chromium (`npx playwright install chromium`).
//   node scripts/docs/rulebook-shots.cjs
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '../../dist/client');
const OUT = path.join(__dirname, '../../docs/img/rulebook');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
// Hide teaching overlays and floating controls: the rulebook shows the board itself.
const CLEAN = '.coach,.dock,.lens,.tutring,.tutglow,.hint,.msg,#zoomreset,.lensmode,.turncard{display:none!important} .tutpulse{animation:none!important;box-shadow:none!important;outline:none!important}';

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(0);
  const url = `http://localhost:${server.address().port}/game.html`;
  const b = await chromium.launch();
  const page = async (date, vp, tutorial) => {
    const p = await b.newPage({ viewport: vp, deviceScaleFactor: 2 });
    await p.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.setAttribute('data-nofx', ''))); // still frames: no one-shot effects
    await p.clock.setFixedTime(new Date(`${date}T12:00:00Z`));
    if (!tutorial) await p.addInitScript(() => localStorage.setItem('arlr.tutorial', 'skipped'));
    await p.goto(url); await p.waitForTimeout(900);
    return p;
  };
  const click = (p, sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!el; }, sel);
  const shot = async (p, sel, name, clean = true) => {
    if (clean) await p.addStyleTag({ content: CLEAN });
    await p.waitForTimeout(250);
    // the UI re-renders often, so clip by the element's box instead of holding a handle to it
    const r = await p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }, sel);
    if (!r || !r.width) throw new Error(`rulebook-shots: ${sel} not found for ${name}: ${JSON.stringify(r)} ${await p.evaluate(() => (() => { let e = document.querySelector('.forecast'), o = []; while (e) { const cs = getComputedStyle(e); if (cs.display === 'none') o.push(e.className || e.tagName); e = e.parentElement; } return o.join(','); })())}`);
    await p.screenshot({ path: path.join(OUT, `${name}.png`), clip: r });
  };
  const dismiss = async (p) => { await click(p, '#decreego'); await click(p, '.decreebox button'); await click(p, '#hintx'); await p.waitForTimeout(200); };

  // 1. Cover: a real day, landscape
  let p = await page('2026-11-15', { width: 1400, height: 820 });
  await dismiss(p); await shot(p, '.mapwrap', 'cover'); await p.close();

  // 2. The tutorial map, step by step (portrait)
  p = await page('2026-11-16', { width: 760, height: 1000 }, true);
  await click(p, '#tutstart'); await p.waitForTimeout(200);
  await click(p, '#tutnext');
  await p.addStyleTag({ content: CLEAN });
  await shot(p, '.mapwrap', 'tut-start', false);
  await click(p, 'g.road[data-road="0"] .hit'); await click(p, 'g.road[data-road="3"] .hit'); await p.waitForTimeout(200);
  await shot(p, '.mapwrap', 'tut-roads', false);
  await click(p, '#end'); await p.waitForTimeout(300); await click(p, '#turncard');
  await shot(p, '.forecast', 'tut-forecast', false);
  await shot(p, '.mapwrap', 'tut-threat', false);
  await click(p, '#tutnext'); await click(p, '#tutnext');
  await click(p, '[data-leg="0"] .leghit'); await p.waitForTimeout(150);
  await shot(p, '.mapwrap', 'tut-march', false);
  await click(p, 'g.town[data-town="3"] .thit'); await click(p, 'g.road[data-road="5"] .hit'); await click(p, 'g.road[data-road="6"] .hit'); await p.waitForTimeout(200);
  await click(p, '[data-lens="military"]'); await p.waitForTimeout(200);
  await shot(p, '.mapwrap', 'tut-shield', false);
  await click(p, '[data-lens="map"]'); await click(p, '#tutnext');
  await click(p, '#end'); await p.waitForTimeout(250); await click(p, '#turncard'); await click(p, '#end'); await p.waitForTimeout(250); await click(p, '#end'); await p.waitForTimeout(400);
  await shot(p, '.status', 'tut-card', false);
  await shot(p, '.mapwrap', 'tut-revolt', false);
  await p.close();

  // 3. A gambit offer, and the decree banner
  p = await page('2026-11-23', { width: 1400, height: 820 });
  await dismiss(p); await shot(p, '.offer', 'gambit');
  await shot(p, '#decree', 'decree-banner');
  await click(p, '#decree'); await p.waitForTimeout(250); await shot(p, '.decreebox', 'decree-sheet');
  await p.close();

  await b.close(); server.close();
  console.log(`rulebook screenshots: ${fs.readdirSync(OUT).length} files in docs/img/rulebook`);
}
main().catch((e) => { console.error(e); process.exit(1); });
