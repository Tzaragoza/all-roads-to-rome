// Parameterised heuristic policies (rules v2) used as player proxies for calibration and
// as plan generators for the par solver. Offline-only; not shipped to the client.
import {
  Rng, apply, forecastPreview, roadCost, garrisonCost, initialState, isOver, legalActions, recruitCost, score, supplied,
} from '../../src/shared/engine';
import type { Action, Scenario, State } from '../../src/shared/engine';

export interface Params {
  value: number;   // weight on glory from newly supplied towns
  depth: number;   // bonus per hop for reaching deep towns
  risk: number;    // weight on avoiding forecast damage
  guard: number;   // weight on moving legions / building garrisons against forecast damage
  recruit: number; // appetite for recruiting legions
  noise: number;
  thrift: number;  // minimum benefit/cost to keep acting this turn
}

export const BOTS: Record<string, Params> = {
  reach:    { value: 1, depth: 1,   risk: 0,   guard: 0,   recruit: 0,   noise: 0, thrift: 0.3 },
  safe:     { value: 1, depth: 0,   risk: 2,   guard: 1.5, recruit: 1,   noise: 0, thrift: 0.8 },
  forecast: { value: 1, depth: 0.3, risk: 1,   guard: 1.5, recruit: 0.6, noise: 0, thrift: 0.4 },
};

/** Forecast damage of a state: value that the next visible revolt would strand, + trapped legions. */
export function damage(sc: Scenario, s: State): number {
  const pv = forecastPreview(sc, s);
  if (!pv) return 0;
  let d = 0;
  for (const t of pv.stranded) d += sc.towns[t]!.value * 2 + 3 * s.legions.filter((p) => p === t).length;
  return d;
}

function newlySupplied(sc: Scenario, before: boolean[], after: boolean[]) {
  let v = 0, hop = 0;
  for (const t of sc.towns) if (!before[t.id] && after[t.id]) { v += t.value; hop = Math.max(hop, t.hop); }
  return { v, hop };
}

export function actionScore(sc: Scenario, s: State, a: Action, p: Params, ctx: Ctx): number {
  const turnsLeft = sc.rules.turns - s.turn + 1;
  switch (a.type) {
    case 'end': return -Infinity;
    case 'road': {
      const r = sc.roads[a.road]!;
      const n = apply(sc, s, a);
      const { v, hop } = newlySupplied(sc, ctx.sup, supplied(sc, n));
      const gain = p.value * v * Math.min(turnsLeft, 6) / 3 + p.depth * hop * (v > 0 ? 1 : 0);
      const safety = p.risk * (ctx.damage - damage(sc, n));
      return (gain + safety) / roadCost(sc, s, r.id);
    }
    case 'camp': {
      if (p.guard === 0 || ctx.damage === 0) return -1;
      const n = apply(sc, s, a);
      return p.guard * (ctx.damage - damage(sc, n)) / 2;
    }
    case 'garrison': {
      if (p.guard === 0) return -1;
      const n = apply(sc, s, a);
      const protectNow = ctx.damage - damage(sc, n);
      return (p.guard * (protectNow + turnsLeft / 3)) / garrisonCost(sc, s);
    }
    case 'recruit': {
      if (p.recruit === 0) return -1;
      const free = s.legions.length;
      return (p.recruit * (ctx.damage + turnsLeft / 2)) / (recruitCost(sc, s) * (1 + free / 2));
    }
  }
}

interface Ctx { sup: boolean[]; damage: number }

/** Play one full turn (actions until the policy ends it), returning the post-endTurn state. */
export function playTurn(sc: Scenario, s: State, p: Params, rng?: Rng, log?: Action[]): State {
  for (let guard = 0; guard < 40; guard++) {
    const ctx: Ctx = { sup: supplied(sc, s), damage: damage(sc, s) };
    let best: Action = { type: 'end' }, bestScore = p.thrift;
    for (const a of legalActions(sc, s)) {
      if (a.type === 'end') continue;
      let v = actionScore(sc, s, a, p, ctx);
      if (rng && p.noise) v += (rng.next() + rng.next() - 1) * p.noise;
      if (v > bestScore) { bestScore = v; best = a; }
    }
    log?.push(best);
    s = apply(sc, s, best);
    if (best.type === 'end') return s;
  }
  log?.push({ type: 'end' });
  return apply(sc, s, { type: 'end' });
}

export function playGame(sc: Scenario, p: Params, rng?: Rng, start?: State, log?: Action[]): State {
  let s = start ?? initialState(sc);
  while (!isOver(sc, s)) s = playTurn(sc, s, p, rng, log);
  return s;
}

export function randomGame(sc: Scenario, rng: Rng): State {
  let s = initialState(sc);
  while (!isOver(sc, s)) {
    const acts = legalActions(sc, s);
    const a = rng.next() < 0.3 ? acts[acts.length - 1]! : rng.pick(acts);
    s = apply(sc, s, a);
  }
  return s;
}

export const finalScore = (sc: Scenario, s: State) => score(sc, s).total;
