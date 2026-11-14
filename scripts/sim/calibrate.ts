import { DEFAULT_GEN, DEFAULT_RULES } from '../../src/shared/engine';
const ENV = JSON.parse(process.env.GEN ?? '{}');
const GEN = { ...DEFAULT_GEN, ...ENV, rules: { ...DEFAULT_RULES, ...(ENV.rules ?? {}) } };
// Calibration report: for N daily seeds, compare par (solver) to bot archetypes.
// Usage: npx tsx tools/calibrate.ts [days=20] [startDate=2026-12-01] [beam] [plans]
import { Rng, generate, replay, score, suppliedTowns } from '../../src/shared/engine';
import { BOTS, finalScore, playGame, randomGame } from './bots';
import { solve } from './solver';

const days = Number(process.argv[2] ?? 20);
const start = new Date(process.argv[3] ?? '2026-12-01');
const beam = Number(process.argv[4] ?? 12), plans = Number(process.argv[5] ?? 12);

const rows: Record<string, number | string>[] = [];
const t0 = Date.now();
for (let d = 0; d < days; d++) {
  const date = new Date(start.getTime() + d * 864e5).toISOString().slice(0, 10);
  const sc = generate(date, GEN);
  const par = solve(sc, { beam, plans });
  // determinism + server validation check: replaying the solver's log reproduces its score
  const re = score(sc, replay(sc, par.actions)).total;
  if (re !== par.score) throw new Error(`replay mismatch on ${date}: ${re} vs ${par.score}`);
  const reach = finalScore(sc, playGame(sc, BOTS.reach!));
  const safe = finalScore(sc, playGame(sc, BOTS.safe!));
  const fc = finalScore(sc, playGame(sc, BOTS.forecast!));
  const rnd: number[] = [];
  for (let i = 0; i < 20; i++) rnd.push(finalScore(sc, randomGame(sc, new Rng(`${date}/rnd/${i}`))));
  const rndMean = rnd.reduce((a, b) => a + b, 0) / rnd.length;
  rows.push({
    date, decree: sc.decree.kind, par: par.score, forecast: fc, reach, safe,
    random: Math.round(rndMean), parGarr: par.state.garrisons, parRecr: par.state.recruited, parBurn: par.state.burned, parLeg: par.state.legions.length, parHop: Math.max(0, ...suppliedTowns(sc, par.state).map((t) => sc.towns[t]!.hop)), fcHop: Math.max(0, ...suppliedTowns(sc, playGame(sc, BOTS.forecast!)).map((t) => sc.towns[t]!.hop)), parLeft: par.state.denarii, parDecree: score(sc, par.state).decreeMet ? 'y' : 'n',
    'fc/par': (fc / par.score).toFixed(2), 'best-greedy': reach > safe ? 'reach' : reach < safe ? 'safe' : 'tie',
  });
}
console.table(rows);
const mean = (k: string) => (rows.reduce((a, r) => a + Number(r[k]), 0) / rows.length).toFixed(1);
console.log(`means  par ${mean('par')}  forecast ${mean('forecast')}  reach ${mean('reach')}  safe ${mean('safe')}  random ${mean('random')}`);
console.log(`reach wins ${rows.filter((r) => r['best-greedy'] === 'reach').length}/${rows.length}; ${((Date.now() - t0) / 1000).toFixed(1)}s`);
