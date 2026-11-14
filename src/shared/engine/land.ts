// The land: Voronoi tiles for towns and "wild" sites (sea, mountains, lakes, wildwood) in the gaps.
// Shared by the board art (which draws it) and the rules (coast and frontier towns), so both agree.
// Deterministic from the map alone; uses the art stream `seed + '/art'`. Coordinates are art units
// (board units × LAND_K). Never stored in the scenario.
import { Rng } from './rng';
import type { Scenario, Terrain } from './types';

export type Pt = { x: number; y: number };
export type Land = Terrain | 'roman' | 'mountain' | 'sea' | 'lake' | 'wildwood';
export const LAND_K = 6;

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export function distSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function clipPoly(poly: Pt[], n: Pt, c: number): Pt[] { // keep n·p <= c
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    const fp = n.x * p.x + n.y * p.y - c, fq = n.x * q.x + n.y * q.y - c;
    if (fp <= 0) out.push(p);
    if (fp * fq < 0) { const t = fp / (fp - fq); out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) }); }
  }
  return out;
}
export function voronoi(sites: Pt[], W: number, H: number): Pt[][] {
  return sites.map((si, i) => {
    let poly: Pt[] = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
    sites.forEach((sj, j) => { if (j !== i) poly = clipPoly(poly, { x: sj.x - si.x, y: sj.y - si.y }, (sj.x ** 2 + sj.y ** 2 - si.x ** 2 - si.y ** 2) / 2); });
    return poly;
  });
}
export function inside(poly: Pt[], p: Pt, margin = 0): boolean {
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
}

export interface LandModel {
  sites: Pt[]; cells: Pt[][]; land: Land[]; W: number; H: number;
  /** Index of the tile across the edge p→q of tile i (-1 = the map border). */
  across: (i: number, p: Pt, q: Pt) => number;
}

/** Build the tiles. `rng` must be `new Rng(seed + '/art')`; the art keeps drawing from it afterwards. */
export function buildLand(sc: Scenario, rng: Rng): LandModel {
  const K = LAND_K, W = sc.width * K, H = sc.height * K;
  const T = sc.towns.map((t) => ({ x: t.x * K, y: t.y * K }));
  const nearRoad = (p: Pt, pad: number) => sc.roads.some((rd) => distSeg(p, T[rd.a]!, T[rd.b]!) < pad);
  const nearTown = (p: Pt, pad: number) => T.some((t) => dist(p, t) < pad);
  // wild sites in the gaps; a wild tile may not swallow any candidate road
  let wild: Pt[] = [];
  const cand: Pt[] = [];
  for (let y = 6; y < sc.height - 4; y += 2.5) for (let x = 4; x < sc.width - 4; x += 2.5) cand.push({ x: x * K, y: y * K });
  for (const p of rng.shuffle(cand)) if (!nearTown(p, 13 * K) && !nearRoad(p, 7.5 * K) && !wild.some((q) => dist(p, q) < 13 * K)) wild.push(p);
  for (let pass = 0; pass < 6; pass++) {
    const cells = voronoi([...T, ...wild], W, H);
    const ok = wild.filter((_, k) => !sc.roads.some((rd) => {
      const a = T[rd.a]!, b = T[rd.b]!;
      for (let t = 0; t <= 1; t += 0.02) if (inside(cells[T.length + k]!, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })) return true;
      return false;
    }));
    if (ok.length === wild.length) break;
    wild = ok;
  }
  const sites = [...T, ...wild];
  const cells = voronoi(sites, W, H);
  const EPS = 0.5;
  const across = (i: number, p: Pt, q: Pt) => {
    const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    if (m.x < EPS || m.y < EPS || m.x > W - EPS || m.y > H - EPS) return -1;
    let best = -1, bd = Infinity;
    sites.forEach((x, j) => { if (j !== i) { const d = dist(m, x); if (d < bd) { bd = d; best = j; } } });
    return best;
  };
  // land: towns use their game terrain; wild tiles on the west/north edge are sea, east/south mountains
  const land: Land[] = sites.map((_, i) => {
    if (i === 0) return 'roman';
    if (i < T.length) return sc.towns[i]!.terrain;
    const c = cells[i]!;
    if (c.some((p) => p.x < EPS || p.y < EPS)) return 'sea';
    if (c.some((p) => p.x > W - EPS || p.y > H - EPS)) return 'mountain';
    return rng.weighted<Land>(['mountain', 'lake', 'wildwood'], [0.4, 0.35, 0.25]);
  });
  for (let pass = 0; pass < 3; pass++) land.forEach((l, i) => {
    if (l !== 'lake') return;
    const c = cells[i]!;
    if (c.some((p, k) => { const j = across(i, p, c[(k + 1) % c.length]!); return j >= 0 && land[j] === 'sea'; })) land[i] = 'sea';
  });
  return { sites, cells, land, W, H, across };
}

export interface Shores { coast: boolean[]; frontier: boolean[] }
const shoreCache = new Map<string, Shores>();

/**
 * Coast and frontier towns, by TownId. Coast: the town's tile borders a sea tile (a port).
 * Frontier: it borders a mountain tile on the east/south map edge, or the east/south edge itself
 * (the Germanic frontier). The castra is neither. Cached per map.
 */
export function shores(sc: Scenario): Shores {
  const key = `${sc.seed}|${sc.towns.length}|${sc.roads.length}|${sc.towns[1]?.x ?? 0}`;
  const hit = shoreCache.get(key);
  if (hit) return hit;
  const L = buildLand(sc, new Rng(`${sc.seed}/art`));
  const n = sc.towns.length, EPS = 0.5;
  const edgeMountain = L.land.map((l, i) => l === 'mountain' && i >= n && L.cells[i]!.some((p) => p.x > L.W - EPS || p.y > L.H - EPS));
  const coast = new Array<boolean>(n).fill(false), frontier = new Array<boolean>(n).fill(false);
  for (let i = 1; i < n; i++) {
    const c = L.cells[i]!;
    for (let k = 0; k < c.length; k++) {
      const p = c[k]!, q = c[(k + 1) % c.length]!, j = L.across(i, p, q);
      if (j >= 0 && L.land[j] === 'sea') coast[i] = true;
      if ((j >= 0 && edgeMountain[j]) || (j < 0 && (Math.max(p.x, q.x) > L.W - EPS || Math.max(p.y, q.y) > L.H - EPS))) frontier[i] = true;
    }
  }
  const out = { coast, frontier };
  if (shoreCache.size > 200) shoreCache.clear();
  shoreCache.set(key, out);
  return out;
}
