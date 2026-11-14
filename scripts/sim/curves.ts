// Add Caesar's turn-by-turn score curve to every calendar entry that lacks one, by re-running
// the same solver that produced its par (beam 20 × 20). Checks the curve ends exactly at par.
// Usage: npx tsx scripts/sim/curves.ts   (rewrites src/shared/season.json in place)
import { readFileSync, writeFileSync } from 'node:fs';
import { generate, scoreCurve } from '../../src/shared/engine';
import type { Faction } from '../../src/shared/engine';
import { solve } from './solver';

const PATH = 'src/shared/season.json';
type Entry = { date: string; seed: string; par: Record<Faction, number>; curve?: Record<Faction, number[]>; tries: number };
const season = JSON.parse(readFileSync(PATH, 'utf8')) as Entry[];
for (const e of season) {
  if (e.curve) continue;
  const curve = {} as Record<Faction, number[]>;
  for (const f of ['populares', 'optimates'] as Faction[]) {
    const sc = generate(e.seed, { faction: f });
    const sol = solve(sc, { beam: 20, plans: 20 });
    curve[f] = scoreCurve(sc, sol.state);
    if (curve[f].at(-1) !== e.par[f]) throw new Error(`${e.date} ${f}: curve ends at ${curve[f].at(-1)}, par is ${e.par[f]}`);
  }
  e.curve = curve;
  writeFileSync(PATH, JSON.stringify(season, null, 1) + '\n');
  process.stderr.write(`${e.date} ok\n`);
}
