// Decree benchmark: does each decree change how the game is best played?
// For N days, solve the map with no decree (baseline) and with each decree, then compare the
// solver's final states on the decree's target metric. Writes docs/decrees-benchmark.md and
// exits with code 1 if any decree fails to move its target.
//   npx tsx scripts/sim/decrees.ts [days=12] [beam=16]
import { writeFileSync, mkdirSync } from 'node:fs';
import { DECREES, Rng, apply, initialState, generate, hubs, longestRoad, protectedTowns, score, shores, suppliedTowns, townValue } from '../../src/shared/engine';
import { BOTS, finalScore, playGame, randomGame } from './bots';
import type { Action, DecreeKind, DecreeMetric, DecreeSpec, Faction, Scenario, State } from '../../src/shared/engine';
import { solve } from './solver';

const DAYS = Number(process.argv[2] ?? 12);
const BEAM = Number(process.argv[3] ?? 16);
const MIN_SHIFT = 0.2; // a decree must move its target metric by at least 20% vs baseline
const MAX_MET_RATE = 0.8; // or, for race-type decrees, be missed by the best play at least 20% of days
// Not trivial, not impossible (averages over maps):
const PAR_RANGE = [0.75, 1.6]; // Caesar's score with the decree, relative to no decree
const MIN_SKILL_GAP = 0.08; // the forecast bot must stay ≥ 8 points (of par) below Caesar: skill still matters
const MAX_RANDOM = 0.35; // random play must stay ≤ 35% of Caesar
const MIN_MET = 0.3; // Caesar earns the decree's bonus on ≥ 30% of maps (decrees with a bonus)
const MAX_BONUS_SHARE = 0.45; // the decree's bonus is ≤ 45% of Caesar's score: the day is still about roads

type Metrics = Record<DecreeMetric | 'par' | 'bot' | 'rand' | 'bonusShare', number>;

function measure(sc: Scenario, st: State, actions: Action[]): Metrics {
  const b = score(sc, st), held = suppliedTowns(sc, st), sh = shores(sc), pr = protectedTowns(sc, st);
  return {
    par: b.total,
    longest: longestRoad(sc, st),
    legions: st.legions.length,
    garrisons: st.garrisons,
    hubs: hubs(sc, st, 3).length,
    cuts: st.history.reduce((n, h) => n + h.cut.length, 0),
    towns: suppliedTowns(sc, st).length,
    leftover: st.denarii,
    deepByT6: Math.max(0, ...st.history.filter((h) => h.turn <= 6).map((h) => h.deepest)),
    townsByT4: st.history.find((h) => h.turn === 4)?.towns ?? 0,
    legionDepth: st.legions.length ? st.legions.reduce((n, t) => n + sc.towns[t]!.hop, 0) / st.legions.length : 0,
    metRate: b.decreeMet ? 1 : 0,
    ports: held.filter((t) => sh.coast[t]).length,
    rough: held.filter((t) => sc.towns[t]!.terrain !== 'plain').length,
    small: held.filter((t) => townValue(st, sc.towns[t]!) <= 2).length,
    minTribe: Math.min(...sc.tribes.map((tr) => held.filter((t) => sc.towns[t]!.tribe === tr.id).length)),
    deepest: Math.max(0, ...held.map((t) => sc.towns[t]!.hop)),
    lost: st.lost,
    guarded: held.filter((t) => pr[t]).length,
    frontierGarrisons: held.filter((t) => sh.frontier[t] && st.garrison[t]).length,
    roughGarrisons: held.filter((t) => st.garrison[t] && sc.towns[t]!.terrain !== 'plain').length,
    home: st.legions.filter((t) => t === sc.castra).length,
    bot: 0, rand: 0, bonusShare: b.total > 0 ? b.decree / b.total : 0,
    roughRoads: sc.roads.filter((r) => st.built[r.id] && r.terrain !== 'plain').length,
    ...timing(sc, actions),
  };
}

/** What Caesar held at the end of turns 4 and 5 (replaying his plan): measures *when*, not just what. */
function timing(sc: Scenario, actions: Action[]) {
  let s = initialState(sc);
  const at: Record<number, number[]> = {};
  for (const a of actions) { s = apply(sc, s, a); if (a.type === 'end') at[s.turn - 1] = suppliedTowns(sc, s); }
  const h4 = at[4] ?? [], h5 = at[5] ?? [], sh = shores(sc);
  return {
    smallByT4: h4.filter((t) => sc.towns[t]!.value <= 2).length,
    portsByT5: h5.filter((t) => sh.coast[t]).length,
    roughByT5: h5.filter((t) => sc.towns[t]!.terrain !== 'plain').length,
    minTribeByT5: Math.min(...sc.tribes.map((tr) => h5.filter((t) => sc.towns[t]!.tribe === tr.id).length)),
  };
}

const avg = (xs: Metrics[]): Metrics => {
  const out = {} as Metrics;
  for (const k of Object.keys(xs[0]!) as Array<keyof Metrics>) out[k] = xs.reduce((s, x) => s + x[k], 0) / xs.length;
  return out;
};

const seeds = Array.from({ length: DAYS }, (_, i) => `bench-${i}`);
const run = (kind: DecreeKind, faction: Faction) =>
  avg(seeds.map((seed) => {
    const sc = generate(seed, { faction, decreeKind: kind });
    const sol = solve(sc, { beam: BEAM, plans: BEAM });
    const m = measure(sc, sol.state, sol.actions);
    const rr = new Rng(`${seed}/bench-random`);
    m.bot = m.par > 0 ? finalScore(sc, playGame(sc, BOTS.forecast!)) / m.par : 0;
    m.rand = m.par > 0 ? Array.from({ length: 5 }, () => finalScore(sc, randomGame(sc, rr))).reduce((a, x) => a + x, 0) / 5 / m.par : 0;
    return m;
  }));

const t0 = Date.now();
const base = run('none', 'populares');
type Row = { spec: DecreeSpec; m: Metrics; shift: number; pass: boolean; verdict: string };
const ONLY = process.env.DECREE?.split(','); // e.g. DECREE=via,mare to benchmark some decrees
const rows: Row[] = DECREES.filter((d) => !ONLY || ONLY.includes(d.kind)).map((spec) => {
  const m = run(spec.kind, spec.faction);
  process.stderr.write(`${spec.kind} done\n`);
  const { metric, direction } = spec.target;
  let shift: number, pass: boolean, verdict: string;
  if (metric === 'metRate') {
    shift = m.metRate;
    pass = m.metRate <= MAX_MET_RATE;
    verdict = `best play meets it on ${Math.round(100 * m.metRate)}% of days`;
  } else {
    const b = base[metric], v = m[metric];
    shift = b === 0 ? (v === 0 ? 0 : Infinity) : (v - b) / b;
    pass = direction === 'up' ? shift >= MIN_SHIFT : shift <= -MIN_SHIFT;
    verdict = `${metric} ${b.toFixed(1)} → ${v.toFixed(1)} (${shift >= 0 ? '+' : ''}${Math.round(100 * shift)}%)`;
  }
  // not trivial, not impossible
  const rel = m.par / base.par, gap = 1 - m.bot, hasBonus = spec.vars.bonus > 0;
  const issues = [
    (rel < PAR_RANGE[0] || rel > PAR_RANGE[1]) && `Caesar's score ×${rel.toFixed(2)} vs no decree (allowed ${PAR_RANGE[0]}–${PAR_RANGE[1]})`,
    gap < MIN_SKILL_GAP && `trivial: the forecast bot reaches ${Math.round(100 * m.bot)}% of Caesar`,
    m.rand > MAX_RANDOM && `trivial: random play reaches ${Math.round(100 * m.rand)}% of Caesar`,
    hasBonus && metric !== 'metRate' && m.metRate < MIN_MET && `near-impossible: Caesar earns the bonus on ${Math.round(100 * m.metRate)}% of maps`,
    m.bonusShare > MAX_BONUS_SHARE && `the bonus is ${Math.round(100 * m.bonusShare)}% of Caesar's score`,
  ].filter(Boolean) as string[];
  if (issues.length) { pass = false; verdict += `; ${issues.join('; ')}`; }
  verdict += ` · par ×${rel.toFixed(2)}, bot ${Math.round(100 * m.bot)}%, random ${Math.round(100 * m.rand)}%, bonus met ${Math.round(100 * m.metRate)}%, bonus share ${Math.round(100 * m.bonusShare)}%`;
  return { spec, m, shift, pass, verdict };
});

const cols: Array<keyof Metrics> = ['par', 'bot', 'rand', 'towns', 'townsByT4', 'smallByT4', 'portsByT5', 'roughByT5', 'minTribeByT5', 'roughRoads', 'deepest', 'small', 'ports', 'rough', 'minTribe', 'legionDepth', 'home', 'lost', 'longest', 'legions', 'garrisons', 'guarded', 'frontierGarrisons', 'roughGarrisons', 'hubs', 'cuts', 'leftover', 'metRate'];
const fmt = (m: Metrics) => cols.map((c) => (c === 'metRate' || c === 'bot' || c === 'rand' ? `${Math.round(100 * m[c])}%` : m[c].toFixed(1))).join(' | ');
const md = [
  '# Decree benchmark',
  '',
  `Generated by \`scripts/sim/decrees.ts\` on ${new Date().toISOString().slice(0, 10)}: ${DAYS} maps, solver beam ${BEAM}×${BEAM}.`,
  `Each decree is compared with the same maps played with no decree. Pass rule: the target metric moves ≥ ${MIN_SHIFT * 100}% in the intended direction (race decrees: best play misses it on ≥ ${Math.round((1 - MAX_MET_RATE) * 100)}% of days).`,
  '',
  `**Not trivial, not impossible.** Also required: Caesar's score stays within ×${PAR_RANGE[0]}–${PAR_RANGE[1]} of the no-decree score; the forecast bot stays ≥ ${MIN_SKILL_GAP * 100} points of par below Caesar and random play ≤ ${MAX_RANDOM * 100}% of Caesar (skill still matters); Caesar earns the bonus on ≥ ${MIN_MET * 100}% of maps; the bonus is ≤ ${MAX_BONUS_SHARE * 100}% of his score.`,
  '',
  ...rows.flatMap(({ spec, verdict, pass }) => [
    `## ${spec.title} (${spec.faction}, \`${spec.kind}\`) ${pass ? 'PASS' : 'FAIL'}`,
    '',
    `*Rule:* ${spec.text(typeof spec.vars.param === 'number' ? spec.vars.param : spec.vars.param === 'maxHop' ? 6 : 5)}`,
    '',
    `*Effect on players:* ${spec.effect}`,
    '',
    `*Evidence:* ${verdict}.`,
    '',
    `*Developer variables:* \`${JSON.stringify(spec.vars)}\``,
    '',
  ]),
  '## Metrics (averages over maps)',
  '',
  `| decree | ${cols.join(' | ')} |`,
  `|---|${cols.map(() => '---').join('|')}|`,
  `| *no decree* | ${fmt(base)} |`,
  ...rows.map(({ spec, m }) => `| ${spec.title} | ${fmt(m)} |`),
  '',
  'par = solver score · bot / rand = forecast bot and random play as a share of par · deepest = farthest supplied town (hops) · small = supplied 1–2★ towns · ports / rough = supplied ports / forest-or-hill towns · minTribe = supplied towns in the weakest tribe · home = legions at the castra at dusk · lost = legions lost · guarded = supplied towns whose roads are all shielded · towns = supplied at dusk · longest = longest road from the castra · hubs = towns with ≥3 roads · cuts = roads cut by revolts and raids all day · leftover = denarii at dusk · townsByT4 = towns supplied at the end of turn 4 · legionDepth = average distance of legions from the castra at dusk · metRate = share of days the solver meets the decree.',
  '',
].join('\n');

mkdirSync('docs', { recursive: true });
if (!ONLY) writeFileSync('docs/decrees-benchmark.md', md);
console.log(md);
console.log(`\n${rows.filter((r) => r.pass).length}/${rows.length} decrees pass · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (rows.some((r) => !r.pass)) process.exit(1);
