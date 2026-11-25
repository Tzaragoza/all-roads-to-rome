import { expect, test } from 'vitest';
import { apply, gambitOffers, initialState, isOver, legalActions, Rng, yieldPerTurn } from '../../shared/engine';
import type { Action, State } from '../../shared/engine';
import { addDays, dailyScenario } from '../../shared/daily';
import { turnPayments } from './pay';

// Regression (2026-11-19): on a turn with a loan instalment due, the treasury counter rose by the towns' full
// income, then snapped back down to the real total (3 → 10 → 7). The payments must add up exactly, debts first.
test('the pay animation adds up to the real treasury, and never shows more than it will hold', () => {
  let instalments = 0;
  for (let k = 0; k < 30; k++) for (const f of ['populares', 'optimates'] as const) {
    const sc = dailyScenario(addDays('2026-11-16', k), f).scenario, rng = new Rng(`pay/${k}/${f}`);
    let s: State = initialState(sc);
    while (!isOver(sc, s)) {
      const loan = gambitOffers(sc, s).find((i) => sc.events[i]!.kind === 'argentarii'); // take every loan
      const acts = legalActions(sc, s).filter((a) => a.type !== 'end');
      const a: Action = loan !== undefined ? { type: 'accept', event: loan } : acts.length && rng.next() < 0.75 ? acts[Math.floor(rng.next() * acts.length)]! : { type: 'end' };
      const before = s, y = a.type === 'end' ? yieldPerTurn(sc, s) : null;
      s = apply(sc, s, a);
      if (a.type !== 'end') continue;
      const { pays } = turnPayments(sc, before, s);
      const order = pays.slice().sort((p, q) => p.hop - q.hop); // as fxEndTurn plays them
      let shown = before.denarii, peak = shown;
      for (const p of order) { shown += p.denarii; peak = Math.max(peak, shown); }
      expect(shown).toBe(s.denarii);
      expect(peak).toBeLessThanOrEqual(Math.max(before.denarii, s.denarii));
      if (y!.purseDebt) {
        instalments++;
        expect(order[0]!.denarii).toBe(-y!.purseDebt);
      }
    }
  }
  expect(instalments).toBeGreaterThan(0); // the case that broke is covered
});
