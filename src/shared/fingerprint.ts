// A short, stable fingerprint of everything a day's player sees: map, events, decree, rules.
// The golden test compares fingerprints of frozen days so that no content change can silently
// alter a day that has already been published.
import { cyrb128 } from './engine';
import type { Faction } from './engine';
import { dailyScenario } from './daily';

export const FACTIONS: Faction[] = ['populares', 'optimates', 'augures'];

export function fingerprint(date: string, faction: Faction): string {
  const { scenario } = dailyScenario(date, faction);
  return cyrb128(JSON.stringify(scenario)).map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('').slice(0, 16);
}
