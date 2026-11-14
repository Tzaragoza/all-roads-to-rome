// Subreddit icon + banners drawn in the game's own visual language.
// Usage: node tools/brand/brand.cjs <outdir>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || 'dist/brand';
fs.mkdirSync(OUT, { recursive: true });

const PAPER = '#f3ead6', INK = '#3b2f1e', RED = '#8b1a1a', THREAT = '#b3261e';
const TRIBES = ['#c9a227', '#4f8a5b', '#7b5ea7', '#b5651d'];
const LEGION = ['#1f5fa8', '#c27c0e'];

// deterministic PRNG
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function network(W, H, castra, n, minDist, seed) {
  const R = rng(seed);
  const pts = [castra];
  let tries = 0;
  while (pts.length < n && tries++ < 20000) {
    const p = { x: 30 + R() * (W - 60), y: 30 + R() * (H - 60) };
    if (pts.every((q) => d2(p, q) >= minDist * minDist)) pts.push(p);
  }
  const edges = [];
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const dij = d2(pts[i], pts[j]);
      if (pts.every((k, ki) => ki === i || ki === j || d2(pts[i], k) + d2(pts[j], k) >= dij)) edges.push([i, j]);
    }
  // BFS hops from castra
  const adj = pts.map(() => []);
  edges.forEach(([a, b], e) => { adj[a].push([b, e]); adj[b].push([a, e]); });
  const hop = pts.map(() => Infinity), parentEdge = pts.map(() => -1);
  hop[0] = 0; const q = [0];
  for (let i = 0; i < q.length; i++) for (const [v, e] of adj[q[i]]) if (hop[v] === Infinity) { hop[v] = hop[q[i]] + 1; parentEdge[v] = e; q.push(v); }
  return { pts, edges, hop, parentEdge, R };
}

function octagon(x, y, r) {
  const p = [];
  for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; p.push(`${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`); }
  return p.join(' ');
}

const FONT = fs.readFileSync(path.join(__dirname, 'cinzel-latin-800-normal.woff2')).toString('base64');
const defs = `<defs>
  <style>@font-face { font-family: 'Cinzel'; font-weight: 800; src: url(data:font/woff2;base64,${FONT}) format('woff2'); }</style>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff3b0"/><stop offset=".35" stop-color="#e8c25a"/><stop offset=".55" stop-color="#c9971f"/>
    <stop offset=".75" stop-color="#e2b84a"/><stop offset="1" stop-color="#8a5f0e"/>
  </linearGradient>
  <filter id="clear" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="18"/></filter>
  <filter id="emboss" x="-5%" y="-30%" width="110%" height="160%">
    <feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#2b1a05" flood-opacity=".55"/>
  </filter>
  <radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset="60%" stop-color="${PAPER}" stop-opacity="0"/><stop offset="100%" stop-color="#b9a47a" stop-opacity=".55"/></radialGradient>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .36  0 0 0 0 .22  0 0 0 .09 0"/></filter>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#3b2f1e" flood-opacity=".35"/></filter>
</defs>`;

function paper(W, H) {
  return `<rect width="${W}" height="${H}" fill="${PAPER}"/><rect width="${W}" height="${H}" filter="url(#grain)"/><rect width="${W}" height="${H}" fill="url(#vig)"/>`;
}

function standard(x, y, s, col, num) {
  return `<g filter="url(#soft)"><line x1="${x}" y1="${y + 14 * s}" x2="${x}" y2="${y - 4 * s}" stroke="#3b2410" stroke-width="${2 * s}"/>` +
    `<rect x="${x}" y="${y - 4 * s}" width="${11 * s}" height="${8.5 * s}" fill="${col}" stroke="#3b2410" stroke-width="${.8 * s}"/>` +
    `<text x="${x + 5.5 * s}" y="${y + 2.6 * s}" font-size="${6.5 * s}" font-family="Georgia,serif" font-weight="bold" fill="#fff" text-anchor="middle">${num}</text></g>`;
}

/** Render a banner-style network scene. */
function scene(W, H, opt) {
  const { pts, edges, hop, parentEdge, R } = network(W, H, opt.castra, opt.n, opt.minDist, opt.seed);
  const built = new Set();
  pts.forEach((_, v) => { if (v && hop[v] <= opt.reach) built.add(parentEdge[v]); });
  // a couple of redundant roads among built towns
  edges.forEach(([a, b], e) => { if (!built.has(e) && hop[a] <= opt.reach - 1 && hop[b] <= opt.reach - 1 && R() < 0.5) built.add(e); });
  // threat: a built frontier road
  const frontier = [...built].filter((e) => Math.max(hop[edges[e][0]], hop[edges[e][1]]) === opt.reach);
  const threat = frontier.length ? frontier[Math.floor(R() * frontier.length)] : -1;
  const tribeOf = (p) => Math.min(TRIBES.length - 1, Math.floor((opt.tribeAxis === 'x' ? p.x / W : p.y / H) * TRIBES.length * 0.999));
  const s = opt.scale;
  const out = [paper(W, H)];
  // roads
  edges.forEach(([a, b], e) => {
    const A = pts[a], B = pts[b];
    if (e === threat) out.push(`<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="${THREAT}" stroke-width="${5 * s}" stroke-dasharray="${10 * s} ${5 * s}" stroke-linecap="round"/>`);
    else if (built.has(e)) out.push(`<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="${INK}" stroke-width="${5 * s}" stroke-linecap="round"/>`);
    else {
      out.push(`<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="#a8987a" stroke-width="${2 * s}" stroke-dasharray="${6 * s} ${6 * s}" stroke-linecap="round" opacity=".8"/>`);
      if (R() < 0.35) {
        const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
        out.push(`<circle cx="${mx}" cy="${my}" r="${7.5 * s}" fill="${PAPER}" stroke="#b9ad92" stroke-width="${1 * s}"/><text x="${mx}" y="${my + 3.6 * s}" font-size="${10 * s}" font-family="system-ui,sans-serif" fill="#7a6a4f" text-anchor="middle">${1 + Math.floor(R() * 5)}</text>`);
      }
    }
  });
  // towns
  const garrisonAt = pts.findIndex((_, v) => hop[v] === Math.max(1, opt.reach - 1));
  const flags = [];
  pts.forEach((p, v) => {
    if (v === 0) {
      out.push(`<circle cx="${p.x}" cy="${p.y}" r="${15 * s}" fill="${RED}" stroke="${INK}" stroke-width="${3 * s}" filter="url(#soft)"/>`);
      return;
    }
    const supplied = hop[v] <= opt.reach;
    const r = (7 + R() * 5) * s;
    const fill = TRIBES[tribeOf(p)];
    const op = supplied ? 1 : 0.55;
    if (v === garrisonAt) {
      out.push(`<polygon points="${octagon(p.x, p.y, r + 5 * s)}" fill="#e6d3a8" stroke="#6b4220" stroke-width="${3.5 * s}" stroke-dasharray="${2.2 * s} ${1.2 * s}"/>`);
      out.push(`<polygon points="${octagon(p.x, p.y, r + 1 * s)}" fill="${fill}" stroke="#6b4220" stroke-width="${1.5 * s}"/>`);
    } else {
      if (!supplied) out.push(`<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${PAPER}"/>`); // hide roads under faded towns
      out.push(`<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${fill}" opacity="${op}" stroke="${supplied ? INK : '#fff'}" stroke-width="${(supplied ? 2.5 : 1.5) * s}"${supplied ? ' filter="url(#soft)"' : ''}/>`);
    }
    if (supplied && hop[v] === opt.reach && flags.length < 2 && R() < 0.6) flags.push([p, r]);
  });
  flags.forEach(([p, r], i) => out.push(standard(p.x + r + 3 * s, p.y - 2 * s, s * 1.4, LEGION[i], ['I', 'II'][i])));
  return out.join('\n');
}

function icon(S) {
  const c = S / 2, s = S / 256;
  const out = [paper(S, S)];
  // radiating roads to towns on a ring
  const towns = [
    { a: -100, r: 92, col: TRIBES[0], rad: 15 }, { a: -35, r: 96, col: TRIBES[1], rad: 13 },
    { a: 30, r: 90, col: TRIBES[2], rad: 14 }, { a: 155, r: 94, col: TRIBES[3], rad: 13 },
  ].map((t) => ({ ...t, x: c + Math.cos((t.a * Math.PI) / 180) * t.r * s, y: c + Math.sin((t.a * Math.PI) / 180) * t.r * s }));
  // one unbuilt dashed road between two outer towns, for game identity
  out.push(`<line x1="${towns[0].x}" y1="${towns[0].y}" x2="${towns[1].x}" y2="${towns[1].y}" stroke="#a8987a" stroke-width="${4 * s}" stroke-dasharray="${8 * s} ${7 * s}" stroke-linecap="round"/>`);
  for (const t of towns) out.push(`<line x1="${c}" y1="${c}" x2="${t.x}" y2="${t.y}" stroke="${INK}" stroke-width="${12 * s}" stroke-linecap="round"/>`);
  for (const t of towns) out.push(`<circle cx="${t.x}" cy="${t.y}" r="${t.rad * s}" fill="${t.col}" stroke="${INK}" stroke-width="${5 * s}"/>`);
  out.push(`<circle cx="${c}" cy="${c}" r="${36 * s}" fill="${RED}" stroke="${INK}" stroke-width="${7 * s}"/>`);
  out.push(`<circle cx="${c}" cy="${c}" r="${24 * s}" fill="none" stroke="#e8c9a0" stroke-width="${2.5 * s}" stroke-dasharray="${4 * s} ${3 * s}" opacity=".7"/>`);
  return out.join('\n');
}

/** Gilded Roman-capital title with a paper glow behind it and ornamental rules. */
function title(cx, cy, size, text = 'ALL ROADS LEAD TO ROME', rules = true) {
  const w = text.length * size * 0.76; // approximate rendered width for Cinzel caps + tracking
  const out = [];
  out.push(`<ellipse cx="${cx}" cy="${cy - size * 0.32}" rx="${w * 0.62}" ry="${size * 0.95}" fill="${PAPER}" opacity=".93" filter="url(#clear)"/>`);
  const ly = cy - size * 0.33, gap = size * 0.35, len = size * 1.6;
  for (const dir of rules ? [-1, 1] : []) {
    const x0 = cx + dir * (w / 2 + gap), x1 = x0 + dir * len;
    out.push(`<line x1="${x0}" y1="${ly}" x2="${x1}" y2="${ly}" stroke="#b8860b" stroke-width="${size * 0.05}" stroke-linecap="round"/>`);
    const dx = x0 + dir * size * 0.05;
    out.push(`<path d="M${dx} ${ly} l${dir * size * 0.16} ${-size * 0.16} l${dir * size * 0.16} ${size * 0.16} l${-dir * size * 0.16} ${size * 0.16} z" fill="url(#gold)" stroke="#5a3c08" stroke-width="${size * 0.02}"/>`);
  }
  out.push(`<text x="${cx}" y="${cy}" font-family="Cinzel" font-weight="800" font-size="${size}" letter-spacing="${size * 0.08}" text-anchor="middle"
    fill="url(#gold)" stroke="#4a3008" stroke-width="${size * 0.035}" paint-order="stroke" filter="url(#emboss)">${text}</text>`);
  return out.join('\n');
}

function subtitle(cx, cy, size, text) {
  return `<text x="${cx}" y="${cy}" font-family="Cinzel" font-weight="800" font-size="${size}" letter-spacing="${size * 0.18}" text-anchor="middle" fill="${INK}" opacity=".85">${text}</text>`;
}

const svg = (W, H, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}${body}</svg>`;

const assets = [
  { name: 'icon-256.png', W: 256, H: 256, body: icon(256) },
  { name: 'icon-512.png', W: 512, H: 512, body: icon(512) },
  // desktop banner: castra on the right third (Reddit overlays name/icon on the left)
  { name: 'banner-desktop-1920x384.png', W: 1920, H: 384,
    body: scene(1920, 384, { castra: { x: 1500, y: 300 }, n: 46, minDist: 95, seed: 11, reach: 3, scale: 1.25, tribeAxis: 'x' }) + title(960, 112 + 0.04 * 384, 66) },
  { name: 'banner-mobile-1600x480.png', W: 1600, H: 480,
    body: scene(1600, 480, { castra: { x: 800, y: 410 }, n: 40, minDist: 105, seed: 23, reach: 3, scale: 1.3, tribeAxis: 'x' }) + title(800, 120 + 0.04 * 480, 70) },
  // project thumbnail, 3:2 (e.g. Devpost)
  { name: 'thumbnail-1500x1000.png', W: 1500, H: 1000,
    body: scene(1500, 1000, { castra: { x: 750, y: 900 }, n: 62, minDist: 125, seed: 5, reach: 3, scale: 2.1, tribeAxis: 'x' }) +
      `<ellipse cx="750" cy="300" rx="640" ry="240" fill="${PAPER}" opacity=".9" filter="url(#clear)"/>` +
      title(750, 250, 128, 'ALL ROADS', false) + title(750, 400, 128, 'LEAD TO ROME', false) +
      subtitle(750, 480, 34, 'A DAILY STRATEGY GAME FOR REDDIT') },
];

(async () => {
  const b = await chromium.launch();
  for (const a of assets) {
    const p = await b.newPage({ viewport: { width: a.W, height: a.H }, deviceScaleFactor: 1 });
    await p.setContent(`<body style="margin:0">${svg(a.W, a.H, a.body)}</body>`);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(OUT, a.name), clip: { x: 0, y: 0, width: a.W, height: a.H } });
    fs.writeFileSync(path.join(OUT, a.name.replace('.png', '.svg')), svg(a.W, a.H, a.body));
    await p.close();
  }
  await b.close();
  console.log('wrote', assets.map((a) => a.name).join(', '));
})();
