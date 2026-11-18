/** A static laurel wreath (around a score when Caesar is beaten). Shared by the results page and the post card. */
export function laurelSvg(cls = 'laurel'): string {
  const B = (s: number, t: number) => { // the stem: cubic Bézier from the knot up one side
    const p0 = [s * 8, 96], p1 = [s * 76, 92], p2 = [s * 108, 50], p3 = [s * 84, -2], m = 1 - t;
    const f = (i: 0 | 1) => m * m * m * p0[i]! + 3 * m * m * t * p1[i]! + 3 * m * t * t * p2[i]! + t * t * t * p3[i]!;
    return [f(0), f(1)] as const;
  };
  let out = '';
  for (const s of [-1, 1]) {
    out += `<path class="lstem" d="M${s * 8},96 C${s * 76},92 ${s * 108},50 ${s * 84},-2" fill="none" stroke="#6b7a2a" stroke-width="3" stroke-linecap="round"/>`;
    for (let k = 0; k < 9; k++) {
      const t = 0.08 + k * 0.105, [x, y] = B(s, t), [x2, y2] = B(s, Math.min(1, t + 0.02)), ang = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI;
      for (const o of [1, -1]) out += `<g class="lleaf" data-k="${k}"><path d="M0,0 C5,-4 12,-4 16,0 C12,4 5,4 0,0 Z" fill="${k % 2 ? '#8aa83a' : '#a3bf4a'}" stroke="#4a5a1a" stroke-width=".8" transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(ang + o * s * -38).toFixed(1)})"/></g>`;
    }
  }
  return `<svg class="${cls}" viewBox="-115 -10 230 120" aria-hidden="true">${out}<circle cx="0" cy="99" r="4" fill="#d4a017" stroke="#6b4a0a"/></svg>`;
}
