// Build the Skirmish pool offline: random seeds that pass the daily fairness checks, with
// Caesar's score and curve. Sharded so it can run on several cores:
//   npx tsx scripts/sim/skirmish.ts shard <i> <n> <candidates>   → tmp/skirmish-<i>.jsonl
//   npx tsx scripts/sim/skirmish.ts merge <count>                 → src/shared/skirmish.json
//   npx tsx scripts/sim/skirmish.ts refresh                       → re-solve maps a content revision changed (ids kept)
//   KIND=argentarii npx tsx scripts/sim/skirmish.ts refresh       → also re-solve every map drawing that event (KIND=gambit: any offer)
//   npx tsx scripts/sim/skirmish.ts egypt <count> [fromK]         → append Aegyptus maps to src/shared/skirmish-egypt.json (ids after the Gaul pool)
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { Rng } from '../../src/shared/engine';
import type { Faction } from '../../src/shared/engine';
import { SKIRMISH_AS_OF, egyptSeed, scenarioPrint, skirmishScenario, skirmishSeed } from '../../src/shared/skirmish';
import { evaluate } from './fairness';

const [mode, a, b, c] = process.argv.slice(2);
/** The decree faction of a skirmish map: Populares or Optimates, the Augures one time in six. */
export const skirmishFaction = (seed: string): Faction => {
  const x = new Rng(`${seed}/sk`).next();
  return x < 1 / 6 ? 'augures' : x < 7 / 12 ? 'populares' : 'optimates';
};

if (mode === 'shard') {
  const i = Number(a), n = Number(b), total = Number(c);
  const out = `tmp/skirmish-${i}.jsonl`;
  for (let k = i; k < total; k += n) {
    const seed = skirmishSeed(k), faction = skirmishFaction(seed);
    const v = evaluate(seed, SKIRMISH_AS_OF, [faction])[faction]!;
    if (v.ok) appendFileSync(out, JSON.stringify({ k, seed, faction, par: v.par, curve: v.curve, fp: scenarioPrint(skirmishScenario(seed, faction)) }) + '\n');
    else process.stderr.write(`${seed}: ${v.why}\n`);
  }
} else if (mode === 'refresh') {
  // a dated content revision changed some pool maps: re-solve them in place, keeping their ids
  // (players' best scores are stored per id). A map that now fails the fairness test is reported.
  const pool = JSON.parse(readFileSync('src/shared/skirmish.json', 'utf8')) as Array<{ id: number; seed: string; faction: Faction; par: number; curve: number[]; fp: string }>;
  let n = 0;
  for (const e of pool) {
    const fp = scenarioPrint(skirmishScenario(e.seed, e.faction));
    const force = process.env.KIND && skirmishScenario(e.seed, e.faction).events.some((x) => x.kind === process.env.KIND || (process.env.KIND === 'gambit' && x.effect.type === 'gambit'));
    if (fp === e.fp && !force) continue;
    const v = evaluate(e.seed, SKIRMISH_AS_OF, [e.faction])[e.faction]!;
    process.stderr.write(`#${e.id}: par ${e.par} -> ${v.par}${v.ok ? '' : ` (now ${v.why})`}\n`);
    Object.assign(e, { par: v.par, curve: v.curve, fp }); n++;
  }
  writeFileSync('src/shared/skirmish.json', JSON.stringify(pool) + '\n');
  process.stderr.write(`refreshed ${n} maps\n`);
} else if (mode === 'egypt') {
  // Aegyptus maps: the same generator and fairness test on their own seeds; the fingerprint is of the generated
  // map (names are swapped at load time, egypt.ts), so the content freeze covers them like the Gaul pool
  const want = Number(a ?? 1), gaul = JSON.parse(readFileSync('src/shared/skirmish.json', 'utf8')) as unknown[];
  const pool = JSON.parse(readFileSync('src/shared/skirmish-egypt.json', 'utf8')) as Array<{ id: number; seed: string }>;
  let k = Number(b ?? (pool.length ? Number(pool.at(-1)!.seed.split('/').pop()) + 1 : 0)), added = 0;
  while (added < want) {
    const seed = egyptSeed(k++), faction = skirmishFaction(seed);
    const v = evaluate(seed, SKIRMISH_AS_OF, [faction])[faction]!;
    if (!v.ok) { process.stderr.write(`${seed}: ${v.why}\n`); continue; }
    pool.push({ id: gaul.length + pool.length + 1, seed, faction, par: v.par, curve: v.curve, fp: scenarioPrint(skirmishScenario(seed, faction)), theme: 'egypt' } as never);
    added++; process.stderr.write(`#${gaul.length + pool.length} ${seed} ${faction}: Caesar ${v.par}\n`);
    writeFileSync('src/shared/skirmish-egypt.json', JSON.stringify(pool) + '\n');
  }
} else if (mode === 'merge') {
  const count = Number(a ?? 300);
  const rows = readdirSync('tmp').filter((f) => /^skirmish-\d+\.jsonl$/.test(f))
    .flatMap((f) => readFileSync(`tmp/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { k: number }))
    .sort((x, y) => x.k - y.k).slice(0, count);
  const pool = rows.map(({ k: _k, ...r }, idx) => ({ id: idx + 1, ...r }));
  writeFileSync('src/shared/skirmish.json', JSON.stringify(pool) + '\n');
  process.stderr.write(`skirmish.json: ${pool.length} maps\n`);
}
