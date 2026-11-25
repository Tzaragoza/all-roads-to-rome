import { expect } from 'vitest';
import { test } from '../test';
import { apply, initialState, isOver, legalActions, Rng } from '../../shared/engine';
import type { Action } from '../../shared/engine';
import { dailyScenario } from '../../shared/daily';
import { factionFor, submitResult } from './game';
import { modStats, recordActivity } from './stats';

async function playRandom(seed: string, date: string): Promise<Action[]> {
  const { scenario: sc } = dailyScenario(date, await factionFor(date));
  const rng = new Rng(seed);
  let s = initialState(sc);
  const log: Action[] = [];
  while (!isOver(sc, s)) { const acts = legalActions(sc, s); const a = rng.next() < 0.35 ? acts[acts.length - 1]! : rng.pick(acts); log.push(a); s = apply(sc, s, a); }
  return log;
}

test('moderator stats: opens and starts per day, logged-out sessions apart, players backfilled from leaderboards', async () => {
  const d1 = '2026-11-18', d2 = '2026-11-20', on = { today: d2, policy: 'flagged' as const };
  // 18 Nov, before activity was recorded: a finished game only (the leaderboard)
  await submitResult(d1, 'aulus', await playRandom('a', d1), { today: d1, policy: 'flagged' });
  // 20 Nov: brutus opens twice, starts and finishes; a logged-out visitor opens and starts; cassia only opens
  await recordActivity(d2, 'brutus', 'open', 'daily');
  await recordActivity(d2, 'brutus', 'open', 'daily');
  await recordActivity(d2, 'brutus', 'start', 'daily');
  await submitResult(d2, 'brutus', await playRandom('b', d2), on);
  await recordActivity(d2, undefined, 'open', 'daily');
  await recordActivity(d2, undefined, 'start', 'daily');
  await recordActivity(d2, undefined, 'finish', 'daily');
  await recordActivity(d2, 'cassia', 'open', 'daily');
  await recordActivity(d2, 'brutus', 'start', 'practice');

  const st = await modStats(d2);
  const day2 = st.days.find((d) => d.date === d2)!, day1 = st.days.find((d) => d.date === d1)!;
  expect([day2.opened, day2.started, day2.finished]).toEqual([2, 1, 1]); // people, not sessions
  expect(day2.sessions.open).toEqual({ in: 3, anon: 1 });
  expect(day2.sessions.finish).toEqual({ in: 0, anon: 1 });
  expect(day2.modes['practice:start']).toBe(1);
  expect([day1.opened, day1.finished]).toEqual([null, 1]); // before 19 Nov only finishes are known
  const names = st.players.map((p) => p.username).sort();
  expect(names).toEqual(['aulus', 'brutus', 'cassia']);
  const aulus = st.players.find((p) => p.username === 'aulus')!;
  expect(aulus.firstSeen).toBe(d1);
  expect(Object.keys(aulus.days)).toEqual([d1]);
  expect(st.players.find((p) => p.username === 'cassia')!.opened).toEqual([d2]);
});
