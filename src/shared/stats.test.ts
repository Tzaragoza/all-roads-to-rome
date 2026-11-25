import { expect, test } from 'vitest';
import { playerFacts, retention, toCsv } from './stats';
import type { DayStat, PlayerStat } from './stats';

const p = (over: Partial<PlayerStat>): PlayerStat => ({ username: 'u', firstSeen: '2026-11-18', lastPlayed: null, days: {}, opened: [], streak: 0, bestStreak: 0, runs: 0, beats: 0, decrees: 0, votes: 0, shares: 0, honours: 0, rivals: 0, skirmishMaps: 0, tutorial: '', demo: false, ...over });
const day = (date: string, par: number | null) => ({ date, par } as DayStat);

test('CSV for Excel: quotes cells with commas, quotes, semicolons or line breaks', () => {
  expect(toCsv([['a', 'b,c', 'say "hi"', null, 3, 'x;y']])).toBe('a,"b,c","say ""hi""",,3,"x;y"');
  expect(toCsv([['h'], ['1']])).toBe('h\r\n1');
});

test('player facts: finishes, % of Caesar, days since the last one, opened without finishing', () => {
  const f = playerFacts(p({ days: { '2026-11-18': 100, '2026-11-20': 300 }, opened: ['2026-11-20', '2026-11-21'] }), [day('2026-11-18', 200), day('2026-11-20', 200)], '2026-11-21');
  expect(f).toEqual({ finished: 2, lastFinished: '2026-11-20', daysSinceLast: 1, avgPct: 100, bestPct: 150, openedOnly: 1 });
});

test('next-day retention counts a return by finishing or by opening', () => {
  const ps = [p({ username: 'a', firstSeen: '2026-11-19', days: { '2026-11-20': 5 } }), p({ username: 'b', firstSeen: '2026-11-19', opened: ['2026-11-20'] }), p({ username: 'c', firstSeen: '2026-11-19' }), p({ username: 'd', firstSeen: '2026-11-18' })];
  expect(retention(ps, '2026-11-19', '2026-11-20')).toEqual({ cohort: 3, back: 2 });
});
