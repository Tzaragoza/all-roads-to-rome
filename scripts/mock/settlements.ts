// Settlement icons for the tile board: 4 tiers (★1–4) × 2 flavours (Gallic = not supplied, Roman = supplied).
// Drawn centred on (0,0), roughly 40–70 px wide. Pure SVG strings, Small-World-ish: outlined, two-tone.
const O = '#1d1409';
const f = (n: number) => n.toFixed(1);

// ---- Gallic pieces
const roundhouse = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})">
<path d="M-6,0 L-6,5 Q0,7 6,5 L6,0 Z" fill="#b48a58" stroke="${O}" stroke-width="1.1"/>
<path d="M-1.6,6.3 L-1.6,2.4 Q0,1.4 1.6,2.4 L1.6,6.3 Z" fill="${O}"/>
<path d="M-8.5,1 Q-4,-5 0,-12 Q4,-5 8.5,1 Q0,3.6 -8.5,1 Z" fill="#d9ad4e" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/>
<path d="M0,-12 Q4,-5 8.5,1 Q5,2.2 2,2.5 Q2.5,-5 0,-12" fill="#b78a32"/>
<path d="M-4,-3 L-5.5,1.6 M0,-5 L0,2.6 M4,-3 L5.2,1.8" stroke="#8a6524" stroke-width=".7"/></g>`;
const longhall = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})">
<path d="M-11,0 L-11,6 L11,6 L11,0 Z" fill="#a87e4c" stroke="${O}" stroke-width="1.2"/>
<path d="M-2,6 L-2,2 L2,2 L2,6 Z" fill="${O}"/>
<path d="M-14,1 L-8,-10 L8,-10 L14,1 Z" fill="#d9ad4e" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/>
<path d="M2,-10 L8,-10 L14,1 L6,1 Z" fill="#b78a32"/>
<path d="M-8,-10 L-6,-14 M8,-10 L6,-14" stroke="${O}" stroke-width="1.2"/></g>`;
const palisade = (r: number, ry: number, gap = 0.5) => {
  let g = '';
  const n = Math.round(r * 1.1);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.PI / 2;
    if (Math.abs(Math.sin(a) - 1) < gap * 0.25) continue; // gate facing the viewer
    const x = Math.cos(a) * r, y = Math.sin(a) * ry + 4;
    g += `<path d="M${f(x - 1.6)},${f(y + 3)} L${f(x - 1.6)},${f(y - 4)} L${f(x)},${f(y - 6.5)} L${f(x + 1.6)},${f(y - 4)} L${f(x + 1.6)},${f(y + 3)} Z" fill="#8a5a2c" stroke="${O}" stroke-width=".8"/>`;
  }
  return g;
};
const rampart = (r: number, ry: number) => `<ellipse cx="0" cy="6" rx="${r + 4}" ry="${ry + 3}" fill="#8f7a52" stroke="${O}" stroke-width="1.4"/><ellipse cx="0" cy="4" rx="${r + 1}" ry="${ry + 1}" fill="#a99064"/>`;
const banner = (x: number, y: number, col: string) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 22}" stroke="${O}" stroke-width="1.4"/><path d="M${x},${y - 22} l10,2 l-3,3.5 l3,3.5 l-10,1 Z" fill="${col}" stroke="${O}" stroke-width=".9"/>`;

// ---- Roman pieces
const domus = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})">
<path d="M-6.5,-2 L-6.5,5 L6.5,5 L6.5,-2 Z" fill="#f2ead6" stroke="${O}" stroke-width="1.1"/>
<path d="M-1.3,5 L-1.3,1.4 L1.3,1.4 L1.3,5 Z" fill="${O}"/><rect x="3" y="0" width="2" height="2" fill="${O}"/>
<path d="M-8,-1.5 L0,-9 L8,-1.5 Z" fill="#c4552d" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/>
<path d="M0,-9 L8,-1.5 L2,-1.5 Z" fill="#9c3d1e"/><path d="M-4,-5 L4,-5" stroke="#9c3d1e" stroke-width=".6"/></g>`;
const temple = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})">
<rect x="-12" y="5" width="24" height="3" fill="#ddd5c2" stroke="${O}" stroke-width="1"/><rect x="-10" y="-3" width="20" height="8" fill="#f6f1e4" stroke="${O}" stroke-width="1"/>
${[-8, -4, 0, 4, 8].map((c) => `<line x1="${c}" y1="-3" x2="${c}" y2="5" stroke="${O}" stroke-width="1.1"/>`).join('')}
<path d="M-12,-3 L0,-11 L12,-3 Z" fill="#f6f1e4" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/><path d="M0,-11 L12,-3 L3,-3 Z" fill="#d8cfba"/><circle cx="0" cy="-5.5" r="1.4" fill="#d8b23a"/></g>`;
const wallArc = (r: number, ry: number, back: boolean) => {
  const d = back ? `M${-r},5 A${r},${ry} 0 0 1 ${r},5` : `M${-r},5 A${r},${ry} 0 0 0 ${r},5`;
  return `<path d="${d}" fill="none" stroke="${O}" stroke-width="6.5"/><path d="${d}" fill="none" stroke="#d8cfb6" stroke-width="4.2"/><path d="${d}" fill="none" stroke="#a89f88" stroke-width="4.2" stroke-dasharray="2 3"/>`;
};
const tower = (x: number, y: number) => `<rect x="${f(x - 4)}" y="${f(y - 9)}" width="8" height="10" fill="#e4dcc6" stroke="${O}" stroke-width="1.1"/><path d="M${f(x - 4)},${f(y - 9)} h2 v-1.8 h2 v1.8 h2 v-1.8 h2 v1.8" fill="none" stroke="${O}" stroke-width=".9"/>`;
const aqueduct = () => {
  let g = `<path d="M-40,-14 H40 V-6 H-40 Z" fill="#e4dcc6" stroke="${O}" stroke-width="1.1"/>`;
  for (let x = -38; x < 38; x += 8) g += `<path d="M${x},-6 V2 H${x + 2} V-1 Q${x + 4},-4 ${x + 6},-1 V2 H${x + 8} V-6" fill="#e4dcc6" stroke="${O}" stroke-width="1"/>`;
  return g;
};
const stoneWall = (r: number, ry: number, towers: number) => {
  let g = `<ellipse cx="0" cy="5" rx="${r}" ry="${ry}" fill="none" stroke="${O}" stroke-width="6"/><ellipse cx="0" cy="5" rx="${r}" ry="${ry}" fill="none" stroke="#d8cfb6" stroke-width="3.8"/><ellipse cx="0" cy="5" rx="${r}" ry="${ry}" fill="none" stroke="#a89f88" stroke-width="3.8" stroke-dasharray="2 3"/>`;
  for (let k = 0; k < towers; k++) {
    const a = (k / towers) * Math.PI * 2 + Math.PI / towers, x = Math.cos(a) * r, y = Math.sin(a) * ry + 5;
    g += `<rect x="${f(x - 3.6)}" y="${f(y - 7)}" width="7.2" height="8" fill="#e4dcc6" stroke="${O}" stroke-width="1.1"/><path d="M${f(x - 3.6)},${f(y - 7)} h1.8 v-1.6 h1.8 v1.6 h1.8 v-1.6 h1.8 v1.6" fill="none" stroke="${O}" stroke-width=".9"/>`;
  }
  return g;
};
const vexillum = (x: number, y: number) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 24}" stroke="${O}" stroke-width="1.4"/><circle cx="${x}" cy="${y - 25}" r="2" fill="#d8b23a" stroke="${O}" stroke-width=".6"/><line x1="${x - 5}" y1="${y - 21}" x2="${x + 5}" y2="${y - 21}" stroke="${O}" stroke-width="1.1"/><path d="M${x - 5},${y - 21} h10 v9 l-5,-2.5 l-5,2.5 Z" fill="#b3261e" stroke="${O}" stroke-width=".8"/>`;

// ---- plinth: ground disc in the tribe colour (board-game piece base)
const plinth = (rx: number, ry: number, tribe: string, roman: boolean) =>
  `<ellipse cx="1" cy="${ry * 0.55 + 7}" rx="${rx + 2}" ry="${ry * 0.6}" fill="#000" opacity=".3"/><ellipse cx="0" cy="${ry * 0.35 + 5}" rx="${rx}" ry="${ry * 0.55}" fill="${roman ? '#d8cba4' : '#9c8a5c'}" stroke="${tribe}" stroke-width="3.5"/>`;

/** Size of the icon (for label placement). */
export const settlementSize = (v: number) => ({ top: [0, 22, 24, 30, 36][v]!, bottom: [0, 12, 13, 17, 20][v]! });

export function settlement(v: number, roman: boolean, tribe: string): string {
  v = Math.max(1, Math.min(4, v));
  const P = [[0, 0], [20, 9], [24, 10], [28, 12], [34, 14]][v]!;
  let g = plinth(P[0]!, P[1]!, tribe, roman);
  if (!roman) {
    if (v === 1) g += roundhouse(-5, 2, 0.95) + roundhouse(6, 5, 0.85);
    if (v === 2) g += roundhouse(-9, 0, 0.9) + roundhouse(4, -3, 0.95) + roundhouse(-2, 7, 1) + roundhouse(11, 6, 0.85);
    if (v === 3) g += palisade(22, 10) + roundhouse(-9, -1, 0.9) + roundhouse(6, -3, 0.9) + roundhouse(-3, 6, 1) + roundhouse(10, 6, 0.9);
    if (v === 4) g += rampart(25, 11) + palisade(26, 12) + longhall(0, -3) + roundhouse(-15, 4, 0.85) + roundhouse(15, 5, 0.85) + roundhouse(-5, 9, 0.9) + roundhouse(8, 10, 0.85);
  } else {
    if (v === 1) g += domus(-5, 1, 0.95) + domus(7, 5, 0.85);
    if (v === 2) g += domus(-9, 0, 0.9) + domus(5, -3, 0.95) + domus(-2, 7, 1) + domus(12, 6, 0.85);
    if (v === 3) g += `<path d="M-22,8 Q0,18 22,8" fill="none" stroke="${O}" stroke-width="5"/><path d="M-22,8 Q0,18 22,8" fill="none" stroke="#d8cfb6" stroke-width="3"/>` + temple(0, -3) + domus(-14, 6, 0.85) + domus(14, 6, 0.85);
    if (v === 4) g += aqueduct() + wallArc(28, 11, true) + tower(-20, -2) + tower(20, -2) + temple(0, -5) + domus(-15, 6, 0.85) + domus(15, 6, 0.85) + wallArc(28, 11, false) + tower(-28, 6) + tower(28, 6) + tower(0, 17);
  }
  return g;
}

/** Castra: square Roman camp. */
export function castraIcon(): string {
  let g = `<ellipse cx="1" cy="20" rx="27" ry="7" fill="#000" opacity=".3"/><rect x="-24" y="-18" width="48" height="36" rx="4" fill="#d8cba4" stroke="${O}" stroke-width="2"/>`;
  g += `<rect x="-24" y="-18" width="48" height="36" rx="4" fill="none" stroke="#8a5a2c" stroke-width="4" stroke-dasharray="3 1.4"/>`;
  g += `<path d="M0,-18 V18 M-24,0 H24" stroke="#b8a77a" stroke-width="3"/>`;
  for (const [x, y] of [[-12, -9], [12, -9], [-12, 9], [12, 9]]) g += `<path d="M${x - 6},${y + 4} L${x},${y - 6} L${x + 6},${y + 4} Z" fill="#c4552d" stroke="${O}" stroke-width="1"/><path d="M${x},${y - 6} L${x + 6},${y + 4} L${x + 1},${y + 4} Z" fill="#9c3d1e"/>`;
  for (const [x, y] of [[-24, -18], [24, -18], [-24, 18], [24, 18]]) g += `<rect x="${x - 4}" y="${y - 8}" width="8" height="9" fill="#a46a35" stroke="${O}" stroke-width="1.1"/>`;
  return g;
}
