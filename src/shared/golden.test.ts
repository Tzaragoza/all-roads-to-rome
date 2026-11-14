import { expect, test } from 'vitest';
import golden from './golden.json';
import { DECREES, EVENTS, BUDGETS } from './engine';
import { fingerprint } from './fingerprint';

const days = (golden as { days: Record<string, Record<string, string>> }).days;

test('published days never change (content is dated; see docs/11-content-versioning.md)', () => {
  const changed: string[] = [];
  for (const [date, fp] of Object.entries(days))
    for (const [f, h] of Object.entries(fp)) if (fingerprint(date, f as 'populares' | 'optimates' | 'augures') !== h) changed.push(`${date} ${f}`);
  expect(changed, 'A frozen day changed. Give new content a `since` after the last frozen day instead of editing live entries.').toEqual([]);
});

test('dated content is well-formed', () => {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  for (const e of [...EVENTS, ...DECREES]) {
    for (const d of [e.since, e.retired]) if (d !== undefined) expect(d, e.kind).toMatch(iso);
  }
  for (const e of EVENTS) for (const t of e.tuning ?? []) expect(t.since, e.kind).toMatch(iso);
  expect(new Set(EVENTS.map((e) => e.kind)).size).toBe(EVENTS.length);
  expect(BUDGETS.map((b) => b.since)).toEqual(BUDGETS.map((b) => b.since).slice().sort());
});
