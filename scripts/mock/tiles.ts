// MOCKUP v2: modular tile board (Catan-like). One Voronoi tile per town, plus "wild" tiles
// (mountains, lakes, deep forest) in the gaps no road crosses. Tiles carry terrain and are pure
// texture; all game information sits on a separate layer on top and props never touch roads.
// PROPOSED RULE shown here (not in the game yet): a road costs the harder of the two tiles it
// crosses + the depth surcharge.
// Usage: npx tsx scripts/mock/tiles.ts [date] [turn]  -> /mnt/user-data/outputs/mockup/tiles*.png
import { mkdirSync, writeFileSync } from 'node:fs';
import season from '../../src/shared/season.json';
import {
  Rng, cloneState, generate, initialState, isOver, protectedTowns, roadsCutBy, supplied, townValue, visibleEvents,
} from '../../src/shared/engine';
import type { GameEvent, GenTrace, Scenario, State } from '../../src/shared/engine';
import { BOTS, playTurn } from '../sim/bots';
import { castraIcon, settlement, settlementSize } from './settlements';

const DATE = process.argv[2] ?? '2026-12-09';
const TURN = Number(process.argv[3] ?? 9);
const OUT = '/mnt/user-data/outputs/mockup';
mkdirSync(OUT, { recursive: true });
const entry = (season as Array<{ date: string; seed: string }>).find((e) => e.date === DATE)!;
const trace: GenTrace = {};
const sc: Scenario = generate(entry.seed, { trace });
let s: State = initialState(sc);
while (s.turn < TURN && !isOver(sc, s)) s = playTurn(sc, s, BOTS.forecast!);

type Pt = { x: number; y: number };
const K = 6, W = sc.width * K, H = sc.height * K;
const rng = new Rng(`${entry.seed}/tiles`);
const r = (a: number, b: number) => a + rng.next() * (b - a);
const INK = '#2b2116', CREAM = '#f3e6c4';
const TRIBE = ['#f0b81c', '#2f86e0', '#a24fd6', '#e0e0e0'];
const T: Pt[] = sc.towns.map((t) => ({ x: t.x * K, y: t.y * K }));
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
function distSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
const nearRoad = (p: Pt, pad: number) => sc.roads.some((rd) => distSeg(p, T[rd.a]!, T[rd.b]!) < pad);
const nearTown = (p: Pt, pad: number) => T.some((t) => dist(p, t) < pad);

// ---------------------------------------------------------------- geometry
function clip(poly: Pt[], n: Pt, c: number): Pt[] { // keep n·p <= c
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    const fp = n.x * p.x + n.y * p.y - c, fq = n.x * q.x + n.y * q.y - c;
    if (fp <= 0) out.push(p);
    if (fp * fq < 0) { const t = fp / (fp - fq); out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) }); }
  }
  return out;
}
const voronoi = (sites: Pt[]) => sites.map((si, i) => {
  let poly: Pt[] = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  sites.forEach((sj, j) => { if (j !== i) poly = clip(poly, { x: sj.x - si.x, y: sj.y - si.y }, (sj.x ** 2 + sj.y ** 2 - si.x ** 2 - si.y ** 2) / 2); });
  return poly;
});
function inset(poly: Pt[], d: number): Pt[] { // convex polygon, counter-clockwise or clockwise
  const area = poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]!; return a + p.x * q.y - q.x * p.y; }, 0);
  const sgn = Math.sign(area);
  let out = poly;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!, l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const n = { x: (sgn * (q.y - p.y)) / l, y: (-sgn * (q.x - p.x)) / l }; // outward normal
    out = clip(out, n, n.x * p.x + n.y * p.y - d);
  }
  return out;
}
const inside = (poly: Pt[], p: Pt, margin = 0) => {
  let sgn = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(c) / (Math.hypot(b.x - a.x, b.y - a.y) || 1) < margin) return false;
    const sg = Math.sign(c);
    if (sg && sgn && sg !== sgn) return false;
    if (sg) sgn = sg;
  }
  return true;
};
const polyD = (p: Pt[]) => 'M' + p.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join('L') + 'Z';

// ---------------------------------------------------------------- wild sites: fill the gaps no road crosses
let wild: Pt[] = [];
const cand: Pt[] = [];
for (let y = 6; y < sc.height - 4; y += 2.5) for (let x = 4; x < sc.width - 4; x += 2.5) cand.push({ x: x * K, y: y * K });
for (const p of rng.shuffle(cand)) if (!nearTown(p, 13 * K) && !nearRoad(p, 7.5 * K) && !wild.some((q) => dist(p, q) < 13 * K)) wild.push(p);
for (let pass = 0; pass < 6; pass++) { // a wild tile may not swallow any candidate road
  const cells = voronoi([...T, ...wild]);
  const ok = wild.filter((_, k) => !sc.roads.some((rd) => {
    for (let t = 0; t <= 1; t += 0.02) {
      const a = T[rd.a]!, b = T[rd.b]!;
      if (inside(cells[T.length + k]!, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })) return true;
    }
    return false;
  }));
  if (ok.length === wild.length) break;
  wild = ok;
}
const sites = [...T, ...wild];
const cells = voronoi(sites);

// ---------------------------------------------------------------- tile classes
// wild (no town): on the map border -> sea (west/north: Atlantic, Channel) or mountains (east/south: Alps, Pyrenees);
//                 inland -> mountains, lake or primeval forest.
// town tiles: terrain sets road cost (plain 1, light forest 2, hills 3); the settlement icon shows its ★ (Gallic until supplied, then Roman).
type Land = 'plain' | 'forest' | 'hills' | 'roman' | 'mountain' | 'sea' | 'lake' | 'wildwood';
const LAND_COST: Record<string, number> = { plain: 1, forest: 2, hills: 3, roman: 1 };
const EPS = 0.5;
const touches = (poly: Pt[]) => ({
  w: poly.some((p) => p.x < EPS), e: poly.some((p) => p.x > W - EPS), n: poly.some((p) => p.y < EPS), s: poly.some((p) => p.y > H - EPS),
});
const land: Land[] = sites.map((_, i) => {
  if (i === 0) return 'roman';
  if (i < T.length) return rng.weighted<Land>(['plain', 'forest', 'hills'], [0.5, 0.33, 0.17]);
  const b = touches(cells[i]!);
  if (b.w || b.n) return 'sea';
  if (b.e || b.s) return 'mountain';
  return rng.weighted<Land>(['mountain', 'lake', 'wildwood'], [0.4, 0.35, 0.25]);
});
// a lake touching the sea is a bay: part of the sea
for (let pass = 0; pass < 3; pass++) land.forEach((l, i) => { if (l === 'lake' && cells[i]!.some((p, k) => { const q = cells[i]![(k + 1) % cells[i]!.length]!; const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; let best = -1, bd = Infinity; sites.forEach((x, j) => { if (j !== i) { const d = dist(m, x); if (d < bd) { bd = d; best = j; } } }); return best >= 0 && land[best] === 'sea'; })) land[i] = 'sea'; });
const proposedCost = (id: number) => {
  const rd = sc.roads[id]!;
  return Math.max(LAND_COST[land[rd.a]!]!, LAND_COST[land[rd.b]!]!) + Math.floor(0.7 * Math.max(sc.towns[rd.a]!.hop, sc.towns[rd.b]!.hop));
};
// neighbour across each polygon edge
const across = (i: number, p: Pt, q: Pt) => {
  const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  if (m.x < EPS || m.y < EPS || m.x > W - EPS || m.y > H - EPS) return -1;
  let best = -1, bd = Infinity;
  sites.forEach((x, j) => { if (j !== i) { const d = dist(m, x); if (d < bd) { bd = d; best = j; } } });
  return best;
};

// ---------------------------------------------------------------- props (Small-World-ish: chunky, outlined, two-tone)
const O = '#1d1409';
const f = (n: number) => n.toFixed(1);
const pine = (x: number, y: number, k = 1, c = ['#2f6b3a', '#24532d']) => `<g transform="translate(${f(x)},${f(y)}) scale(${k.toFixed(2)})"><ellipse cx="1.5" cy="7" rx="6" ry="2.2" fill="#000" opacity=".22"/><rect x="-1.2" y="3" width="2.4" height="4" fill="#6a4423" stroke="${O}" stroke-width=".8"/><path d="M0,-12 L7,0 L3.5,0 L8,5 L-8,5 L-3.5,0 L-7,0 Z" fill="${c[0]}" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/><path d="M0,-12 L7,0 L3.5,0 L8,5 L1,5 Z" fill="${c[1]}"/></g>`;
const oak = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k.toFixed(2)})"><ellipse cx="1.5" cy="7" rx="6" ry="2.2" fill="#000" opacity=".22"/><rect x="-1.3" y="1" width="2.6" height="6" fill="#6a4423" stroke="${O}" stroke-width=".8"/><circle r="6.2" fill="#5f9a3c" stroke="${O}" stroke-width="1.3"/><path d="M4.4,-4.4 A6.2,6.2 0 0 1 -4.4,4.4 A5,5 0 0 0 4.4,-4.4" fill="#477a2c"/><circle cx="-2" cy="-2.2" r="1.8" fill="#86bf5a"/></g>`;
const hillP = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k.toFixed(2)})"><path d="M-13,5 Q-4,-12 13,5 Z" fill="#c49352" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/><path d="M-1,-5.5 Q8,-2 13,5 L3,5 Q4,-1 -1,-5.5" fill="#9a6c34"/><path d="M-7,1 l3,-3" stroke="${O}" stroke-width=".8"/></g>`;
const peak = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k.toFixed(2)})"><ellipse cx="3" cy="11" rx="18" ry="3.5" fill="#000" opacity=".25"/><path d="M-18,11 L-2,-20 L5,-9 L9,-14 L20,11 Z" fill="#9b958a" stroke="${O}" stroke-width="1.5" stroke-linejoin="round"/><path d="M-2,-20 L5,-9 L2,11 L20,11 L9,-14 L5,-9" fill="#6c665c"/><path d="M-8,-8 L-2,-20 L3.5,-12 L0,-10 L-3,-13 L-5,-8 Z" fill="#fbfaf5" stroke="${O}" stroke-width=".9" stroke-linejoin="round"/></g>`;
const curl = (x: number, y: number, k = 1, c = '#cfe7ee') => `<path d="M${f(x - 8 * k)},${f(y)} q${f(4 * k)},${f(-6 * k)} ${f(8 * k)},0 q${f(-3 * k)},${f(-1 * k)} ${f(-2 * k)},${f(-3.5 * k)}" fill="none" stroke="${c}" stroke-width="${f(1.6 * k)}" stroke-linecap="round"/>`;
const trireme = (x: number, y: number, flip: boolean) => `<g transform="translate(${f(x)},${f(y)}) scale(${flip ? -1.1 : 1.1},1.1)"><path d="M-16,8 l-3,6 M-10,8 l-3,6 M-4,8 l-3,6 M2,8 l-3,6 M8,8 l-3,6" stroke="${O}" stroke-width="1"/><path d="M-20,4 Q-18,10 -10,10 L12,10 Q18,9 22,2 L16,4 Z" fill="#7a4a24" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/><path d="M22,2 l5,-3" stroke="${O}" stroke-width="1.5"/><line x1="0" y1="4" x2="0" y2="-16" stroke="${O}" stroke-width="1.4"/><path d="M-8,-14 Q0,-10 8,-14 L8,0 Q0,3 -8,0 Z" fill="#efe2c2" stroke="${O}" stroke-width="1.2"/><path d="M-8,-7 Q0,-4 8,-7" stroke="#b3261e" stroke-width="2.4" fill="none"/>${curl(-24, 12, 0.8)}${curl(26, 12, 0.7)}</g>`;
const boat = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})"><path d="M-8,0 Q0,5 8,0 Z" fill="#8a5a2c" stroke="${O}" stroke-width="1.1"/><circle cx="-1" cy="-3" r="2" fill="#d8b089" stroke="${O}" stroke-width=".8"/><path d="M1,-2 L9,-10" stroke="${O}" stroke-width=".9"/><path d="M9,-10 L9,2" stroke="${O}" stroke-width=".4" stroke-dasharray="1 1"/></g>`;
const duck = (x: number, y: number) => `<path d="M${f(x - 4)},${f(y)} q4,-4 8,0" fill="none" stroke="${O}" stroke-width="1.1"/>`;
const reeds = (x: number, y: number) => `<path d="M${f(x - 2)},${f(y)} l-1,-7 M${f(x)},${f(y)} l0,-9 M${f(x + 2)},${f(y)} l1,-6" stroke="#4d5a28" stroke-width="1.3"/><ellipse cx="${f(x)}" cy="${f(y - 9)}" rx="1" ry="2" fill="#6a4423"/>`;
const menhirs = (x: number, y: number) => [0, 1, 2, 3, 4].map((k) => { const a = (k / 5) * Math.PI * 2; return `<path d="M${f(x + Math.cos(a) * 9 - 2.5)},${f(y + Math.sin(a) * 6 + 3)} l1,-9 q1.5,-2 3,0 l1,9 Z" fill="#b8b3a6" stroke="${O}" stroke-width="1"/>`; }).join('');
const deer = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})"><path d="M-5,0 q5,-3 9,-1 l2,-4 M6,-5 l2,-3 M6,-5 l-1,-3" fill="#a0602a" stroke="${O}" stroke-width="1.1" stroke-linecap="round"/><path d="M-4,0 l0,4 M3,0 l0,4" stroke="${O}" stroke-width="1.1"/></g>`;
const vine = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})"><path d="M-7,0 H7" stroke="#6a4423" stroke-width="1"/>${[-5, -1, 3].map((dx) => `<circle cx="${dx}" cy="-1.5" r="2" fill="#5c8a2e" stroke="${O}" stroke-width=".6"/><circle cx="${dx + 1}" cy="0.8" r="1" fill="#6b2a5a"/>`).join('')}</g>`;
const tufts = (x: number, y: number) => `<path d="M${f(x - 3)},${f(y)} q1,-4 2,0 M${f(x)},${f(y)} q.5,-5 1,0 M${f(x + 2)},${f(y)} q1,-3.5 2,0" stroke="#5e7a2a" stroke-width="1" fill="none"/>`;
const flowers = (x: number, y: number) => `<circle cx="${f(x)}" cy="${f(y)}" r="1.3" fill="${['#f2d14b', '#e8eef5', '#d5603c'][Math.floor(r(0, 3))]}" stroke="${O}" stroke-width=".4"/>`;
function scatter(poly: Pt[], spacing: number, edge: number, draw: (p: Pt) => string, max = 400, keep: (p: Pt) => boolean = () => true): string {
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pts: Pt[] = [];
  for (let k = 0; k < ((x1 - x0) * (y1 - y0)) / (spacing * spacing) * 3 && pts.length < max; k++) {
    const p = { x: r(x0, x1), y: r(y0, y1) };
    if (!inside(poly, p, edge) || !keep(p) || nearRoad(p, 2.6 * K) || nearTown(p, 6.5 * K) || pts.some((q) => dist(p, q) < spacing)) continue;
    pts.push(p);
  }
  return pts.sort((a, b) => a.y - b.y).map(draw).join('');
}
function stripes(poly: Pt[], center: Pt, pal: string[], wmin: number, wmax: number, line: string, th = r(0, Math.PI)): string {
  const u = { x: Math.cos(th), y: Math.sin(th) }, v = { x: -u.y, y: u.x };
  let g = '', o = -300;
  while (o < 300) {
    const w = r(wmin, wmax), col = pal[Math.floor(r(0, pal.length))]!;
    const a = { x: center.x + v.x * o - u.x * 400, y: center.y + v.y * o - u.y * 400 }, b = { x: center.x + v.x * o + u.x * 400, y: center.y + v.y * o + u.y * 400 };
    g += `<path d="M${f(a.x)},${f(a.y)} L${f(b.x)},${f(b.y)} L${f(b.x + v.x * w)},${f(b.y + v.y * w)} L${f(a.x + v.x * w)},${f(a.y + v.y * w)} Z" fill="${col}"/><path d="M${f(a.x)},${f(a.y)} L${f(b.x)},${f(b.y)}" stroke="${line}" stroke-width="1"/>`;
    o += w;
  }
  return g;
}

// ---------------------------------------------------------------- tiles
const BASE: Record<Land, string> = { plain: '#b6c45a', forest: '#8fb04c', hills: '#c9a25e', roman: '#d9c48c', mountain: '#8f897d', sea: '#245a78', lake: '#6fb2c4', wildwood: '#2c5a30' };
const isLand = (l: Land) => l !== 'sea';
let defs = '', sea = '', tiles = '', tex = '', rims = '';
cells.forEach((cell, i) => {
  const L = land[i]!;
  if (L === 'sea') {
    sea += `<path d="${polyD(cell)}" fill="${BASE.sea}" stroke="${BASE.sea}" stroke-width="2"/>`;
    let g = scatter(cell, 22, 6, (p) => curl(p.x, p.y, r(0.9, 1.3)), 40, () => true);
    const c = { x: cell.reduce((a, p) => a + p.x, 0) / cell.length, y: cell.reduce((a, p) => a + p.y, 0) / cell.length };
    if (rng.next() < 0.65) g += trireme(c.x, c.y, c.x > W / 2);
    tex += `<g clip-path="url(#sc${i})">${g}</g>`;
    defs += `<clipPath id="sc${i}"><path d="${polyD(cell)}"/></clipPath>`;
    return;
  }
  const t = inset(cell, 4.5);
  if (t.length < 3) return;
  defs += `<clipPath id="c${i}"><path d="${polyD(t)}"/></clipPath>`;
  tiles += `<path d="${polyD(t)}" fill="${BASE[L]}" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>`;
  const c = { x: t.reduce((a, p) => a + p.x, 0) / t.length, y: t.reduce((a, p) => a + p.y, 0) / t.length };
  let g = '';
  if (i < T.length) {
    const v = i ? townValue(s, sc.towns[i]!) : 0, home = T[i]!;
    const inFarm = (p: Pt) => dist(p, home) < 0; void v;
    if (L === 'roman') {
      // centuriation: Roman square land division, vineyards, and the limes facing Gaul
      g += stripes(t, home, ['#e3d29b', '#cdb877', '#d8c88f'], 16, 16, '#9c8a5a', 0) + stripes(t, home, ['#00000000'], 16, 16, '#9c8a5a', Math.PI / 2);
      g += scatter(t, 15, 8, (p) => vine(p.x, p.y), 18);
    } else {
      if (L === 'plain') g += scatter(t, 9, 4, (p) => (rng.next() < 0.5 ? tufts(p.x, p.y) : flowers(p.x, p.y)), 120);
      if (L === 'forest') g += scatter(t, 15, 6, (p) => (rng.next() < 0.55 ? oak(p.x, p.y, r(0.85, 1.1)) : pine(p.x, p.y, r(0.8, 1), ['#4f8f3c', '#3c7030'])), 200, (p) => !inFarm(p));
      if (L === 'hills') g += scatter(t, 21, 8, (p) => hillP(p.x, p.y, r(0.9, 1.2)), 60, (p) => !inFarm(p));
      if (L === 'plain') g += scatter(t, 34, 10, (p) => oak(p.x, p.y, 0.9), 4, (p) => !inFarm(p));
    }
  } else if (L === 'mountain') g += scatter(t, 26, 13, (p) => peak(p.x, p.y, r(0.95, 1.35)), 30);
  else if (L === 'lake') {
    g += scatter(t, 20, 9, (p) => curl(p.x, p.y, 0.8, '#e6f4f7'), 20) + scatter(t, 12, 3, (p) => reeds(p.x, p.y), 30, (p) => !inside(t, p, 14));
    g += boat(c.x, c.y) + duck(c.x + 22, c.y + 14) + duck(c.x + 30, c.y + 10);
  } else if (L === 'wildwood') {
    g += menhirs(c.x, c.y) + deer(c.x + 26, c.y + 18);
    g += scatter(t, 10, 4, (p) => pine(p.x, p.y, r(1, 1.3)), 300, (p) => dist(p, c) > 22);
  }
  tex += `<g clip-path="url(#c${i})">${g}</g>`;
  // coastline: sand rim where a land tile meets the sea
  for (let k = 0; k < cell.length; k++) {
    const p = cell[k]!, q = cell[(k + 1) % cell.length]!, j = across(i, p, q);
    if (j >= 0 && land[j] === 'sea') tex += `<path d="M${f(p.x)},${f(p.y)} L${f(q.x)},${f(q.y)}" stroke="#e8d7a0" stroke-width="16" clip-path="url(#c${i})"/><path d="M${f(p.x)},${f(p.y)} L${f(q.x)},${f(q.y)}" stroke="#cfe7ee" stroke-width="4" stroke-dasharray="10 6" opacity=".8"/>`;
  }
  if (i < T.length && i > 0) rims += `<path d="${polyD(t)}" fill="none" stroke="${TRIBE[sc.towns[i]!.tribe]}" stroke-width="8" stroke-linejoin="round" clip-path="url(#c${i})"/>`;
});
// the limes: palisade on the castra tile's edges facing Gaul
{
  const t = inset(cells[0]!, 9);
  for (let k = 0; k < t.length; k++) {
    const p = t[k]!, q = t[(k + 1) % t.length]!;
    if (Math.min(p.y, q.y) > H - 12) continue;
    const n = Math.max(2, Math.floor(dist(p, q) / 7));
    for (let j = 0; j <= n; j++) { const x = p.x + ((q.x - p.x) * j) / n, y = p.y + ((q.y - p.y) * j) / n; rims += `<path d="M${f(x - 2)},${f(y + 3)} L${f(x - 2)},${f(y - 4)} L${f(x)},${f(y - 7)} L${f(x + 2)},${f(y - 4)} L${f(x + 2)},${f(y + 3)} Z" fill="#8a5a2c" stroke="${O}" stroke-width=".8"/>`; }
    const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    rims += `<rect x="${f(m.x - 5)}" y="${f(m.y - 12)}" width="10" height="14" fill="#a46a35" stroke="${O}" stroke-width="1.2"/><path d="M${f(m.x - 7)},${f(m.y - 12)} L${f(m.x)},${f(m.y - 18)} L${f(m.x + 7)},${f(m.y - 12)} Z" fill="#b3261e" stroke="${O}" stroke-width="1"/>`;
  }
}
void isLand;

// rivers: the shared border of two towns whose candidate road was pruned
let rivers = '';
for (const [a, b] of trace.pruned ?? []) {
  const ca = cells[a]!;
  for (let k = 0; k < ca.length; k++) {
    const p = ca[k]!, q = ca[(k + 1) % ca.length]!;
    if (across(a, p, q) !== b) continue;
    const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l;
    let d = `M${p.x},${p.y}`;
    for (let j = 1; j <= 6; j++) { const t = j / 6, w = j < 6 ? (j % 2 ? 5 : -5) : 0; d += ` Q${p.x + dx * (t - 1 / 12) + nx * w},${p.y + dy * (t - 1 / 12) + ny * w} ${p.x + dx * t},${p.y + dy * t}`; }
    rivers += `<path d="${d}" stroke="${O}" stroke-width="10" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#5fb0cf" stroke-width="6.5" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#bfe6f2" stroke-width="1.5" fill="none" stroke-dasharray="4 7"/>`;
  }
}

// ---------------------------------------------------------------- game layer
const LENS = process.argv.includes('--lens');
const SHOWCASE = !process.argv.includes('--real');
let ev: GameEvent[] = visibleEvents(sc, s.turn);
if (SHOWCASE) {
  // inject damage: a destroyed road whose loss leaves towns besieged
  const before = supplied(sc, s);
  for (const rd of sc.roads.filter((x) => s.built[x.id])) {
    const s2 = cloneState(s); s2.built[rd.id] = false; s2.rubble[rd.id] = 2;
    const after = supplied(sc, s2);
    const lost = sc.towns.filter((t) => before[t.id] && !after[t.id] && sc.roads.some((x) => s2.built[x.id] && (x.a === t.id || x.b === t.id)));
    if (lost.length >= 1 && lost.length <= 2) { for (const t of lost) s2.siege[t.id] = 2; s = s2; break; }
  }
  // inject the events this day lacks so every visual appears once
  const used = new Set(ev.map((e) => e.tribe));
  const free = sc.tribes.map((t) => t.id).find((k) => !used.has(k)) ?? 0;
  const other = ev.find((e) => e.kind === 'revolt')?.tribe ?? 0;
  s.tolls.push({ tribe: free, surcharge: 1, until: s.turn + 1 });
  ev = [...ev,
    { turn: s.turn, kind: 'rains', tribe: free, effect: { type: 'toll', surcharge: 1, duration: 2 } },
    { turn: s.turn + 1, kind: 'tribute', tribe: other, effect: { type: 'yield', glory: 1, income: 3 } },
    { turn: s.turn + 1, kind: 'silver', tribe: free, town: sc.towns.filter((t) => t.tribe === free && t.id).sort((a, b) => b.hop - a.hop)[0]!.id, effect: { type: 'boom', value: 1 } },
  ];
}
const sup = supplied(sc, s), prot = protectedTowns(sc, s);
const threat = new Set<number>();
for (const e of ev) if (e.effect.type === 'cut' && e.turn <= s.turn + 1) for (const id of roadsCutBy(sc, s, e.tribe, e.effect.mode, prot)) threat.add(id);
const tollOn = (rd: { a: number; b: number }) => s.tolls.some((x) => s.turn <= x.until && (sc.towns[rd.a]!.tribe === x.tribe || sc.towns[rd.b]!.tribe === x.tribe));

let roads = '', stones = '';
for (const rd of sc.roads) {
  const a = T[rd.a]!, b = T[rd.b]!, d = `M${a.x},${a.y} L${b.x},${b.y}`, m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (s.built[rd.id]) {
    const defended = prot[rd.a] || prot[rd.b];
    if (threat.has(rd.id)) roads += `<path d="${d}" stroke="#ff2a1a" stroke-width="${LENS ? 20 : 15}" stroke-opacity=".55" stroke-linecap="round"><animate attributeName="stroke-opacity" values=".3;.8;.3" dur="1.4s" repeatCount="indefinite"/></path>`;
    else if (LENS && defended) roads += `<path d="${d}" stroke="#ffd23a" stroke-width="20" stroke-opacity=".85" stroke-linecap="round"/>`;
    roads += `<path d="${d}" stroke="#1d1409" stroke-width="10" stroke-linecap="round"/><path d="${d}" stroke="#b7b2a6" stroke-width="6.5" stroke-linecap="round"/><path d="${d}" stroke="#8c877b" stroke-width="6.5" stroke-dasharray="3.5 2"/><path d="${d}" stroke="#d6d2c8" stroke-width="1.2" stroke-dasharray="3.5 2"/>`;
  } else if (s.rubble[rd.id]) {
    const l = dist(a, b), ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
    roads += `<path d="${d}" stroke="#3b2a1a" stroke-width="9" stroke-opacity=".55" stroke-dasharray="14 9" stroke-linecap="round"/>`;
    for (let k = 10; k < l - 10; k += 7) {
      const jx = r(-6, 6), jy = r(-6, 6), ang = r(0, 90);
      roads += `<rect x="${f(a.x + ux * k + jx - 2.5)}" y="${f(a.y + uy * k + jy - 2)}" width="5" height="4" fill="#9a958a" stroke="#1d1409" stroke-width=".8" transform="rotate(${f(ang)} ${f(a.x + ux * k + jx)} ${f(a.y + uy * k + jy)})"/>`;
    }
    stones += `<g transform="translate(${m.x},${m.y})"><rect x="-17" y="-10" width="34" height="20" rx="10" fill="#3b2a1a" stroke="#f3e6c4" stroke-width="1.5"/><path d="M-10,-5 l5,5 m0,-5 l-5,5" stroke="#ff8a6a" stroke-width="2"/><text x="5" y="4.5" text-anchor="middle" font-size="12" font-weight="bold" fill="#f3e6c4">${s.rubble[rd.id]}</text></g>`;
  } else {
    roads += `<path d="${d}" stroke="${INK}" stroke-width="4.5" stroke-opacity=".75" stroke-linecap="round" stroke-dasharray="6 5"/><path d="${d}" stroke="${CREAM}" stroke-width="2" stroke-linecap="round" stroke-dasharray="6 5"/>`;
    const toll = tollOn(rd);
    stones += `<g transform="translate(${m.x},${m.y})"><path d="M-8,10 L-8,-4 Q-8,-11 0,-11 Q8,-11 8,-4 L8,10 Z" fill="${toll ? '#d6e8f2' : CREAM}" stroke="${toll ? '#2f6f9f' : INK}" stroke-width="${toll ? 2.2 : 1.3}"/><text y="4.5" text-anchor="middle" font-size="12.5" font-weight="bold" fill="${toll ? '#1f4f7f' : INK}">${proposedCost(rd.id) + (toll ? 1 : 0)}</text></g>`;
  }
}

// ---- event glyphs
const flame = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><path d="M0,8 C-7,6 -7,-2 -2,-8 C-2,-3 1,-3 1,-6 C6,-2 7,6 0,8 Z" fill="#f08a1c" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/><path d="M0,7 C-3,5 -3,1 0,-2 C1,1 3,3 0,7 Z" fill="#ffd84a"/></g>`;
const pitchfork = (x: number, y: number, rot: number) => `<g transform="translate(${f(x)},${f(y)}) rotate(${rot})"><line x1="0" y1="12" x2="0" y2="-6" stroke="#7a4a24" stroke-width="2.6"/><line x1="0" y1="12" x2="0" y2="-6" stroke="${O}" stroke-width=".6"/><path d="M-5,-12 V-6 H5 V-12 M0,-13 V-6" fill="none" stroke="#5a5a5a" stroke-width="1.8" stroke-linecap="round"/></g>`;
const swords = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><circle r="15" fill="#7a1f16" stroke="${O}" stroke-width="1.6"/>${[45, -45].map((a) => `<g transform="rotate(${a})"><path d="M-1.6,-12 L0,-14 L1.6,-12 L1.6,5 L-1.6,5 Z" fill="#e6e6ea" stroke="${O}" stroke-width=".9"/><rect x="-5" y="5" width="10" height="2.2" fill="#c9a227" stroke="${O}" stroke-width=".7"/><rect x="-1.2" y="7.2" width="2.4" height="5" fill="#6a4423" stroke="${O}" stroke-width=".6"/></g>`).join('')}</g>`;
const sheaf = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><ellipse cy="9" rx="7" ry="2" fill="#000" opacity=".2"/>${[-4, -2, 0, 2, 4].map((dx) => `<path d="M${dx * 0.4},9 L${dx},-6" stroke="#a07a1c" stroke-width="1.3"/><ellipse cx="${dx}" cy="-8" rx="1.7" ry="4" fill="#f0c23a" stroke="${O}" stroke-width=".7"/>`).join('')}<path d="M-4,2 H4" stroke="#7a4a24" stroke-width="2"/></g>`;
const coins = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})">${[[-6, 3], [6, 3], [0, -4]].map(([cx, cy]) => `<ellipse cx="${cx}" cy="${cy! + 1.5}" rx="6" ry="6" fill="#a6740f" stroke="${O}" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="6" fill="#f2c230" stroke="${O}" stroke-width="1.1"/><text x="${cx}" y="${cy! + 2.6}" text-anchor="middle" font-size="7" font-weight="bold" fill="#8a5a0c">D</text>`).join('')}</g>`;
const silverPeak = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})"><ellipse cx="2" cy="11" rx="17" ry="3.4" fill="#000" opacity=".25"/><path d="M-17,11 L-2,-17 L4,-7 L8,-12 L18,11 Z" fill="#9b958a" stroke="${O}" stroke-width="1.5" stroke-linejoin="round"/><path d="M-8,6 L-3,-4 L1,2 L5,-6 M-11,10 L-5,2" stroke="#e8f0ff" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M-8,6 L-3,-4 L1,2 L5,-6" stroke="#8fa3c8" stroke-width=".8" fill="none"/><path d="M12,-14 l1.6,4 4,1.6 -4,1.6 -1.6,4 -1.6,-4 -4,-1.6 4,-1.6 Z" fill="#fff" stroke="#6d7290" stroke-width=".8"><animate attributeName="opacity" values="1;.2;1" dur="1.8s" repeatCount="indefinite"/></path><path d="M-2,8 h6 v3 h-6 Z" fill="${O}"/></g>`;
const cloud = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})"><path d="M-14,4 Q-16,-4 -8,-5 Q-6,-13 3,-10 Q10,-14 13,-6 Q19,-5 17,3 Z" fill="#c9d3dc" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/><path d="M-8,8 l-2,5 M-1,8 l-2,5 M6,8 l-2,5" stroke="#2f6f9f" stroke-width="1.6" stroke-linecap="round"/></g>`;
// mini icons for the row under the stars
const MINI: Record<string, (x: number, y: number) => string> = {
  revolt: (x, y) => `<g transform="translate(${x},${y}) scale(.55)">${pitchfork(-4, 0, -15)}${flame(6, 3, 0.9)}</g>`,
  raid: (x, y) => swords(x, y, 0.5),
  rains: (x, y) => `<path d="M${x},${y - 7} C${x + 6},${y} ${x + 5},${y + 6} ${x},${y + 6} C${x - 5},${y + 6} ${x - 6},${y} ${x},${y - 7} Z" fill="#5fb0e0" stroke="${O}" stroke-width="1.1"/>`,
  harvest: (x, y) => sheaf(x, y - 1, 0.62),
  tribute: (x, y) => coins(x, y, 0.55),
  silver: (x, y) => `<path d="M${x - 6},${y + 5} L${x},${y - 6} L${x + 6},${y + 5} Z" fill="#9b958a" stroke="${O}" stroke-width="1"/><path d="M${x - 3},${y + 2} L${x},${y - 3} L${x + 2},${y}" stroke="#eef3ff" stroke-width="1.6" fill="none"/>`,
};

// tiles of a tribe (town tiles only)
const tribeTiles = (k: number) => sc.towns.filter((t) => t.id && t.tribe === k).map((t) => t.id);
const tileOf = (i: number) => inset(cells[i]!, 4.5);
let evTiles = '', evDefs = '';
const iconsAt = new Map<number, Array<{ kind: string; now: boolean }>>();
const addIcon = (town: number, kind: string, now: boolean) => { const l = iconsAt.get(town) ?? []; if (!l.some((x) => x.kind === kind)) l.push({ kind, now }); iconsAt.set(town, l); };
for (const e of ev) {
  const now = e.turn === s.turn;
  if (e.effect.type === 'toll') {
    for (const i of tribeTiles(e.tribe)) {
      evTiles += `<path d="${polyD(tileOf(i))}" fill="url(#rainHatch)"/>`;
      evTiles += `<g clip-path="url(#c${i})">${scatter(tileOf(i), 50, 18, (p) => cloud(p.x, p.y), 1, (p) => dist(p, T[i]!) > 55)}</g>`;
      addIcon(i, 'rains', now);
    }
    continue;
  }
  if (e.effect.type === 'boom') {
    const i = e.town!;
    const sp = scatter(tileOf(i), 40, 12, (p) => silverPeak(p.x, p.y), 1);
    evTiles += `<g clip-path="url(#c${i})">${sp || silverPeak(T[i]!.x + 40, T[i]!.y + 22)}</g>`;
    addIcon(i, 'silver', now);
    continue;
  }
  if (e.effect.type === 'cut' && e.effect.mode === 'deepest') {
    const id = roadsCutBy(sc, s, e.tribe, 'deepest', prot)[0];
    if (id !== undefined) {
      const rd = sc.roads[id]!, far = sc.towns[rd.a]!.hop >= sc.towns[rd.b]!.hop ? rd.a : rd.b, near = far === rd.a ? rd.b : rd.a;
      const a = T[far]!, b = T[near]!, l = dist(a, b), p = { x: a.x + (b.x - a.x) * 0.3, y: a.y + (b.y - a.y) * 0.3 };
      const nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l;
      evTiles += swords(p.x + nx * 26, p.y + ny * 26, 1.1);
    }
    for (const i of tribeTiles(e.tribe)) addIcon(i, 'raid', now);
    continue;
  }
  for (const i of tribeTiles(e.tribe)) {
    const t = tileOf(i);
    if (e.effect.type === 'cut') {
      evTiles += `<path d="${polyD(t)}" fill="none" stroke="#e0301e" stroke-width="10" stroke-linejoin="round" clip-path="url(#c${i})" stroke-dasharray="14 8"><animate attributeName="stroke-opacity" values=".35;1;.35" dur="1.6s" repeatCount="indefinite"/></path>`;
      const atRisk = [...threat].some((id) => sc.roads[id]!.a === i || sc.roads[id]!.b === i);
      evTiles += `<g clip-path="url(#c${i})">${scatter(t, 34, 10, (p) => (atRisk && rng.next() < 0.6 ? flame(p.x, p.y, 1.2) : pitchfork(p.x, p.y, r(-25, 25))), atRisk ? 5 : 2)}</g>`;
      addIcon(i, 'revolt', now);
    } else if (e.effect.type === 'yield') {
      const kind = e.kind;
      if (kind === 'harvest') {
        const c = T[i]!;
        evTiles += `<g clip-path="url(#c${i})" opacity=".8">${stripes(t, c, ['#efc94a', '#e2b232', '#f5d966', '#d9a72a'], 8, 14, '#a57a18')}</g>`;
        evTiles += `<g clip-path="url(#c${i})">${scatter(t, 26, 9, (p) => sheaf(p.x, p.y, 1.1), 6)}</g>`;
      } else {
        evTiles += `<g clip-path="url(#c${i})">${scatter(t, 60, 12, (p) => coins(p.x, p.y, 1.1), 1)}</g>`;
      }
      addIcon(i, kind, now);
    }
  }
}

// ---- towns
let towns = '';
sc.towns.forEach((t, i) => {
  const { x, y } = T[i]!;
  if (i === 0) { towns += `<g transform="translate(${x},${y})">${castraIcon()}</g><text x="${x}" y="${y - 32}" text-anchor="middle" class="name">Castra</text>`; return; }
  const v = townValue(s, t), z = settlementSize(Math.min(4, v)), besieged = s.siege[i]! > 0;
  if (LENS && prot[i]) towns += `<ellipse cx="${x}" cy="${y + 6}" rx="${z.top + 6}" ry="${z.bottom + 6}" fill="#ffd23a" fill-opacity=".35" stroke="#ffd23a" stroke-width="2"/>`;
  if (s.garrison[i]) towns += `<ellipse cx="${x}" cy="${y + 6}" rx="${z.top + 10}" ry="${z.bottom + 9}" fill="none" stroke="#5a3a1a" stroke-width="5" stroke-dasharray="3 1.6"/>`;
  towns += `<g transform="translate(${x},${y})">${settlement(v, sup[i]! || besieged, TRIBE[t.tribe]!)}</g>`;
  if (besieged) towns += `<g opacity=".9"><path d="M${x - 6},${y - 4} c-8,-9 6,-14 -1,-24 c-7,-9 6,-13 0,-22" stroke="#4a4038" stroke-width="7" fill="none" stroke-linecap="round" opacity=".6"/></g>${flame(x - 8, y - 2, 0.9)}${flame(x + 9, y + 2, 0.8)}<g transform="translate(${x + z.top - 2},${y - 14})"><circle r="10" fill="#b3261e" stroke="#fff" stroke-width="1.6"/><text y="4.4" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">${s.siege[i]}</text></g>`;
  const boom = ev.find((e) => e.effect.type === 'boom' && e.town === i);
  const stars = '★'.repeat(v) + (boom ? `<tspan fill="#dfe6f5">★</tspan>` : '');
  towns += `<text x="${x}" y="${y - z.top - 4}" text-anchor="middle" class="name">${t.name}</text><text x="${x}" y="${y + z.bottom + 16}" text-anchor="middle" class="stars">${stars}</text>`;
  const icons = iconsAt.get(i);
  if (icons?.length) {
    const w = icons.length * 22, x0 = x - w / 2 + 11, yy = y + z.bottom + 33;
    towns += `<rect x="${x - w / 2 - 3}" y="${yy - 11}" width="${w + 6}" height="22" rx="11" fill="${CREAM}" fill-opacity=".92" stroke="${O}" stroke-width="1.1"/>`;
    icons.forEach((ic, k) => {
      const cx = x0 + k * 22;
      towns += ic.now ? `<circle cx="${cx}" cy="${yy}" r="10" fill="#ffd9cf" stroke="#b3261e" stroke-width="1.6"/>` : `<circle cx="${cx}" cy="${yy}" r="10" fill="none" stroke="#8a7a5a" stroke-width="1.1" stroke-dasharray="2.5 2"/>`;
      towns += MINI[ic.kind]!(cx, yy);
    });
  }
});
const legionAt = new Map<number, number>();
for (const l of s.legions) legionAt.set(l, (legionAt.get(l) ?? 0) + 1);
for (const [t, n] of legionAt) {
  const x = T[t]!.x - (t === 0 ? 34 : 30), y = T[t]!.y + 4;
  towns += `<g transform="translate(${x},${y})"><line y1="8" y2="-24" stroke="${INK}" stroke-width="1.8"/><circle cy="-26" r="3.4" fill="#e0b42a" stroke="${INK}" stroke-width=".7"/><path d="M-6,-19 h12 v10 l-6,-3 l-6,3 Z" fill="#b3261e" stroke="${INK}" stroke-width=".7"/>${n > 1 ? `<circle cx="7" cy="4" r="6.5" fill="#b3261e" stroke="#fff"/><text x="7" y="7.6" text-anchor="middle" font-size="9" fill="#fff" font-weight="bold">${n}</text>` : ''}</g>`;
}
const events = '';
void evDefs;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 -14 ${W + 28} ${H + 28}" font-family="Georgia,serif">
<defs>${defs}
  <filter id="lift" x="-5%" y="-5%" width="110%" height="110%"><feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#000" flood-opacity=".55"/></filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .12 0"/></filter>
  <linearGradient id="table" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a2a1a"/><stop offset="1" stop-color="#22180e"/></linearGradient>
  <pattern id="rainHatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(25)"><line x1="0" y1="0" x2="0" y2="7" stroke="#2f6f9f" stroke-width="1.6" opacity=".75"/><line x1="6" y1="5" x2="6" y2="10" stroke="#bfe0f5" stroke-width="1.2" opacity=".9"/></pattern>
  <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#7a1f16"/></marker>
  <style>.name{font-size:12.5px;fill:${INK};paint-order:stroke;stroke:${CREAM};stroke-width:3.6px;stroke-linejoin:round;font-weight:bold;letter-spacing:.02em}.stars{font-size:11px;fill:#f2c230;paint-order:stroke;stroke:${INK};stroke-width:2.6px;stroke-linejoin:round}</style>
</defs>
<rect x="-14" y="-14" width="${W + 28}" height="${H + 28}" rx="10" fill="url(#table)"/>
${sea}
<g filter="url(#lift)">${tiles}</g>
${tex}
${rims}
<rect width="${W}" height="${H}" filter="url(#grain)"/>
${evTiles}
${evTiles}
${rivers}
${LENS ? `<rect x="-14" y="-14" width="${W + 28}" height="${H + 28}" fill="#120a03" fill-opacity=".45"/>` : ''}
${roads}${stones}${towns}${events}
</svg>`;
writeFileSync(`${OUT}/tiles.svg`, svg);
if (process.argv.includes('--svg-only')) process.exit(0);

// side-by-side: texture only vs. full board, plus legend
const legend = [
  ['#b6c45a', 'Plains', 'town tile · roads cost 1'], ['#8fb04c', 'Light forest', 'town tile · roads cost 2'], ['#c9a25e', 'Hills', 'town tile · roads cost 3'],
['#d9c48c', 'Castra', 'Roman grid and vineyards; the limes faces Gaul'],
  ['#245a78', 'Sea', 'map edge, west & north · triremes'], ['#8f897d', 'Mountains', 'map edge east & south, or inland'],
  ['#6fb2c4', 'Lake', 'inland, calm · fishermen'], ['#2c5a30', 'Primeval forest', 'inland, unclaimed · standing stones'],
  ['#5fb0cf', 'River', 'between two towns the map refused to join'],
];
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#1b140c;color:#f3e6c4;font-family:Georgia,serif;display:flex;gap:16px;padding:16px;height:100vh;box-sizing:border-box}
.b{height:100%;aspect-ratio:${W + 28}/${H + 28}}.b svg{width:100%;height:100%}.cap{font-size:13px;margin:0 0 6px;color:#cbb88f}
.side{width:300px}.row{display:flex;gap:10px;align-items:center;margin:8px 0;font-size:13px}.sw{width:30px;height:24px;border-radius:4px;box-shadow:0 2px 3px #000}
h1{font-size:19px;margin:0 0 8px;color:#f2c230}p{font-size:12.5px;line-height:1.45;color:#d9cba8}
</style></head><body><div class="b">${svg}</div><div class="side"><h1>Tile board · mockup v4</h1>
<p>One tile per town (Voronoi cell), plus wild tiles where no road passes. Tiles are texture only; the game layer (roads, milestones, towns, events) sits on top and tile props never cover a road or a town.</p>
${legend.map(([c, h, t]) => `<div class="row"><div class="sw" style="background:${c}"></div><div><b>${h}</b><br>${t}</div></div>`).join('')}
<p><b>Tribe</b> = coloured inner rim of each tile and ring of each town.</p>
<p><b>Proposed rule shown:</b> a road costs the harder of the two tiles it crosses, + depth. Milestones sit exactly on the tile seam because every road crosses one seam, at its midpoint.</p>
<p>${DATE}, turn ${s.turn}/10 (forecast bot).</p></div></body></html>`;
writeFileSync(`${OUT}/tiles.html`, html);
console.error(`wild tiles ${wild.length}; land: ${['plain', 'forest', 'hills', 'mountain', 'sea', 'lake', 'wildwood'].map((l) => `${l} ${land.filter((x) => x === l).length}`).join(', ')}; rivers ${(rivers.match(/#2f5f6e/g) ?? []).length}`);
