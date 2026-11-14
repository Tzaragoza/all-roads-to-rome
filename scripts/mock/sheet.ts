import { writeFileSync } from 'node:fs';
import { castraIcon, settlement } from './settlements';
const TR = ['#f0b81c', '#2f86e0', '#a24fd6'];
let g = '';
['Gallic (not supplied)', 'Roman (supplied)'].forEach((lab, row) => {
  g += `<text x="16" y="${70 + row * 120}" font-size="15" font-weight="bold">${lab}</text>`;
  for (let v = 1; v <= 4; v++) g += `<g transform="translate(${130 + v * 110},${60 + row * 120}) scale(1.6)">${settlement(v, row === 1, TR[(v + row) % 3]!)}</g><text x="${130 + v * 110}" y="${118 + row * 120}" text-anchor="middle" font-size="14" fill="#a8790c">${'★'.repeat(v)}</text>`;
});
g += `<g transform="translate(720,120) scale(1.6)">${castraIcon()}</g><text x="720" y="200" text-anchor="middle" font-size="14">Castra</text>`;
writeFileSync('/mnt/user-data/outputs/mockup/settlements.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 270" width="800" height="270" font-family="Georgia,serif"><rect width="800" height="270" fill="#b6c45a"/>${g}</svg>`);
