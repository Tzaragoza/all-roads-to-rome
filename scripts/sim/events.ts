// Event benchmark: does each event change how the game is best played?
// For N maps, solve the day as generated (baseline), then the same day with one extra event of
// the kind under test injected on a fixed turn and tribe. Compare Caesar's score and plan.
// Pass rule: (1) the score moves in the event's direction on average (threats and hardships do not
// raise it, boons do not lower it), and (2) Caesar's plan changes (roads built, legion positions,
// garrisons or recruits at dusk) on at least MIN_CHANGED of maps: an event that never changes the
// best play is reading time for nothing. Writes docs/events-benchmark.md; exit 1 on any failure.
//   npm run sim:events -- [days=10] [beam=12]      EVENT=bandits npm run sim:events  (one event)
import { writeFileSync, mkdirSync } from 'node:fs';
import { EVENTS, Rng, apply, checkAction, generate, initialState, isOver, score, shores } from '../../src/shared/engine';
import type { Action, EventSpec, GameEvent, Scenario, State } from '../../src/shared/engine';
import { solve } from './solver';

const DAYS = Number(process.argv[2] ?? 10);
const BEAM = Number(process.argv[3] ?? 12);
const MIN_CHANGED = 0.4;
const ONLY = process.env.EVENT;

const seeds = Array.from({ length: DAYS }, (_, i) => `evbench-${i}`);
const plan = (sc: Scenario, st: State) => JSON.stringify({
  roads: sc.roads.filter((r) => st.built[r.id]).map((r) => r.id),
  legions: st.legions.slice().sort((a, b) => a - b), garrison: st.garrison.flatMap((g, i) => (g ? [i] : [])), recruited: st.recruited,
});
type Run = { par: number; plan: string; log: Action[] };
/** `cur`, or `other` replayed on `sc` if it is legal there and scores higher. */
function floor(sc: Scenario, cur: Run, other: Action[]): Run {
  let st = initialState(sc);
  for (const a of other) { if (checkAction(sc, st, a)) return cur; st = apply(sc, st, a); }
  return isOver(sc, st) && score(sc, st).total > cur.par ? { par: score(sc, st).total, plan: plan(sc, st), log: other } : cur;
}
function run(sc: Scenario, prev?: Action[]): Run {
  const sol = solve(sc, { beam: BEAM, plans: BEAM });
  const own: Run = { par: score(sc, sol.state).total, plan: plan(sc, sol.state), log: sol.actions };
  return prev ? floor(sc, own, prev) : own;
}

/** The same day with one event of `spec` added: turn in the middle of its window, a seeded tribe. */
function inject(sc: Scenario, spec: EventSpec, seed: string): Scenario {
  const rng = new Rng(`${seed}/inject/${spec.kind}`);
  const lo = Math.max(spec.gen.minTurn, 2), hi = Math.min(spec.gen.maxTurn, sc.rules.turns - 1);
  const threatTurns = new Set(sc.events.filter((e) => e.effect.type === 'cut').map((e) => e.turn));
  const turns = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k).filter((t) => spec.tone !== 'threat' || !threatTurns.has(t));
  const turn = turns.length ? turns[Math.floor(turns.length / 2)]! : lo;
  const w = spec.effect.type === 'cut' ? spec.effect.where : undefined;
  const ok = w ? [...new Set(sc.towns.filter((t) => t.id !== sc.castra && shores(sc)[w][t.id]).map((t) => t.tribe))] : sc.tribes.map((t) => t.id);
  const tribe = ok.length ? ok[rng.int(0, ok.length - 1)]! : 0;
  const ev: GameEvent = { turn, kind: spec.kind, tribe, effect: spec.effect };
  const f = spec.effect;
  if (f.type === 'boom' || f.type === 'settle' || (f.type === 'gambit' && f.parts.some((p) => p.effect.type === 'boom'))) {
    const c = sc.towns.filter((t) => t.tribe === tribe && t.id !== sc.castra);
    ev.town = c.length ? c.reduce((a, b) => (b.hop < a.hop ? b : a)).id : undefined; // the nearest: likely supplied
  }
  return { ...sc, events: [...sc.events, ev].sort((a, b) => a.turn - b.turn) };
}

const t0 = Date.now();
const base = seeds.map((seed) => { const sc = generate(seed); return { seed, sc, ...run(sc) }; });
const measure = (spec: EventSpec) => {
  const res = base.map((b) => {
    const sc2 = inject(b.sc, spec, b.seed);
    const r = run(sc2, b.log);
    const own = r.log.filter((a) => a.type !== 'accept'); // a plan with an accept is not legal on the baseline
    const b2 = floor(b.sc, b, own); // symmetric: the baseline may also do better with the other plan
    const gi = sc2.events.findIndex((e) => e.kind === spec.kind);
    const took = r.log.some((a) => a.type === 'accept' && a.event === gi);
    return { d: r.par - b2.par, changed: r.plan !== b2.plan || took, accepted: r.log.some((a) => a.type === 'accept' && a.event === gi) };
  });
  return { dPar: res.reduce((n, r) => n + r.d, 0) / res.length, changed: res.filter((r) => r.changed).length / res.length, accepted: res.filter((r) => r.accepted).length / res.length };
};
const TOL = 0, NEED = MIN_CHANGED;
type Row = { spec: EventSpec; dPar: number; changed: number; accepted: number; pass: boolean; why: string };
const ACCEPT = [0.15, 0.85]; // a gambit must be a real choice: Caesar takes it on some maps, not on others
const rows: Row[] = EVENTS.filter((e) => !ONLY || e.kind === ONLY).map((spec) => {
  const { dPar, changed, accepted } = measure(spec);
  const gambit = spec.tone === 'gambit';
  const dirOk = spec.tone === 'boon' || gambit ? dPar >= -TOL : dPar <= TOL;
  const why = [gambit && (accepted < ACCEPT[0] || accepted > ACCEPT[1]) && `Caesar accepts it on ${Math.round(100 * accepted)}% of maps (need ${ACCEPT[0] * 100}–${ACCEPT[1] * 100}%)`,!dirOk && `score moves the wrong way (${dPar >= 0 ? '+' : ''}${dPar.toFixed(1)})`, changed < NEED && `changes Caesar's plan on only ${Math.round(100 * changed)}% of maps (need ${Math.round(100 * NEED)}%)`].filter(Boolean).join('; ');
  process.stderr.write(gambit ? `  accepted ${Math.round(100 * accepted)}%\n` : '');
  process.stderr.write(`${spec.kind}: Δpar ${dPar.toFixed(1)}, plan changed ${Math.round(100 * changed)}%\n`);
  return { spec, dPar, changed, accepted, pass: !why, why };
});

const md = [
  '# Event benchmark',
  '',
  `Generated by \`scripts/sim/events.ts\` on ${new Date().toISOString().slice(0, 10)}: ${DAYS} maps, solver beam ${BEAM}×${BEAM}.`,
  `Each event is injected once into otherwise unchanged days (middle of its turn window, a seeded tribe) and the day re-solved.`,
  '',
  `**Both sides take the better plan.** The beam search is myopic: an extra event can steer it to a worse plan even when the old one is still available (a free garrison looked harmful, a grain shortage looked helpful). So on each side Caesar plays the better of his own solve and the other side's plan replayed, when that plan is legal there.`,
  '',
  `**Pass rule.** Caesar's score moves in the event's direction on average (threats and hardships do not raise it, boons do not lower it), and his plan at dusk changes on ≥ ${Math.round(100 * NEED)}% of maps.`,
  '',
  `**Gambits** (offers) must also be a real choice: Caesar accepts on ${ACCEPT[0] * 100}–${ACCEPT[1] * 100}% of maps, and declines on the rest. Their score can only rise (declining is free).`,
  '',
  '| event | tone | since | Δ Caesar score | plan changed | Caesar accepts | verdict |',
  '|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.spec.title} (\`${r.spec.kind}\`) | ${r.spec.tone}${r.spec.gen.rare ? ', rare' : ''} | ${r.spec.since ?? 'launch'} | ${r.dPar >= 0 ? '+' : ''}${r.dPar.toFixed(1)} | ${Math.round(100 * r.changed)}% | ${r.spec.tone === 'gambit' ? `${Math.round(100 * r.accepted)}%` : '–'} | ${r.pass ? 'PASS' : `FAIL: ${r.why}`} |`),
  '',
].join('\n');
mkdirSync('docs', { recursive: true });
if (!ONLY) writeFileSync('docs/events-benchmark.md', md);
console.log(md);
console.log(`${rows.filter((r) => r.pass).length}/${rows.length} events pass · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (rows.some((r) => !r.pass)) process.exit(1);
