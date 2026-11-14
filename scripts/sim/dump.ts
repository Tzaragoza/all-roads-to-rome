import { writeFileSync } from 'node:fs';
import { generate } from '../../src/shared/engine';
import { renderSvg } from './render';
for (const seed of process.argv.slice(2)) {
  const sc = generate(seed);
  writeFileSync(`/tmp/${seed}.svg`, renderSvg(sc));
  console.log(seed, 'towns', sc.towns.length, 'roads', sc.roads.length, 'tribes', sc.tribes.map(t=>t.name).join(','), 'maxhop', Math.max(...sc.towns.map(t=>t.hop)), JSON.stringify(sc.events));
}
