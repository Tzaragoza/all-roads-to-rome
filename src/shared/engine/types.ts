export type TownId = number;
export type RoadId = number;
export type TribeId = number; // -1 = Roman castra (no tribe)
export type Terrain = 'plain' | 'forest' | 'hills';
/** Senate factions. The Augurs are a rare third option on the ballot, with a sealed decree. */
export type Faction = 'populares' | 'optimates' | 'augures';

export interface Town {
  id: TownId;
  name: string;
  x: number; // board units, see Scenario.width/height
  y: number;
  value: number; // 1..4 glory per turn while supplied
  tribe: TribeId;
  hop: number; // graph distance from castra on the candidate-road graph
  terrain: Terrain; // the land of this town's tile; a road costs the harder of its two tiles
}

export interface Road {
  id: RoadId;
  a: TownId;
  b: TownId;
  terrain: Terrain; // the harder of the two tiles it crosses
  cost: number;
}

export interface Tribe { id: TribeId; name: string }

/** Effect primitives. Events in events.ts are combinations of these. */
export type EventEffect =
  // cut unshielded roads touching the tribe: all of them, the one reaching deepest, or the cheapest.
  // `pierce: 'garrison'` = garrisons do not shield against this one (legions still do).
  // `where` limits it to roads touching the tribe's coastal (ports) or frontier towns.
  | { type: 'cut'; mode: CutMode; pierce?: 'garrison' | 'all'; where?: Shore }
  | { type: 'yield'; glory: number; income: number } // multiply the tribe's pay that turn
  // roads touching the tribe cost `surcharge` more (negative = cheaper, never below 1) for N turns;
  // `terrain` limits it to roads of that terrain
  | { type: 'toll'; surcharge: number; duration: number; terrain?: Terrain[] }
  | { type: 'boom'; value: number } // a town gains value permanently
  | { type: 'levy'; surcharge: number; duration: number } // recruits and garrisons cost more for N turns
  | { type: 'purse'; denarii: number; always?: boolean } // flat denarii if any town of the tribe is supplied (or always); negative = pay (the treasury may go into debt)
  | { type: 'settle' } // a free garrison in the event's town, if it is supplied then
  | { type: 'muster'; legions: number } // free legions at the castra
  // An offer: nothing happens unless the player accepts it (action 'accept'); then each part
  // becomes an event of its own, `delay` turns after the gambit's turn.
  | { type: 'gambit'; parts: GambitPart[] };

/** One consequence of an accepted gambit. `icon` picks the map art (an event kind); `text` is the forecast line. */
export interface GambitPart { delay: number; effect: EventEffect; icon: string; text: string }

/** `hub`: every road of your most-connected town (ignores the tribe). */
export type CutMode = 'all' | 'deepest' | 'cheapest' | 'hub';
export type Shore = 'coast' | 'frontier';

/** A scheduled event. `kind` refers to an EVENTS registry entry; `town` is set for boom events. */
export interface GameEvent {
  turn: number; kind: string; tribe: TribeId; town?: TownId; effect: EventEffect;
  /** Set on the parts of an accepted gambit (never stored in a scenario): the gambit's index and the part's line. */
  from?: number; note?: string;
}

export type DecreeKind =
  | 'triumph' | 'via' | 'marius' // populares: glory, reach, ambition
  | 'panem' | 'cursus' | 'mare' | 'montes' | 'legatio' | 'devotio' | 'census' // populares (2026-11-15)
  | 'pax' | 'nexus' | 'peace' | 'treasury' // optimates: order, consolidation, caution
  | 'censor' | 'limes' | 'classis' | 'mos' | 'castella' | 'cincinnatus' // optimates (2026-11-15)
  | 'saturnalia' | 'lupercalia' | 'libri' | 'idus' // augures: the sealed decrees
  | 'none'; // benchmark baseline only

export interface Decree {
  kind: DecreeKind;
  faction: Faction;
  title: string; // short name, e.g. "Via Militaris"
  text: string; // what the Senate asks, one sentence
  param: number; // threshold (reach, noLoss, treasury) or unused
  bonus: number; // flat bonus, or bonus per unit for per-unit decrees
  rules?: Partial<Rules>; // rule changes for the day (already merged into Scenario.rules)
}

export interface Rules {
  turns: number;
  startDenarii: number;
  baseIncome: number;
  tributeFrom: number; // supplied towns of value v >= tributeFrom pay (v - tributeFrom + 1) denarii per turn
  legionRange: number; // max roads a legion can march per turn
  maxLegions: number; // cap on legions alive (recruiting is refused at the cap)
  roadSurcharge: number; // added to every road's cost (decree modifier)
  legions: number; // starting legions (camped at the castra)
  recruitCost: number;
  recruitCostStep: number;
  garrisonCost: number;
  garrisonCostStep: number;
  rubbleTurns: number; // a road cut by a revolt cannot be rebuilt for this many turns
  siegeTurns: number; // turns a cut-off town/legion survives before burning/being lost
  lostLegionPenalty: number;
  eventLookahead: number; // events visible for turns [t, t+lookahead-1]
  // ---- decree hooks (absent = off)
  portsShield?: boolean; // supplied ports shield the roads touching them, like a legion
  depthCap?: { hop: number; until: number }; // before turn `until`, no road may reach a town more than `hop` roads out
  garrisonDeal?: { where: Shore | 'rough'; cost: number }; // garrisons there cost a flat `cost`
  roughDiscount?: number; // forest and hill roads cost this much less (never below 1)
  gloryMaxHop?: number; // towns farther than this from the castra pay no glory
  invertStars?: boolean; // glory paid = 5 − ★
  invertTerrain?: boolean; // terrain costs swap: plain 3, forest 2, hills 1 (Saturnalia)
  legionsShield?: boolean; // false: legions do not shield roads today
  tempoRoads?: { until: number; early: number; late: number }; // road cost change through turn `until`, then after
  noTribute?: boolean; // towns pay no denarii today (base income only)
  deepSurcharge?: { hop: number; extra: number }; // roads reaching beyond `hop` roads out cost `extra` more
}

export interface Scenario {
  version: 2;
  seed: string;
  width: number;
  height: number;
  rules: Rules;
  castra: TownId;
  towns: Town[];
  roads: Road[];
  tribes: Tribe[];
  events: GameEvent[];
  decree: Decree;
}

export interface TurnRecord {
  turn: number;
  cut: RoadId[]; // cut by revolts
  burned: TownId[]; // towns whose roads burned after a siege
  lostLegions: TownId[]; // where legions were lost
  glory: number;
  income: number;
  deepest: number; // max hop of a supplied town at the end of the turn
  towns: number; // supplied towns at the end of the turn
}

export interface State {
  turn: number; // 1-based; > rules.turns means game over
  denarii: number;
  built: boolean[]; // by RoadId
  legions: TownId[]; // position of each legion (castra = in reserve); lost legions are removed
  moved: boolean[]; // by legion index, reset each turn
  garrison: boolean[]; // by TownId
  siege: number[]; // by TownId; 0 = fine; k = turns left before the town burns
  rubble: number[]; // by RoadId; turns before a cut road can be rebuilt
  tolls: Array<{ tribe: TribeId; surcharge: number; until: number; terrain?: Terrain[] }>; // active road surcharges (through turn `until`)
  levies?: Array<{ surcharge: number; until: number }>;
  accepted?: number[]; // indices of accepted gambits in sc.events
  dGlory?: number; // glory earned so far from a per-turn decree (already in `glory`) // active surcharges on recruits and garrisons
  valueBonus: number[]; // by TownId; permanent value gained from events
  lost: number;
  glory: number;
  garrisons: number;
  recruited: number;
  burned: number;
  history: TurnRecord[];
}

export type Action =
  | { type: 'road'; road: RoadId }
  | { type: 'camp'; legion: number; town: TownId }
  | { type: 'garrison'; town: TownId }
  | { type: 'recruit' }
  | { type: 'accept'; event: number } // accept the gambit sc.events[event]
  | { type: 'end' };
