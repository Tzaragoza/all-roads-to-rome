import { expect, test } from 'vitest';
import { EVENTS } from './engine/events';
import { TOWN_NAMES, TRIBE_NAMES } from './engine/names';
import { EGYPT_TOWNS, EGYPT_TRIBES, egyptText, egyptize } from './egypt';
import { generate } from './engine';

// The skin's words are applied to the live page by a DOM pass that also sees its own output:
// every rule must be idempotent, or a text grows forever (it happened: "shields and spears").
test('Aegyptus words: idempotent on every event text, and they reach the Gallic words', () => {
  const ctx = { who: 'Nobatae', when: 'next turn', town: 'Memphis' } as never;
  const texts = EVENTS.flatMap((e) => [e.title, e.effectText, e.text(ctx), ...(e.revisions ?? []).flatMap((r) => [r.text?.(ctx) ?? '', r.effectText ?? ''])]);
  texts.push('shields and spears on the frontier', 'snowflakes: forest and hill roads', 'Rains', 'golden sickles on the tiles', 'March on Gaul');
  for (const t of texts) { const once = egyptText(t); expect(egyptText(once), t).toBe(once); }
  expect(egyptText('Germanic incursion')).toBe('Nubian incursion');
  expect(egyptText('March on Gaul')).toBe('March on Egypt');
});

test('Aegyptus names: one-for-one, distinct, about the same length; the map itself is untouched', () => {
  const towns = TOWN_NAMES.map((n) => EGYPT_TOWNS[n]), tribes = TRIBE_NAMES.map((n) => EGYPT_TRIBES[n]);
  expect(new Set(towns).size).toBe(TOWN_NAMES.length);
  expect(new Set(tribes).size).toBe(TRIBE_NAMES.length);
  TOWN_NAMES.forEach((n) => expect(Math.abs(EGYPT_TOWNS[n].length - n.length), n).toBeLessThanOrEqual(3));
  const sc = generate('skirmish/eg/1', { faction: 'optimates', asOf: '2026-11-16' }), eg = egyptize(sc);
  expect(eg.roads).toEqual(sc.roads);
  expect(eg.events).toEqual(sc.events);
  expect(eg.towns.map((t) => ({ ...t, name: '' }))).toEqual(sc.towns.map((t) => ({ ...t, name: '' })));
});
