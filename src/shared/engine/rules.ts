import { adjacency, bfs, bridges } from './graph';
import { shores } from './land';
import type { Action, CutMode, GameEvent, Shore, RoadId, Scenario, State, TownId, TurnRecord } from './types';

/*
 * Rules v2
 *  - A town is pacified while it is connected to the castra by built roads (supplied).
 *    Supplied towns pay their value in glory every turn.
 *  - Revolts cut every built road touching the tribe's towns unless the road is protected.
 *    A road is protected if either endpoint is protected: the castra, a town with a legion
 *    camped on it, or a town that is garrisoned or adjacent to a garrison.
 *  - A town with built roads (or a legion) that is cut off has `siegeTurns` turns to be
 *    reconnected. Then its roads burn and any legion camped there is lost. Garrisoned towns
 *    never burn (their legions are fed by the garrison).
 *  - Legions move once per turn between supplied towns. A cut-off legion cannot move.
 */

export function initialState(sc: Scenario): State {
  const n = sc.towns.length;
  const legions = new Array<TownId>(sc.rules.legions).fill(sc.castra);
  return {
    turn: 1,
    denarii: sc.rules.startDenarii,
    built: new Array(sc.roads.length).fill(false),
    legions,
    moved: legions.map(() => false),
    garrison: new Array(n).fill(false),
    siege: new Array(n).fill(0),
    rubble: new Array(sc.roads.length).fill(0),
    tolls: [],
    levies: [],
    accepted: [],
    valueBonus: new Array(n).fill(0),
    lost: 0,
    glory: 0,
    garrisons: 0,
    recruited: 0,
    burned: 0,
    history: [],
  };
}

export function cloneState(s: State): State {
  return {
    ...s,
    built: s.built.slice(),
    legions: s.legions.slice(),
    moved: s.moved.slice(),
    garrison: s.garrison.slice(),
    siege: s.siege.slice(),
    rubble: s.rubble.slice(),
    tolls: s.tolls.slice(),
    levies: (s.levies ?? []).slice(),
    accepted: (s.accepted ?? []).slice(),
    valueBonus: s.valueBonus.slice(),
    history: s.history.slice(),
  };
}

export const isOver = (sc: Scenario, s: State) => s.turn > sc.rules.turns;

const candidateAdjCache = new WeakMap<Scenario, ReturnType<typeof adjacency>>();
export function candidateAdj(sc: Scenario) {
  let a = candidateAdjCache.get(sc);
  if (!a) { a = adjacency(sc.towns.length, sc.roads); candidateAdjCache.set(sc, a); }
  return a;
}

export function builtAdj(sc: Scenario, s: State) {
  return adjacency(sc.towns.length, sc.roads, (r) => s.built[r.id]!);
}

/** supplied[t] = town t is connected to the castra by built roads. */
export function supplied(sc: Scenario, s: State): boolean[] {
  return bfs(builtAdj(sc, s), sc.castra).map((d) => d !== Infinity);
}

/** Bridges of the supplied road network: roads whose loss cuts something off from the castra. */
export function supplyBridges(sc: Scenario, s: State): Set<RoadId> {
  const sup = supplied(sc, s);
  const adj = adjacency(sc.towns.length, sc.roads, (r) => s.built[r.id]! && sup[r.a]! && sup[r.b]!);
  return bridges(adj);
}

/** Towns whose touching roads are shielded from revolts (`legionsOnly`: ignore garrisons). */
export function protectedTowns(sc: Scenario, s: State, legionsOnly = false): boolean[] {
  const p = new Array<boolean>(sc.towns.length).fill(false);
  p[sc.castra] = true;
  if (sc.rules.legionsShield !== false) for (const t of s.legions) p[t] = true;
  if (sc.rules.portsShield) { const sup = supplied(sc, s), c = shores(sc).coast; for (const t of sc.towns) if (c[t.id] && sup[t.id]) p[t.id] = true; }
  const adj = candidateAdj(sc);
  for (const t of sc.towns) {
    if (legionsOnly || !s.garrison[t.id]) continue;
    p[t.id] = true;
    for (const { to } of adj[t.id]!) p[to] = true;
  }
  return p;
}

/** Denarii a supplied town of this value pays per turn. */
/** Glory a supplied town pays per turn (decrees can reshape it). */
export function townGlory(sc: Scenario, t: { hop: number }, value: number): number {
  if (sc.rules.gloryMaxHop !== undefined && t.hop > sc.rules.gloryMaxHop) return 0;
  return sc.rules.invertStars ? Math.max(0, 5 - value) : value;
}
export const townIncome = (sc: Scenario, value: number) => sc.rules.noTribute ? 0 : Math.max(0, value - sc.rules.tributeFrom + 1);

/** A town's current value: base value plus permanent event bonuses (e.g. Silver vein). */
export const townValue = (s: State, t: { id: TownId; value: number }) => t.value + (s.valueBonus?.[t.id] ?? 0);

/** Glory and income multipliers per tribe from `yield` events resolving at the end of `turn`. */
/**
 * The events in play for state s: the scenario's events (gambit offers included, they do nothing
 * themselves) plus the parts of every gambit the player accepted, as events of their own.
 */
export function liveEvents(sc: Scenario, s?: State): GameEvent[] {
  if (!s?.accepted?.length) return sc.events;
  const extra: GameEvent[] = [];
  for (const i of s.accepted) {
    const g = sc.events[i];
    if (!g || g.effect.type !== 'gambit') continue;
    for (const p of g.effect.parts) if (!p.now) extra.push({ turn: g.turn + p.delay, kind: p.icon, tribe: g.tribe, ...(g.town !== undefined ? { town: g.town } : {}), effect: p.effect, from: i, note: p.text });
  }
  return [...sc.events, ...extra].sort((a, b) => a.turn - b.turn);
}

/** Gambits the player may accept now: visible, not past, not yet accepted. */
export function gambitOffers(sc: Scenario, s: State): number[] {
  const out: number[] = [];
  sc.events.forEach((e, i) => {
    if (e.effect.type === 'gambit' && s.turn <= e.turn && e.turn < s.turn + sc.rules.eventLookahead && !(s.accepted ?? []).includes(i)) out.push(i);
  });
  return out;
}

export function yieldMultipliers(sc: Scenario, turn: number, s?: State): Map<number, { glory: number; income: number }> {
  const m = new Map<number, { glory: number; income: number }>();
  for (const e of liveEvents(sc, s)) {
    if (e.turn !== turn || e.effect.type !== 'yield') continue;
    const cur = m.get(e.tribe) ?? { glory: 1, income: 1 };
    m.set(e.tribe, { glory: cur.glory * e.effect.glory, income: cur.income * e.effect.income });
  }
  return m;
}

/**
 * Glory and income the end of this turn will pay, split into the base amount and the bonus from this
 * turn's yield events and per-turn decrees. Exactly what `endTurn` pays: this turn's cuts, booms and burnings
 * are applied first (a revolt that strands towns lowers the preview). Nothing once the game is over.
 */
export function yieldPerTurn(sc: Scenario, s: State) {
  if (isOver(sc, s)) return { glory: 0, income: 0, bonusGlory: 0, bonusIncome: 0, purseGain: 0, purseDebt: 0, boostedTribes: new Set<number>() };
  // paid on the network as it stands once this turn's cuts, booms and burnings have happened (as endTurn pays)
  const { n, sup } = resolveTurn(sc, s);
  const mult = yieldMultipliers(sc, s.turn, s);
  let glory = 0, income = sc.rules.baseIncome, bonusGlory = 0, bonusIncome = 0;
  for (const t of sc.towns) {
    if (t.id === sc.castra || !sup[t.id]) continue;
    const v = townValue(n, t), g = townGlory(sc, t, v), inc = townIncome(sc, v);
    glory += g; income += inc;
    const m = mult.get(t.tribe);
    if (m) { bonusGlory += g * (m.glory - 1); bonusIncome += inc * (m.income - 1); }
  }
  bonusGlory += decreeTurnGlory(sc, n, sup);
  const purse = purseAt(sc, s, sup);
  return { glory, income, bonusGlory, bonusIncome, purseGain: purse.gain, purseDebt: purse.debt, boostedTribes: new Set(mult.keys()) };
}

/**
 * Flat denarii due at the end of this turn (caravans, loans, loan instalments), split into what comes in and
 * what goes out, for the network `sup` at dusk. A tribe's purse needs one of its towns supplied unless `always`.
 */
export function purseAt(sc: Scenario, s: State, sup: boolean[]): { gain: number; debt: number } {
  let gain = 0, debt = 0;
  for (const e of liveEvents(sc, s)) {
    if (e.turn !== s.turn || e.effect.type !== 'purse') continue;
    if (!e.effect.always && !sc.towns.some((t) => t.tribe === e.tribe && t.id !== sc.castra && sup[t.id])) continue;
    if (e.effect.denarii >= 0) gain += e.effect.denarii; else debt -= e.effect.denarii;
  }
  return { gain, debt };
}

/** Hop distance along built roads from a town (Infinity if unreachable). */
export function roadDistance(sc: Scenario, s: State, from: TownId): number[] {
  return bfs(builtAdj(sc, s), from);
}

/** Active toll on a road this turn (from hardship events touching either endpoint's tribe). */
export function roadToll(sc: Scenario, s: State, roadId: number): number {
  const r = sc.roads[roadId]!;
  const ta = sc.towns[r.a]!.tribe, tb = sc.towns[r.b]!.tribe;
  // the worst surcharge and the best discount apply (they do not stack among themselves)
  let up = 0, down = 0;
  for (const t of s.tolls ?? []) {
    if (s.turn > t.until || (t.tribe !== ta && t.tribe !== tb) || (t.terrain && !t.terrain.includes(r.terrain))) continue;
    up = Math.max(up, t.surcharge); down = Math.min(down, t.surcharge);
  }
  return up + down;
}

/** What a road costs right now: terrain + depth, decree surcharge, and any active toll. */
export const roadCost = (sc: Scenario, s: State, roadId: number) =>
  Math.max(1, sc.roads[roadId]!.cost + (sc.rules.roadSurcharge ?? 0) + roadToll(sc, s, roadId) - (sc.rules.roughDiscount && sc.roads[roadId]!.terrain !== 'plain' ? sc.rules.roughDiscount : 0)
    + (sc.rules.invertTerrain ? INVERTED[sc.roads[roadId]!.terrain] : 0)
    + (sc.rules.tempoRoads ? (s.turn <= sc.rules.tempoRoads.until ? sc.rules.tempoRoads.early : sc.rules.tempoRoads.late) : 0)
    + (sc.rules.deepSurcharge && Math.max(sc.towns[sc.roads[roadId]!.a]!.hop, sc.towns[sc.roads[roadId]!.b]!.hop) > sc.rules.deepSurcharge.hop ? sc.rules.deepSurcharge.extra : 0));
/** Saturnalia: terrain part of a road's cost becomes plain 2, forest 1, hills 1. */
const INVERTED = { plain: 1, forest: -1, hills: -2 } as const;

/**
 * Glory a per-turn decree pays at the end of a turn (already part of the turn's glory). These
 * decrees reward *when* you hold something, since by dusk the best play holds nearly every town.
 */
export function decreeTurnGlory(sc: Scenario, s: State, sup: boolean[]): number {
  const held = sc.towns.filter((t) => t.id !== sc.castra && sup[t.id]);
  switch (sc.decree.kind) {
    case 'mare': { const c = shores(sc).coast; return sc.decree.bonus * held.filter((t) => c[t.id]).length; }
    case 'montes': return sc.decree.bonus * held.filter((t) => t.terrain !== 'plain').length;
    case 'legatio': return sc.decree.bonus * Math.min(...sc.tribes.map((tr) => held.filter((t) => t.tribe === tr.id).length));
    case 'devotio': return sc.decree.bonus * s.legions.filter((t) => t !== sc.castra && sc.towns[t]!.hop >= sc.decree.param).length;
    default: return 0;
  }
}

/** Active surcharge on recruits and garrisons from levy events (grain shortage). */
export const levyNow = (s: State) => Math.max(0, ...(s.levies ?? []).filter((l) => s.turn <= l.until).map((l) => l.surcharge));
export const recruitCost = (sc: Scenario, s: State) => sc.rules.recruitCost + sc.rules.recruitCostStep * s.recruited + levyNow(s);
/** Is `town` covered by the day's garrison deal (frontier, port, or forest/hill town)? */
export function dealTown(sc: Scenario, town: TownId): boolean {
  const d = sc.rules.garrisonDeal;
  if (!d || town === sc.castra) return false;
  return d.where === 'rough' ? sc.towns[town]!.terrain !== 'plain' : shores(sc)[d.where][town]!;
}
export const garrisonCost = (sc: Scenario, s: State, town?: TownId) =>
  (town !== undefined && dealTown(sc, town) ? sc.rules.garrisonDeal!.cost : sc.rules.garrisonCost + sc.rules.garrisonCostStep * s.garrisons) + levyNow(s);

/** Events visible at the start of turn `turn` (current + lookahead). */
export function visibleEvents(sc: Scenario, turn: number, s?: State): GameEvent[] {
  return liveEvents(sc, s).filter((e) => e.turn >= turn && e.turn < turn + sc.rules.eventLookahead);
}

/** Roads a cut event would destroy in state s: 'all' unshielded roads of the tribe, the 'deepest', the 'cheapest', or the 'hub'. */
export function roadsCutBy(sc: Scenario, s: State, tribe: number, mode: CutMode, prot = protectedTowns(sc, s), where?: Shore): RoadId[] {
  const sh = where ? shores(sc)[where] : null;
  const struck = (t: number) => sc.towns[t]!.tribe === tribe && (!sh || sh[t]);
  const hit = sc.roads.filter((r) => s.built[r.id] && !prot[r.a] && !prot[r.b] && (struck(r.a) || struck(r.b)));
  if (mode === 'hub') { // every road of the most-connected town (ties: lower id), whatever the tribe
    const deg = new Array<number>(sc.towns.length).fill(0);
    for (const r of sc.roads) if (s.built[r.id]) { deg[r.a]!++; deg[r.b]!++; }
    let hub = -1;
    for (const t of sc.towns) if (t.id !== sc.castra && deg[t.id]! > 0 && (hub < 0 || deg[t.id]! > deg[hub]!)) hub = t.id;
    return hub < 0 ? [] : sc.roads.filter((r) => s.built[r.id] && (r.a === hub || r.b === hub) && !prot[r.a] && !prot[r.b]).map((r) => r.id);
  }
  if (mode === 'all' || hit.length <= 1) return hit.map((r) => r.id);
  if (mode === 'cheapest') return [hit.reduce((a, b) => (b.cost < a.cost || (b.cost === a.cost && b.id < a.id) ? b : a)).id];
  // deepest: the road reaching farthest from the castra; ties broken by road id (deterministic)
  const depth = (r: (typeof hit)[number]) => Math.max(sc.towns[r.a]!.hop, sc.towns[r.b]!.hop);
  const best = hit.reduce((a, b) => (depth(b) > depth(a) || (depth(b) === depth(a) && b.id < a.id) ? b : a));
  return [best.id];
}

/** All roads cut by the cut events resolving at the end of `turn`. */
export function cutsAt(sc: Scenario, s: State, turn: number): RoadId[] {
  const prot = protectedTowns(sc, s);
  let legionOnly: boolean[] | undefined;
  const out = new Set<RoadId>();
  for (const e of liveEvents(sc, s)) {
    if (e.turn !== turn || e.effect.type !== 'cut') continue;
    const p = e.effect.pierce === 'all' ? new Array<boolean>(sc.towns.length).fill(false) : e.effect.pierce === 'garrison' ? (legionOnly ??= protectedTowns(sc, s, true)) : prot;
    for (const r of roadsCutBy(sc, s, e.tribe, e.effect.mode, p, e.effect.where)) out.add(r);
  }
  return [...out];
}

/**
 * Roads the revolts resolving at the end of `turn` would have cut with no protection but did not:
 * what legions and garrisons saved (for the client's "held" effect; the rules never read it).
 * Only roads saved by a legion or garrison count (not the castra's or a port's standing protection).
 * `by` is the protected end of the road (an end holding a legion or garrison when there is one);
 * `source` the town whose legion or garrison did the protecting, where the shield is drawn: `by` itself,
 * or the garrison next to it (a garrison also shields its neighbours, so `source` may lie off the road).
 * `tribe` is the revolting tribe.
 */
export function heldAt(sc: Scenario, s: State, turn: number): Array<{ road: RoadId; by: TownId; source: TownId; tribe: number }> {
  const cut = new Set(cutsAt(sc, s, turn)), none = new Array<boolean>(sc.towns.length).fill(false);
  // only what the player's legions and garrisons did: the castra and ports are protected by rule, not by a choice.
  // src[t]: the town whose unit shields t (t itself when a legion or garrison stands there), -1 when unshielded
  const military = (legionsOnly: boolean) => {
    const src = new Array<number>(sc.towns.length).fill(-1);
    if (!legionsOnly) {
      const adj = candidateAdj(sc);
      for (const t of sc.towns) if (s.garrison[t.id]) for (const { to } of adj[t.id]!) if (src[to] === -1) src[to] = t.id;
      for (const t of sc.towns) if (s.garrison[t.id]) src[t.id] = t.id;
    }
    if (sc.rules.legionsShield !== false) for (const t of s.legions) src[t] = t;
    src[sc.castra] = -1;
    return src;
  };
  const prot = military(false);
  const out = new Map<RoadId, { road: RoadId; by: TownId; source: TownId; tribe: number }>();
  for (const e of liveEvents(sc, s)) {
    if (e.turn !== turn || e.effect.type !== 'cut' || e.effect.pierce === 'all') continue;
    const src = e.effect.pierce === 'garrison' ? military(true) : prot;
    for (const r of roadsCutBy(sc, s, e.tribe, e.effect.mode, none, e.effect.where)) {
      if (cut.has(r) || out.has(r)) continue;
      const road = sc.roads[r]!;
      // prefer the end where the unit actually stands, then any shielded end
      const by = [road.a, road.b].find((t) => src[t] === t) ?? [road.a, road.b].find((t) => src[t]! >= 0);
      if (by !== undefined) out.set(r, { road: r, by, source: src[by]!, tribe: e.tribe });
    }
  }
  return [...out.values()];
}

export const isThreat = (e: GameEvent) => e.effect.type === 'cut';

export interface ForecastPreview { turn: number; cut: RoadId[]; stranded: TownId[] }

/**
 * What the next cut event in the visible window would do to the CURRENT network if the player
 * changed nothing: roads cut and towns that would lose supply. Used for the UI warning layer.
 */
export function forecastPreview(sc: Scenario, s: State): ForecastPreview | null {
  const ev = visibleEvents(sc, s.turn, s).filter(isThreat);
  if (!ev.length) return null;
  const turn = ev[0]!.turn;
  const cut = cutsAt(sc, s, turn);
  const before = supplied(sc, s);
  const after = supplied(sc, { ...s, built: s.built.map((b, i) => b && !cut.includes(i)) });
  const stranded = sc.towns.filter((t) => before[t.id] && !after[t.id]).map((t) => t.id);
  return { turn, cut, stranded };
}

/** Returns null if legal, else a human-readable reason. */
export function checkAction(sc: Scenario, s: State, a: Action, sup = supplied(sc, s)): string | null {
  if (isOver(sc, s)) return 'The campaign is over';
  switch (a.type) {
    case 'end':
      return null;
    case 'accept':
      return gambitOffers(sc, s).includes(a.event) ? null : 'This offer is not open';
    case 'recruit':
      if (s.legions.length >= sc.rules.maxLegions) return 'The Senate forbids raising more legions today';
      return s.denarii < recruitCost(sc, s) ? `Recruiting costs ${recruitCost(sc, s)} denarii` : null;
    case 'road': {
      const r = sc.roads[a.road];
      if (!r) return 'No such road';
      if (s.built[r.id]) return 'Road already built';
      if (s.rubble[r.id]) return `Rebels hold this road: rebuild in ${s.rubble[r.id]} turn(s)`;
      if (!sup[r.a] && !sup[r.b]) return 'Roads must extend from your supplied network';
      const cap = sc.rules.depthCap;
      if (cap && s.turn < cap.until && Math.max(sc.towns[r.a]!.hop, sc.towns[r.b]!.hop) > cap.hop) return `Mos maiorum: no road beyond ${cap.hop} roads out before turn ${cap.until}`;
      if (s.denarii < roadCost(sc, s, r.id)) return `This road costs ${roadCost(sc, s, r.id)} denarii`;
      return null;
    }
    case 'camp': {
      const from = s.legions[a.legion];
      if (from === undefined) return 'No such legion';
      if (s.moved[a.legion]) return 'This legion already marched this turn';
      if (!sc.towns[a.town]) return 'No such town';
      if (from === a.town) return 'Already camped here';
      if (!sup[from]) return 'This legion is cut off and cannot march';
      if (!sup[a.town]) return 'Legions can only march along your roads';
      if (roadDistance(sc, s, from)[a.town]! > sc.rules.legionRange) return `Legions march at most ${sc.rules.legionRange} roads per turn`;
      if (a.town !== sc.castra && s.legions.includes(a.town)) return 'A legion already camps here';
      return null;
    }
    case 'garrison': {
      const t = sc.towns[a.town];
      if (!t || t.id === sc.castra) return 'Cannot garrison there';
      if (s.garrison[t.id]) return 'Already garrisoned';
      if (!sup[t.id]) return 'Garrisons need a supplied town';
      if (s.denarii < garrisonCost(sc, s, t.id)) return `A garrison costs ${garrisonCost(sc, s, t.id)} denarii`;
      return null;
    }
  }
}

/** Applies a legal action, returning a new state. Throws on illegal action. */
export function apply(sc: Scenario, s: State, a: Action): State {
  const err = checkAction(sc, s, a);
  if (err) throw new Error(`Illegal ${JSON.stringify(a)} at turn ${s.turn}: ${err}`);
  if (a.type === 'end') return endTurn(sc, s);
  const n = cloneState(s);
  switch (a.type) {
    case 'road': n.built[a.road] = true; n.denarii -= roadCost(sc, s, a.road); break;
    case 'camp': n.legions[a.legion] = a.town; n.moved[a.legion] = true; break;
    case 'accept': {
      n.accepted = [...(n.accepted ?? []), a.event];
      const g = sc.events[a.event]!.effect;
      // parts marked `now` pay on the spot (a loan you can spend this very turn)
      if (g.type === 'gambit') for (const p of g.parts) if (p.now && p.effect.type === 'purse') n.denarii += p.effect.denarii;
      break;
    }
    case 'garrison': n.garrison[a.town] = true; n.denarii -= garrisonCost(sc, s, a.town); n.garrisons += 1; break;
    case 'recruit':
      n.denarii -= recruitCost(sc, s); n.recruited += 1;
      n.legions.push(sc.castra); n.moved.push(false);
      break;
  }
  return n;
}

/**
 * Steps 1–2 of the end of the turn (event effects, then sieges): the state and the network that the
 * turn's glory and income are paid on. Shared by `endTurn` and `yieldPerTurn`, so the preview is the payout.
 */
function resolveTurn(sc: Scenario, s: State): { n: State; rec: TurnRecord; sup: boolean[] } {
  const n = cloneState(s);
  const rec: TurnRecord = { turn: s.turn, cut: [], burned: [], lostLegions: [], glory: 0, income: 0, deepest: 0, towns: 0 };
  const events = liveEvents(sc, s).filter((e) => e.turn === s.turn);

  // 1. Event effects: cuts, tolls, booms (yields are applied to the pay below).
  rec.cut = cutsAt(sc, n, s.turn);
  for (const r of rec.cut) { n.built[r] = false; n.rubble[r] = sc.rules.rubbleTurns + 1; }
  for (const e of events) {
    if (e.effect.type === 'toll') n.tolls.push({ tribe: e.tribe, surcharge: e.effect.surcharge, until: s.turn + e.effect.duration, ...(e.effect.terrain ? { terrain: e.effect.terrain } : {}) });
    if (e.effect.type === 'levy') (n.levies ??= []).push({ surcharge: e.effect.surcharge, until: s.turn + e.effect.duration });
    if (e.effect.type === 'boom' && e.town !== undefined) n.valueBonus[e.town] = (n.valueBonus[e.town] ?? 0) + e.effect.value;
  }

  // 2. Sieges: cut-off towns that still have roads or a legion.
  let sup = supplied(sc, n);
  const burnNow: TownId[] = [];
  for (const t of sc.towns) {
    if (t.id === sc.castra) continue;
    const hasRoad = sc.roads.some((r) => n.built[r.id] && (r.a === t.id || r.b === t.id));
    const hasLegion = n.legions.includes(t.id);
    if (sup[t.id] || (!hasRoad && !hasLegion) || n.garrison[t.id]) { n.siege[t.id] = 0; continue; }
    n.siege[t.id] = n.siege[t.id] === 0 ? sc.rules.siegeTurns : n.siege[t.id]! - 1;
    if (n.siege[t.id] === 0) burnNow.push(t.id);
  }
  for (const t of burnNow) {
    for (const r of sc.roads) if (r.a === t || r.b === t) n.built[r.id] = false;
    const before = n.legions.length;
    const keep = n.legions.map((p, i) => ({ p, m: n.moved[i]! })).filter((x) => x.p !== t);
    n.legions = keep.map((x) => x.p);
    n.moved = keep.map((x) => x.m);
    for (let i = 0; i < before - n.legions.length; i++) rec.lostLegions.push(t);
    n.lost += before - n.legions.length;
    n.burned += 1;
    rec.burned.push(t);
  }
  if (burnNow.length) sup = supplied(sc, n);
  return { n, rec, sup };
}

/** Resolve revolts, sieges, then glory and income. */
export function endTurn(sc: Scenario, s: State): State {
  const { n, rec, sup } = resolveTurn(sc, s);
  const events = liveEvents(sc, s).filter((e) => e.turn === s.turn);

  // 3. Glory and income from supplied towns.
  const mult = yieldMultipliers(sc, s.turn, s);
  rec.income = sc.rules.baseIncome;
  for (const t of sc.towns) {
    if (t.id === sc.castra || !sup[t.id]) continue;
    const m = mult.get(t.tribe) ?? { glory: 1, income: 1 };
    const v = townValue(n, t);
    rec.glory += townGlory(sc, t, v) * m.glory;
    rec.income += townIncome(sc, v) * m.income;
  }
  const held = sc.towns.filter((t) => t.id !== sc.castra && sup[t.id]);
  rec.deepest = Math.max(0, ...held.map((t) => t.hop));
  rec.towns = held.length;
  const dg = decreeTurnGlory(sc, n, sup);
  if (dg) { rec.glory += dg; n.dGlory = (n.dGlory ?? 0) + dg; }
  // 4. Purses (flat denarii) and settlers (free garrisons) need the tribe supplied at dusk.
  const purse = purseAt(sc, s, sup);
  rec.income += purse.gain - purse.debt;
  for (const e of events) {
    if (e.effect.type === 'settle' && e.town !== undefined && sup[e.town]) n.garrison[e.town] = true;
    if (e.effect.type === 'muster') for (let k = 0; k < e.effect.legions; k++) { n.legions.push(sc.castra); n.moved.push(false); }
  }
  n.glory += rec.glory;
  n.denarii += rec.income; // may go below 0 (a loan due): nothing can be bought until it recovers
  n.moved = n.moved.map(() => false);
  n.rubble = n.rubble.map((x) => Math.max(0, x - 1));
  n.history.push(rec);
  n.turn += 1;
  return n;
}

export function suppliedTowns(sc: Scenario, s: State): TownId[] {
  const sup = supplied(sc, s);
  return sc.towns.filter((t) => t.id !== sc.castra && sup[t.id]).map((t) => t.id);
}

/** Longest simple path (in roads) from the castra along built, supplied roads. */
export function longestRoad(sc: Scenario, s: State): number {
  const adj = builtAdj(sc, s);
  const seen = new Array<boolean>(sc.towns.length).fill(false);
  let best = 0, budget = 200000; // the built network is small; the budget guards pathological cases
  const dfs = (u: number, len: number) => {
    if (--budget < 0) return;
    if (len > best) best = len;
    seen[u] = true;
    for (const { to } of adj[u]!) if (!seen[to]) dfs(to, len + 1);
    seen[u] = false;
  };
  dfs(sc.castra, 0);
  return best;
}

/** Supplied towns with at least `k` built roads. */
export function hubs(sc: Scenario, s: State, k: number): TownId[] {
  const sup = supplied(sc, s);
  const deg = new Array<number>(sc.towns.length).fill(0);
  for (const r of sc.roads) if (s.built[r.id]) { deg[r.a]!++; deg[r.b]!++; }
  return sc.towns.filter((t) => t.id !== sc.castra && sup[t.id] && deg[t.id]! >= k).map((t) => t.id);
}

export interface DecreeStatus { met: boolean; bonus: number; progress: string }

/** The decree's bonus if the day ended in state s, with a short progress line for the UI. */
export function decreeStatus(sc: Scenario, s: State): DecreeStatus {
  const d = sc.decree;
  const held = suppliedTowns(sc, s);
  const flat = (met: boolean, progress: string): DecreeStatus => ({ met, bonus: met ? d.bonus : 0, progress });
  const per = (n: number, unit: string): DecreeStatus => ({ met: n > 0, bonus: n * d.bonus, progress: `${n} ${unit}` });
  // per-turn decrees: their glory is paid each turn (see decreeTurnGlory), nothing at dusk
  const turnly = (): DecreeStatus => ({ met: (s.dGlory ?? 0) > 0, bonus: 0, progress: `+${s.dGlory ?? 0}★ earned so far` });
  switch (d.kind) {
    case 'none': return { met: false, bonus: 0, progress: '' };
    case 'triumph': {
      const n = s.legions.filter((t) => t !== sc.castra && sc.towns[t]!.hop >= d.param).length;
      return { met: n > 0, bonus: n * d.bonus, progress: `${n} legion${n === 1 ? '' : 's'} at the frontier (${d.param}+ roads out)` };
    }
    case 'via': return per(longestRoad(sc, s), 'roads in your longest road');
    case 'marius': return per(s.legions.length, `legion${s.legions.length === 1 ? '' : 's'} standing`);
    case 'pax': {
      const cuts = s.history.reduce((n, h) => n + h.cut.length, 0);
      return flat(cuts === 0 && held.length >= d.param, `${cuts} road${cuts === 1 ? '' : 's'} cut so far · ${held.length} towns supplied`);
    }
    case 'nexus': return per(hubs(sc, s, d.param).length, `hub${hubs(sc, s, d.param).length === 1 ? '' : 's'}`);
    case 'peace': return per(s.garrisons, `garrison${s.garrisons === 1 ? '' : 's'}`);
    case 'treasury': {
      const n = Math.floor(s.denarii / d.param);
      return { met: n > 0, bonus: n * d.bonus, progress: `${s.denarii}🪙 in the treasury` };
    }    // ---- 2026-11-15
    case 'panem': return { met: true, bonus: 0, progress: 'towns pay no 🪙; the castra pays 4🪙 a turn' };
    case 'cursus': return { met: true, bonus: 0, progress: s.turn <= d.param ? `roads cost 1🪙 less through turn ${d.param}` : 'roads cost 1🪙 more now' };
    case 'mare': return turnly();
    case 'montes': return turnly();
    case 'legatio': return turnly();
    case 'devotio': return turnly();
    case 'census': return per(held.length, `town${held.length === 1 ? '' : 's'} counted`);
    case 'censor': { const pr = protectedTowns(sc, s), n = held.filter((t) => pr[t]).length; return per(n, `fully guarded town${n === 1 ? '' : 's'}`); }
    case 'limes': { const fr = shores(sc).frontier, n = held.filter((t) => fr[t] && s.garrison[t]).length; return per(n, `garrisoned frontier town${n === 1 ? '' : 's'}`); }
    case 'classis': { const c = shores(sc).coast, n = held.filter((t) => c[t]).length; return per(n, `port${n === 1 ? '' : 's'} supplied`); }
    case 'mos': { const n = held.filter((t) => sc.towns[t]!.hop <= 3).length; return per(n, `town${n === 1 ? '' : 's'} within 3 roads`); }
    case 'castella': { const n = held.filter((t) => s.garrison[t] && sc.towns[t]!.terrain !== 'plain').length; return per(n, `garrisoned forest or hill town${n === 1 ? '' : 's'}`); }
    case 'cincinnatus': { const n = s.legions.filter((t) => t === sc.castra).length; return per(n, `legion${n === 1 ? '' : 's'} home at the castra`); }
    case 'saturnalia': return { met: true, bonus: 0, progress: 'plain roads +1🪙, forest −1🪙, hills −2🪙' };
    case 'lupercalia': { const n = s.history.reduce((k, h) => k + h.cut.length, 0); return per(n, `road${n === 1 ? '' : 's'} cut so far`); }
    case 'libri': return { met: true, bonus: 0, progress: 'every event is foretold' };
    case 'idus': {
      const deg = new Array<number>(sc.towns.length).fill(0);
      for (const r of sc.roads) if (s.built[r.id]) { deg[r.a]!++; deg[r.b]!++; }
      const n = held.filter((t) => deg[t]! <= 2).length;
      return per(n, `supplied town${n === 1 ? '' : 's'} with at most 2 roads`);
    }
  }
}

export const decreeMet = (sc: Scenario, s: State) => decreeStatus(sc, s).met;

export interface ScoreBreakdown { glory: number; penalty: number; decree: number; total: number; decreeMet: boolean }

export function score(sc: Scenario, s: State): ScoreBreakdown {
  const d = decreeStatus(sc, s);
  const penalty = s.lost * sc.rules.lostLegionPenalty;
  // per-turn decrees pay into s.glory as they go: report that share under the decree, not the towns
  const turnly = s.dGlory ?? 0;
  return { glory: s.glory - turnly, penalty, decree: d.bonus + turnly, total: s.glory - penalty + d.bonus, decreeMet: d.met };
}

/** All legal actions (including 'end'). */
export function legalActions(sc: Scenario, s: State): Action[] {
  if (isOver(sc, s)) return [];
  const sup = supplied(sc, s);
  const out: Action[] = [];
  const push = (a: Action) => { if (!checkAction(sc, s, a, sup)) out.push(a); };
  for (const r of sc.roads) push({ type: 'road', road: r.id });
  for (const t of sc.towns) {
    push({ type: 'garrison', town: t.id });
    for (let i = 0; i < s.legions.length; i++) push({ type: 'camp', legion: i, town: t.id });
  }
  push({ type: 'recruit' });
  out.push({ type: 'end' });
  return out;
}

/** Server-side validation: replay an action log; throws on any illegal action. */
export function replay(sc: Scenario, actions: readonly Action[]): State {
  let s = initialState(sc);
  for (const a of actions) s = apply(sc, s, a);
  return s;
}

/**
 * Score over the day: cumulative glory after each turn, then the final score at dusk
 * (glory + decree bonus − lost legions). Length = turns played + 1.
 */
export function scoreCurve(sc: Scenario, s: State): number[] {
  const out: number[] = [];
  let g = 0;
  for (const h of s.history) out.push((g += h.glory));
  out.push(score(sc, s).total);
  return out;
}
