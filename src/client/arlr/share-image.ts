/**
 * The result as a picture to share: a 1080 × 1080 PNG drawn on the device (an SVG rasterised on a canvas).
 * Left: today's map with the roads you held at dusk; right: your score against Caesar's, the turn-by-turn race.
 * Fonts: Georgia only (an SVG drawn into an image cannot load web fonts).
 */
import type { Scenario, State } from '../../shared/engine';
import { supplied } from '../../shared/engine';
import { laurelSvg } from './laurel';

export type ShareCard = {
  sc: Scenario; fin: State; total: number; par: number | null; title: string; subtitle: string; ranking: string;
  you: number[]; caesar: number[] | null; mode: 'daily' | 'practice' | 'skirmish';
};

const TRIBE_COL = ['#f0b81c', '#2f86e0', '#a24fd6', '#d4d4d4']; // the board's tribe colours (app.ts TRIBE_COL), the white one greyed for parchment
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function shareSvg(c: ShareCard): string {
  const S = 1080, beat = c.par !== null && c.total >= c.par;
  // ---- the map, fitted into the left 470 × 760 box
  const sup = supplied(c.sc, c.fin), xs = c.sc.towns.map((t) => t.x), ys = c.sc.towns.map((t) => t.y);
  const x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 6, y0 = Math.min(...ys) - 6, y1 = Math.max(...ys) + 6;
  const k = Math.min(470 / (x1 - x0), 760 / (y1 - y0)), ox = 60 + (470 - (x1 - x0) * k) / 2, oy = 210 + (760 - (y1 - y0) * k) / 2;
  const P = (x: number, y: number) => `${(ox + (x - x0) * k).toFixed(1)},${(oy + (y - y0) * k).toFixed(1)}`;
  let map = '';
  for (const r of c.sc.roads) {
    const A = c.sc.towns[r.a]!, B = c.sc.towns[r.b]!, mine = c.fin.built[r.id];
    map += `<polyline points="${P(A.x, A.y)} ${P(B.x, B.y)}" stroke="${mine ? '#c9971f' : '#8a7a5a'}" stroke-width="${mine ? 9 : 3}" stroke-linecap="round" ${mine ? '' : 'stroke-dasharray="8 7" opacity=".55"'} fill="none"/>`;
  }
  for (const t of c.sc.towns) {
    const [cx, cy] = P(t.x, t.y).split(',');
    map += t.id === c.sc.castra ? `<circle cx="${cx}" cy="${cy}" r="20" fill="#8b1a1a" stroke="#2b2115" stroke-width="4"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${11 + t.value * 2.5}" fill="${TRIBE_COL[t.tribe % TRIBE_COL.length]}" stroke="#fff" stroke-width="3" opacity="${sup[t.id] ? 1 : 0.3}"/>`;
  }
  // ---- the race: your curve and Caesar's
  const W = 410, H = 220, gx = 600, gy = 730, n = c.you.length;
  const top = Math.max(10, ...c.you, ...(c.caesar ?? []));
  const pts = (cv: number[]) => [0, ...cv].map((v, i) => `${(gx + (i * W) / n).toFixed(1)},${(gy + H - (H * v) / top).toFixed(1)}`).join(' ');
  const race = `<line x1="${gx}" y1="${gy + H}" x2="${gx + W}" y2="${gy + H}" stroke="#c9b88f" stroke-width="2"/>`
    + (c.caesar ? `<polyline points="${pts(c.caesar)}" fill="none" stroke="#e8642c" stroke-width="6" stroke-linejoin="round"/>` : '')
    + `<polyline points="${pts(c.you)}" fill="none" stroke="#2f6fd6" stroke-width="9" stroke-linejoin="round"/>`
    + `<text x="${gx}" y="${gy - 18}" font-size="26" fill="#7a6a4f">Turn by turn: <tspan fill="#2f6fd6" font-weight="bold">you</tspan>${c.caesar ? ' vs <tspan fill="#e8642c" font-weight="bold">Caesar</tspan>' : ''}</text>`;
  const gap = c.par === null ? '' : beat ? `Caesar beaten (${c.par})` : `${c.par - c.total} short of Caesar (${c.par})`;
  // the unranked tag sized to its text (Georgia bold 22 px, letter-spaced: about 14.5 px a character)
  const tagText = c.mode === 'practice' ? 'PRACTICE · UNRANKED' : 'SKIRMISH · UNRANKED', tagW = Math.round(tagText.length * 14.5 + 44);
  const tag = c.mode === 'daily' ? '' : `<rect x="${805 - tagW / 2}" y="218" width="${tagW}" height="44" rx="22" fill="#6b5d42"/><text x="805" y="248" font-size="22" letter-spacing="1" fill="#fff" text-anchor="middle" font-weight="bold">${tagText}</text>`;
  // right column, top to bottom, nothing overlapping: tag 218-262, title 320, score 395-500 (the wreath around it
  // when Caesar is beaten, its leaves outside the digits), gap line 612, ranking 654, race 702-950
  const digits = String(c.total).length, fs = digits <= 3 ? 150 : 118;
  const wreath = beat ? `<g transform="translate(805,368) scale(1.98)" opacity=".9">${laurelSvg().replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" font-family="Georgia, 'Times New Roman', serif">
  <defs><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d77a"/><stop offset=".5" stop-color="#c9971f"/><stop offset="1" stop-color="#8a5f0e"/></linearGradient></defs>
  <rect width="${S}" height="${S}" fill="#f3ead6"/><rect x="24" y="24" width="${S - 48}" height="${S - 48}" rx="28" fill="none" stroke="#c9b88f" stroke-width="4"/>
  <text x="${S / 2}" y="112" text-anchor="middle" font-size="66" font-weight="bold" letter-spacing="3" fill="url(#gold)" stroke="#4a3008" stroke-width="1.5">ALL ROADS LEAD TO ROME</text>
  <text x="${S / 2}" y="165" text-anchor="middle" font-size="32" fill="#7a6a4f">${esc(c.subtitle)}</text>
  ${map}${tag}
  <text x="805" y="320" text-anchor="middle" font-size="34" fill="#4a3b26">${esc(c.title)}</text>
  ${wreath}
  <text x="805" y="500" text-anchor="middle" font-size="${fs}" font-weight="bold" fill="#8a5f0e">${c.total}</text>
  <text x="805" y="612" text-anchor="middle" font-size="32" font-weight="bold" fill="${beat ? '#2e6b34' : '#8b1a1a'}">${esc(gap)}</text>
  ${c.ranking ? `<text x="805" y="654" text-anchor="middle" font-size="26" fill="#4a3b26">${esc(c.ranking)}</text>` : ''}
  ${race}
  <text x="${S / 2}" y="1030" text-anchor="middle" font-size="26" fill="#8a7a5a">A daily campaign on Reddit · can you out-march Caesar?</text>
</svg>`;
}

/** The PNG of a share card (null if the browser cannot rasterise it). */
export function shareBlob(svg: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1080;
      const g = cv.getContext('2d');
      if (!g) return resolve(null);
      g.drawImage(img, 0, 0);
      cv.toBlob((b) => resolve(b), 'image/png');
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * Share the picture: the system share sheet with the file where the browser allows it (most phones), else
 * a copy to the clipboard, else a download. Returns what happened, for the button's message.
 */
export async function sharePicture(blob: Blob, text: string): Promise<'shared' | 'copied' | 'downloaded' | 'cancelled' | 'failed'> {
  const file = new File([blob], 'all-roads-to-rome.png', { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return 'shared'; }
  } catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; }
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); return 'copied'; }
  } catch { /* fall through */ }
  try {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'all-roads-to-rome.png' });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return 'downloaded';
  } catch { return 'failed'; }
}
