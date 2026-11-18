// Money-lenders sweep: which loan is "attractive with foresight, disadvantageous without"?
// For each (now, repay, after) the loan is injected into N maps (as in events.ts) and measured two ways:
//   Caesar (beam solver, sees the whole day): does he accept, and how much does the offer add?
//   A player without foresight (the forecast bot, who spends what it has): it accepts the moment the
//   offer appears and plays on as usual; compared with the same bot declining.
//   npx tsx scripts/sim/loan-sweep.ts <maps> <shard i> <shards n>   → tmp/loan-<i>.jsonl
import { appendFileSync, mkdirSync } from 'node:fs';
import { Rng, apply, checkAction, eventsAsOf, gambitOffers, generate, initialState, isOver, score } from '../../src/shared/engine';
import type { Action, EventSpec, GameEvent, Scenario, State } from '../../src/shared/engine';
import { solve } from './solver';
import { BOTS, playTurn } from './bots';

const MAPS = Number(process.argv[2] ?? 10), SHARD = Number(process.argv[3] ?? 0), SHARDS = Number(process.argv[4] ?? 1);
const BEAM = 12;
const seeds = Array.from({ length: MAPS }, (_, i) => `evbench-${i}`);
const base0 = eventsAsOf().find((e) => e.kind === 'argentarii')!;
/** `now` paid at once; then `repay` denarii per instalment, `after` instalments on the turns after the offer (INSTALMENTS=1). */
const STAGGER = process.env.INSTALMENTS === '1';
const loan = (now: number, repay: number, after: number): EventSpec => ({ ...base0, effect: { type: 'gambit', parts: [
  { delay: 0, now: true, icon: 'caravan', effect: { type: 'purse', denarii: now, always: true }, text: '' },
  ...(STAGGER
    ? Array.from({ length: after }, (_, k) => ({ delay: k + 1, icon: 'tribute', effect: { type: 'purse' as const, denarii: -repay, always: true }, text: '' }))
    : [{ delay: after, icon: 'tribute', effect: { type: 'purse' as const, denarii: -repay, always: true }, text: '' }]),
] } });

type Run = { par: number; log: Action[] };
function floor(sc: Scenario, cur: Run, other: Action[]): Run {
  let st = initialState(sc);
  for (const a of other) { if (checkAction(sc, st, a)) return cur; st = apply(sc, st, a); }
  return isOver(sc, st) && score(sc, st).total > cur.par ? { par: score(sc, st).total, log: other } : cur;
}
const run = (sc: Scenario, prev?: Action[]): Run => {
  const sol = solve(sc, { beam: BEAM, plans: BEAM });
  const own = { par: score(sc, sol.state).total, log: sol.actions };
  return prev ? floor(sc, own, prev) : own;
};
function inject(sc: Scenario, spec: EventSpec, seed: string): Scenario {
  const rng = new Rng(`${seed}/inject/${spec.kind}`);
  const lo = Math.max(spec.gen.minTurn, 2), hi = Math.min(spec.gen.maxTurn, sc.rules.turns - 1);
  const turn = lo + Math.floor((hi - lo) / 2);
  const ev: GameEvent = { turn, kind: spec.kind, tribe: rng.int(0, sc.tribes.length - 1), effect: spec.effect };
  return { ...sc, events: [...sc.events, ev].sort((a, b) => a.turn - b.turn) };
}
/** The forecast bot, optionally taking every loan the moment it is offered. */
function bot(sc: Scenario, take: boolean): number {
  let s: State = initialState(sc);
  while (!isOver(sc, s)) {
    if (take) for (const i of gambitOffers(sc, s)) s = apply(sc, s, { type: 'accept', event: i });
    s = playTurn(sc, s, BOTS.forecast!);
  }
  return score(sc, s).total;
}

const grid: Array<[number, number, number]> = [];
const GRID = process.env.GRID; // "now/repay/after,..." to test chosen points
if (GRID) for (const g of GRID.split(",")) grid.push(g.split("/").map(Number) as [number, number, number]);
else for (const now of [3, 4, 5, 6]) for (const repay of [now + 1, now + 2, 2 * now, 3 * now]) for (const after of [1, 2, 3]) grid.push([now, repay, after]);
mkdirSync('tmp', { recursive: true });
const base = seeds.map((seed) => { const sc = generate(seed); return { seed, sc, ...run(sc) }; });
grid.forEach(([now, repay, after], k) => {
  if (k % SHARDS !== SHARD) return;
  const spec = loan(now, repay, after);
  let dC = 0, acc = 0, dNaive = 0, naiveWorse = 0;
  for (const b of base) {
    const sc2 = inject(b.sc, spec, b.seed);
    const r = run(sc2, b.log);
    const b2 = floor(b.sc, b, r.log.filter((a) => a.type !== 'accept'));
    const gi = sc2.events.findIndex((e) => e.kind === 'argentarii');
    dC += r.par - b2.par; acc += r.log.some((a) => a.type === 'accept' && a.event === gi) ? 1 : 0;
    const d = bot(sc2, true) - bot(sc2, false);
    dNaive += d; naiveWorse += d < 0 ? 1 : 0;
  }
  const n = base.length;
  appendFileSync(`tmp/loan-${SHARD}.jsonl`, JSON.stringify({ now, repay, after, dCaesar: dC / n, accept: acc / n, dNaive: dNaive / n, naiveWorse: naiveWorse / n }) + '\n');
  process.stderr.write(`${now}/${repay}/${after} done\n`);
});
