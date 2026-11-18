// "Aegyptus": an alternative skin for the board (same tiles, same rules, different art).
// Plains are the irrigated Nile valley, forests flat desert, hills rocky desert, mountains the deep desert;
// lakes are oases; the sea stays the sea. Native towns are mud-brick (pyramids at ★4); Roman towns are
// Greco-Egyptian, after Alexandria (white houses, Greek temples, the Pharos at ★4). Art pixels, outline OUT.

const O = '#1d1409';
const f = (n: number) => n.toFixed(1);

/** Tile base colours of the skin (keys as in board-art BASE). */
export const EGYPT_BASE = {
  plain: '#cdbb72', forest: '#e9d6a2', hills: '#d1a15c', roman: '#e3d3a4', mountain: '#f2c65a', sea: '#245a78', lake: '#4fb0b4', wildwood: '#d9b56c',
} as const;

// ---- scenery
/** A date palm: curved trunk, six fronds, a cluster of dates. */
export const palm = (x: number, y: number, k = 1, lean = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${(k * lean).toFixed(2)},${k.toFixed(2)})">
<ellipse cx="2" cy="8" rx="6" ry="2" fill="#000" opacity=".22"/>
<path d="M0,8 Q1,-2 4,-11" fill="none" stroke="${O}" stroke-width="3.6" stroke-linecap="round"/><path d="M0,8 Q1,-2 4,-11" fill="none" stroke="#8a5a2c" stroke-width="2" stroke-linecap="round"/>
<g fill="#3f8a3a" stroke="${O}" stroke-width=".9" stroke-linejoin="round">
<path d="M4,-11 Q-4,-15 -9,-9 Q-3,-12 4,-11 Z"/><path d="M4,-11 Q12,-16 15,-8 Q10,-12 4,-11 Z"/><path d="M4,-11 Q-2,-20 -6,-17 Q0,-16 4,-11 Z"/>
<path d="M4,-11 Q10,-21 14,-17 Q8,-16 4,-11 Z"/><path d="M4,-11 Q-5,-9 -7,-3 Q-2,-8 4,-11 Z"/><path d="M4,-11 Q12,-9 13,-3 Q9,-8 4,-11 Z"/></g>
<circle cx="3" cy="-9" r="1.5" fill="#a0521e"/><circle cx="5.5" cy="-9.5" r="1.3" fill="#a0521e"/></g>`;
/** Papyrus clump at the water's edge. */
export const papyrus = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})" stroke="#3f6a24" stroke-width="1.1" fill="none"><path d="M-2,0 L-3,-8 M0,0 L0,-10 M2,0 L3,-7"/><g fill="#7fae3a" stroke="${O}" stroke-width=".5"><path d="M-3,-8 l-2.5,-2 l2,0.2 l0.5,-2 Z"/><path d="M0,-10 l-2,-2.5 l2,.6 l2,-.6 Z"/><path d="M3,-7 l2.5,-2 l-2,0.2 l-0.5,-2 Z"/></g></g>`;
/** Ripples of a sand sea. */
export const ripple = (x: number, y: number, k = 1) => `<path d="M${f(x - 9 * k)},${f(y)} q${f(4.5 * k)},${f(-3.5 * k)} ${f(9 * k)},0 t${f(9 * k)},0" fill="none" stroke="#c49a4a" stroke-width="${f(1.2 * k)}" stroke-linecap="round"/>`;
/** A crescent dune with its shaded lee side. */
export const dune = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k.toFixed(2)})"><path d="M-14,5 Q-4,-8 6,-6 Q12,-2 14,5 Z" fill="#e9cd8a" stroke="${O}" stroke-width="1.1" stroke-linejoin="round"/><path d="M6,-6 Q12,-2 14,5 L4,5 Q6,-1 6,-6 Z" fill="#c9a058"/></g>`;
/** A high dune of the deep desert: a sharp crest, a bright windward face and an orange lee. */
export const bigDune = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k.toFixed(2)})"><ellipse cx="1" cy="6.5" rx="17" ry="2.2" fill="#b7741a" opacity=".22"/><path d="M-17,6 C-10,-1 -1,-6 6,-6 C10,-5 13,0 16,6 Z" fill="#f7d77a" stroke="${O}" stroke-width="1.1" stroke-linejoin="round"/><path d="M6,-6 C10,-5 13,0 16,6 L8,6 C9,1 8.5,-3 6,-6 Z" fill="#e0a645"/><path d="M-9,3 q3,-1.6 6,0 M-3,0 q2.5,-1.4 5,0" stroke="#d6a548" stroke-width=".8" fill="none"/></g>`;
/** A flat-topped rock (mesa) of the rocky desert. */
export const mesa = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k.toFixed(2)})"><ellipse cx="2" cy="7" rx="14" ry="2.6" fill="#000" opacity=".22"/><path d="M-13,7 L-10,-3 L-6,-6 L5,-6 L9,-2 L13,7 Z" fill="#c98f52" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/><path d="M5,-6 L9,-2 L13,7 L5,7 L4,-1 Z" fill="#9c6634"/><path d="M-9,1 H6 M-11,4 H9" stroke="#8a5a2c" stroke-width=".8"/></g>`;
/** Small stones. */
export const pebbles = (x: number, y: number) => `<g fill="#a87a48" stroke="${O}" stroke-width=".6"><ellipse cx="${f(x - 3)}" cy="${f(y)}" rx="2" ry="1.3"/><ellipse cx="${f(x + 2)}" cy="${f(y + 1)}" rx="1.5" ry="1"/></g>`;
/** The deep desert: a jagged red crag. */
export const crag = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k.toFixed(2)})"><ellipse cx="3" cy="10" rx="17" ry="3.4" fill="#000" opacity=".28"/><path d="M-16,10 L-11,-4 L-7,-1 L-3,-17 L2,-6 L6,-11 L12,0 L17,10 Z" fill="#9c4f2a" stroke="${O}" stroke-width="1.5" stroke-linejoin="round"/><path d="M-3,-17 L2,-6 L6,-11 L12,0 L17,10 L3,10 L1,-3 Z" fill="#6f3319"/><path d="M-9,4 L-6,0 M-2,6 L1,1" stroke="#d9925a" stroke-width="1.1"/></g>`;
/** Bleached bones in the deep desert. */
export const bones = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})"><path d="M-6,0 Q0,-6 6,0" fill="none" stroke="#f1ead8" stroke-width="2.2" stroke-linecap="round"/><path d="M-4,-2.5 V1 M0,-3.5 V0.5 M4,-2.5 V1" stroke="#f1ead8" stroke-width="1.4" stroke-linecap="round"/><path d="M-6,0 Q0,-6 6,0" fill="none" stroke="${O}" stroke-width=".5"/></g>`;
/** A papyrus skiff with a bundled, upturned hull and a little square sail. */
export const skiff = (x: number, y: number, flip = false, sail = true) => `<g transform="translate(${f(x)},${f(y)}) scale(${flip ? -1 : 1},1)"><path d="M-16,-3 Q-12,6 0,6 Q12,6 17,-5 Q12,1 0,1 Q-10,1 -16,-3 Z" fill="#c9b04a" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/><path d="M-10,1.5 V5 M-5,1.5 V5.8 M0,1.5 V6 M5,1.5 V5.8 M10,1.5 V4.6" stroke="#8a7a2a" stroke-width=".9"/>${sail ? `<line x1="1" y1="1" x2="1" y2="-15" stroke="${O}" stroke-width="1.2"/><path d="M-6,-14 H8 V-3 H-6 Z" fill="#f2ead2" stroke="${O}" stroke-width="1"/><path d="M-6,-8 H8" stroke="#2f86b0" stroke-width="1.6"/>` : `<circle cx="-3" cy="-2" r="2" fill="#a8743a" stroke="${O}" stroke-width=".7"/><path d="M-1,-1 L8,-9" stroke="${O}" stroke-width=".9"/>`}</g>`;
/** Necropolis (the wildwood tiles): a sphinx and an obelisk. */
// Thomas's drawing (tmp/Sphinx.png), traced: the head in its striped nemes, the long body, paws forward, the tail.
// Drawn in the drawing's pixels (730 × 540) and scaled; the origin is the middle of the base.
export const sphinx = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${(0.056 * k).toFixed(4)}) translate(-370,-455)" stroke="${O}" stroke-width="20" stroke-linejoin="round">
<ellipse cx="380" cy="470" rx="330" ry="36" fill="#000" stroke="none" opacity=".22"/>
<path d="M680,345 C682,290 660,240 618,228" fill="none" stroke-width="30" stroke-linecap="round"/><path d="M680,345 C682,290 660,240 618,228" fill="none" stroke="#d9a85e" stroke-width="10" stroke-linecap="round"/>
<path d="M190,300 L200,236 L590,232 Q650,232 652,290 L654,455 L60,455 Q44,455 44,430 L44,388 Q44,365 70,365 L168,365 Z" fill="#dcaa62"/>
<path d="M56,410 Q60,402 80,402 L200,404" fill="none" stroke-width="14" stroke-linecap="round"/>
<path d="M160,300 L160,90 Q160,20 252,18 Q345,20 345,90 L345,300 Z" fill="#e8c27a"/>
<path d="M170,142 H208 M298,142 H335 M170,194 H208 M298,194 H335 M170,246 H335" stroke="#2f6fb0" stroke-width="22"/>
<rect x="208" y="86" width="90" height="126" fill="#c98f55" stroke-width="14"/></g>`;
export const obelisk = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><path d="M-3,8 L-2,-12 L0,-15 L2,-12 L3,8 Z" fill="#e6d3a2" stroke="${O}" stroke-width="1.1" stroke-linejoin="round"/><path d="M0,-15 L2,-12 L3,8 L0.5,8 Z" fill="#c4ab72"/><path d="M-2,-12 L0,-15 L2,-12 Z" fill="#e0b42a"/></g>`;

// ---- native towns: mud brick, pyramids at the top tier
const mudhouse = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><path d="M-6,-3 L-6,5 L6,5 L6,-3 Z" fill="#d8ac72" stroke="${O}" stroke-width="1.1"/><path d="M2,-3 L6,-3 L6,5 L2,5 Z" fill="#b58650"/><path d="M-7,-5 H7 V-3 H-7 Z" fill="#c69a60" stroke="${O}" stroke-width="1"/><path d="M-2.6,5 V1 H0.4 V5 Z" fill="${O}"/><rect x="-5" y="-1" width="1.8" height="1.8" fill="${O}"/></g>`;
const pyramid = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><path d="M-14,8 L0,-14 L14,8 Z" fill="#e6c27a" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/><path d="M0,-14 L14,8 L4,8 Z" fill="#bf954e"/><path d="M-9,0 L9,0 M-11.5,4 L11.5,4 M-6.5,-4 L6.5,-4" stroke="#b08a48" stroke-width=".7"/><path d="M-2.2,-10.5 L0,-14 L2.2,-10.5 Z" fill="#f2d24a" stroke="${O}" stroke-width=".7"/></g>`;
const mudwall = (rx: number, ry: number) => {
  const d = `M${-rx},5 A${rx},${ry} 0 0 0 ${rx},5`;
  return `<path d="${d}" fill="none" stroke="${O}" stroke-width="6"/><path d="${d}" fill="none" stroke="#c99a5c" stroke-width="3.8"/><path d="${d}" fill="none" stroke="#a87a44" stroke-width="3.8" stroke-dasharray="1.5 4"/>`;
};

// ---- Roman towns, Greco-Egyptian (after Alexandria)
const whitehouse = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><path d="M-6.5,-3 L-6.5,5 L6.5,5 L6.5,-3 Z" fill="#f5f0e2" stroke="${O}" stroke-width="1.1"/><path d="M2.5,-3 L6.5,-3 L6.5,5 L2.5,5 Z" fill="#dcd5c2"/><path d="M-7.5,-5 H7.5 V-3 H-7.5 Z" fill="#e9e2cf" stroke="${O}" stroke-width="1"/><path d="M-1.6,5 V1 Q0,-.4 1.6,1 V5 Z" fill="#2f6aa0"/><rect x="-5" y="-1" width="2" height="2" fill="#2f6aa0"/></g>`;
const gtemple = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})"><rect x="-12" y="5" width="24" height="3" fill="#ece5d2" stroke="${O}" stroke-width="1"/><rect x="-10" y="-3" width="20" height="8" fill="#fbf8ef" stroke="${O}" stroke-width="1"/>${[-8, -4, 0, 4, 8].map((c) => `<line x1="${c}" y1="-3" x2="${c}" y2="5" stroke="${O}" stroke-width="1.1"/>`).join('')}<path d="M-12,-3 L0,-10 L12,-3 Z" fill="#fbf8ef" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/><path d="M-9,-4.2 H9" stroke="#2f86b0" stroke-width="1.2"/><circle cx="0" cy="-6" r="1.3" fill="#d8b23a"/></g>`;
const pharos = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})"><rect x="-6" y="-2" width="12" height="10" fill="#f5f0e2" stroke="${O}" stroke-width="1.1"/><path d="M-4.2,-2 L-3.4,-12 L3.4,-12 L4.2,-2 Z" fill="#ece5d2" stroke="${O}" stroke-width="1.1"/><path d="M-2.4,-12 L-2,-19 L2,-19 L2.4,-12 Z" fill="#f5f0e2" stroke="${O}" stroke-width="1"/><path d="M-2.6,-19 H2.6 L0,-22 Z" fill="#d8cfba" stroke="${O}" stroke-width=".8"/><path d="M0,-28 C-4,-25 -3,-22 0,-21 C3,-22 4,-25 0,-28 Z" fill="#f08a1c" stroke="${O}" stroke-width=".9"/><path d="M0,-25.5 C-1.4,-24 -1,-22.5 0,-22 C1,-22.5 1.4,-24 0,-25.5 Z" fill="#ffd84a"/><rect x="-1" y="2" width="2" height="4" fill="${O}"/></g>`;
const swall = (rx: number, ry: number, back: boolean) => {
  const d = back ? `M${-rx},5 A${rx},${ry} 0 0 1 ${rx},5` : `M${-rx},5 A${rx},${ry} 0 0 0 ${rx},5`;
  return `<path d="${d}" fill="none" stroke="${O}" stroke-width="6.5"/><path d="${d}" fill="none" stroke="#efe8d6" stroke-width="4.2"/><path d="${d}" fill="none" stroke="#c9c0a8" stroke-width="4.2" stroke-dasharray="2 3"/>`;
};
const stower = (x: number, y: number) => `<rect x="${f(x - 4)}" y="${f(y - 9)}" width="8" height="10" fill="#f5f0e2" stroke="${O}" stroke-width="1.1"/><path d="M${f(x - 4)},${f(y - 9)} h2 v-1.8 h2 v1.8 h2 v-1.8 h2 v1.8" fill="none" stroke="${O}" stroke-width=".9"/>`;

const plinth = (rx: number, ry: number, tribe: string, roman: boolean) =>
  `<ellipse cx="1" cy="${ry * 0.55 + 7}" rx="${rx + 2}" ry="${ry * 0.6}" fill="#000" opacity=".3"/><ellipse cx="0" cy="${ry * 0.35 + 5}" rx="${rx}" ry="${ry * 0.55}" fill="${roman ? '#ece2c6' : '#c9a468'}" stroke="${tribe}" stroke-width="3.5"/>`;

export function settlementEgypt(v: number, roman: boolean, tribe: string): string {
  v = Math.max(1, Math.min(4, v));
  const P = [[0, 0], [20, 9], [24, 10], [28, 12], [34, 14]][v]!;
  let g = plinth(P[0]!, P[1]!, tribe, roman);
  if (!roman) {
    if (v === 1) g += mudhouse(-5, 2, 0.95) + mudhouse(7, 5, 0.85);
    if (v === 2) g += mudhouse(-9, 0, 0.9) + mudhouse(5, -2, 0.95) + mudhouse(-2, 7, 1) + palm(13, 2, 0.75);
    if (v === 3) g += obelisk(-14, -2, 0.9) + mudhouse(-4, -2, 0.95) + mudhouse(9, -1, 0.9) + mudhouse(2, 7, 1) + mudwall(23, 10) + palm(-19, 6, 0.7);
    if (v === 4) g += pyramid(2, -6, 1.15) + pyramid(-15, 0, 0.6) + mudhouse(16, 4, 0.85) + mudhouse(-6, 9, 0.85) + mudhouse(8, 10, 0.85) + mudwall(29, 12) + palm(24, 8, 0.7);
  } else {
    if (v === 1) g += whitehouse(-5, 1, 0.95) + whitehouse(7, 5, 0.85);
    if (v === 2) g += whitehouse(-9, 0, 0.9) + whitehouse(5, -3, 0.95) + whitehouse(-2, 7, 1) + palm(13, 3, 0.75);
    if (v === 3) g += `<path d="M-22,8 Q0,18 22,8" fill="none" stroke="${O}" stroke-width="5"/><path d="M-22,8 Q0,18 22,8" fill="none" stroke="#efe8d6" stroke-width="3"/>` + gtemple(0, -3) + whitehouse(-14, 6, 0.85) + whitehouse(14, 6, 0.85);
    if (v === 4) g += swall(28, 11, true) + pharos(-18, -2) + gtemple(4, -5) + stower(22, -2) + whitehouse(-12, 7, 0.85) + whitehouse(15, 6, 0.85) + swall(28, 11, false) + stower(-28, 6) + stower(28, 6) + stower(0, 17);
  }
  return g;
}

/** The castra in Egypt: the same Roman camp, mud-brick walls, palms at the gate. */
export function castraEgypt(): string {
  let g = `<ellipse cx="1" cy="20" rx="27" ry="7" fill="#000" opacity=".3"/><rect x="-24" y="-18" width="48" height="36" rx="4" fill="#e6d3a2" stroke="${O}" stroke-width="2"/>`;
  g += `<rect x="-24" y="-18" width="48" height="36" rx="4" fill="none" stroke="#b07a42" stroke-width="4" stroke-dasharray="3 1.4"/><path d="M0,-18 V18 M-24,0 H24" stroke="#c9b07a" stroke-width="3"/>`;
  for (const [x, y] of [[-12, -9], [12, -9], [-12, 9], [12, 9]]) g += `<path d="M${x! - 6},${y! + 4} L${x},${y! - 6} L${x! + 6},${y! + 4} Z" fill="#c4552d" stroke="${O}" stroke-width="1"/><path d="M${x},${y! - 6} L${x! + 6},${y! + 4} L${x! + 1},${y! + 4} Z" fill="#9c3d1e"/>`;
  for (const [x, y] of [[-24, -18], [24, -18], [-24, 18], [24, 18]]) g += `<rect x="${x! - 4}" y="${y! - 8}" width="8" height="9" fill="#c99a5c" stroke="${O}" stroke-width="1.1"/>`;
  g += palm(-30, 14, 0.8) + palm(30, 14, 0.8, -1);
  return g;
}

// ---- event art in Egypt (same events, Egyptian look); used by board-art's themed wrappers
/** Sandstorm: a tan cloud of dust with streaks of blown sand. */
export const duststorm = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})"><path d="M-14,4 Q-16,-4 -8,-5 Q-6,-13 3,-10 Q10,-14 13,-6 Q19,-5 17,3 Z" fill="#e2c58a" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/><path d="M-6,-3 q3,-3 6,0 M3,-1 q3,-3 6,0" stroke="#b08a4a" stroke-width="1.1" fill="none"/><path d="M-12,8 h10 M-4,11 h12 M4,8 h9" stroke="#b07a2a" stroke-width="1.6" stroke-linecap="round"/></g>`;
/** Small sandstorm glyph (event icon): a swirl of sand. */
export const swirl = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})" fill="none" stroke-linecap="round"><path d="M-6,-3 Q0,-8 5,-3 Q8,1 3,3 Q-1,4 -1,1 Q0,-1 2,0" stroke="${O}" stroke-width="3.6"/><path d="M-6,-3 Q0,-8 5,-3 Q8,1 3,3 Q-1,4 -1,1 Q0,-1 2,0" stroke="#e0b45a" stroke-width="2"/><path d="M-7,5 h6 M1,7 h6" stroke="${O}" stroke-width="3.2"/><path d="M-7,5 h6 M1,7 h6" stroke="#e0b45a" stroke-width="1.6"/></g>`;
/** Khamsin: three gusts of hot wind. */
export const gust = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})" fill="none" stroke-linecap="round">${['M-9,-5 H3 Q7,-5 7,-8 Q7,-11 4,-11', 'M-10,1 H8 Q12,1 12,4 Q12,7 9,7', 'M-8,7 H-1'].map((d) => `<path d="${d}" stroke="${O}" stroke-width="3.6"/><path d="${d}" stroke="#f3e2b8" stroke-width="1.8"/>`).join('')}</g>`;
/** The ankh, for the priests' revolt. */
export const ankh = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><path d="M0,-3 C-5,-6 -5,-13 0,-13 C5,-13 5,-6 0,-3 Z M-8,-3 H8 M0,-3 V11" fill="none" stroke="${O}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M0,-3 C-5,-6 -5,-13 0,-13 C5,-13 5,-6 0,-3 Z M-8,-3 H8 M0,-3 V11" fill="none" stroke="#f0c23a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>`;
/** A Nubian warrior's tall oval cowhide shield and spear. */
export const nubian = (x: number, y: number, k = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><line x1="-8" y1="11" x2="8" y2="-13" stroke="#6a4423" stroke-width="2"/><path d="M8,-13 L11,-17 L10,-10 Z" fill="#c9c9cf" stroke="${O}" stroke-width=".8"/><ellipse cx="-1" cy="1" rx="6.5" ry="10" fill="#f1ead8" stroke="${O}" stroke-width="1.3"/><path d="M-4,-5 q2,1 1,4 q-2,2 0,4 M2,-2 q2,2 0,5" fill="none" stroke="#3b2a1a" stroke-width="2.2" stroke-linecap="round"/><path d="M-1,-9 V11" stroke="#8a5a2c" stroke-width=".8"/></g>`;
/** Gold in the hills (the silver vein, in Egypt a gold mine). */
export const goldPeak = (x: number, y: number) => `<g transform="translate(${f(x)},${f(y)})"><ellipse cx="2" cy="11" rx="17" ry="3.4" fill="#000" opacity=".25"/><path d="M-17,11 L-2,-17 L4,-7 L8,-12 L18,11 Z" fill="#c98f52" stroke="${O}" stroke-width="1.5" stroke-linejoin="round"/><path d="M-8,6 L-3,-4 L1,2 L5,-6 M-11,10 L-5,2" stroke="#ffd84a" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M12,-14 l1.6,4 4,1.6 -4,1.6 -1.6,4 -1.6,-4 -4,-1.6 4,-1.6 Z" fill="#fff6c8" stroke="#a07a1c" stroke-width=".8"/><path d="M-2,8 h6 v3 h-6 Z" fill="${O}"/></g>`;
export const goldMini = (x: number, y: number) => `<path d="M${x - 6},${y + 5} L${x},${y - 6} L${x + 6},${y + 5} Z" fill="#c98f52" stroke="${O}" stroke-width="1"/><path d="M${x - 3},${y + 2} L${x},${y - 3} L${x + 2},${y}" stroke="#ffd84a" stroke-width="1.8" fill="none"/>`;
