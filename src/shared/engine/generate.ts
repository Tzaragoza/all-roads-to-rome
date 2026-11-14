import { adjacency, bfs } from './graph';
import { TOWN_NAMES, TRIBE_NAMES } from './names';
import { Rng } from './rng';
import { decreesOf } from './decrees';
import { eventsAsOf } from './events';
import { shores } from './land';
import type { EventSpec, EventTone } from './events';
import type { Decree, DecreeKind, Faction, GameEvent, Road, Rules, Scenario, Terrain, Town, Tribe } from './types';

export const DEFAULT_RULES: Rules = {
  turns: 10,
  startDenarii: 8,
  baseIncome: 2,
  tributeFrom: 3,
  legionRange: 2,
  maxLegions: 99,
  roadSurcharge: 0,
  legions: 1,
  recruitCost: 4,
  recruitCostStep: 2,
  garrisonCost: 5,
  garrisonCostStep: 3,
  rubbleTurns: 2,
  siegeTurns: 2,
  lostLegionPenalty: 5,
  eventLookahead: 2,
};

export interface GenOptions {
  towns: number;
  minDist: number;
  pruneFraction: number; // share of non-MST Gabriel edges removed
  depthCost: number; // logistics surcharge: + floor(depthCost * hop of the far end) per road
  tribes: number;
  /** Tile terrain weights (plain, forest, hills). Road cost = harder of its two tiles, so
   *  (.71, .20, .09) reproduces the old per-road mix: P(1) = .71² ≈ .50, P(≤2) = .91² ≈ .83. */
  tileTerrain: [number, number, number];
  /** Daily event budget per tone: [min, max] drawn uniformly. Normally resolved from BUDGETS by `asOf`. */
  budget: Budget;
  /** The day being generated (UTC, YYYY-MM-DD). Content (events, decrees, budget) is the content
   *  live on that day, so later additions never change it. Undefined = latest content (sims). */
  asOf?: string;
  faction?: Faction;
  decreeKind?: DecreeKind; // force a decree (benchmarks); normally drawn per seed
  rules: Rules;
  /** Optional observer for docs/debugging: filled with intermediate results. Never draws from the Rng. */
  trace?: GenTrace;
}

export type EventPickTrace = {
  tone: EventTone; pool: Array<{ kind: string; weight: number; used: number; cap: number }>;
  chosen: string; turnOptions: number[]; turn: number; tribe: number; town?: number; skipped?: string;
};
export type GenTrace = {
  points?: Array<{ x: number; y: number }>;
  gabriel?: Array<[number, number]>;
  mst?: Array<[number, number]>;
  pruned?: Array<[number, number]>;
  hop?: number[];
  tribeSeeds?: number[];
  bfsOrder?: number[];
  rawValue?: number[]; // 0.8*hop + noise, before rounding and clamping
  counts?: Partial<Record<EventTone, number>>;
  picks?: EventPickTrace[];
  reassigned?: Array<{ turn: number; kind: string; from: number; to: number }>;
  faction?: { given: boolean; value: Faction };
};

/** Dated event budgets, oldest first (append only; see events.ts). */
/** Events per day by tone: [min, max]. Gambits are optional (absent = none, and no draw). */
export type Budget = Record<Exclude<EventTone, 'gambit'>, [number, number]> & { gambit?: [number, number] };
export const BUDGETS: Array<{ since: string; budget: Budget }> = [
  { since: '', budget: { threat: [3, 5], hardship: [0, 1], boon: [1, 3] } },
  { since: '2026-11-15', budget: { threat: [3, 5], hardship: [0, 2], boon: [1, 3], gambit: [0, 1] } }, // more hardship kinds; gambits
];
export const budgetAsOf = (date?: string) => BUDGETS.filter((b) => date === undefined || b.since <= date).at(-1)!.budget;

export const DEFAULT_GEN: GenOptions = {
  towns: 17,
  minDist: 19,
  pruneFraction: 0.3,
  depthCost: 0.7,
  tribes: 3,
  tileTerrain: [0.71, 0.2, 0.09],
  budget: budgetAsOf(),
  rules: DEFAULT_RULES,
};

const W = 100, H = 140, MARGIN = 7;
const TERRAIN: readonly Terrain[] = ['plain', 'forest', 'hills'];
const TERRAIN_COST: Record<Terrain, number> = { plain: 1, forest: 2, hills: 3 };

const d2 = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function samplePoints(rng: Rng, n: number, minDist: number): Array<{ x: number; y: number }> {
  // Castra fixed at the southern edge: Rome lies to the south.
  const pts = [{ x: W / 2, y: H - MARGIN }];
  let tries = 0;
  let md2 = minDist * minDist;
  while (pts.length < n) {
    if (++tries > 5000) { md2 *= 0.9; tries = 0; } // relax if too dense
    const p = { x: MARGIN + rng.next() * (W - 2 * MARGIN), y: MARGIN + rng.next() * (H - 2 * MARGIN - 8) };
    if (pts.every((q) => d2(p, q) >= md2)) pts.push(p);
  }
  return pts;
}

function gabrielEdges(pts: Array<{ x: number; y: number }>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const dij = d2(pts[i]!, pts[j]!);
      let ok = true;
      for (let k = 0; k < pts.length && ok; k++)
        if (k !== i && k !== j && d2(pts[i]!, pts[k]!) + d2(pts[j]!, pts[k]!) < dij) ok = false;
      if (ok) out.push([i, j]);
    }
  return out;
}

function mst(pts: Array<{ x: number; y: number }>, edges: Array<[number, number]>): Set<string> {
  const parent = pts.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
  const keep = new Set<string>();
  const sorted = edges.slice().sort((e, f) => d2(pts[e[0]]!, pts[e[1]]!) - d2(pts[f[0]]!, pts[f[1]]!));
  for (const [a, b] of sorted) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) { parent[ra] = rb; keep.add(`${a}-${b}`); }
  }
  return keep;
}

/**
 * The Senate's decree for a faction, drawn from the registry (./decrees.ts). Independent of
 * the map's random stream, so both factions' decrees for a date are fixed in advance.
 */
export function makeDecree(seed: string, faction: Faction, maxHop: number, kind?: DecreeKind, asOf?: string): Decree {
  const rng = new Rng(`${seed}/decree/${faction}`);
  let pool = decreesOf(faction, asOf);
  if (!pool.length) pool = decreesOf('populares', asOf); // a faction with no decree yet on that date
  const spec = kind ? decreesOf(faction).find((d) => d.kind === kind)! : rng.pick(pool);
  const param = spec.vars.param === 'maxHop' ? maxHop : spec.vars.param === 'maxHop-1' ? Math.max(3, maxHop - 1) : spec.vars.param;
  return {
    kind: spec.kind, faction, title: spec.title, text: spec.text(param), param, bonus: spec.vars.bonus,
    ...(spec.vars.rules ? { rules: spec.vars.rules } : {}),
  };
}

/**
 * Draw the day's events. For each tone, draw a count within the budget, then pick event types
 * by weight (respecting each type's maxPerDay) and a turn within the type's window.
 * Constraints: threats fall on distinct turns, and two consecutive threats never hit the same
 * tribe. A boom event targets a random non-castra town of its tribe.
 */
export function generateEvents(
  rng: Rng, registry: EventSpec[], budget: Budget,
  turns: number, tribeCount: number, towns: Town[], trace?: GenTrace, sc?: Scenario,
): GameEvent[] {
  if (trace) { trace.counts = { threat: 0, hardship: 0, boon: 0 }; trace.picks = []; trace.reassigned = []; }
  const events: GameEvent[] = [];
  const used = new Map<string, number>();
  let rareDrawn = false; // at most one rare event a day (no effect on draws while no rare event is live)
  const threatTurns = new Set<number>();
  for (const tone of ['threat', 'hardship', 'boon', 'gambit'] as EventTone[]) {
    const range = budget[tone];
    if (!range) continue; // no draw at all: days before gambits existed are unchanged
    const n = rng.int(range[0], range[1]);
    if (trace) trace.counts![tone] = n;
    for (let i = 0; i < n; i++) {
      const pool = registry.filter((e) => e.tone === tone && e.gen.weight > 0 && (used.get(e.kind) ?? 0) < e.gen.maxPerDay && !(rareDrawn && e.gen.rare));
      if (!pool.length) break;
      const poolTrace = trace && pool.map((e) => ({ kind: e.kind, weight: e.gen.weight, used: used.get(e.kind) ?? 0, cap: e.gen.maxPerDay }));
      const spec = rng.weighted(pool, pool.map((e) => e.gen.weight));
      const lo = Math.max(1, spec.gen.minTurn), hi = Math.min(turns, spec.gen.maxTurn);
      const options = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k).filter((t) => tone !== 'threat' || !threatTurns.has(t));
      if (!options.length) { trace?.picks!.push({ tone, pool: poolTrace!, chosen: spec.kind, turnOptions: [], turn: 0, tribe: -1, skipped: 'no free turn' }); continue; }
      const turn = rng.pick(options);
      if (tone === 'threat') threatTurns.add(turn);
      used.set(spec.kind, (used.get(spec.kind) ?? 0) + 1);
      if (spec.gen.rare) rareDrawn = true;
      let tribe: number;
      if (spec.effect.type === 'cut' && spec.effect.where && sc) { // only tribes that have ports / a frontier
        const sh = shores(sc)[spec.effect.where];
        const ok = [...new Set(towns.filter((t) => t.id !== 0 && sh[t.id]).map((t) => t.tribe))].sort((a, b) => a - b);
        if (!ok.length) { trace?.picks!.push({ tone, pool: poolTrace!, chosen: spec.kind, turnOptions: options, turn, tribe: -1, skipped: `no ${spec.effect.where} town` }); continue; }
        tribe = rng.pick(ok);
      } else tribe = rng.int(0, tribeCount - 1);
      const ev: GameEvent = { turn, kind: spec.kind, tribe, effect: spec.effect };
      const needsTown = (f: EventSpec['effect']): boolean => f.type === 'boom' || f.type === 'settle' || (f.type === 'gambit' && f.parts.some((p) => needsTown(p.effect)));
      if (needsTown(spec.effect)) {
        const cands = towns.filter((t) => t.tribe === tribe && t.tribe >= 0);
        if (!cands.length) { trace?.picks!.push({ tone, pool: poolTrace!, chosen: spec.kind, turnOptions: options, turn, tribe, skipped: 'tribe has no town' }); continue; }
        ev.town = rng.pick(cands).id;
      }
      trace?.picks!.push({ tone, pool: poolTrace!, chosen: spec.kind, turnOptions: options, turn, tribe, ...(ev.town !== undefined ? { town: ev.town } : {}) });
      events.push(ev);
    }
  }
  events.sort((a, b) => a.turn - b.turn);
  // consecutive threats never hit the same tribe
  let prev = -1;
  for (const e of events) {
    if (e.effect.type !== 'cut') continue;
    if (e.tribe === prev && tribeCount > 1) {
      let to = (e.tribe + 1) % tribeCount;
      if (e.effect.where && sc) { // a shore threat may only move to another tribe with such towns
        const sh = shores(sc)[e.effect.where];
        const ok = Array.from({ length: tribeCount - 1 }, (_, k) => (e.tribe + 1 + k) % tribeCount).filter((t) => towns.some((x) => x.id !== 0 && x.tribe === t && sh[x.id]));
        if (!ok.length) { prev = e.tribe; continue; }
        to = ok[0]!;
      }
      trace?.reassigned!.push({ turn: e.turn, kind: e.kind, from: e.tribe, to });
      e.tribe = to;
    }
    prev = e.tribe;
  }
  return events;
}

function valueOf(raw: number, i: number, trace?: GenTrace): number {
  if (trace?.rawValue) trace.rawValue[i] = raw;
  return Math.min(4, Math.max(1, Math.round(raw)));
}

export function generate(seed: string, opts: Partial<GenOptions> = {}): Scenario {
  const o: GenOptions = { ...DEFAULT_GEN, ...opts, budget: opts.budget ?? budgetAsOf(opts.asOf) };
  const rng = new Rng(seed);
  const pts = samplePoints(rng, o.towns, o.minDist);

  // Candidate roads: Gabriel graph minus a random share of non-MST edges.
  const gab = gabrielEdges(pts);
  const tree = mst(pts, gab);
  const edges = gab.filter(([a, b]) => tree.has(`${a}-${b}`) || rng.next() >= o.pruneFraction);
  if (o.trace) {
    o.trace.points = pts.map((p) => ({ ...p }));
    o.trace.gabriel = gab;
    o.trace.mst = gab.filter(([a, b]) => tree.has(`${a}-${b}`));
    o.trace.pruned = gab.filter((e) => !edges.includes(e));
  }

  // Terrain belongs to tiles (one per town); a road costs the harder of the two tiles it crosses.
  const land: Terrain[] = pts.map((_, i) => (i === 0 ? 'plain' : rng.weighted(TERRAIN, o.tileTerrain)));
  const harder = (a: Terrain, b: Terrain) => (TERRAIN_COST[a] >= TERRAIN_COST[b] ? a : b);
  const roads: Road[] = edges.map(([a, b], id) => {
    const terrain = harder(land[a]!, land[b]!);
    return { id, a, b, terrain, cost: TERRAIN_COST[terrain] };
  });

  const adj = adjacency(pts.length, roads);
  const hop = bfs(adj, 0);
  for (const r of roads) r.cost += Math.floor(o.depthCost * Math.max(hop[r.a]!, hop[r.b]!));
  if (o.trace) o.trace.hop = hop.slice();

  // Tribes: farthest-point seeds (by hop), then multi-source BFS, castra excluded.
  const names = rng.shuffle([...TOWN_NAMES]);
  const tribeNames = rng.shuffle([...TRIBE_NAMES]);
  const tribe = new Array<number>(pts.length).fill(-2);
  tribe[0] = -1;
  const candidates = rng.shuffle(pts.map((_, i) => i).filter((i) => i !== 0 && hop[i]! >= 2));
  const seeds: number[] = [];
  const far = (i: number) => (seeds.length ? Math.min(...seeds.map((s) => d2(pts[i]!, pts[s]!))) : hop[i]!);
  for (let k = 0; k < o.tribes && candidates.length; k++) {
    candidates.sort((x, y) => far(y) - far(x));
    seeds.push(candidates.shift()!);
  }
  const queue: number[] = [];
  seeds.forEach((s, k) => { tribe[s] = k; queue.push(s); });
  for (let i = 0; i < queue.length; i++) {
    const u = queue[i]!;
    for (const { to } of rng.shuffle(adj[u]!.slice())) if (tribe[to] === -2) { tribe[to] = tribe[u]!; queue.push(to); }
  }
  for (let i = 0; i < pts.length; i++) if (tribe[i] === -2) tribe[i] = 0; // castra neighbours unreachable w/o castra
  if (o.trace) { o.trace.tribeSeeds = seeds.slice(); o.trace.bfsOrder = queue.slice(); o.trace.rawValue = []; }

  const towns: Town[] = pts.map((p, i) => ({
    id: i,
    name: i === 0 ? 'Castra' : names[i]!,
    x: Math.round(p.x * 10) / 10,
    y: Math.round(p.y * 10) / 10,
    value: i === 0 ? 0 : valueOf(hop[i]! * 0.8 + (rng.next() - 0.6), i, o.trace),
    tribe: tribe[i]!,
    hop: hop[i]!,
    terrain: land[i]!,
  }));
  const tribes: Tribe[] = seeds.map((_, k) => ({ id: k, name: tribeNames[k]! }));

  // Events: procedural, from the registry (events.ts) and the daily budget.
  const R = o.rules;
  // Each concern draws from its own stream, so new content in one never shifts another.
  // The map alone (no events or decree yet), for content that depends on the land (ports, frontier).
  const map = { version: 2, seed, width: W, height: H, rules: R, castra: 0, towns, roads, tribes, events: [], decree: { kind: 'none', faction: 'populares', title: '', text: '', param: 0, bonus: 0 } } as Scenario;
  const events = generateEvents(new Rng(`${seed}/events`), eventsAsOf(o.asOf), o.budget, R.turns, tribes.length, towns, o.trace, map);


  const faction = o.faction ?? (new Rng(`${seed}/faction`).next() < 0.5 ? 'populares' : 'optimates');
  if (o.trace) o.trace.faction = { given: !!o.faction, value: faction };
  const maxHop = Math.max(...hop.filter((h) => h !== Infinity));

  const decree = o.decreeKind === 'none'
    ? { kind: 'none' as const, faction, title: 'No decree', text: '', param: 0, bonus: 0 }
    : makeDecree(seed, faction, maxHop, o.decreeKind, o.asOf);
  // Decrees that reshape the day's events (Augures only, so the other factions' days are untouched).
  let dayEvents = events;
  if (decree.kind === 'libri') { // half as many events again, all foretold
    const B = o.budget, up = (r: [number, number]): [number, number] => [Math.ceil(r[0] * 1.5), Math.ceil(r[1] * 1.5)];
    dayEvents = generateEvents(new Rng(`${seed}/events/libri`), eventsAsOf(o.asOf), { threat: up(B.threat), hardship: up(B.hardship), boon: up(B.boon), ...(B.gambit ? { gambit: B.gambit } : {}) }, R.turns, tribes.length, towns, undefined, map)
      .map((e) => (e.effect.type === 'cut' && !e.effect.pierce ? { ...e, effect: { ...e.effect, pierce: 'garrison' as const } } : e)); // garrisons do not hold
  } else if (decree.kind === 'idus') {
    dayEvents = [...events, { turn: decree.param, kind: 'idus', tribe: 0, effect: { type: 'cut' as const, mode: 'hub' as const, pierce: 'all' as const } }].sort((a, b) => a.turn - b.turn);
  }
  return {
    version: 2, seed, width: W, height: H, rules: { ...R, ...decree.rules }, castra: 0,
    towns, roads, tribes, events: dayEvents, decree,
  };
}
