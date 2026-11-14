// Board art: the static tile board (built once per day and orientation) and the drawing
// helpers the game layer uses on top of it (settlements, event overlays).
//
// Geometry: one Voronoi tile per town, plus "wild" tiles in the gaps no candidate road crosses.
// Every candidate road (a Gabriel edge) crosses exactly one tile seam, at its midpoint.
// Tiles are texture only; every piece of game information is drawn by the game layer on top,
// and props never cover a road or a town. Art randomness uses its own stream (seed + "/art"),
// so it never affects the game. Coordinates are computed in the original orientation and
// mapped to the screen orientation only when drawn, so rotating the phone keeps the same board.
import { Rng, buildLand, clipPoly, dist, distSeg, inside, LAND_K } from '../../shared/engine';
import type { Land, Pt, Scenario } from '../../shared/engine';

export type { Pt, Land };

/** Pixels per board unit inside the art. The art group is scaled by 1/K into board units. */
export const K = LAND_K;
export const OUT = '#1d1409';
export const CREAM = '#f3e6c4';
/** Half-width of the seam between tiles, and the width of a tribe's border band (art pixels). */
const SEAM = 2.5, BAND = 8.7;
export const TRIBE_ART = ['#f0b81c', '#2f86e0', '#a24fd6', '#e8e8e8'];
const f = (n: number) => n.toFixed(1);

// ---------------------------------------------------------------- geometry (shared with the rules: engine/land.ts)
const clip = clipPoly;
export function inset(poly: Pt[], d: number): Pt[] {
  const area = poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]!; return a + p.x * q.y - q.x * p.y; }, 0);
  const sgn = Math.sign(area) || 1;
  let out = poly;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!, l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const n = { x: (sgn * (q.y - p.y)) / l, y: (-sgn * (q.x - p.x)) / l };
    out = clip(out, n, n.x * p.x + n.y * p.y - d);
  }
  return out;
}
export const polyD = (p: Pt[]) => 'M' + p.map((q) => `${f(q.x)},${f(q.y)}`).join('L') + 'Z';
const centroid = (p: Pt[]) => ({ x: p.reduce((a, q) => a + q.x, 0) / p.length, y: p.reduce((a, q) => a + q.y, 0) / p.length });

// ---------------------------------------------------------------- props (outlined, two-tone)
const O = OUT;
const pine = (x: number, y: number, k = 1, c = ['#2f6b3a', '#24532d']) => `<g transform="translate(${f(x)},${f(y)}) scale(${k.toFixed(2)})"><ellipse cx="1.5" cy="7" rx="6" ry="2.2" fill="#000" opacity=".22"/><rect x="-1.2" y="3" width="2.4" height="4" fill="#6a4423" stroke="${O}" stroke-width=".8"/><path d="M0,-12 L7,0 L3.5,0 L8,5 L-8,5 L-3.5,0 L-7,0 Z" fill="${c[0]}" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/><path d="M0,-12 L7,0 L3.5,0 L8,5 L1,5 Z" fill="${c[1]}"/></g>`;
const oak = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k.toFixed(2)})"><ellipse cx="1.5" cy="7" rx="6" ry="2.2" fill="#000" opacity=".22"/><rect x="-1.3" y="1" width="2.6" height="6" fill="#6a4423" stroke="${O}" stroke-width=".8"/><circle r="6.2" fill="#5f9a3c" stroke="${O}" stroke-width="1.3"/><path d="M4.4,-4.4 A6.2,6.2 0 0 1 -4.4,4.4 A5,5 0 0 0 4.4,-4.4" fill="#477a2c"/><circle cx="-2" cy="-2.2" r="1.8" fill="#86bf5a"/></g>`;
const hillP = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k.toFixed(2)})"><path d="M-13,5 Q-4,-12 13,5 Z" fill="#c49352" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/><path d="M-1,-5.5 Q8,-2 13,5 L3,5 Q4,-1 -1,-5.5" fill="#9a6c34"/><path d="M-7,1 l3,-3" stroke="${O}" stroke-width=".8"/></g>`;
const peak = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k.toFixed(2)})"><ellipse cx="3" cy="11" rx="18" ry="3.5" fill="#000" opacity=".25"/><path d="M-18,11 L-2,-20 L5,-9 L9,-14 L20,11 Z" fill="#9b958a" stroke="${O}" stroke-width="1.5" stroke-linejoin="round"/><path d="M-2,-20 L5,-9 L2,11 L20,11 L9,-14 L5,-9" fill="#6c665c"/><path d="M-8,-8 L-2,-20 L3.5,-12 L0,-10 L-3,-13 L-5,-8 Z" fill="#fbfaf5" stroke="${O}" stroke-width=".9" stroke-linejoin="round"/></g>`;
const curl = (x: number, y: number, k = 1, c = '#cfe7ee') => `<path d="M${f(x - 8 * k)},${f(y)} q${f(4 * k)},${f(-6 * k)} ${f(8 * k)},0 q${f(-3 * k)},${f(-1 * k)} ${f(-2 * k)},${f(-3.5 * k)}" fill="none" stroke="${c}" stroke-width="${f(1.6 * k)}" stroke-linecap="round"/>`;
const trireme = (x: number, y: number, flip: boolean) => `<g transform="translate(${f(x)},${f(y)}) scale(${flip ? -1.1 : 1.1},1.1)"><path d="M-16,8 l-3,6 M-10,8 l-3,6 M-4,8 l-3,6 M2,8 l-3,6 M8,8 l-3,6" stroke="${O}" stroke-width="1"/><path d="M-20,4 Q-18,10 -10,10 L12,10 Q18,9 22,2 L16,4 Z" fill="#7a4a24" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/><path d="M22,2 l5,-3" stroke="${O}" stroke-width="1.5"/><line x1="0" y1="4" x2="0" y2="-16" stroke="${O}" stroke-width="1.4"/><path d="M-8,-14 Q0,-10 8,-14 L8,0 Q0,3 -8,0 Z" fill="#efe2c2" stroke="${O}" stroke-width="1.2"/><path d="M-8,-7 Q0,-4 8,-7" stroke="#b3261e" stroke-width="2.4" fill="none"/></g>`;
const boat = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})"><path d="M-8,0 Q0,5 8,0 Z" fill="#8a5a2c" stroke="${O}" stroke-width="1.1"/><circle cx="-1" cy="-3" r="2" fill="#d8b089" stroke="${O}" stroke-width=".8"/><path d="M1,-2 L9,-10" stroke="${O}" stroke-width=".9"/></g>`;
const duck = (x: number, y: number) => `<path d="M${f(x - 4)},${f(y)} q4,-4 8,0" fill="none" stroke="${O}" stroke-width="1.1"/>`;
const reeds = (x: number, y: number) => `<path d="M${f(x - 2)},${f(y)} l-1,-7 M${f(x)},${f(y)} l0,-9 M${f(x + 2)},${f(y)} l1,-6" stroke="#4d5a28" stroke-width="1.3"/>`;
const menhirs = (x: number, y: number) => [0, 1, 2, 3, 4].map((k) => { const a = (k / 5) * Math.PI * 2; return `<path d="M${f(x + Math.cos(a) * 9 - 2.5)},${f(y + Math.sin(a) * 6 + 3)} l1,-9 q1.5,-2 3,0 l1,9 Z" fill="#b8b3a6" stroke="${O}" stroke-width="1"/>`; }).join('');
const deer = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})"><path d="M-5,0 q5,-3 9,-1 l2,-4 M6,-5 l2,-3 M6,-5 l-1,-3" fill="#a0602a" stroke="${O}" stroke-width="1.1" stroke-linecap="round"/><path d="M-4,0 l0,4 M3,0 l0,4" stroke="${O}" stroke-width="1.1"/></g>`;
const vine = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})"><path d="M-7,0 H7" stroke="#6a4423" stroke-width="1"/>${[-5, -1, 3].map((dx) => `<circle cx="${dx}" cy="-1.5" r="2" fill="#5c8a2e" stroke="${O}" stroke-width=".6"/><circle cx="${dx + 1}" cy="0.8" r="1" fill="#6b2a5a"/>`).join('')}</g>`;
const tufts = (x: number, y: number) => `<path d="M${f(x - 3)},${f(y)} q1,-4 2,0 M${f(x)},${f(y)} q.5,-5 1,0 M${f(x + 2)},${f(y)} q1,-3.5 2,0" stroke="#5e7a2a" stroke-width="1" fill="none"/>`;

/** A tribe's symbol (▲ ● ■ ◆), white on its border band: identity that does not rely on colour. */
export function tribeMark(k: number, x: number, y: number, r = 5.5): string {
  const st = `fill="#fff" stroke="${O}" stroke-width="1.6" stroke-linejoin="round"`;
  switch (k % 4) {
    case 0: return `<path d="M${f(x)},${f(y - r)} L${f(x + r)},${f(y + r * 0.8)} L${f(x - r)},${f(y + r * 0.8)} Z" ${st}/>`;
    case 1: return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.85)}" ${st}/>`;
    case 2: return `<rect x="${f(x - r * 0.8)}" y="${f(y - r * 0.8)}" width="${f(r * 1.6)}" height="${f(r * 1.6)}" ${st}/>`;
    default: return `<path d="M${f(x)},${f(y - r)} L${f(x + r)},${f(y)} L${f(x)},${f(y + r)} L${f(x - r)},${f(y)} Z" ${st}/>`;
  }
}

// ---------------------------------------------------------------- the board
export type Board = {
  /** Static background markup in board units (wrap in an <svg> sharing the game's viewBox). */
  markup: string;
  /** Inset tile polygon of each town, in art pixels and screen orientation. */
  tile: Pt[][];
  /** Town positions in art pixels and screen orientation. */
  town: Pt[];
  /** Map a board-unit point in the ORIGINAL orientation to art pixels on screen. */
  seed: string;
};

/**
 * Build the static board. `sc` is the original scenario; `rotated` turns the board a quarter
 * turn (castra on the left) exactly as the game view does: (x, y) -> (height - y, x).
 */
export function buildBoard(sc: Scenario, rotated: boolean): Board {
  const W = sc.width * K, H = sc.height * K;
  const mp = (p: Pt): Pt => (rotated ? { x: H - p.y, y: p.x } : p);
  const rng = new Rng(`${sc.seed}/art`);
  const r = (a: number, b: number) => a + rng.next() * (b - a);
  const T = sc.towns.map((t) => ({ x: t.x * K, y: t.y * K }));
  const nearRoad = (p: Pt, pad: number) => sc.roads.some((rd) => distSeg(p, T[rd.a]!, T[rd.b]!) < pad);
  const nearTown = (p: Pt, pad: number) => T.some((t) => dist(p, t) < pad);
  // tiles and their land (shared with the rules, which need coast and frontier towns)
  const { cells, land, across } = buildLand(sc, rng);

  function scatter(poly: Pt[], spacing: number, edge: number, draw: (p: Pt) => string, max = 400, keep: (p: Pt) => boolean = () => true): string {
    const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pts: Pt[] = [];
    for (let k = 0; k < ((x1 - x0) * (y1 - y0)) / (spacing * spacing) * 3 && pts.length < max; k++) {
      const p = { x: r(x0, x1), y: r(y0, y1) };
      if (!inside(poly, p, edge) || !keep(p) || nearRoad(p, 2.6 * K) || nearTown(p, 6.5 * K) || pts.some((q) => dist(p, q) < spacing)) continue;
      pts.push(p);
    }
    return pts.map(mp).sort((a, b) => a.y - b.y).map(draw).join('');
  }
  function stripes(center: Pt, pal: string[], wmin: number, wmax: number, line: string, th = r(0, Math.PI)): string {
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

  const BASE: Record<Land, string> = { plain: '#b6c45a', forest: '#8fb04c', hills: '#c9a25e', roman: '#d9c48c', mountain: '#8f897d', sea: '#245a78', lake: '#6fb2c4', wildwood: '#2c5a30' };
  const id = sc.seed.replace(/[^a-z0-9]/gi, '') + (rotated ? 'r' : 'u');
  let defs = '', sea = '', ground = '', shadows = '', tiles = '', tex = '', rims = '', borders = '', marks = '';
  const tileOut: Pt[][] = [];
  cells.forEach((cell, i) => {
    const L = land[i]!;
    const view = cell.map(mp);
    if (L === 'sea') {
      sea += `<path d="${polyD(view)}" fill="${BASE.sea}" stroke="${BASE.sea}" stroke-width="2"/>`;
      let g = scatter(cell, 22, 6, (p) => curl(p.x, p.y, r(0.9, 1.3)), 40);
      const c = mp(centroid(cell));
      if (rng.next() < 0.65) g += trireme(c.x, c.y, c.x > (rotated ? H : W) / 2);
      defs += `<clipPath id="s${id}${i}"><path d="${polyD(view)}"/></clipPath>`;
      tex += `<g clip-path="url(#s${id}${i})">${g}</g>`;
      return;
    }
    const t = inset(cell, SEAM);
    if (t.length < 3) return;
    const tv = t.map(mp);
    if (i < T.length) tileOut[i] = tv;
    defs += `<clipPath id="c${id}${i}"><path d="${polyD(tv)}"/></clipPath>`;
    // ground under the seam: the full cell in the tile's own colour, so neighbouring tiles meet
    // along a thin ink line instead of being separated by water
    ground += `<path d="${polyD(view)}" fill="${BASE[L]}" stroke="${BASE[L]}" stroke-width="1.5" stroke-linejoin="round"/>`;
    shadows += `<path d="${polyD(tv.map((p) => ({ x: p.x + 0.8, y: p.y + 1.6 })))}" fill="#000" opacity=".22"/>`;
    tiles += `<path d="${polyD(tv)}" fill="${BASE[L]}" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/>`;
    let g = '';
    const c = mp(centroid(t));
    if (L === 'roman') {
      const home = mp(T[i]!);
      g += stripes(home, ['#e3d29b', '#cdb877', '#d8c88f'], 16, 16, '#9c8a5a', 0) + stripes(home, ['#00000000'], 16, 16, '#9c8a5a', Math.PI / 2);
      g += scatter(t, 15, 8, (p) => vine(p.x, p.y), 18);
    } else if (L === 'plain') {
      g += scatter(t, 9, 4, (p) => tufts(p.x, p.y), 120) + scatter(t, 34, 10, (p) => oak(p.x, p.y, 0.9), 4);
    } else if (L === 'forest') {
      g += scatter(t, 15, 6, (p) => (rng.next() < 0.55 ? oak(p.x, p.y, r(0.85, 1.1)) : pine(p.x, p.y, r(0.8, 1), ['#4f8f3c', '#3c7030'])), 200);
    } else if (L === 'hills') {
      g += scatter(t, 21, 8, (p) => hillP(p.x, p.y, r(0.9, 1.2)), 60);
    } else if (L === 'mountain') {
      g += scatter(t, 26, 13, (p) => peak(p.x, p.y, r(0.95, 1.35)), 30);
    } else if (L === 'lake') {
      g += scatter(t, 20, 9, (p) => curl(p.x, p.y, 0.8, '#e6f4f7'), 20) + scatter(t, 12, 3, (p) => reeds(p.x, p.y), 30, (p) => !inside(t, p, 14));
      g += boat(c.x, c.y) + duck(c.x + 22, c.y + 14) + duck(c.x + 30, c.y + 10);
    } else if (L === 'wildwood') {
      g += menhirs(c.x, c.y) + deer(c.x + 26, c.y + 18) + scatter(t, 10, 4, (p) => pine(p.x, p.y, r(1, 1.3)), 300, (p) => dist(mp(p), c) > 22);
    }
    tex += `<g clip-path="url(#c${id}${i})">${g}</g>`;
    for (let k = 0; k < cell.length; k++) { // sandy coast where land meets the sea
      const p = cell[k]!, q = cell[(k + 1) % cell.length]!, j = across(i, p, q);
      if (j >= 0 && land[j] === 'sea') { const a = mp(p), b = mp(q); tex += `<path d="M${f(a.x)},${f(a.y)} L${f(b.x)},${f(b.y)}" stroke="#e8d7a0" stroke-width="16" clip-path="url(#c${id}${i})"/>`; }
    }
    if (i < T.length && i > 0) {
      // tribe border: a thick band only along edges where the tribe's territory ends
      const tribe = sc.towns[i]!.tribe, col = TRIBE_ART[tribe % TRIBE_ART.length]!;
      for (let k = 0; k < cell.length; k++) {
        const p = cell[k]!, q = cell[(k + 1) % cell.length]!, j = across(i, p, q);
        if (j > 0 && j < T.length && sc.towns[j]!.tribe === tribe) continue;
        const a = mp(p), b = mp(q), d = `M${f(a.x)},${f(a.y)} L${f(b.x)},${f(b.y)}`;
        borders += `<g clip-path="url(#c${id}${i})"><path d="${d}" stroke="${O}" stroke-width="${2 * (SEAM + BAND + 2.5)}" stroke-linecap="round"/><path d="${d}" stroke="${col}" stroke-width="${2 * (SEAM + BAND)}" stroke-linecap="round"/></g>`;
        // the tribe's symbol stamped along the band, so tribes differ by shape as well as colour
        const len = dist(p, q), home = T[i]!;
        const n = Math.floor(len / 70);
        for (let m = 1; m <= n; m++) {
          const at = { x: p.x + ((q.x - p.x) * m) / (n + 1), y: p.y + ((q.y - p.y) * m) / (n + 1) };
          const toward = dist(at, home) || 1, c = mp({ x: at.x + ((home.x - at.x) / toward) * (SEAM + BAND / 2), y: at.y + ((home.y - at.y) / toward) * (SEAM + BAND / 2) });
          marks += tribeMark(tribe, c.x, c.y, 4.2);
        }
      }
    }
  });
  // the limes: palisade on the castra tile's edges that face Gaul (not the map's southern edge)
  {
    const t = inset(cells[0]!, 9);
    for (let k = 0; k < t.length; k++) {
      const p0 = t[k]!, q0 = t[(k + 1) % t.length]!;
      if (Math.min(p0.y, q0.y) > H - 12) continue;
      const p = mp(p0), q = mp(q0), n = Math.max(2, Math.floor(dist(p, q) / 7));
      for (let j = 0; j <= n; j++) { const x = p.x + ((q.x - p.x) * j) / n, y = p.y + ((q.y - p.y) * j) / n; rims += `<path d="M${f(x - 2)},${f(y + 3)} L${f(x - 2)},${f(y - 4)} L${f(x)},${f(y - 7)} L${f(x + 2)},${f(y - 4)} L${f(x + 2)},${f(y + 3)} Z" fill="#8a5a2c" stroke="${O}" stroke-width=".8"/>`; }
      const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      rims += `<rect x="${f(m.x - 5)}" y="${f(m.y - 12)}" width="10" height="14" fill="#a46a35" stroke="${O}" stroke-width="1.2"/><path d="M${f(m.x - 7)},${f(m.y - 12)} L${f(m.x)},${f(m.y - 18)} L${f(m.x + 7)},${f(m.y - 12)} Z" fill="#b3261e" stroke="${O}" stroke-width="1"/>`;
    }
  }
  // rivers: where two neighbouring towns have no candidate road between them
  let rivers = '';
  const hasRoad = new Set(sc.roads.map((rd) => `${Math.min(rd.a, rd.b)}-${Math.max(rd.a, rd.b)}`));
  for (let a = 0; a < T.length; a++) {
    const ca = cells[a]!;
    for (let k = 0; k < ca.length; k++) {
      const p0 = ca[k]!, q0 = ca[(k + 1) % ca.length]!, b = across(a, p0, q0);
      if (b <= a || b >= T.length || hasRoad.has(`${a}-${b}`)) continue;
      // only where the two towns are genuine neighbours: the seam crosses the segment joining them
      const m = { x: (T[a]!.x + T[b]!.x) / 2, y: (T[a]!.y + T[b]!.y) / 2 };
      if (distSeg(m, p0, q0) > 2) continue;
      const p = mp(p0), q = mp(q0), dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
      let d = `M${f(p.x)},${f(p.y)}`;
      for (let j = 1; j <= 6; j++) { const t = j / 6, w = j < 6 ? (j % 2 ? 5 : -5) : 0; d += ` Q${f(p.x + dx * (t - 1 / 12) + nx * w)},${f(p.y + dy * (t - 1 / 12) + ny * w)} ${f(p.x + dx * t)},${f(p.y + dy * t)}`; }
      rivers += `<path d="${d}" stroke="${O}" stroke-width="10" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#5fb0cf" stroke-width="6.5" fill="none" stroke-linecap="round"/>`;
    }
  }
  // harbours on ports (a jetty into the sea, a moored boat) and watchtowers on the frontier;
  // deterministic placement (no random draws), on the longest sea / frontier edge of the tile
  let shoreArt = '';
  const EPS = 0.5, n0 = T.length;
  const edgeMount = (j: number) => j >= n0 && land[j] === 'mountain' && cells[j]!.some((p) => p.x > W - EPS || p.y > H - EPS);
  for (let i = 1; i < n0; i++) {
    const c = cells[i]!;
    let sea: [Pt, Pt] | null = null, front: [Pt, Pt] | null = null;
    for (let k = 0; k < c.length; k++) {
      const p = c[k]!, q = c[(k + 1) % c.length]!, j = across(i, p, q), len = dist(p, q);
      if (j >= 0 && land[j] === 'sea' && (!sea || len > dist(sea[0], sea[1]))) sea = [p, q];
      const border = j < 0 && (Math.max(p.x, q.x) > W - EPS || Math.max(p.y, q.y) > H - EPS);
      if ((edgeMount(j) || border) && (!front || len > dist(front[0], front[1]))) front = [p, q];
    }
    const out = (e: [Pt, Pt]) => { // edge midpoint and the unit normal pointing away from the town
      const m = { x: (e[0].x + e[1].x) / 2, y: (e[0].y + e[1].y) / 2 }, dx = e[1].x - e[0].x, dy = e[1].y - e[0].y, l = Math.hypot(dx, dy) || 1;
      let nx = -dy / l, ny = dx / l;
      if ((m.x - T[i]!.x) * nx + (m.y - T[i]!.y) * ny < 0) { nx = -nx; ny = -ny; }
      return { m, nx, ny, tx: dx / l, ty: dy / l };
    };
    if (sea && dist(sea[0], sea[1]) > 24) {
      const { m, nx, ny, tx, ty } = out(sea);
      const P = (a: number, b: number) => mp({ x: m.x + nx * a + tx * b, y: m.y + ny * a + ty * b });
      const quad = [P(-6, -4), P(30, -4), P(30, 4), P(-6, 4)];
      let planks = '';
      for (let a = 0; a <= 28; a += 5) { const u = P(a, -4.5), v = P(a, 4.5); planks += `M${f(u.x)},${f(u.y)} L${f(v.x)},${f(v.y)} `; }
      const posts = [P(30, -5), P(30, 5), P(14, -5), P(14, 5)].map((o) => `<circle cx="${f(o.x)}" cy="${f(o.y)}" r="1.8" fill="#3b2a1a"/>`).join('');
      const boat = P(22, 15);
      shoreArt += `<path d="${polyD(quad)}" fill="#9a6a3a" stroke="${O}" stroke-width="1.2"/><path d="${planks}" stroke="#5a3a1a" stroke-width=".8"/>${posts}` +
        `<g transform="translate(${f(boat.x)},${f(boat.y)}) scale(.55)"><path d="M-14,0 Q-12,6 -4,6 L10,6 Q15,5 17,-1 Z" fill="#7a4a24" stroke="${O}" stroke-width="1.6"/><line x1="0" y1="2" x2="0" y2="-14" stroke="${O}" stroke-width="1.6"/><path d="M-1,-13 L-9,-2 H-1 Z" fill="#efe2c2" stroke="${O}" stroke-width="1"/></g>`;
    }
    if (front && dist(front[0], front[1]) > 24) {
      const { m, nx, ny } = out(front);
      const t = mp({ x: m.x - nx * 20, y: m.y - ny * 20 });
      shoreArt += `<g transform="translate(${f(t.x)},${f(t.y)})"><ellipse cy="9" rx="10" ry="2.6" fill="#000" opacity=".22"/>` +
        `<path d="M-6,9 L-4.5,-8 M6,9 L4.5,-8 M-5.5,3 L5.5,-3 M5.5,3 L-5.5,-3" stroke="#5a3a1a" stroke-width="2.2" stroke-linecap="round"/>` +
        `<rect x="-7.5" y="-12" width="15" height="5" fill="#9a6a3a" stroke="${O}" stroke-width="1.1"/><path d="M-8.5,-12 L0,-19 L8.5,-12 Z" fill="#b3261e" stroke="${O}" stroke-width="1.1"/>` +
        `<line x1="0" y1="-19" x2="0" y2="-26" stroke="${O}" stroke-width="1"/><path d="M0,-26 L6,-24 L0,-22 Z" fill="#e0b42a"/></g>`;
    }
  }

  const BW = rotated ? H : W, BH = rotated ? W : H;
  const markup = `<defs>${defs}</defs><g transform="scale(${1 / K})">` +
    `<rect x="${-BW}" y="${-BH}" width="${BW * 3}" height="${BH * 3}" fill="#2a1e12"/>` +
    `<rect width="${BW}" height="${BH}" fill="${BASE.sea}"/>` +
    sea + ground + shadows + tiles + tex + borders + marks + shoreArt + rims + rivers + '</g>';
  return { markup, tile: tileOut, town: T.map(mp), seed: sc.seed };
}

// ---------------------------------------------------------------- settlements (art pixels, centred on 0,0)
const roundhouse = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><path d="M-6,0 L-6,5 Q0,7 6,5 L6,0 Z" fill="#b48a58" stroke="${O}" stroke-width="1.1"/><path d="M-1.6,6.3 L-1.6,2.4 Q0,1.4 1.6,2.4 L1.6,6.3 Z" fill="${O}"/><path d="M-8.5,1 Q-4,-5 0,-12 Q4,-5 8.5,1 Q0,3.6 -8.5,1 Z" fill="#d9ad4e" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/><path d="M0,-12 Q4,-5 8.5,1 Q5,2.2 2,2.5 Q2.5,-5 0,-12" fill="#b78a32"/><path d="M-4,-3 L-5.5,1.6 M0,-5 L0,2.6 M4,-3 L5.2,1.8" stroke="#8a6524" stroke-width=".7"/></g>`;
const longhall = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})"><path d="M-11,0 L-11,6 L11,6 L11,0 Z" fill="#a87e4c" stroke="${O}" stroke-width="1.2"/><path d="M-2,6 L-2,2 L2,2 L2,6 Z" fill="${O}"/><path d="M-14,1 L-8,-10 L8,-10 L14,1 Z" fill="#d9ad4e" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/><path d="M2,-10 L8,-10 L14,1 L6,1 Z" fill="#b78a32"/><path d="M-8,-10 L-6,-14 M8,-10 L6,-14" stroke="${O}" stroke-width="1.2"/></g>`;
const palisade = (rx: number, ry: number) => {
  let g = '';
  const n = Math.round(rx * 1.1);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.PI / 2;
    if (Math.abs(Math.sin(a) - 1) < 0.12) continue;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry + 4;
    g += `<path d="M${f(x - 1.6)},${f(y + 3)} L${f(x - 1.6)},${f(y - 4)} L${f(x)},${f(y - 6.5)} L${f(x + 1.6)},${f(y - 4)} L${f(x + 1.6)},${f(y + 3)} Z" fill="#8a5a2c" stroke="${O}" stroke-width=".8"/>`;
  }
  return g;
};
const rampart = (rx: number, ry: number) => `<ellipse cx="0" cy="6" rx="${rx + 4}" ry="${ry + 3}" fill="#8f7a52" stroke="${O}" stroke-width="1.4"/><ellipse cx="0" cy="4" rx="${rx + 1}" ry="${ry + 1}" fill="#a99064"/>`;
const domus = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><path d="M-6.5,-2 L-6.5,5 L6.5,5 L6.5,-2 Z" fill="#f2ead6" stroke="${O}" stroke-width="1.1"/><path d="M-1.3,5 L-1.3,1.4 L1.3,1.4 L1.3,5 Z" fill="${O}"/><rect x="3" y="0" width="2" height="2" fill="${O}"/><path d="M-8,-1.5 L0,-9 L8,-1.5 Z" fill="#c4552d" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/><path d="M0,-9 L8,-1.5 L2,-1.5 Z" fill="#9c3d1e"/></g>`;
const temple = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})"><rect x="-12" y="5" width="24" height="3" fill="#ddd5c2" stroke="${O}" stroke-width="1"/><rect x="-10" y="-3" width="20" height="8" fill="#f6f1e4" stroke="${O}" stroke-width="1"/>${[-8, -4, 0, 4, 8].map((c) => `<line x1="${c}" y1="-3" x2="${c}" y2="5" stroke="${O}" stroke-width="1.1"/>`).join('')}<path d="M-12,-3 L0,-11 L12,-3 Z" fill="#f6f1e4" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/><path d="M0,-11 L12,-3 L3,-3 Z" fill="#d8cfba"/><circle cx="0" cy="-5.5" r="1.4" fill="#d8b23a"/></g>`;
const wallArc = (rx: number, ry: number, back: boolean) => {
  const d = back ? `M${-rx},5 A${rx},${ry} 0 0 1 ${rx},5` : `M${-rx},5 A${rx},${ry} 0 0 0 ${rx},5`;
  return `<path d="${d}" fill="none" stroke="${O}" stroke-width="6.5"/><path d="${d}" fill="none" stroke="#d8cfb6" stroke-width="4.2"/><path d="${d}" fill="none" stroke="#a89f88" stroke-width="4.2" stroke-dasharray="2 3"/>`;
};
const tower = (x: number, y: number) => `<rect x="${f(x - 4)}" y="${f(y - 9)}" width="8" height="10" fill="#e4dcc6" stroke="${O}" stroke-width="1.1"/><path d="M${f(x - 4)},${f(y - 9)} h2 v-1.8 h2 v1.8 h2 v-1.8 h2 v1.8" fill="none" stroke="${O}" stroke-width=".9"/>`;
const aqueduct = () => {
  let g = `<path d="M-40,-14 H40 V-6 H-40 Z" fill="#e4dcc6" stroke="${O}" stroke-width="1.1"/>`;
  for (let x = -38; x < 38; x += 8) g += `<path d="M${x},-6 V2 H${x + 2} V-1 Q${x + 4},-4 ${x + 6},-1 V2 H${x + 8} V-6" fill="#e4dcc6" stroke="${O}" stroke-width="1"/>`;
  return g;
};
const plinth = (rx: number, ry: number, tribe: string, roman: boolean) =>
  `<ellipse cx="1" cy="${ry * 0.55 + 7}" rx="${rx + 2}" ry="${ry * 0.6}" fill="#000" opacity=".3"/><ellipse cx="0" cy="${ry * 0.35 + 5}" rx="${rx}" ry="${ry * 0.55}" fill="${roman ? '#d8cba4' : '#9c8a5c'}" stroke="${tribe}" stroke-width="3.5"/>`;

/** Extent of a settlement icon above and below its centre (for labels). */
export const settlementSize = (v: number) => ({ top: [0, 22, 24, 30, 36][Math.max(1, Math.min(4, v))]!, bottom: [0, 12, 13, 17, 20][Math.max(1, Math.min(4, v))]! });

/** Settlement by tier (★1–4) and flavour: Gallic until Rome holds it, Roman after. */
export function settlement(v: number, roman: boolean, tribe: string): string {
  v = Math.max(1, Math.min(4, v));
  const P = [[0, 0], [20, 9], [24, 10], [28, 12], [34, 14]][v]!;
  let g = plinth(P[0]!, P[1]!, tribe, roman);
  if (!roman) {
    if (v === 1) g += roundhouse(-5, 2, 0.95) + roundhouse(6, 5, 0.85);
    if (v === 2) g += roundhouse(-9, 0, 0.9) + roundhouse(4, -3, 0.95) + roundhouse(-2, 7, 1) + roundhouse(11, 6, 0.85);
    if (v === 3) g += palisade(22, 10) + roundhouse(-9, -1, 0.9) + roundhouse(6, -3, 0.9) + roundhouse(-3, 6, 1) + roundhouse(10, 6, 0.9);
    if (v === 4) g += rampart(25, 11) + palisade(26, 12) + longhall(0, -3) + roundhouse(-15, 4, 0.85) + roundhouse(15, 5, 0.85) + roundhouse(-5, 9, 0.9) + roundhouse(8, 10, 0.85);
  } else {
    if (v === 1) g += domus(-5, 1, 0.95) + domus(7, 5, 0.85);
    if (v === 2) g += domus(-9, 0, 0.9) + domus(5, -3, 0.95) + domus(-2, 7, 1) + domus(12, 6, 0.85);
    if (v === 3) g += `<path d="M-22,8 Q0,18 22,8" fill="none" stroke="${O}" stroke-width="5"/><path d="M-22,8 Q0,18 22,8" fill="none" stroke="#d8cfb6" stroke-width="3"/>` + temple(0, -3) + domus(-14, 6, 0.85) + domus(14, 6, 0.85);
    if (v === 4) g += aqueduct() + wallArc(28, 11, true) + tower(-20, -2) + tower(20, -2) + temple(0, -5) + domus(-15, 6, 0.85) + domus(15, 6, 0.85) + wallArc(28, 11, false) + tower(-28, 6) + tower(28, 6) + tower(0, 17);
  }
  return g;
}

/** The castra: a square Roman camp. */
export function castraIcon(): string {
  let g = `<ellipse cx="1" cy="20" rx="27" ry="7" fill="#000" opacity=".3"/><rect x="-24" y="-18" width="48" height="36" rx="4" fill="#d8cba4" stroke="${O}" stroke-width="2"/>`;
  g += `<rect x="-24" y="-18" width="48" height="36" rx="4" fill="none" stroke="#8a5a2c" stroke-width="4" stroke-dasharray="3 1.4"/><path d="M0,-18 V18 M-24,0 H24" stroke="#b8a77a" stroke-width="3"/>`;
  for (const [x, y] of [[-12, -9], [12, -9], [-12, 9], [12, 9]]) g += `<path d="M${x! - 6},${y! + 4} L${x},${y! - 6} L${x! + 6},${y! + 4} Z" fill="#c4552d" stroke="${O}" stroke-width="1"/><path d="M${x},${y! - 6} L${x! + 6},${y! + 4} L${x! + 1},${y! + 4} Z" fill="#9c3d1e"/>`;
  for (const [x, y] of [[-24, -18], [24, -18], [-24, 18], [24, 18]]) g += `<rect x="${x! - 4}" y="${y! - 8}" width="8" height="9" fill="#a46a35" stroke="${O}" stroke-width="1.1"/>`;
  return g;
}

// ---------------------------------------------------------------- event glyphs (art pixels)
export const flame = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><path d="M0,8 C-7,6 -7,-2 -2,-8 C-2,-3 1,-3 1,-6 C6,-2 7,6 0,8 Z" fill="#f08a1c" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/><path d="M0,7 C-3,5 -3,1 0,-2 C1,1 3,3 0,7 Z" fill="#ffd84a"/></g>`;
export const pitchfork = (x: number, y: number, rot: number) => `<g transform="translate(${f(x)},${f(y)}) rotate(${f(rot)})"><line x1="0" y1="12" x2="0" y2="-6" stroke="#7a4a24" stroke-width="2.6"/><path d="M-5,-12 V-6 H5 V-12 M0,-13 V-6" fill="none" stroke="#5a5a5a" stroke-width="1.8" stroke-linecap="round"/></g>`;
export const swords = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><circle r="15" fill="#7a1f16" stroke="${O}" stroke-width="1.6"/>${[45, -45].map((a) => `<g transform="rotate(${a})"><path d="M-1.6,-12 L0,-14 L1.6,-12 L1.6,5 L-1.6,5 Z" fill="#e6e6ea" stroke="${O}" stroke-width=".9"/><rect x="-5" y="5" width="10" height="2.2" fill="#c9a227" stroke="${O}" stroke-width=".7"/><rect x="-1.2" y="7.2" width="2.4" height="5" fill="#6a4423" stroke="${O}" stroke-width=".6"/></g>`).join('')}</g>`;
export const sheaf = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><ellipse cy="9" rx="7" ry="2" fill="#000" opacity=".2"/>${[-4, -2, 0, 2, 4].map((dx) => `<path d="M${dx * 0.4},9 L${dx},-6" stroke="#a07a1c" stroke-width="1.3"/><ellipse cx="${dx}" cy="-8" rx="1.7" ry="4" fill="#f0c23a" stroke="${O}" stroke-width=".7"/>`).join('')}<path d="M-4,2 H4" stroke="#7a4a24" stroke-width="2"/></g>`;
export const coins = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})">${[[-6, 3], [6, 3], [0, -4]].map(([cx, cy]) => `<circle cx="${cx}" cy="${cy! + 1.5}" r="6" fill="#a6740f" stroke="${O}" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="6" fill="#f2c230" stroke="${O}" stroke-width="1.1"/><text x="${cx}" y="${cy! + 2.6}" text-anchor="middle" font-size="7" font-weight="bold" fill="#8a5a0c" font-family="Georgia,serif">D</text>`).join('')}</g>`;
export const silverPeak = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})"><ellipse cx="2" cy="11" rx="17" ry="3.4" fill="#000" opacity=".25"/><path d="M-17,11 L-2,-17 L4,-7 L8,-12 L18,11 Z" fill="#9b958a" stroke="${O}" stroke-width="1.5" stroke-linejoin="round"/><path d="M-8,6 L-3,-4 L1,2 L5,-6 M-11,10 L-5,2" stroke="#e8f0ff" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M12,-14 l1.6,4 4,1.6 -4,1.6 -1.6,4 -1.6,-4 -4,-1.6 4,-1.6 Z" fill="#fff" stroke="#6d7290" stroke-width=".8"/><path d="M-2,8 h6 v3 h-6 Z" fill="${O}"/></g>`;
export const cloud = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})"><path d="M-14,4 Q-16,-4 -8,-5 Q-6,-13 3,-10 Q10,-14 13,-6 Q19,-5 17,3 Z" fill="#c9d3dc" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/><path d="M-8,8 l-2,5 M-1,8 l-2,5 M6,8 l-2,5" stroke="#2f6f9f" stroke-width="1.6" stroke-linecap="round"/></g>`;
export const drop = (x: number, y: number) => `<path d="M${x},${y - 7} C${x + 6},${y} ${x + 5},${y + 6} ${x},${y + 6} C${x - 5},${y + 6} ${x - 6},${y} ${x},${y - 7} Z" fill="#5fb0e0" stroke="${O}" stroke-width="1.1"/>`;
export const silverMini = (x: number, y: number) => `<path d="M${x - 6},${y + 5} L${x},${y - 6} L${x + 6},${y + 5} Z" fill="#9b958a" stroke="${O}" stroke-width="1"/><path d="M${x - 3},${y + 2} L${x},${y - 3} L${x + 2},${y}" stroke="#eef3ff" stroke-width="1.6" fill="none"/>`;
// ---- art for the 2026-11-15 events (large props on tiles, and small icons below)
export const dagger = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><circle r="15" fill="#3d3326" stroke="${O}" stroke-width="1.6"/><g transform="rotate(35)"><path d="M-1.8,-12 L0,-14.5 L1.8,-12 L1.6,4 L-1.6,4 Z" fill="#d9d9de" stroke="${O}" stroke-width=".9"/><rect x="-5.5" y="4" width="11" height="2.2" fill="#8a6a3a" stroke="${O}" stroke-width=".7"/><rect x="-1.3" y="6.2" width="2.6" height="5.5" fill="#4a3018" stroke="${O}" stroke-width=".6"/></g><path d="M-9,-3 q4,-4 8,0 M1,-3 q4,-4 8,0" stroke="#000" stroke-width="2.4" fill="none" opacity=".55"/></g>`;
export const sickle = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><path d="M-9,4 C-10,-7 0,-12 8,-8 C1,-8 -5,-4 -4,4 Z" fill="#f0c23a" stroke="${O}" stroke-width="1.1" stroke-linejoin="round"/><path d="M-9,4 L-6,10" stroke="#6a4423" stroke-width="2.6" stroke-linecap="round"/><path d="M-9,4 L-6,10" stroke="${O}" stroke-width=".6" stroke-linecap="round" opacity=".5"/><circle cx="5" cy="4" r="2" fill="#eef5e0" stroke="#5d7a2a" stroke-width=".8"/><circle cx="8.5" cy="1.5" r="1.7" fill="#eef5e0" stroke="#5d7a2a" stroke-width=".8"/><circle cx="7.5" cy="6.5" r="1.5" fill="#eef5e0" stroke="#5d7a2a" stroke-width=".8"/></g>`;
export const bowl = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><path d="M-9,-1 H9 Q8,8 0,8 Q-8,8 -9,-1 Z" fill="#a8743a" stroke="${O}" stroke-width="1.1" stroke-linejoin="round"/><path d="M-2,-1 L0,3 L-1,6" stroke="${O}" stroke-width="1" fill="none"/><path d="M-3,-5 q1.5,-2 0,-4 M3,-5 q1.5,-2 0,-4" stroke="#8a7a66" stroke-width="1" fill="none"/></g>`;
export const snowflake = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})" stroke-linecap="round">${[0, 60, 120].map((a) => `<g transform="rotate(${a})"><line x1="0" y1="-8" x2="0" y2="8" stroke="${O}" stroke-width="3.2"/><line x1="0" y1="-8" x2="0" y2="8" stroke="#fff" stroke-width="1.6"/></g>`).join('')}<circle r="1.8" fill="#bfe0f5" stroke="${O}" stroke-width=".7"/></g>`;
export const amphora = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><path d="M-2.5,-9 H2.5 V-6 Q7,-3 6,3 Q5,8 0,10 Q-5,8 -6,3 Q-7,-3 -2.5,-6 Z" fill="#c4683a" stroke="${O}" stroke-width="1.1" stroke-linejoin="round"/><path d="M-2.5,-7 Q-6,-7 -5,-3 M2.5,-7 Q6,-7 5,-3" stroke="${O}" stroke-width="1" fill="none"/><path d="M-5,1 H5" stroke="#f2d6a8" stroke-width="1.2"/></g>`;
export const purse = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><path d="M-3,-6 Q-9,-2 -8,4 Q-7,9 0,9 Q7,9 8,4 Q9,-2 3,-6 Z" fill="#b08850" stroke="${O}" stroke-width="1.1" stroke-linejoin="round"/><path d="M-4,-7 Q0,-4 4,-7" stroke="#6a4423" stroke-width="1.6" fill="none"/><circle cx="0" cy="3" r="3.2" fill="#f2c230" stroke="${O}" stroke-width=".8"/></g>`;
export const olive = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><path d="M-9,8 Q0,2 8,-9" stroke="#5a4a24" stroke-width="1.4" fill="none"/>${[[-5, 4, -30], [-1, 1, 40], [2, -2, -35], [5, -5, 35], [7, -8, -20]].map(([lx, ly, a]) => `<ellipse cx="${lx}" cy="${ly}" rx="3.6" ry="1.5" transform="rotate(${a} ${lx} ${ly})" fill="#7fa04a" stroke="${O}" stroke-width=".6"/>`).join('')}<circle cx="-3" cy="6" r="1.4" fill="#3b3a5a"/></g>`;
export const stakes = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})">${[-6, -2, 2, 6].map((px) => `<path d="M${px - 1.8},8 V-4 L${px},-8 L${px + 1.8},-4 V8 Z" fill="#9a6a3a" stroke="${O}" stroke-width=".8"/>`).join('')}<path d="M-8,2 H8" stroke="#5a3a1c" stroke-width="1.4"/></g>`;

export const scales = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})" fill="none" stroke="${O}" stroke-linecap="round"><line x1="0" y1="-11" x2="0" y2="9" stroke-width="1.6"/><line x1="-9" y1="-7" x2="9" y2="-7" stroke-width="1.6"/><path d="M-9,-7 L-12,1 H-6 Z M9,-7 L6,1 H12 Z" fill="#e0a52a" stroke-width="1"/><path d="M-5,9 H5" stroke-width="2.2"/></g>`;
export const pirateShip = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><path d="M-12,3 H12 L8,9 H-8 Z" fill="#4a2e1a" stroke="${O}" stroke-width="1.1" stroke-linejoin="round"/><line x1="0" y1="3" x2="0" y2="-12" stroke="${O}" stroke-width="1.4"/><path d="M0,-11 L-9,-1 H0 Z" fill="#1f1f24" stroke="${O}" stroke-width=".8"/><path d="M0,-11 L8,-3 H0 Z" fill="#2a2a30" stroke="${O}" stroke-width=".8"/><circle cx="-3.5" cy="-4" r="1.4" fill="#e8e2d0"/></g>`;
export const warband = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><line x1="-9" y1="10" x2="7" y2="-11" stroke="#6a4423" stroke-width="2"/><path d="M7,-11 L11,-15 L9,-9 Z" fill="#c9c9cf" stroke="${O}" stroke-width=".8"/><circle cx="-1" cy="3" r="7.5" fill="#7a3b1e" stroke="${O}" stroke-width="1.2"/><circle cx="-1" cy="3" r="2.2" fill="#c9a227" stroke="${O}" stroke-width=".7"/><path d="M-1,-4.5 V10.5 M-8.5,3 H6.5" stroke="#5a2a14" stroke-width="1"/></g>`;

/** Small icons for the row under a town's stars, keyed by event kind (or effect kind). */
export const MINI: Record<string, (x: number, y: number) => string> = {
  revolt: (x, y) => `<g transform="translate(${x},${y}) scale(.55)">${pitchfork(-4, 0, -15)}${flame(6, 3, 0.9)}</g>`,
  raid: (x, y) => swords(x, y, 0.5),
  toll: drop,
  harvest: (x, y) => sheaf(x, y - 1, 0.62),
  tribute: (x, y) => coins(x, y, 0.55),
  boom: silverMini,
  bandits: (x, y) => dagger(x, y, 0.5),
  pirates: (x, y) => pirateShip(x, y, 0.62),
  gambit: (x, y) => scales(x, y, 0.62),
  idus: (x, y) => dagger(x, y, 0.5),
  anchor: (x, y) => `<g transform="translate(${f(x)},${f(y)})" fill="none" stroke-linecap="round"><circle r="9" fill="#245a78" stroke="${O}" stroke-width="1.2"/><g stroke="#f3e6c4" stroke-width="1.6"><circle cy="-4.6" r="1.6"/><line y1="-3" y2="5.5"/><line x1="-3.4" x2="3.4" y1="-1.2" y2="-1.2"/><path d="M-5,2.2 Q-4,6 0,6 Q4,6 5,2.2"/></g></g>`,
  tower: (x, y) => `<g transform="translate(${f(x)},${f(y)})"><circle r="9" fill="#5a4630" stroke="${O}" stroke-width="1.2"/><g stroke="#f3e6c4" stroke-width="1.3" fill="none" stroke-linecap="round"><path d="M-3.6,6 L-2.6,-2.5 M3.6,6 L2.6,-2.5 M-3,2 L3,2 M-3.3,-2.5 H3.3"/><path d="M-4.6,-2.5 L0,-6.6 L4.6,-2.5" fill="#c9a25e"/></g></g>`,
  germani: (x, y) => warband(x, y, 0.62),
  druids: (x, y) => sickle(x, y, 0.62),
  famine: (x, y) => bowl(x, y, 0.62),
  snows: (x, y) => snowflake(x, y, 0.7),
  levy: (x, y) => amphora(x, y, 0.62),
  caravan: (x, y) => purse(x, y, 0.62),
  alliance: (x, y) => olive(x, y, 0.66),
  veterans: (x, y) => stakes(x, y, 0.66),
};
/** Icon key for an event: its own kind if it has art, else its effect's generic art. */
export const miniKey = (kind: string, f: { type: string; mode?: string; glory?: number; surcharge?: number; terrain?: unknown }): string =>
  MINI[kind] ? kind : f.type === 'cut' ? (f.mode === 'all' ? 'revolt' : 'raid') : f.type === 'yield' ? ((f.glory ?? 1) > 1 ? 'harvest' : 'tribute') : f.type;

/** Deterministic point picker inside a tile for event props (same spot every render). */
export function spotsIn(tile: Pt[], seed: string, n: number, spacing: number, avoid: Pt[], avoidR: number): Pt[] {
  const rng = new Rng(seed);
  const xs = tile.map((p) => p.x), ys = tile.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const out: Pt[] = [];
  for (let k = 0; k < 400 && out.length < n; k++) {
    const p = { x: x0 + rng.next() * (x1 - x0), y: y0 + rng.next() * (y1 - y0) };
    if (!inside(tile, p, 10) || avoid.some((a) => dist(a, p) < avoidR) || out.some((q) => dist(q, p) < spacing)) continue;
    out.push(p);
  }
  return out;
}
export { dist, distSeg };
