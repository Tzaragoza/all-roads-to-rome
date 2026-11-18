// Calendar acceptance test for a seed: solver par plus three reference players, per faction.
import { Rng, apply, checkAction, generate, initialState, isOver, score, scoreCurve } from '../../src/shared/engine';
import type { Action, Scenario, State } from '../../src/shared/engine';

function replayIfLegal(sc: Scenario, actions: Action[]): State | null {
  let st = initialState(sc);
  for (const a of actions) { if (checkAction(sc, st, a)) return null; st = apply(sc, st, a); }
  return isOver(sc, st) ? st : null;
}
import type { Faction } from '../../src/shared/engine';
import { BOTS, finalScore, playGame, randomGame } from './bots';
import { solve } from './solver';

export const FACTIONS: Faction[] = ['populares', 'optimates'];
export const THRESHOLDS = { forecastMin: 0.45, greedyMax: 0.92, randomMax: 0.3 };

export type Verdict = { par: number; curve: number[]; forecast: number; greedy: number; random: number; ok: boolean; why: string };

export function evaluate(seed: string, asOf?: string, factions: Faction[] = FACTIONS) {
  const out: Partial<Record<Faction, Verdict>> = {};
  for (const faction of factions) {
    const sc = generate(seed, { faction, asOf });
    // Caesar never takes a gambit (from 2026-11-16): offers are the player's edge, balanced for a player
    // who sees only the forecast. His plan is solved on the day without its offers, then replayed on it.
    let sol = solve(sc, { beam: 20, plans: 20 });
    if (sc.events.some((e) => e.effect.type === 'gambit')) {
      const plain = solve({ ...sc, events: sc.events.filter((e) => e.effect.type !== 'gambit') }, { beam: 20, plans: 20 });
      const st = replayIfLegal(sc, plain.actions);
      if (st) sol = { score: score(sc, st).total, actions: plain.actions, state: st };
    }
    const par = sol.score, curve = scoreCurve(sc, sol.state);
    const fc = finalScore(sc, playGame(sc, BOTS.forecast!));
    const greedyBest = Math.max(finalScore(sc, playGame(sc, BOTS.reach!)), finalScore(sc, playGame(sc, BOTS.safe!)));
    let rnd = 0;
    for (let i = 0; i < 10; i++) rnd += finalScore(sc, randomGame(sc, new Rng(`${seed}/r${i}`))) / 10;
    const why = fc / par < THRESHOLDS.forecastMin ? 'trap (heuristic play collapses)'
      : greedyBest / par > THRESHOLDS.greedyMax ? 'trivial (greedy ~ par)'
      : rnd / par > THRESHOLDS.randomMax ? 'random play too strong' : '';
    out[faction] = { par, curve, forecast: fc, greedy: greedyBest, random: rnd, ok: !why, why };
  }
  return out;
}

