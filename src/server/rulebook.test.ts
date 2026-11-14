import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { rulebookStamp } from '../shared/rulebook-stamp';

test('the rulebook PDF is up to date with the game (run `npm run docs:rulebook`)', () => {
  const stored = JSON.parse(readFileSync(resolve(__dirname, '../../docs/rulebook.stamp.json'), 'utf8')) as { stamp: string };
  expect(stored.stamp, 'Rules, events or decrees changed: regenerate the rulebook with `npm run docs:rulebook`.').toBe(rulebookStamp());
});
