// Who paid what at the end of a turn, for the pay animation (fx.ts, fxEndTurn). Pure, so it is tested
// against the engine (pay.test.ts): the amounts must add up to the real change in the treasury and in glory.
import { purseAt, supplied, townGlory, townIncome, townValue, yieldMultipliers } from '../../shared/engine';
import type { Scenario, State } from '../../shared/engine';
import type { Payment } from './fx';

/**
 * The end of a turn as payments, in the order they are shown: debts first (loan instalments, as a negative
 * payment at the castra, hop −1), then the castra's own income (base income, caravans), then each supplied
 * town outwards. Debts go first so the treasury counter never climbs above the turn's final total.
 */
export function turnPayments(sc: Scenario, before: State, after: State): { pays: Payment[]; extraGlory: number } {
  const supA = supplied(sc, after), mult = yieldMultipliers(sc, before.turn, before);
  const towns: Payment[] = [];
  let g = 0, d = 0;
  for (const t of sc.towns) {
    if (t.id === sc.castra || !supA[t.id]) continue;
    const v = townValue(after, t), m = mult.get(t.tribe) ?? { glory: 1, income: 1 };
    const pg = Math.round(townGlory(sc, t, v) * m.glory), pd = Math.round(townIncome(sc, v) * m.income);
    towns.push({ town: t.id, glory: pg, denarii: pd, hop: t.hop }); g += pg; d += pd;
  }
  const dG = after.glory - before.glory, dD = after.denarii - before.denarii;
  const { debt } = purseAt(sc, before, supA);
  const pays: Payment[] = [];
  if (debt > 0) pays.push({ town: sc.castra, glory: 0, denarii: -debt, hop: -1 });
  // base income and caravans: whatever the towns and the debt do not explain, so the total is always exact
  const castra = dD - d + debt;
  if (castra !== 0) pays.push({ town: sc.castra, glory: 0, denarii: castra, hop: 0 });
  pays.push(...towns);
  return { pays, extraGlory: Math.max(0, dG - g) };
}
