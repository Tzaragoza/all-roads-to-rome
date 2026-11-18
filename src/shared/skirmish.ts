// Skirmish: a pool of pre-validated random maps, unlocked once today's campaign is played.
// Each map passed the same fairness checks as a daily (scripts/sim/skirmish.ts) and carries
// Caesar's score. Content is frozen at SKIRMISH_AS_OF so a map never changes under its par.
import { cyrb128, generate } from './engine';
import type { Faction, Scenario } from './engine';
import { egyptize } from './egypt';
import egyptPool from './skirmish-egypt.json';
import pool from './skirmish.json';

/** theme 'egypt': an Aegyptus map (Egyptian names and art; same generator and rules). */
export type SkirmishEntry = { id: number; seed: string; faction: Faction; par: number; curve: number[]; fp: string; theme?: 'egypt' };
export const SKIRMISH_AS_OF = '2026-11-16';
export const SKIRMISHES: SkirmishEntry[] = [...(pool as SkirmishEntry[]), ...(egyptPool as SkirmishEntry[])];

export const skirmishSeed = (k: number) => `skirmish/${k}`;
export const egyptSeed = (k: number) => `skirmish/eg/${k}`;
export function skirmishScenario(seed: string, faction: Faction, theme?: 'egypt'): Scenario {
  const sc = generate(seed, { faction, asOf: SKIRMISH_AS_OF });
  return theme === 'egypt' ? egyptize(sc) : sc;
}
export const scenarioPrint = (sc: Scenario) => cyrb128(JSON.stringify(sc)).map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('').slice(0, 16);

export type Skirmish = { entry: SkirmishEntry; scenario: Scenario };
export function skirmish(id: number): Skirmish | null {
  const entry = SKIRMISHES.find((e) => e.id === id);
  return entry ? { entry, scenario: skirmishScenario(entry.seed, entry.faction, entry.theme) } : null;
}
