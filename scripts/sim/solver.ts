// Par solver: beam search over whole-turn plans. Plans are produced by the heuristic
// policy with randomised parameters; each candidate is evaluated by greedy rollouts.
// The result is a lower bound on the optimum ("best found"), not a proof of optimality.
import { Rng, apply, gambitOffers, initialState, isOver } from '../../src/shared/engine';
import type { Action, Scenario, State } from '../../src/shared/engine';
import { BOTS, finalScore, playGame, playTurn, type Params } from './bots';

export interface SolveOptions { beam: number; plans: number; seed: string }
export interface Solution { score: number; actions: Action[]; state: State }

const key = (s: State) =>
  `${s.built.map(Number).join('')}|${s.garrison.map(Number).join('')}|${s.legions.slice().sort((a, b) => a - b).join(',')}|${s.denarii}|${s.glory}|${s.lost}|${s.burned}|${(s.accepted ?? []).join(',')}`;

function randomParams(rng: Rng): Params {
  return {
    value: 0.5 + rng.next(), depth: rng.next() * 1.5, risk: rng.next() * 2.5, guard: rng.next() * 2.5,
    recruit: rng.next() * 1.5, noise: rng.next() * 1.2, thrift: rng.next() * 1.0,
  };
}

export function solve(sc: Scenario, o: Partial<SolveOptions> = {}): Solution {
  const { beam = 12, plans = 12, seed = sc.seed + '/solver' } = o;
  const rng = new Rng(seed);
  const rollout = (s: State) => Math.max(
    finalScore(sc, playGame(sc, BOTS.forecast!, undefined, s)),
    finalScore(sc, playGame(sc, BOTS.reach!, undefined, s)),
  );
  let frontier: Array<{ state: State; log: Action[]; eval: number }> = [{ state: initialState(sc), log: [], eval: 0 }];
  let best: Solution | null = null;
  const fixed = Object.values(BOTS);
  while (frontier.length && !isOver(sc, frontier[0]!.state)) {
    const seen = new Map<string, { state: State; log: Action[]; eval: number }>();
    // Gambits: on an offer's own turn (the last moment to accept; accepting earlier changes nothing),
    // every node branches into "accepted" and "declined".
    const nodes = frontier.flatMap((node) => {
      let out = [node];
      for (const i of gambitOffers(sc, node.state)) {
        if (sc.events[i]!.turn !== node.state.turn) continue;
        out = out.flatMap((n) => [n, { state: apply(sc, n.state, { type: 'accept', event: i }), log: [...n.log, { type: 'accept' as const, event: i }], eval: n.eval }]);
      }
      return out;
    });
    for (const node of nodes) {
      for (let k = 0; k < plans; k++) {
        const p = k < fixed.length ? fixed[k]! : randomParams(rng);
        const log: Action[] = [];
        const s2 = playTurn(sc, node.state, p, rng, log);
        const kk = key(s2);
        if (seen.has(kk)) continue;
        const ev = rollout(s2);
        seen.set(kk, { state: s2, log: node.log.concat(log), eval: ev });
      }
    }
    frontier = [...seen.values()].sort((a, b) => b.eval - a.eval).slice(0, beam);
    for (const c of frontier) {
      if (isOver(sc, c.state)) {
        const sc2 = finalScore(sc, c.state);
        if (!best || sc2 > best.score) best = { score: sc2, actions: c.log, state: c.state };
      }
    }
  }
  return best!;
}
