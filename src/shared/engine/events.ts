// Event registry. Each event is data: an effect built from engine primitives, generation
// parameters, and the forecast text. Adding an event made of existing primitives needs no
// engine, generator or UI change: add an entry here, run the season generator, done.
// A genuinely new kind of effect needs a new primitive (EventEffect + its case in rules.ts).
//
// CONTENT IS DATED (see docs/11-content-versioning.md). A day only sees the entries that were
// live on that day, so adding, retiring or retuning an event never changes what an earlier day
// drew. Rules: a new entry gets `since` = the first day it may appear (never today or earlier);
// to retire one set `retired`; to retune `gen`, append to `tuning`. Never edit a live entry's
// `gen` or `effect` in place: the golden test (golden.test.ts) fails if a frozen day changes.
import type { EventEffect } from './types';

export type EventTone = 'threat' | 'hardship' | 'boon' | 'gambit';

export type EventSpec = {
  kind: string;
  title: string;
  /** threat = cuts roads (spaced out, budgeted); hardship = makes life costlier; boon = helps. */
  tone: EventTone;
  effect: EventEffect;
  gen: {
    weight: number; // relative chance of being picked within its tone
    minTurn: number; // earliest turn (threats need minTurn ≥ 2 so the 2-turn forecast warns first)
    maxTurn: number;
    maxPerDay: number;
    /** Rare events: at most one rare event per day, of any kind. */
    rare?: boolean;
  };
  /** Forecast line. `who` = tribe name; `town` = target town (boom only); `when` = "at the end of this turn". */
  text: (p: { who: string; town?: string; when: string }) => string;
  /** Plain-language effect, for docs and the rules sheet. */
  effectText: string;
  /** First day (UTC, YYYY-MM-DD) the event may be drawn. Absent = since the beginning. */
  since?: string;
  /** First day it may no longer be drawn. */
  retired?: string;
  /** Dated retunings of `gen`, oldest first; each applies from its `since` on. */
  tuning?: Array<{ since: string; gen: Partial<EventSpec['gen']> }>;
};

/** Is a dated entry live on `date`? Undefined date = "now": every non-retired entry. */
export const liveOn = (e: { since?: string; retired?: string }, date?: string): boolean =>
  date === undefined ? e.retired === undefined : (e.since ?? '') <= date && (e.retired === undefined || date < e.retired);

/** The event registry as it stood on `date`, with tunings applied (undefined = latest). */
export function eventsAsOf(date?: string, registry: EventSpec[] = EVENTS): EventSpec[] {
  return registry.filter((e) => liveOn(e, date)).map((e) => {
    const t = (e.tuning ?? []).filter((x) => date === undefined || x.since <= date);
    return t.length ? { ...e, gen: Object.assign({}, e.gen, ...t.map((x) => x.gen)) } : e;
  });
}

export const EVENTS: EventSpec[] = [
  // ---- threats: cut roads
  {
    kind: 'revolt', title: 'Revolt', tone: 'threat',
    effect: { type: 'cut', mode: 'all' },
    gen: { weight: 6, minTurn: 3, maxTurn: 10, maxPerDay: 4 },
    text: ({ who, when }) => `${who} revolt ${when}: every unshielded road touching their towns is cut.`,
    effectText: 'Cuts every unshielded built road touching the tribe. Cut roads are rubble for 2 turns.',
  },
  {
    kind: 'raid', title: 'Raiders', tone: 'threat',
    effect: { type: 'cut', mode: 'deepest' },
    gen: { weight: 3, minTurn: 2, maxTurn: 10, maxPerDay: 2 },
    text: ({ who, when }) => `${who} raiders strike ${when}: your deepest unshielded road in their lands is cut.`,
    effectText: 'Cuts the single unshielded built road touching the tribe that reaches farthest from the castra.',
  },
  {
    kind: 'bandits', title: 'Bandits', tone: 'threat', since: '2026-11-15',
    effect: { type: 'cut', mode: 'cheapest' },
    gen: { weight: 3, minTurn: 2, maxTurn: 10, maxPerDay: 2 },
    text: ({ who, when }) => `Bandits on the ${who} roads ${when}: your cheapest unshielded road in their lands is cut.`,
    effectText: 'Cuts the single cheapest unshielded built road touching the tribe: raiders go deep, bandits hit the trunk.',
  },
  {
    kind: 'pirates', title: 'Pirates', tone: 'threat', since: '2026-11-15',
    effect: { type: 'cut', mode: 'all', where: 'coast' },
    gen: { weight: 2, minTurn: 3, maxTurn: 10, maxPerDay: 1 },
    text: ({ who, when }) => `Pirates land on the ${who} coast ${when}: every unshielded road touching their <b>ports</b> is cut.`,
    effectText: "Cuts every unshielded built road touching the tribe's ports (towns on the sea). Inland towns are spared.",
  },
  {
    kind: 'germani', title: 'Germanic incursion', tone: 'threat', since: '2026-11-15',
    effect: { type: 'cut', mode: 'all', where: 'frontier' },
    gen: { weight: 2, minTurn: 3, maxTurn: 10, maxPerDay: 1 },
    text: ({ who, when }) => `Germanic warbands cross into ${who} lands ${when}: every unshielded road touching their <b>frontier</b> towns is cut.`,
    effectText: "Cuts every unshielded built road touching the tribe's frontier towns (by the mountains at the edge of the map). Towns away from the frontier are spared.",
  },
  {
    kind: 'druids', title: 'Druid uprising', tone: 'threat', since: '2026-11-15',
    effect: { type: 'cut', mode: 'all', pierce: 'garrison' },
    gen: { weight: 0.5, minTurn: 4, maxTurn: 10, maxPerDay: 1, rare: true },
    text: ({ who, when }) => `The druids raise the ${who} ${when}: every road touching their towns is cut unless a <b>legion</b> stands guard. Garrisons do not hold them.`,
    effectText: 'Like a revolt, but garrisons do not shield against it: only legions do.',
  },
  // ---- hardships: costlier, not destructive
  {
    kind: 'rains', title: 'Autumn rains', tone: 'hardship',
    effect: { type: 'toll', surcharge: 1, duration: 2 },
    gen: { weight: 1, minTurn: 2, maxTurn: 8, maxPerDay: 1 },
    text: ({ who, when }) => `Autumn rains in ${who} lands ${when}: roads touching their towns cost +1 for 2 turns.`,
    effectText: 'For the 2 turns after the event, roads touching the tribe cost 1 more denarius.',
  },
  {
    kind: 'famine', title: 'Famine', tone: 'hardship', since: '2026-11-15',
    effect: { type: 'yield', glory: 1, income: 0 },
    gen: { weight: 1, minTurn: 2, maxTurn: 9, maxPerDay: 1 },
    text: ({ who, when }) => `Famine among the ${who} ${when}: their supplied towns pay no denarii that turn (glory unchanged).`,
    effectText: "That turn, the tribe's supplied towns pay no denarii (glory unchanged).",
  },
  {
    kind: 'snows', title: 'Early snows', tone: 'hardship', since: '2026-11-15',
    effect: { type: 'toll', surcharge: 2, duration: 3, terrain: ['forest', 'hills'] },
    gen: { weight: 1, minTurn: 2, maxTurn: 8, maxPerDay: 1 },
    text: ({ who, when }) => `Snow in the ${who} hills and forests ${when}: forest and hill roads touching their towns cost +2 for 3 turns.`,
    effectText: 'For the 3 turns after the event, forest and hill roads touching the tribe cost 2 more denarii (plains are spared).',
  },
  {
    kind: 'levy', title: 'Grain shortage', tone: 'hardship', since: '2026-11-15',
    effect: { type: 'levy', surcharge: 2, duration: 3 },
    gen: { weight: 1, minTurn: 2, maxTurn: 8, maxPerDay: 1 },
    text: ({ who, when }) => `The ${who} granaries run short ${when}: legions and garrisons cost +2 for 3 turns.`,
    effectText: 'For the 3 turns after the event, recruiting a legion or building a garrison costs 2 more denarii.',
  },
  // ---- boons
  {
    kind: 'harvest', title: 'Harvest', tone: 'boon',
    effect: { type: 'yield', glory: 2, income: 2 },
    gen: { weight: 4, minTurn: 2, maxTurn: 10, maxPerDay: 2 },
    text: ({ who, when }) => `${who} harvest ${when}: their supplied towns pay double glory and denarii.`,
    effectText: "That turn, the tribe's supplied towns pay double glory and double denarii.",
  },
  {
    kind: 'tribute', title: 'Tribute', tone: 'boon',
    effect: { type: 'yield', glory: 1, income: 3 },
    gen: { weight: 2, minTurn: 2, maxTurn: 9, maxPerDay: 1 },
    text: ({ who, when }) => `${who} chieftains pledge tribute ${when}: their supplied towns pay triple denarii.`,
    effectText: "That turn, the tribe's supplied towns pay triple denarii (glory unchanged).",
  },
  {
    kind: 'silver', title: 'Silver vein', tone: 'boon',
    effect: { type: 'boom', value: 1 },
    gen: { weight: 2, minTurn: 2, maxTurn: 7, maxPerDay: 1 },
    text: ({ town, who, when }) => `Silver found at ${town} (${who}) ${when}: it becomes worth +1★ for the rest of the day.`,
    effectText: 'One town of the tribe gains +1★ permanently (more glory, and more denarii if it reaches 3★).',
  },
  {
    kind: 'caravan', title: 'Merchant caravan', tone: 'boon', since: '2026-11-15',
    effect: { type: 'purse', denarii: 4 },
    gen: { weight: 2, minTurn: 2, maxTurn: 9, maxPerDay: 1 },
    text: ({ who, when }) => `A merchant caravan crosses the ${who} lands ${when}: +4 denarii if any of their towns is supplied.`,
    effectText: 'At the end of that turn, +4 denarii if at least one town of the tribe is linked to the castra.',
  },
  {
    kind: 'alliance', title: 'Alliance', tone: 'boon', since: '2026-11-15',
    effect: { type: 'toll', surcharge: -1, duration: 2 },
    gen: { weight: 2, minTurn: 2, maxTurn: 8, maxPerDay: 1 },
    text: ({ who, when }) => `The ${who} seek an alliance ${when}: roads touching their towns cost 1 less for 2 turns.`,
    effectText: 'For the 2 turns after the event, roads touching the tribe cost 1 less (never below 1).',
  },
  {
    kind: 'veterans', title: 'Veterans settle', tone: 'boon', since: '2026-11-15',
    effect: { type: 'settle' },
    gen: { weight: 1, minTurn: 2, maxTurn: 8, maxPerDay: 1, rare: true },
    text: ({ town, who, when }) => `Veterans settle at ${town} (${who}) ${when}: if it is supplied then, it gets a free garrison.`,
    effectText: 'One town of the tribe gets a free garrison, if it is linked to the castra when the event comes.',
  },
  // ---- decree-made events (weight 0: never drawn; the Ides of March decree schedules it)
  {
    kind: 'idus', title: 'The conspirators', tone: 'threat', since: '2026-11-15',
    effect: { type: 'cut', mode: 'hub', pierce: 'all' },
    gen: { weight: 0, minTurn: 6, maxTurn: 6, maxPerDay: 1 },
    text: ({ when }) => `The conspirators strike ${when}: every road of your <b>most-connected town</b> is cut, whatever guards it.`,
    effectText: 'Only with the Ides of March decree: every road of your most-connected town is cut, legions and garrisons notwithstanding.',
  },
  // ---- gambits: offers. Nothing happens unless the player accepts; then each part is an event.
  {
    kind: 'publicani', title: 'Publicani', tone: 'gambit', since: '2026-11-15',
    effect: { type: 'gambit', parts: [
      { delay: 0, icon: 'tribute', effect: { type: 'yield', glory: 1, income: 3 }, text: 'the tax farmers squeeze them: their supplied towns pay triple denarii' },
      { delay: 1, icon: 'tribute', effect: { type: 'yield', glory: 1, income: 3 }, text: 'triple denarii again' },
      { delay: 3, icon: 'revolt', effect: { type: 'cut', mode: 'all' }, text: 'bled dry, they revolt: every unshielded road touching their towns is cut' },
    ] },
    gen: { weight: 2, minTurn: 2, maxTurn: 6, maxPerDay: 1 },
    text: ({ who, when }) => `Tax farmers offer to squeeze the ${who} ${when}: triple denarii from their towns for 2 turns, but they <b>revolt</b> 3 turns later.`,
    effectText: "Accept: the tribe's supplied towns pay triple denarii on the offer's turn and the next; 3 turns after the offer, the tribe revolts.",
  },
  {
    kind: 'oppidum', title: 'Oppidum', tone: 'gambit', since: '2026-11-15',
    effect: { type: 'gambit', parts: [
      { delay: 0, icon: 'silver', effect: { type: 'boom', value: 1 }, text: 'the town is fortified into an oppidum: +1★ for the rest of the day' },
      { delay: 0, icon: 'toll', effect: { type: 'toll', surcharge: 2, duration: 10 }, text: 'the works take every hand: roads touching the tribe cost +2 for the rest of the day' },
    ] },
    gen: { weight: 2, minTurn: 2, maxTurn: 6, maxPerDay: 1 },
    text: ({ town, who, when }) => `The ${who} offer to raise an oppidum at ${town} ${when}: it gains <b>+1★</b>, but roads touching their towns cost <b>+2 for the rest of the day</b>.`,
    effectText: 'Accept: one town of the tribe gains +1★ for the day; roads touching the tribe cost +2 for the rest of the day.',
  },
  {
    kind: 'frumentatio', title: 'Grain dole', tone: 'gambit', since: '2026-11-15',
    effect: { type: 'gambit', parts: [0, 1, 2].map((d) => ({ delay: d, icon: 'harvest', effect: { type: 'yield' as const, glory: 2, income: 0 }, text: d === 0 ? 'free grain: their supplied towns pay double glory and no denarii' : 'the dole goes on: double glory, no denarii' })) },
    gen: { weight: 2, minTurn: 2, maxTurn: 7, maxPerDay: 1 },
    text: ({ who, when }) => `Feed the ${who} at Rome's expense ${when}: for 3 turns their towns pay <b>double glory</b> but <b>no denarii</b>.`,
    effectText: "Accept: for 3 turns from the offer, the tribe's supplied towns pay double glory and no denarii.",
  },
  {
    kind: 'argentarii', title: 'Money-lenders', tone: 'gambit', since: '2026-11-15',
    effect: { type: 'gambit', parts: [
      { delay: 0, icon: 'caravan', effect: { type: 'purse', denarii: 8, always: true }, text: 'the argentarii lend you 8 denarii' },
      { delay: 3, icon: 'tribute', effect: { type: 'purse', denarii: -30, always: true }, text: 'the loan falls due: you repay 30 denarii, in debt if need be' },
    ] },
    gen: { weight: 2, minTurn: 4, maxTurn: 7, maxPerDay: 1 }, // later offers: early money compounds too much
    text: ({ who, when }) => `${who} money-lenders offer a loan ${when}: <b>+8 denarii now</b>, <b>30 to repay</b> 3 turns later.`,
    effectText: 'Accept: +8 denarii at the end of the offer\'s turn; 3 turns later you repay 30; if the treasury cannot cover it, it goes into debt and nothing can be bought until it recovers.',
  },

];

export const eventSpec = (kind: string) => EVENTS.find((e) => e.kind === kind);
