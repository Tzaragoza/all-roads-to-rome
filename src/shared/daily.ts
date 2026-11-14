// Which scenario belongs to a date: the season calendar maps a UTC date to a pre-validated
// seed and Caesar's score per faction. Dates outside the calendar fall back to the raw date.
import { Rng, generate } from './engine';
import type { Faction, Scenario } from './engine';
import season from './season.json';

type SeasonEntry = { date: string; seed: string; par: Partial<Record<Faction, number>>; curve?: Partial<Record<Faction, number[]>>; tries: number };
const SEASON: SeasonEntry[] = season as SeasonEntry[];

export const dateKey = (d: Date = new Date()) => d.toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  return dateKey(new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5));
}

export function prettyDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** `parCurve`: Caesar's score after each turn, then at dusk (null when not precomputed). */
export type Daily = { date: string; scenario: Scenario; par: number | null; parCurve: number[] | null };

/**
 * The scenario for `date`. `faction` (set by the previous day's vote) picks the Senate decree;
 * without it the seed's own default faction is used. The map is identical either way.
 */
export function dailyScenario(date: string = dateKey(), faction?: Faction): Daily {
  const entry = SEASON.find((e) => e.date === date);
  const seed = entry?.seed ?? date;
  const scenario = generate(seed, faction ? { faction, asOf: date } : { asOf: date });
  const f = scenario.decree.faction;
  return { date, scenario, par: entry?.par[f] ?? null, parCurve: entry?.curve?.[f] ?? null };
}

/** First day the Augurs can be on the ballot (the day being decided). */
export const AUGURS_SINCE = '2026-11-15';
/** Odds that the Augurs are on the ballot for a given day. */
export const AUGUR_ODDS = 1 / 6;
/**
 * Are the Augurs (a sealed third decree) on the ballot that decides `date`? Seeded by the date
 * alone (not the map), so the calendar can be built before a seed is chosen.
 */
export const augurBallot = (date: string): boolean => date >= AUGURS_SINCE && new Rng(`${date}/augur`).next() < AUGUR_ODDS;
/** The factions on the ballot that decides `date`. */
export const ballotFor = (date: string): Faction[] => (augurBallot(date) ? ['populares', 'optimates', 'augures'] : ['populares', 'optimates']);

/** Default faction of a date when nobody voted. */
export const defaultFaction = (date: string): Faction => dailyScenario(date).scenario.decree.faction;

/** The data stored on each daily post. */
export type DailyPostData = { date: string; faction: Faction };
