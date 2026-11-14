// Calendar acceptance test for a seed: solver par plus three reference players, per faction.
import { Rng, generate, scoreCurve } from '../../src/shared/engine';
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
    const sol = solve(sc, { beam: 20, plans: 20 });
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

