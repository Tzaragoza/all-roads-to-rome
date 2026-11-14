// Precompute the daily calendar offline: pick an accepted seed per date and its par
// for both factions (the faction is decided by the community vote at rollover).
// Usage: npm run sim:season -- 2026-12-01 60      (or --only 2026-12-03,2026-12-09 to recompute just those days)
// Append-only: entries before the start date are kept as they are (published days never change);
// entries from the start date on are recomputed with the content live on each date (asOf).
import { readFileSync, writeFileSync } from 'node:fs';
import type { Faction } from '../../src/shared/engine';
import { evaluate } from './fairness';
import { ballotFor } from '../../src/shared/daily';

const FILE = new URL('../../src/shared/season.json', import.meta.url);
const start = Date.parse(process.argv[2] ?? '2026-12-01');
const days = Number(process.argv[3] ?? 30);
const startKey = new Date(start).toISOString().slice(0, 10);
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > 0 ? new Set(process.argv[onlyArg + 1]!.split(',')) : null;
const all = JSON.parse(readFileSync(FILE, 'utf8')) as DayEntry[];
const kept = ONLY ? all.filter((e) => !ONLY.has(e.date)) : all.filter((e) => e.date < startKey);

export interface DayEntry { date: string; seed: string; par: Partial<Record<Faction, number>>; curve: Partial<Record<Faction, number[]>>; tries: number }

const entries: DayEntry[] = [...kept];
const dates = ONLY ? [...ONLY].sort() : Array.from({ length: days }, (_, d) => new Date(start + d * 864e5).toISOString().slice(0, 10));
for (const date of dates) {
  for (let k = 0; k < 20; k++) {
    const seed = k === 0 ? date : `${date}#${k}`;
    const factions = ballotFor(date); // the Augurs only on days they can win the ballot
    const ev = evaluate(seed, date, factions);
    if (factions.every((f) => ev[f]!.ok) || k === 19) {
      entries.push({ date, seed, par: Object.fromEntries(factions.map((f) => [f, ev[f]!.par])), curve: Object.fromEntries(factions.map((f) => [f, ev[f]!.curve])), tries: k + 1 });
      break;
    }
    process.stderr.write(`${seed}: rejected (${factions.map((f) => ev[f]!.why).filter(Boolean).join('; ')})\n`);
  }
}
entries.sort((a, b) => a.date.localeCompare(b.date));
writeFileSync(FILE, JSON.stringify(entries, null, 1) + '\n');
process.stderr.write(`season.json: kept ${kept.length} days before ${startKey}, computed ${entries.length - kept.length}\n`);
