import { expect, test } from 'vitest';
import { apply, checkAction, initialState, protectedTowns, supplied } from '../../shared/engine';
import type { Action, State } from '../../shared/engine';
import { roadBetween as R, STEPS, TUTORIAL as sc } from './tutorial';

/** Play the tutorial's intended script on the real engine; every step must be legal and on cue. */
test('the tutorial script is legal and every lesson happens on cue', () => {
  let s: State = initialState(sc);
  const act = (a: Action) => { expect(checkAction(sc, s, a)).toBe(null); s = apply(sc, s, a); };
  const step = (id: string) => STEPS.find((x) => x.id === id)!;
  const allowed = (id: string, a: Action) => step(id).allow?.(a) ?? false;

  expect(allowed('road1', { type: 'road', road: R(0, 1) })).toBe(true);
  act({ type: 'road', road: R(0, 1) });
  act({ type: 'road', road: R(1, 3) });
  act({ type: 'end' });
  expect(s.turn).toBe(2);
  // the lessons on money and the decree quote these numbers
  expect(s.denarii).toBe(8 - 1 - 2 + 2 + 1);
  expect(s.history[0]!.glory).toBe(1 + 3 + 3); // Aquae + Lutetia + Embassies (1 Aedui, 1 Remi)
  expect(s.dGlory).toBe(3);
  // the revolt is on the forecast now (end of turn 3)
  expect(sc.events[0]!.turn).toBe(3);
  act({ type: 'camp', legion: 0, town: 3 });
  act({ type: 'road', road: R(3, 4) });
  act({ type: 'road', road: R(4, 5) });
  expect(protectedTowns(sc, s)[3]).toBe(true);
  act({ type: 'end' });
  act({ type: 'end' }); // the revolt strikes
  const rec = s.history[2]!;
  expect(rec.cut).toEqual([R(4, 5)]); // only the exposed road falls
  expect(supplied(sc, s)[5]).toBe(false); // Alesia is lost...
  expect(s.rubble[R(4, 5)]).toBeGreaterThan(0);
  act({ type: 'road', road: R(3, 5) }); // ...and won back by another route
  expect(supplied(sc, s)[5]).toBe(true);
  expect(STEPS.every((x) => x.text.length < 260)).toBe(true);
  expect(STEPS.map((x) => x.id)).toEqual(expect.arrayContaining(['income', 'decree', 'vote'])); // one short paragraph per step
});
