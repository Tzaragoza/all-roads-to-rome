// Senate decree registry. Each decree is data: developer-tunable variables (`vars`), the
// player-facing text, a plain-language description of its intended effect on play, and the
// metric it is meant to move. `scripts/sim/decrees.ts` benchmarks every entry against a
// no-decree baseline and fails if a decree does not measurably change optimal play.
import type { DecreeKind, Faction, Rules } from './types';

/** Metrics measured on the solver's final state (see scripts/sim/decrees.ts). */
export type DecreeMetric =
  | 'longest' | 'legions' | 'garrisons' | 'hubs' | 'cuts' | 'towns' | 'leftover' | 'deepByT6' | 'townsByT4' | 'legionDepth' | 'metRate'
  | 'ports' | 'rough' | 'small' | 'minTribe' | 'deepest' | 'lost' | 'guarded' | 'frontierGarrisons' | 'roughGarrisons' | 'home'
  | 'smallByT4' | 'portsByT5' | 'roughByT5' | 'minTribeByT5' | 'roughRoads';

export type DecreeSpec = {
  kind: DecreeKind;
  faction: Faction;
  title: string;
  /** Developer variables. `param` is a threshold, `bonus` a flat or per-unit reward. */
  vars: { bonus: number; param: number | 'maxHop' | 'maxHop-1'; rules?: Partial<Rules> };
  /** Player-facing rule text; receives the resolved param. */
  text: (param: number) => string;
  /** What the decree does to how people play (shown on the vote, used in docs). */
  effect: string;
  /** Metric the decree must move, and in which direction, versus the no-decree baseline. */
  target: { metric: DecreeMetric; direction: 'up' | 'down' };
  /** First day (UTC) the decree can be drawn, and the first day it no longer can (see events.ts). */
  since?: string;
  retired?: string;
};

export const DECREES: DecreeSpec[] = [
  // ---- Populares: glory, reach, ambition
  {
    kind: 'triumph', faction: 'populares', title: 'Triumph at the frontier',
    vars: { bonus: 6, param: 3 },
    text: (p) => `At dusk, +6 glory for every legion standing at a town ${p}+ roads from the castra.`,
    effect: 'Pulls the legions forward: instead of guarding the trunk roads near the castra, they must end the day on the frontier. The core of the network is left to garrisons, or to luck.',
    target: { metric: 'legionDepth', direction: 'up' },
  },
  {
    kind: 'via', faction: 'populares', title: 'Via Militaris',
    vars: { bonus: 2, param: 0 },
    text: () => 'At dusk, +2 glory for every road in your longest unbroken road from the castra.',
    effect: 'Rewards long, winding roads: one serpentine route that threads through many towns beats a compact web. Long chains are full of single points of failure, so it pairs ambition with fragility.',
    target: { metric: 'longest', direction: 'up' },
  },
  {
    kind: 'marius', faction: 'populares', title: 'Marian reforms',
    vars: { bonus: 4, param: 0, rules: { recruitCost: 2, recruitCostStep: 1 } },
    text: () => 'Recruits are cheap today (2, then +1). At dusk, +4 glory for every legion still standing.',
    effect: 'An army day: legions are cheap and each one surviving to dusk pays. Favours many mobile legions over garrisons, and punishes losing them to sieges.',
    target: { metric: 'legions', direction: 'up' },
  },
  // ---- Populares, 2026-11-15
  {
    kind: 'panem', faction: 'populares', title: 'Panem et circenses', since: '2026-11-15',
    vars: { bonus: 0, param: 0, rules: { noTribute: true, baseIncome: 4 } },
    text: () => 'Bread and games, paid by the treasury: today towns pay no denarii, but the castra brings in 4 a turn instead of 2.',
    effect: 'A flat budget: reaching rich cities no longer pays for the next roads, so nothing is hoarded and every denarius goes straight to glory or defence.',
    target: { metric: 'leftover', direction: 'down' },
  },

  {
    kind: 'cursus', faction: 'populares', title: 'Cursus publicus', since: '2026-11-15',
    vars: { bonus: 0, param: 4, rules: { tempoRoads: { until: 4, early: -1, late: 1 } } },
    text: (p) => `The relay posts are built: roads cost 1 less through turn ${p}, and 1 more after it.`,
    effect: 'A race: the network must be laid out in the first four turns, when roads are cheap. Turns 5–10 are for defence.',
    target: { metric: 'townsByT4', direction: 'up' },
  },

  {
    kind: 'mare', faction: 'populares', title: 'Mare Nostrum', since: '2026-11-15',
    vars: { bonus: 3, param: 0 },
    text: () => 'Our sea: every turn, +3 glory for each supplied port (a town on the sea).',
    effect: 'The coast first: ports pay from the turn they join, so the network runs to the sea before it runs deep.',
    target: { metric: 'portsByT5', direction: 'up' },
  },

  {
    kind: 'montes', faction: 'populares', title: 'Into the hills', since: '2026-11-15',
    vars: { bonus: 2, param: 0, rules: { roughDiscount: 1 } },
    text: () => 'Forest and hill roads cost 1 less today, and every turn each supplied forest or hill town pays +2 glory.',
    effect: 'The rough country first: routes go through forests and hills early instead of around them.',
    target: { metric: 'roughByT5', direction: 'up' },
  },

  {
    kind: 'legatio', faction: 'populares', title: 'Embassies', since: '2026-11-15',
    vars: { bonus: 3, param: 0 },
    text: () => 'Every tribe must feel Rome: every turn, +3 glory for each supplied town in the tribe where you hold the fewest.',
    effect: 'Balance over greed: the weakest tribe sets the bonus every turn, so the network spreads into all tribes from the start.',
    target: { metric: 'minTribeByT5', direction: 'up' },
  },

  {
    kind: 'devotio', faction: 'populares', title: 'Legions on campaign', since: '2026-11-15',
    vars: { bonus: 4, param: 2, rules: { legionsShield: false } },
    text: (p) => `The legions march to war, not to guard: today they shield no road. Every turn, +4 glory for each legion standing ${p}+ roads out.`,
    effect: 'Troops stop defending: they campaign on the frontier for glory, and only garrisons protect the roads.',
    target: { metric: 'garrisons', direction: 'up' },
  },

  {
    kind: 'census', faction: 'populares', title: 'Census of Gaul', since: '2026-11-15',
    vars: { bonus: 3, param: 0, rules: { deepSurcharge: { hop: 3, extra: 2 } } },
    text: () => 'Count every household: roads reaching beyond 3 roads out cost +2 today. At dusk, +3 glory per supplied town.',
    effect: 'Wide instead of long: depth stops paying, so the network branches sideways instead of running one long road.',
    target: { metric: 'longest', direction: 'down' },
  },

  // ---- Optimates: order, consolidation, caution
  {
    kind: 'pax', faction: 'optimates', title: 'Pax Romana',
    vars: { bonus: 20, param: 5 },
    text: (p) => `Let no revolt or raid cut a single road all day, and supply ${p}+ towns at dusk.`,
    effect: 'A defensive day: every road a revolt touches must be shielded in time. Pushes players to expand only as far as their legions and garrisons can cover.',
    target: { metric: 'cuts', direction: 'down' },
  },
  {
    kind: 'nexus', faction: 'optimates', title: 'Fortified hubs',
    vars: { bonus: 3, param: 3 },
    text: (p) => `At dusk, +3 glory for every supplied town with ${p} or more of your roads.`,
    effect: 'Rewards dense, redundant networks: towns joined by several roads. Builds resilience (fewer single points of failure) at the cost of reach.',
    target: { metric: 'hubs', direction: 'up' },
  },
  {
    kind: 'peace', faction: 'optimates', title: 'No private armies',
    vars: { bonus: 3, param: 0, rules: { maxLegions: 1, garrisonCost: 3, garrisonCostStep: 2 } },
    text: () => 'Fearing civil war, the Senate forbids new legions. Garrisons are cheap (3, then +2); +3 glory each at dusk.',
    effect: 'One legion only: players must place it at a well-connected hub and lean on permanent garrisons. Shifts defence from mobility to fortification.',
    target: { metric: 'garrisons', direction: 'up' },
  },
  {
    kind: 'treasury', faction: 'optimates', title: 'Austerity',
    vars: { bonus: 2, param: 1, rules: { roadSurcharge: 1 } },
    text: () => 'Every road costs +1 today. At dusk, +2 glory for every denarius left in the treasury.',
    effect: 'A lean day: roads are dear and coin is glory. Players connect fewer, more valuable towns and weigh every road against saving.',
    target: { metric: 'towns', direction: 'down' },
  },
  // ---- Optimates, 2026-11-15
  {
    kind: 'censor', faction: 'optimates', title: "The Censor's audit", since: '2026-11-15',
    vars: { bonus: 4, param: 0 },
    text: () => 'At dusk, +4 glory for every supplied town whose roads are all shielded (a legion or garrison on it or next to it).',
    effect: 'Coverage over reach: every town should sit under a shield at dusk. Garrisons placed to cover clusters beat lone legions.',
    target: { metric: 'guarded', direction: 'up' },
  },
  {
    kind: 'limes', faction: 'optimates', title: 'Limes', since: '2026-11-15',
    vars: { bonus: 5, param: 0, rules: { garrisonDeal: { where: 'frontier', cost: 2 } } },
    text: () => 'Fortify the frontier: garrisons in frontier towns cost 2. At dusk, +5 glory for every garrisoned frontier town.',
    effect: 'A wall of forts along the mountains at the edge of the map: garrisons instead of troops, and the frontier first.',
    target: { metric: 'frontierGarrisons', direction: 'up' },
  },
  {
    kind: 'classis', faction: 'optimates', title: 'Classis', since: '2026-11-15',
    vars: { bonus: 2, param: 0, rules: { portsShield: true } },
    text: () => 'The fleet patrols the coast: supplied ports shield their roads like a legion. At dusk, +2 glory per supplied port.',
    effect: 'Ports defend themselves, so forts and troops are needed only inland: fewer garrisons, legions kept near home.',
    target: { metric: 'garrisons', direction: 'down' },
  },

  {
    kind: 'mos', faction: 'optimates', title: 'Mos maiorum', since: '2026-11-15',
    vars: { bonus: 3, param: 0, rules: { depthCap: { hop: 3, until: 7 } } },
    text: () => 'The ways of the ancestors: no road may reach beyond 3 roads out before turn 7. At dusk, +3 glory per supplied town within 3 roads.',
    effect: 'A slow, sure start: the first six turns fill in the core, and the push outward waits for the end of the day.',
    target: { metric: 'deepByT6', direction: 'down' },
  },

  {
    kind: 'castella', faction: 'optimates', title: 'Castella', since: '2026-11-15',
    vars: { bonus: 4, param: 0, rules: { garrisonDeal: { where: 'rough', cost: 2 } } },
    text: () => 'Forts on the heights: garrisons in forest and hill towns cost 2. At dusk, +4 glory for every garrisoned forest or hill town.',
    effect: 'The rough country becomes the shield: cheap forts on hills and in forests guard the network instead of legions.',
    target: { metric: 'roughGarrisons', direction: 'up' },
  },
  {
    kind: 'cincinnatus', faction: 'optimates', title: 'Cincinnatus', since: '2026-11-15',
    vars: { bonus: 7, param: 0 },
    text: () => 'Return to the plough: at dusk, +7 glory for every legion standing at the castra.',
    effect: 'Legions must come home by dusk: they defend early and leave the frontier to garrisons at the end.',
    target: { metric: 'home', direction: 'up' },
  },
  // ---- Augures (green): sealed decrees, revealed only after the vote. Each one overturns a rule of the game.
  {
    kind: 'saturnalia', faction: 'augures', title: 'Saturnalia', since: '2026-11-15',
    vars: { bonus: 0, param: 0, rules: { invertTerrain: true } },
    text: () => 'The world upside down: today plains cost 2 to cross, forests and hills 1.',
    effect: 'Every route turns over: the hills and forests you avoided become the highways, and the open plains the obstacle.',
    target: { metric: 'roughRoads', direction: 'up' },
  },

  {
    kind: 'lupercalia', faction: 'augures', title: 'Lupercalia', since: '2026-11-15',
    vars: { bonus: 4, param: 0 },
    text: () => 'The wolves feast with you: at dusk, +4 glory for every road the tribes cut today.',
    effect: 'Losses become gains: cheap roads are built to be cut, and shielding is often the wrong move.',
    target: { metric: 'cuts', direction: 'up' },
  },
  {
    kind: 'libri', faction: 'augures', title: 'Libri Sibyllini', since: '2026-11-15',
    vars: { bonus: 0, param: 0, rules: { eventLookahead: 10 } },
    text: () => "The Sibyl's books are opened: every event of the day is foretold from turn 1, but there are half as many again, and no garrison holds against them: only legions do.",
    effect: 'A perfect-information puzzle with mobile defence only: the whole day is known, and the legions must be in the right place at the right turn.',
    target: { metric: 'legions', direction: 'up' },
  },
  {
    kind: 'idus', faction: 'augures', title: 'Ides of March', since: '2026-11-15',
    vars: { bonus: 4, param: 6 },
    text: (p) => `Beware the conspirators: at the end of turn ${p}, every road of your most-connected town is cut, whatever guards it. At dusk, +4 glory per supplied town with at most 2 of your roads.`,
    effect: 'Hubs are a liability: the network spreads its connections so that no single town holds it together.',
    target: { metric: 'hubs', direction: 'down' },
  },

];

/** A faction's decrees as they stood on `date` (undefined = latest). Order matters: append only. */
export const decreesOf = (f: Faction, date?: string) =>
  DECREES.filter((d) => d.faction === f && (date === undefined ? d.retired === undefined : (d.since ?? '') <= date && (d.retired === undefined || date < d.retired)));
export const decreeSpec = (k: DecreeKind) => DECREES.find((d) => d.kind === k)!;
