import { expect } from 'vitest';
import { test } from '../test';
import { BugLimit, listBugs, newBugCount, setBugStatus, submitBug } from './bugs';
import { BUG_LIMITS } from '../../shared/bugs';
import type { BugContext } from '../../shared/bugs';

const ctx: BugContext = { version: 'v0.0.6', day: '2026-11-21', mode: 'daily', view: 'map', skirmish: null, skin: 'gaul', turn: 6, denarii: 19, glory: 80, screen: '390x844@3', agent: 'test', actions: [{ type: 'end' }] };

test('bug reports: stored newest first, counted until marked done, limited per player and per day', async () => {
  const a = await submitBug('aulus', 'Gold goes to 21 then 19', ctx, '2026-11-21', 1000);
  const b = await submitBug(undefined, 'Button overlaps the map', { ...ctx, actions: null }, '2026-11-21', 2000);
  const list = await listBugs();
  expect(list.map((r) => r.id)).toEqual([b, a]);
  expect(list[1]!).toMatchObject({ user: 'aulus', status: 'new', ctx: { turn: 6, actions: [{ type: 'end' }] } });
  expect(list[0]!.user).toBeNull();
  expect(await newBugCount()).toBe(2);
  await setBugStatus(a, 'done');
  await setBugStatus(a, 'done'); // twice: counted once
  expect(await newBugCount()).toBe(1);
  await setBugStatus(a, 'new');
  expect(await newBugCount()).toBe(2);
  for (let k = 1; k < BUG_LIMITS.perUser; k++) await submitBug('aulus', `report ${k}`, ctx, '2026-11-21');
  await expect(submitBug('aulus', 'one too many', ctx, '2026-11-21')).rejects.toBeInstanceOf(BugLimit);
  await expect(submitBug('aulus', 'next day is fine', ctx, '2026-11-22')).resolves.toBeTypeOf('string');
});
