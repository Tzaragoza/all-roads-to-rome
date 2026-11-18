import { expect, test } from 'vitest';
import { SKIRMISHES, scenarioPrint, skirmishScenario } from './skirmish';

// One pass over the pool (300 maps): each scenario is generated once and checked for both properties.
test('the skirmish pool is well-formed, and no map changed under its Caesar score (content frozen at SKIRMISH_AS_OF)', () => {
  expect(SKIRMISHES.map((e) => e.id)).toEqual(SKIRMISHES.map((_, i) => i + 1));
  const changed: number[] = [];
  for (const e of SKIRMISHES) {
    const sc = skirmishScenario(e.seed, e.faction);
    if (scenarioPrint(sc) !== e.fp) changed.push(e.id); // the generated map (Aegyptus names are swapped after)
    expect(e.par).toBeGreaterThan(0);
    expect(e.curve.length).toBe(sc.rules.turns + 1);
    expect(e.curve.at(-1)).toBe(e.par);
    expect(sc.decree.faction).toBe(e.faction);
  }
  expect(changed, 'A skirmish map changed: content used by the pool must stay dated before SKIRMISH_AS_OF.').toEqual([]);
});
