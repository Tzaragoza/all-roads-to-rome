// Freeze the fingerprints of published days into src/shared/golden.json.
// Usage: npm run golden -- [through=today]   (adds days up to `through`; never rewrites a frozen day)
//        npm run golden -- --reset [through]  (deliberate: rebuild all, after an intentional generator change)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import season from '../../src/shared/season.json';
import { FACTIONS, fingerprint } from '../../src/shared/fingerprint';
import { ballotFor } from '../../src/shared/daily';

const FILE = new URL('../../src/shared/golden.json', import.meta.url);
const args = process.argv.slice(2), reset = args.includes('--reset');
const through = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? new Date().toISOString().slice(0, 10);
type Golden = { note: string; days: Record<string, Record<string, string>> };
const g: Golden = !reset && existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { note: '', days: {} };
g.note = 'Fingerprints of published days. Written by `npm run golden`; checked by golden.test.ts. Do not edit by hand.';
let added = 0;
for (const { date } of season as Array<{ date: string }>) {
  if (date > through || g.days[date]) continue;
  g.days[date] = Object.fromEntries(FACTIONS.filter((f) => ballotFor(date).includes(f)).map((f) => [f, fingerprint(date, f)]));
  added++;
}
writeFileSync(FILE, JSON.stringify(g, null, 1) + '\n');
console.log(`golden.json: ${Object.keys(g.days).length} frozen days (${added} added, through ${through})`);
