/**
 * The loading screen. game.html paints parchment and the title before any script arrives (static markup);
 * as soon as this runs, today's map is drawn into it and its roads pave outwards from the castra, ring by ring,
 * looping while the server answers. bootDone() fades it out over the mounted game and removes it.
 * Nothing waits for it: on a fast connection it is gone in a moment.
 */
import type { Scenario } from '../../shared/engine';

const TRIBE_COL = ['#f0b81c', '#2f86e0', '#a24fd6', '#d4d4d4']; // the board's tribe colours (app.ts TRIBE_COL), the white one greyed for parchment
let running: Animation[] = [], timer: ReturnType<typeof setTimeout> | undefined, stopped = false;
const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function bootPaint(sc: Scenario) {
  const slot = document.getElementById('bootmap');
  if (!slot || slot.childElementCount) return;
  // hops from the castra over the candidate roads: the paving order
  const hop = sc.towns.map(() => Infinity); hop[sc.castra] = 0;
  const q = [sc.castra];
  while (q.length) {
    const t = q.shift()!;
    for (const r of sc.roads) { const o = r.a === t ? r.b : r.b === t ? r.a : -1; if (o >= 0 && hop[o] === Infinity) { hop[o] = hop[t]! + 1; q.push(o); } }
  }
  let s = `<svg viewBox="-2 -4 104 146" aria-hidden="true"><g class="bnet">`;
  for (const r of sc.roads) { const A = sc.towns[r.a]!, B = sc.towns[r.b]!; s += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`; }
  s += '</g><g class="bpave">';
  for (const r of sc.roads) {
    const [f, t] = hop[r.a]! <= hop[r.b]! ? [r.a, r.b] : [r.b, r.a], A = sc.towns[f]!, B = sc.towns[t]!, len = Math.hypot(B.x - A.x, B.y - A.y);
    s += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" data-ring="${hop[f]}" data-len="${len.toFixed(2)}" stroke-dasharray="${len.toFixed(2)} ${len.toFixed(2)}" stroke-dashoffset="${still() ? 0 : len.toFixed(2)}"/>`;
  }
  s += '</g><g class="btowns">';
  for (const t of sc.towns) {
    s += t.id === sc.castra ? `<circle cx="${t.x}" cy="${t.y}" r="4" class="bcastra" data-hop="0"/>`
      : `<circle cx="${t.x}" cy="${t.y}" r="${2 + t.value * 0.5}" fill="${TRIBE_COL[t.tribe % TRIBE_COL.length]}" data-hop="${hop[t.id]}"/>`;
  }
  slot.innerHTML = `${s}</g></svg>`;
  const svg = slot.firstElementChild as SVGSVGElement;
  if (still() || typeof svg.animate !== 'function') return;
  running.push(svg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'both' }));
  const STEP = 200, DUR = 260, last = Math.max(...hop.filter(Number.isFinite)) * STEP + DUR;
  const pave = () => {
    if (stopped) return;
    running.forEach((a) => a.cancel()); running = [];
    svg.querySelectorAll<SVGLineElement>('.bpave line').forEach((l) => {
      const len = Number(l.dataset.len);
      running.push(l.animate([{ strokeDashoffset: len, opacity: 1 }, { strokeDashoffset: 0, opacity: 1 }], { duration: DUR, delay: Number(l.dataset.ring) * STEP, easing: 'ease-out', fill: 'both' }));
    });
    svg.querySelectorAll<SVGCircleElement>('.btowns circle').forEach((c) => {
      const h = Number(c.dataset.hop);
      if (!Number.isFinite(h)) return;
      c.style.transformBox = 'fill-box'; c.style.transformOrigin = 'center';
      running.push(c.animate([{ transform: 'scale(1)', opacity: 0.55 }, { transform: 'scale(1.6)', opacity: 1, offset: 0.5 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300, delay: h === 0 ? 0 : (h - 1) * STEP + DUR - 40, fill: 'both' }));
    });
    // still loading after a full paving: let it rest, fade the gold, pave again
    timer = setTimeout(() => {
      if (stopped) return;
      svg.querySelectorAll<SVGLineElement>('.bpave line').forEach((l) => running.push(l.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards', composite: 'replace' })));
      timer = setTimeout(pave, 260);
    }, last + 600);
  };
  pave();
}

/** The game is on screen: the loading screen fades out over it (0.25 s) and leaves the page. */
export function bootDone() {
  stopped = true;
  if (timer) clearTimeout(timer);
  const el = document.getElementById('boot');
  if (!el) return;
  const end = () => { running.forEach((a) => a.cancel()); running = []; el.remove(); };
  if (still() || typeof el.animate !== 'function') return end();
  el.style.pointerEvents = 'none';
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).finished.then(end, end);
}
