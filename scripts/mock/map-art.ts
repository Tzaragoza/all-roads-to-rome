// MOCKUP: illustrated campaign map. Every graphic maps to a game fact:
//   ground tint under a road = its terrain cost (darker = dearer), trees/hills = terrain type,
//   mountains & lakes = where no road exists (pruned Gabriel edges, empty areas),
//   territory tint = tribe, building = town value, flag = supplied, standard = legion,
//   raider camp = road a raid will cut, smoke = revolt, rain hatching = toll, wheat = harvest.
// Usage: npx tsx scripts/mock/map-art.ts [date] [turn]  -> /mnt/user-data/outputs/mockup/
import { mkdirSync, writeFileSync } from 'node:fs';
import season from '../../src/shared/season.json';
import {
  Rng, generate, initialState, isOver, protectedTowns, roadCost, roadsCutBy, supplied, townValue, visibleEvents, eventSpec,
} from '../../src/shared/engine';
import type { GenTrace, Scenario, State } from '../../src/shared/engine';
import { BOTS, playTurn } from '../sim/bots';

const DATE = process.argv[2] ?? '2026-12-09';
const TURN = Number(process.argv[3] ?? 9);
const OUT = '/mnt/user-data/outputs/mockup';
mkdirSync(OUT, { recursive: true });

const entry = (season as Array<{ date: string; seed: string }>).find((e) => e.date === DATE)!;
const trace: GenTrace = {};
const sc: Scenario = generate(entry.seed, { trace });
let s: State = initialState(sc);
while (s.turn < TURN && !isOver(sc, s)) s = playTurn(sc, s, BOTS.forecast!);

const K = 6; // px per board unit
const W = sc.width * K, H = sc.height * K;
const art = new Rng(`${entry.seed}/art`);
const r = (a: number, b: number) => a + art.next() * (b - a);
type Pt = { x: number; y: number };
const T = sc.towns.map((t) => ({ x: t.x * K, y: t.y * K }));
const INK = '#3a2c1c', PAPER = '#efe2c0';
const TRIBE = ['#c9a227', '#4f8a5b', '#7b5ea7', '#b5651d'];
const SOIL = { plain: '#d8c68a', forest: '#6f8a4f', hills: '#6e4f33' } as const;
const SOIL_OP = { plain: 0.35, forest: 0.4, hills: 0.5 } as const;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
function distSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

// ---- road curves (gentle, seeded)
const ctrl = sc.roads.map((rd) => {
  const a = T[rd.a]!, b = T[rd.b]!, len = dist(a, b);
  const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len, o = r(-0.09, 0.09) * len;
  return { x: (a.x + b.x) / 2 + nx * o, y: (a.y + b.y) / 2 + ny * o };
});
const qpt = (id: number, t: number): Pt => {
  const a = T[sc.roads[id]!.a]!, b = T[sc.roads[id]!.b]!, c = ctrl[id]!;
  return { x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y };
};
const qpath = (id: number) => { const a = T[sc.roads[id]!.a]!, b = T[sc.roads[id]!.b]!, c = ctrl[id]!; return `M${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`; };
const nearRoad = (p: Pt, pad: number) => sc.roads.some((rd) => distSeg(p, T[rd.a]!, T[rd.b]!) < pad);
const nearTown = (p: Pt, pad: number) => T.some((t) => dist(p, t) < pad);

// ---- Voronoi territories (half-plane clipping)
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
const cells = T.map((ti, i) => {
  let poly: Pt[] = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  T.forEach((tj, j) => { if (j !== i) poly = clip(poly, { x: tj.x - ti.x, y: tj.y - ti.y }, (tj.x ** 2 + tj.y ** 2 - ti.x ** 2 - ti.y ** 2) / 2); });
  return poly;
});
const nearestTown = (p: Pt) => T.reduce((b, t, i) => (dist(p, t) < dist(p, T[b]!) ? i : b), 0);
const polyD = (p: Pt[]) => 'M' + p.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join('L') + 'Z';
const tribeOf = (i: number) => sc.towns[i]!.tribe;

let territory = '', borders = '';
cells.forEach((poly, i) => {
  const tr = tribeOf(i);
  territory += `<path d="${polyD(poly)}" fill="${tr < 0 ? '#e9d6b0' : TRIBE[tr]}" fill-opacity="${tr < 0 ? 0.5 : 0.17}"/>`;
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k]!, q = poly[(k + 1) % poly.length]!, m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    if (m.x < 1 || m.y < 1 || m.x > W - 1 || m.y > H - 1) continue;
    const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1;
    const o1 = nearestTown({ x: m.x + (dy / l) * 2, y: m.y - (dx / l) * 2 }), o2 = nearestTown({ x: m.x - (dy / l) * 2, y: m.y + (dx / l) * 2 });
    if (tribeOf(o1) !== tribeOf(o2) && i < Math.max(o1, o2) && (o1 === i || o2 === i)) borders += `M${p.x},${p.y}L${q.x},${q.y}`;
  }
});

// ---- terrain glyphs along roads
const tree = (x: number, y: number, sc2 = 1) => `<g transform="translate(${x},${y}) scale(${sc2})"><line x1="0" y1="2" x2="0" y2="5" stroke="${INK}" stroke-width="1"/><circle r="3.6" fill="#5d7d45" stroke="${INK}" stroke-width=".7"/><circle cx="-1.1" cy="-1" r="1.3" fill="#7d9c5e"/></g>`;
const hill = (x: number, y: number, sc2 = 1) => `<g transform="translate(${x},${y}) scale(${sc2})" fill="none" stroke="${INK}" stroke-width=".9"><path d="M-6,3 Q0,-5 6,3" fill="#c7ad7c"/><path d="M1,-1.2 L3,2.6 M2.6,0 L4.4,2.6" stroke-width=".6"/></g>`;
const tuft = (x: number, y: number) => `<path d="M${x - 2},${y} q1,-3 1.5,0 M${x},${y} q.5,-3.5 1,0 M${x + 1.5},${y} q1,-2.5 1.6,0" stroke="#8a7a45" stroke-width=".7" fill="none"/>`;
let glyphs = '';
const placed: Pt[] = [];
for (const rd of sc.roads) {
  const steps = Math.floor(dist(T[rd.a]!, T[rd.b]!) / (K * 5));
  for (let k = 1; k < steps; k++) {
    const t = k / steps, p = qpt(rd.id, t), q = qpt(rd.id, Math.min(1, t + 0.01));
    const l = Math.hypot(q.x - p.x, q.y - p.y) || 1, side = k % 2 ? 1 : -1, off = r(3.2, 5) * K * side;
    const g = { x: p.x - ((q.y - p.y) / l) * off, y: p.y + ((q.x - p.x) / l) * off };
    if (nearTown(g, 6 * K) || nearRoad(g, 2.4 * K) || placed.some((x) => dist(x, g) < 3 * K)) continue;
    placed.push(g);
    glyphs += rd.terrain === 'forest' ? tree(g.x, g.y) + (art.next() < 0.6 ? tree(g.x + 6, g.y + 3, 0.8) : '') : rd.terrain === 'hills' ? hill(g.x, g.y) : (k % 2 ? tuft(g.x, g.y) : '');
  }
}

// ---- obstacles: where no road runs
const mountain = (x: number, y: number, s2: number) => {
  let g = '';
  const n = 2 + Math.floor(r(0, 3));
  for (let k = 0; k < n; k++) {
    const px = x + (k - (n - 1) / 2) * 9 * s2 + r(-2, 2), py = y + r(-2, 3), h = r(11, 17) * s2, w = r(8, 11) * s2;
    g += `<path d="M${px - w},${py + h * 0.35} L${px},${py - h * 0.65} L${px + w},${py + h * 0.35} Z" fill="#cdb98e" stroke="${INK}" stroke-width=".9"/>`;
    g += `<path d="M${px},${py - h * 0.65} L${px + w},${py + h * 0.35} L${px + w * 0.15},${py + h * 0.35} Z" fill="#9e865c" opacity=".8"/>`;
    g += `<path d="M${px - w * 0.28},${py - h * 0.3} L${px},${py - h * 0.65} L${px + w * 0.25},${py - h * 0.33}" fill="#f4ecd8" stroke="${INK}" stroke-width=".5"/>`;
  }
  return g;
};
const lake = (x: number, y: number, rad: number) => {
  const pts = Array.from({ length: 10 }, (_, k) => { const a = (k / 10) * Math.PI * 2, rr = rad * r(0.7, 1.15); return { x: x + Math.cos(a) * rr * 1.3, y: y + Math.sin(a) * rr }; });
  let d = `M${(pts[0]!.x + pts[9]!.x) / 2},${(pts[0]!.y + pts[9]!.y) / 2}`;
  pts.forEach((p, k) => { const q = pts[(k + 1) % 10]!; d += ` Q${p.x},${p.y} ${(p.x + q.x) / 2},${(p.y + q.y) / 2}`; });
  return `<path d="${d}" fill="#a9c2c1" stroke="#4f6e74" stroke-width="1.1"/><path d="M${x - rad * 0.6},${y} q${rad * 0.15},-2 ${rad * 0.3},0 t${rad * 0.3},0 M${x - rad * 0.2},${y + rad * 0.4} q${rad * 0.15},-2 ${rad * 0.3},0 t${rad * 0.3},0" fill="none" stroke="#6f9095" stroke-width=".8"/>`;
};
let obstacles = '';
const obstaclePts: Pt[] = [];
const freeFor = (p: Pt, pad: number) => !nearTown(p, pad * 1.2) && !nearRoad(p, pad) && !obstaclePts.some((q) => dist(p, q) < 17 * K);
// (a) at each pruned candidate edge: something blocks that road
for (const [a, b] of trace.pruned ?? []) {
  const m = { x: (T[a]!.x + T[b]!.x) / 2, y: (T[a]!.y + T[b]!.y) / 2 };
  obstaclePts.push(m);
  obstacles += art.next() < 0.55 ? mountain(m.x, m.y, 1) : lake(m.x, m.y, 5 * K);
}
// (b) empty regions
const cand: Pt[] = [];
for (let y = 8; y < sc.height - 8; y += 3) for (let x = 6; x < sc.width - 6; x += 3) cand.push({ x: x * K, y: y * K });
let filler = 0;
for (const p of art.shuffle(cand)) {
  if (filler >= 9 || !freeFor(p, 9 * K)) continue;
  filler++;
  obstaclePts.push(p);
  const roll = art.next();
  obstacles += roll < 0.5 ? mountain(p.x, p.y, 1.1) : roll < 0.75 ? lake(p.x, p.y, 4.5 * K) : [0, 1, 2, 3, 4].map(() => tree(p.x + r(-14, 14), p.y + r(-10, 10), 1.1)).join('');
}

// ---- roads
const sup = supplied(sc, s), prot = protectedTowns(sc, s);
const ev = visibleEvents(sc, s.turn);
const threat = new Map<number, string>(); // road -> event kind
for (const e of ev) if (e.effect.type === 'cut') for (const id of roadsCutBy(sc, s, e.tribe, e.effect.mode, prot)) threat.set(id, e.kind);
let soil = '', roads = '', stones = '';
for (const rd of sc.roads) {
  soil += `<path d="${qpath(rd.id)}" stroke="${SOIL[rd.terrain]}" stroke-opacity="${SOIL_OP[rd.terrain]}" stroke-width="${6.5 * K}" fill="none" stroke-linecap="round" filter="url(#soft)"/>`;
  if (s.built[rd.id]) {
    if (threat.has(rd.id)) roads += `<path d="${qpath(rd.id)}" stroke="#c0392b" stroke-opacity=".55" stroke-width="16" fill="none" stroke-linecap="round"><animate attributeName="stroke-opacity" values=".25;.7;.25" dur="1.6s" repeatCount="indefinite"/></path>`;
    roads += `<path d="${qpath(rd.id)}" stroke="#4a3a26" stroke-width="7.5" fill="none" stroke-linecap="round"/><path d="${qpath(rd.id)}" stroke="#d9c59a" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="${qpath(rd.id)}" stroke="#8d7550" stroke-width="4.5" stroke-dasharray="2.2 2.2" fill="none"/>`;
  } else if (s.rubble[rd.id]) {
    roads += `<path d="${qpath(rd.id)}" stroke="#7a2d1c" stroke-width="2" stroke-dasharray="3 6" fill="none"/>`;
  } else {
    roads += `<path d="${qpath(rd.id)}" stroke="${INK}" stroke-opacity=".55" stroke-width="1.6" stroke-dasharray="4 4" fill="none"/>`;
    const m = qpt(rd.id, 0.5), cost = roadCost(sc, s, rd.id);
    stones += `<g transform="translate(${m.x},${m.y})"><path d="M-7,9 L-7,-4 Q-7,-10 0,-10 Q7,-10 7,-4 L7,9 Z" fill="#e8dcc0" stroke="${INK}" stroke-width="1"/><text y="4" text-anchor="middle" font-size="11" font-weight="bold" fill="${INK}">${cost}</text></g>`;
  }
}

// ---- towns
const hut = (x: number, y: number, col: string, op: number) => `<g transform="translate(${x},${y})"><rect x="-3.2" y="-1" width="6.4" height="4.6" fill="#e9dcc0" stroke="${INK}" stroke-width=".8"/><path d="M-4.4,-0.6 L0,-5 L4.4,-0.6 Z" fill="${col}" fill-opacity="${op}" stroke="${INK}" stroke-width=".8"/></g>`;
function townIcon(i: number): string {
  const t = sc.towns[i]!, { x, y } = T[i]!, v = townValue(s, t), base = t.value;
  const col = TRIBE[t.tribe]!, op = sup[i] ? 1 : 0.45;
  let g = '';
  if (v >= 4) {
    g += `<circle cx="${x}" cy="${y}" r="15" fill="#e9dcc0" stroke="${INK}" stroke-width="3.2" stroke-opacity=".85"/>`;
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; g += `<rect x="${x + Math.cos(a) * 15 - 3}" y="${y + Math.sin(a) * 15 - 3}" width="6" height="6" fill="#cbb48a" stroke="${INK}" stroke-width=".8"/>`; }
  } else if (v === 3) {
    for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; g += `<line x1="${x + Math.cos(a) * 12}" y1="${y + Math.sin(a) * 12}" x2="${x + Math.cos(a) * 12}" y2="${y + Math.sin(a) * 12 - 4}" stroke="#6b4a2a" stroke-width="2"/>`; }
  }
  const huts = Math.min(v, 4) === 1 ? [[0, 2]] : v === 2 ? [[-4, 2], [4, 3]] : [[-5, 3], [5, 3], [0, -3]];
  for (const [dx, dy] of huts) g += hut(x + dx!, y + dy!, col, op);
  if (sup[i]) g += `<line x1="${x + 8}" y1="${y - 2}" x2="${x + 8}" y2="${y - 18}" stroke="${INK}" stroke-width="1.2"/><path d="M${x + 8},${y - 18} h9 v6 h-9 Z" fill="#a3271f" stroke="${INK}" stroke-width=".6"/>`;
  if (s.garrison[i]) for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8, b = ((k + 1) / 8) * Math.PI * 2 + Math.PI / 8; g += `<line x1="${x + Math.cos(a) * 22}" y1="${y + Math.sin(a) * 22}" x2="${x + Math.cos(b) * 22}" y2="${y + Math.sin(b) * 22}" stroke="#7a5230" stroke-width="3.5" stroke-dasharray="2 1.2"/>`; }
  const stars = '★'.repeat(base) + (v > base ? `<tspan fill="#9aa0b5">${'★'.repeat(v - base)}</tspan>` : '');
  g += `<text x="${x}" y="${y - (v >= 4 ? 22 : 17)}" text-anchor="middle" class="name">${t.name}</text>`;
  g += `<text x="${x}" y="${y + (v >= 4 ? 27 : 19)}" text-anchor="middle" class="stars">${stars}</text>`;
  return g;
}
function castra(): string {
  const { x, y } = T[0]!;
  let g = `<rect x="${x - 17}" y="${y - 17}" width="34" height="34" rx="5" fill="#ead9b4" stroke="#8b1a1a" stroke-width="3.5"/>`;
  g += `<path d="M${x - 4},${y - 17} h8 M${x - 4},${y + 17} h8 M${x - 17},${y - 4} v8 M${x + 17},${y - 4} v8" stroke="#ead9b4" stroke-width="4.5"/>`;
  g += `<path d="M${x},${y - 15} V${y + 15} M${x - 15},${y} H${x + 15}" stroke="#b9a27a" stroke-width="1.5"/>`;
  for (const [dx, dy] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) g += `<path d="M${x + dx! - 4},${y + dy! + 3} L${x + dx!},${y + dy! - 4} L${x + dx! + 4},${y + dy! + 3} Z" fill="#c2562f" stroke="${INK}" stroke-width=".6"/>`;
  return g + `<text x="${x}" y="${y - 23}" text-anchor="middle" class="name">Castra</text>`;
}
const standard = (x: number, y: number, n: number) =>
  `<g transform="translate(${x},${y})"><line x1="0" y1="6" x2="0" y2="-26" stroke="${INK}" stroke-width="1.6"/><circle cy="-28" r="3.2" fill="#d8b23a" stroke="${INK}" stroke-width=".7"/><line x1="-6" y1="-21" x2="6" y2="-21" stroke="${INK}" stroke-width="1.3"/><path d="M-6,-21 h12 v10 l-6,-3 l-6,3 Z" fill="#a3271f" stroke="${INK}" stroke-width=".7"/>${n > 1 ? `<circle cx="7" cy="2" r="6" fill="#a3271f" stroke="#fff"/><text x="7" y="5.5" text-anchor="middle" font-size="9" fill="#fff" font-weight="bold">${n}</text>` : ''}</g>`;
let towns = castra();
for (let i = 1; i < T.length; i++) towns += townIcon(i);
const legionAt = new Map<number, number>();
for (const l of s.legions) legionAt.set(l, (legionAt.get(l) ?? 0) + 1);
for (const [t, n] of legionAt) towns += standard(T[t]!.x - (t === 0 ? 24 : 16), T[t]!.y - 2, n);

// ---- events on the map
const tribeCentroid = (k: number) => {
  const ts = sc.towns.filter((t) => t.tribe === k);
  return { x: (ts.reduce((a, t) => a + t.x, 0) / ts.length) * K, y: (ts.reduce((a, t) => a + t.y, 0) / ts.length) * K };
};
const when = (turn: number) => (turn === s.turn ? 'this turn' : 'next turn');
const banner = (x: number, y: number, title: string, sub: string, col: string) =>
  `<g transform="translate(${x},${y})"><path d="M-58,-15 h116 l-6,15 l6,15 h-116 l6,-15 Z" fill="${col}" stroke="${INK}" stroke-width="1"/><text y="-2" text-anchor="middle" font-size="11.5" font-weight="bold" fill="#fff" letter-spacing=".08em">${title}</text><text y="10.5" text-anchor="middle" font-size="9" fill="#fff">${sub}</text></g>`;
const smoke = (x: number, y: number) => `<g opacity=".8"><path d="M${x},${y} c-6,-8 6,-12 0,-20 c-6,-8 6,-12 0,-20" stroke="#6b6157" stroke-width="5" fill="none" stroke-linecap="round" opacity=".55"><animate attributeName="opacity" values=".35;.7;.35" dur="2.4s" repeatCount="indefinite"/></path><path d="M${x - 4},${y + 2} q4,-10 8,0 q-4,-4 -8,0" fill="#e0662c" stroke="${INK}" stroke-width=".6"/></g>`;
const tent = (x: number, y: number) => `<path d="M${x - 7},${y + 5} L${x},${y - 7} L${x + 7},${y + 5} Z" fill="#9c8a6a" stroke="${INK}" stroke-width=".9"/><path d="M${x},${y - 7} L${x},${y + 5}" stroke="${INK}" stroke-width=".6"/><path d="M${x - 2},${y + 5} L${x},${y} L${x + 2},${y + 5}" fill="#3a2c1c"/>`;
let events = '', rainDefs = '';
const sorted = [...ev].sort((a, b) => a.turn - b.turn);
const bannerSlots: Pt[] = [];
for (const e of sorted) {
  const spec = eventSpec(e.kind)!;
  const c = tribeCentroid(e.tribe);
  let b = { x: c.x, y: c.y - 26 };
  while (bannerSlots.some((q) => dist(q, b) < 40)) b = { x: b.x, y: b.y + 38 };
  bannerSlots.push(b);
  if (e.effect.type === 'cut' && e.effect.mode === 'deepest') {
    const target = roadsCutBy(sc, s, e.tribe, 'deepest', prot)[0];
    if (target !== undefined) {
      const m = qpt(target, 0.5), q = qpt(target, 0.52), l = Math.hypot(q.x - m.x, q.y - m.y) || 1;
      let nx = -(q.y - m.y) / l, ny = (q.x - m.x) / l;
      const camp = (sg: number) => ({ x: m.x + nx * 46 * sg, y: m.y + ny * 46 * sg });
      let cp = camp(1);
      if (nearTown(cp, 26) || cp.x < 30 || cp.x > W - 30) { cp = camp(-1); nx = -nx; ny = -ny; }
      events += `<line x1="${cp.x}" y1="${cp.y}" x2="${m.x + nx * 10}" y2="${m.y + ny * 10}" stroke="#7a1f16" stroke-width="2" stroke-dasharray="5 3" marker-end="url(#arrow)"/>`;
      events += tent(cp.x - 9, cp.y + 2) + tent(cp.x + 8, cp.y) + tent(cp.x, cp.y - 9) + `<path d="M${cp.x + 16},${cp.y + 10} q3,-8 6,0 z" fill="#e0662c"/>` + smoke(cp.x + 19, cp.y + 8);
      b = { x: cp.x, y: cp.y - 30 };
    }
    events += banner(b.x, b.y, 'RAIDERS', `${sc.tribes[e.tribe]!.name} · ${when(e.turn)}`, '#7a1f16');
  } else if (e.effect.type === 'cut') {
    const hit = roadsCutBy(sc, s, e.tribe, 'all', prot);
    const hitTowns = sc.towns.filter((t) => t.tribe === e.tribe && t.id && hit.some((id) => sc.roads[id]!.a === t.id || sc.roads[id]!.b === t.id));
    for (const t of hitTowns) events += smoke(T[t.id]!.x - 12, T[t.id]!.y - 4);
    if (hitTowns.length) { const hx = hitTowns.reduce((a, t) => a + T[t.id]!.x, 0) / hitTowns.length, hy = Math.min(...hitTowns.map((t) => T[t.id]!.y)); b = { x: Math.min(W - 70, Math.max(70, hx)), y: hy - 52 }; }
    events += banner(b.x, b.y, 'REVOLT', `${sc.tribes[e.tribe]!.name} · ${when(e.turn)}${hitTowns.length ? '' : ' · roads safe'}`, '#a3271f');
  } else if (e.effect.type === 'toll') {
    rainDefs += `<clipPath id="rain${e.tribe}">${cells.map((p, i) => (tribeOf(i) === e.tribe ? `<path d="${polyD(p)}"/>` : '')).join('')}</clipPath>`;
    events += `<rect width="${W}" height="${H}" fill="url(#rainHatch)" clip-path="url(#rain${e.tribe})"/>` + banner(b.x, b.y, 'RAINS', `${sc.tribes[e.tribe]!.name} · roads +${e.effect.surcharge}`, '#3f6f9f');
  } else if (e.effect.type === 'yield') {
    for (const t of sc.towns.filter((t) => t.tribe === e.tribe && t.id && sup[t.id])) {
      const { x, y } = T[t.id]!;
      events += `<g transform="translate(${x + 15},${y + 6})"><path d="M0,8 L0,-6 M-3,8 L-1,-4 M3,8 L1,-4" stroke="#a07a1c" stroke-width="1.3"/><ellipse cx="0" cy="-7" rx="2" ry="4" fill="#d9b23a" stroke="${INK}" stroke-width=".5"/><ellipse cx="-2.5" cy="-5" rx="1.6" ry="3.4" fill="#d9b23a" stroke="${INK}" stroke-width=".5"/><ellipse cx="2.5" cy="-5" rx="1.6" ry="3.4" fill="#d9b23a" stroke="${INK}" stroke-width=".5"/></g>`;
    }
    events += banner(b.x, b.y, spec.title.toUpperCase(), `${sc.tribes[e.tribe]!.name} · ×${Math.max(e.effect.glory, e.effect.income)} ${when(e.turn)}`, '#3f7f4f');
  } else if (e.effect.type === 'boom') {
    const { x, y } = T[e.town!]!;
    events += `<path d="M${x + 14},${y - 14} l2,5 5,2 -5,2 -2,5 -2,-5 -5,-2 5,-2 Z" fill="#e8ecf5" stroke="#6d7290"/>` + banner(b.x, b.y, 'SILVER', `${sc.towns[e.town!]!.name} · ${when(e.turn)}`, '#5d6380');
  }
}

// ---- assemble map svg
const dusk = (s.turn - 1) / (sc.rules.turns - 1);
const mapSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Georgia,serif">
<defs>
  <filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="3"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .26  0 0 0 0 .15  0 0 0 .09 0"/></filter>
  <filter id="mottle" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .42  0 0 0 0 .22  0 0 0 .22 0"/></filter>
  <filter id="rough"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="5" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="9"/></filter>
  <filter id="soft"><feGaussianBlur stdDeviation="5"/></filter>
  <radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#4a3015" stop-opacity=".35"/></radialGradient>
  <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8823a" stop-opacity="${(0.16 * dusk).toFixed(3)}"/><stop offset="1" stop-color="#7a3d5a" stop-opacity="${(0.1 * dusk).toFixed(3)}"/></linearGradient>
  <pattern id="rainHatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(20)"><line x1="0" y1="0" x2="0" y2="6" stroke="#3f6f9f" stroke-width="1.2" opacity=".55"/></pattern>
  <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#7a1f16"/></marker>
  ${rainDefs}
  <style>.name{font-size:12.5px;fill:${INK};paint-order:stroke;stroke:${PAPER};stroke-width:3.5px;stroke-linejoin:round;letter-spacing:.03em}.stars{font-size:10.5px;fill:#a8790c;paint-order:stroke;stroke:${PAPER};stroke-width:3px}</style>
</defs>
<rect width="${W}" height="${H}" fill="${PAPER}"/>
<rect width="${W}" height="${H}" filter="url(#mottle)"/>
<g filter="url(#rough)">${territory}</g>
<path d="${borders}" stroke="${INK}" stroke-opacity=".45" stroke-width="1.6" stroke-dasharray="1 4" stroke-linecap="round" fill="none" filter="url(#rough)"/>
${soil}
${obstacles}
${glyphs}
${roads}
${stones}
${towns}
${events}
<rect width="${W}" height="${H}" filter="url(#paper)"/>
<rect width="${W}" height="${H}" fill="url(#dusk)"/>
<rect width="${W}" height="${H}" fill="url(#vig)"/>
<rect x="3" y="3" width="${W - 6}" height="${H - 6}" fill="none" stroke="${INK}" stroke-width="2"/><rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="none" stroke="${INK}" stroke-width=".7"/>
</svg>`;
writeFileSync(`${OUT}/map.svg`, mapSvg);

// ---- legend page
const sw = (inner: string, w = 56, h = 44) => `<svg viewBox="${-w / 2} ${-h / 2} ${w} ${h}" width="${w * 1.25}" height="${h * 1.25}">${inner}</svg>`;
const legend: Array<[string, string, string]> = [
  ['Ground', sw(`<rect x="-26" y="-6" width="16" height="12" rx="3" fill="${SOIL.plain}" opacity=".7"/><rect x="-8" y="-6" width="16" height="12" rx="3" fill="${SOIL.forest}" opacity=".7"/><rect x="10" y="-6" width="16" height="12" rx="3" fill="${SOIL.hills}" opacity=".8"/>`), 'Soil under a road shows its terrain: pale plain (1), green forest (2), dark hills and mud (3). Darker ground = dearer road.'],
  ['Forest · hills', sw(tree(-12, 0) + hill(12, 2)), 'Glyphs beside a road repeat its terrain so the cost reads without the number.'],
  ['Mountains · lakes', sw(mountain(-10, 6, 0.75) + lake(17, 4, 9)), 'Where no road exists. Each one sits on a road the map could have had but doesn’t.'],
  ['Milestone', sw(`<g><path d="M-7,9 L-7,-4 Q-7,-10 0,-10 Q7,-10 7,-4 L7,9 Z" fill="#e8dcc0" stroke="${INK}"/><text y="4" text-anchor="middle" font-size="11" font-weight="bold">4</text></g>`), 'Cost to build, including tolls. Hidden once the road is built.'],
  ['Roman road', sw(`<path d="M-24,0 H24" stroke="#4a3a26" stroke-width="7.5"/><path d="M-24,0 H24" stroke="#d9c59a" stroke-width="4.5"/><path d="M-24,0 H24" stroke="#8d7550" stroke-width="4.5" stroke-dasharray="2.2 2.2"/>`), 'Built road. Pulses red when the forecast will cut it.'],
  ['Towns', sw(hut(-18, 2, TRIBE[0]!, 1) + `<g>${[0, 1, 2].map((k) => hut(6 + (k - 1) * 9, k === 1 ? -2 : 3, TRIBE[1]!, 1)).join('')}</g>`), 'More buildings = more ★. 3★ towns get a palisade, 4★ a stone wall. Faded roofs = not yet supplied.'],
  ['Supplied', sw(`<line x1="0" y1="10" x2="0" y2="-10" stroke="${INK}" stroke-width="1.2"/><path d="M0,-10 h9 v6 h-9 Z" fill="#a3271f"/>`), 'The red flag marks towns connected to the castra (they pay).'],
  ['Legion', sw(standard(0, 12, 1), 56, 48), 'The standard shows where a legion camps. A number means several.'],
  ['Raiders', sw(tent(-9, 4) + tent(8, 2) + tent(0, -6), 56, 40), 'Their camp sits beside the exact road a raid will cut.'],
  ['Revolt', sw(smoke(0, 14), 40, 48), 'Smoke rises over the tribe’s towns whose roads will be cut.'],
  ['Rains', sw(`<rect x="-24" y="-16" width="48" height="32" fill="url(#lrain)"/>`), 'Blue hatching over the tribe’s lands while roads cost more.'],
  ['Harvest · silver', sw(`<g transform="translate(-10,4)"><path d="M0,8 L0,-6 M-3,8 L-1,-4 M3,8 L1,-4" stroke="#a07a1c" stroke-width="1.3"/><ellipse cx="0" cy="-7" rx="2" ry="4" fill="#d9b23a"/><ellipse cx="-2.5" cy="-5" rx="1.6" ry="3.4" fill="#d9b23a"/><ellipse cx="2.5" cy="-5" rx="1.6" ry="3.4" fill="#d9b23a"/></g><path d="M14,-8 l2,5 5,2 -5,2 -2,5 -2,-5 -5,-2 5,-2 Z" fill="#e8ecf5" stroke="#6d7290"/>`), 'Wheat on towns that will pay double; a glint on the town gaining ★.'],
];
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Map art mockup</title><style>
body{margin:0;background:#2b2116;font-family:Georgia,serif;color:#2b2116;display:flex;gap:18px;padding:18px;box-sizing:border-box;min-height:100vh}
.map{flex:0 0 auto;height:calc(100vh - 36px);aspect-ratio:${W}/${H};box-shadow:0 6px 24px #000a}.map svg{width:100%;height:100%;display:block}
.side{background:#f3e8cc;border-radius:8px;padding:14px 18px;width:400px;overflow:auto;max-height:calc(100vh - 36px);box-sizing:border-box}
h1{font-size:20px;margin:0 0 2px;color:#5a1a12}.sub{font-size:12px;color:#7a6a52;margin-bottom:10px}
.row{display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid #e0d2b0}.row b{display:block;font-size:13px}.row span{font-size:12px;line-height:1.35}
.ic{flex:0 0 74px;display:flex;justify-content:center}
</style></head><body><div class="map">${mapSvg}</div><div class="side"><h1>Campaign map · mockup</h1>
<div class="sub">${DATE}, turn ${s.turn}/10, played by the forecast bot · every symbol carries game information · light warms toward dusk</div>
<svg width="0" height="0"><defs><pattern id="lrain" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(20)"><line x1="0" y1="0" x2="0" y2="6" stroke="#3f6f9f" stroke-width="1.2" opacity=".7"/></pattern></defs></svg>
${legend.map(([h, ic, t]) => `<div class="row"><div class="ic">${ic}</div><div><b>${h}</b><span>${t}</span></div></div>`).join('')}
</div></body></html>`;
writeFileSync(`${OUT}/mockup.html`, html);
console.error(`turn ${s.turn}; events: ${ev.map((e) => e.kind + '@' + e.turn).join(', ')}; threatened roads ${threat.size}; obstacles ${obstaclePts.length}`);
