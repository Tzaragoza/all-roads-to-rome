// Fingerprint of everything the rulebook (docs/rulebook.pdf) prints: rules, costs, event and
// decree texts, budgets, ballot odds, honours. `npm run docs:rulebook` stores it in docs/rulebook.stamp.json;
// rulebook.test.ts fails when the game changes and the rulebook was not regenerated.
import { cyrb128, DECREES, DEFAULT_RULES, budgetAsOf, eventsAsOf } from './engine';
import { AUGUR_ODDS } from './daily';
import { ACHIEVEMENTS } from './achievements';

export function rulebookInputs(): string {
  const who = 'the TRIBE', town = 'TOWN', when = 'WHEN';
  return JSON.stringify({
    rules: DEFAULT_RULES, budget: budgetAsOf(), augur: AUGUR_ODDS,
    events: eventsAsOf().map((e) => ({ k: e.kind, t: e.title, tone: e.tone, gen: e.gen, eff: e.effectText, txt: e.text({ who, town, when }) })),
    honours: ACHIEVEMENTS.map((a) => [a.id, a.name, a.tier, a.group, a.how, a.hidden ?? false]),
    decrees: DECREES.map((d) => ({ k: d.kind, f: d.faction, t: d.title, v: d.vars, txt: d.text(typeof d.vars.param === 'number' ? d.vars.param : 5), rule: d.rule(typeof d.vars.param === 'number' ? d.vars.param : 5), eff: d.effect })),
  });
}
export const rulebookStamp = () => cyrb128(rulebookInputs()).map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('');
