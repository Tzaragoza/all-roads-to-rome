// One-shot effects drawn over the board: the end of a turn, a road being built, a garrison raised.
//
// How it works (see docs/07-client.md, "Animations"):
// - Effects live in temporary <g class="fxl"> layers (not "fx": that is the board's event-overlay layer) appended next to the element they decorate, so
//   they share its coordinates. The game redraws the map on every action, which removes them: a
//   redraw simply ends the effect early (the board underneath is already in its final state).
// - Each effect is a Web Animations API call (`el.animate`): delays sequence it, `finish()` skips it.
// - Only transform and opacity are animated (composited by the GPU: smooth on cheap phones).
// - "Reduce motion" (the phone's setting): no movement, no shaking, numbers just fade in place.

const NS = 'http://www.w3.org/2000/svg';
let running: Animation[] = [];
let timers: Array<ReturnType<typeof setTimeout>> = [];
let finishers: Array<() => void> = [];

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Screenshots (rulebook) turn effects off with <html data-nofx>. */
const off = () => typeof document !== 'undefined' && document.documentElement.hasAttribute('data-nofx');
export const fxActive = () => running.some((a) => a.playState === 'running');

/** End every effect now (a tap skips the show): counters jump to their final values. */
export function fxFinish() {
  for (const a of running) { try { a.finish(); } catch { /* already gone */ } }
  timers.forEach(clearTimeout); timers = [];
  finishers.splice(0).forEach((f) => f());
  running = [];
  document.querySelectorAll('#map g.fxl').forEach((g) => g.remove());
}

function mk<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent.appendChild(e);
  return e;
}
function anim(el: Element, kf: Keyframe[], o: KeyframeAnimationOptions): Animation | null {
  if (typeof (el as HTMLElement).animate !== 'function') return null;
  const a = (el as HTMLElement).animate(kf, { fill: 'both', ...o });
  running.push(a);
  return a;
}
function later(ms: number, f: () => void) { timers.push(setTimeout(f, ms)); }
/** A temporary layer beside `near`, in its coordinates, removed after `ms`. */
function layer(near: Element, ms: number): SVGGElement {
  const g = mk('g', { class: 'fxl' }, near.parentElement!);
  later(ms, () => g.remove());
  return g;
}
const center = (el: SVGGraphicsElement) => { const b = el.getBBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height }; };
const pivot = (el: SVGElement) => { el.style.transformBox = 'fill-box'; el.style.transformOrigin = 'center'; };
/** The map's scale unit (art pixels per board unit), so effects keep their size on every board. */
const unit = (svg: SVGSVGElement) => Number(svg.style.getPropertyValue('--u')) || 1;

/** `x` moved, if needed, so text centred on it stays inside the visible map (margin in board units). */
function onScreen(root: HTMLElement, L: SVGGElement, x: number, margin: number): number {
  const m = (L as unknown as SVGGraphicsElement).getScreenCTM?.(), view = (root.querySelector('.mapwrap') ?? L.ownerSVGElement)?.getBoundingClientRect();
  if (!m || !m.a || !view) return x;
  const px = margin * Math.abs(m.a), sx = m.a * x + m.e;
  return x + (Math.max(view.left + px, Math.min(view.right - px, sx)) - sx) / m.a;
}

/** `above` if text there stays inside the visible map (margin in board units), else `below`. */
function onScreenY(root: HTMLElement, L: SVGGElement, above: number, below: number, margin: number): number {
  const m = (L as unknown as SVGGraphicsElement).getScreenCTM?.(), view = (root.querySelector('.mapwrap') ?? L.ownerSVGElement)?.getBoundingClientRect();
  if (!m || !m.d || !view) return above;
  return m.d * above + m.f - margin * Math.abs(m.d) < view.top ? below : above;
}
function floater(L: SVGGElement, x: number, y: number, text: string, cls: string, delay: number, u: number, coin = false) {
  // a denarii floater ends with the map's coin (gold disc with a D) instead of an emoji, drawn beside the number
  const fs = 30 * u, g = coin ? mk('g', {}, L) : L;
  const t = mk('text', { x: coin ? x + fs * 0.1 : x, y, 'text-anchor': coin ? 'end' : 'middle', class: `fxnum ${cls}`, style: `font-size:${fs.toFixed(1)}px;stroke-width:${(6 * u).toFixed(1)}px` }, g);
  t.textContent = text;
  if (coin) {
    const cx = x + fs * 0.56, cy = y - fs * 0.34, r = fs * 0.36;
    mk('circle', { cx, cy, r, fill: '#f2c230', stroke: '#2b2116', 'stroke-width': (2.6 * u).toFixed(1) }, g);
    const d = mk('text', { x: cx, y: cy + r * 0.45, 'text-anchor': 'middle', style: `font:bold ${(r * 1.35).toFixed(1)}px Georgia,serif;fill:#8a5a0c` }, g);
    d.textContent = 'D';
  }
  const el = coin ? (g as SVGElement) : t; pivot(el);
  anim(el, reducedMotion()
    ? [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }]
    : [{ transform: 'translate(0,6px) scale(.6)', opacity: 0 }, { transform: 'translate(0,-2px) scale(1.18)', opacity: 1, offset: 0.16 },
      { transform: 'translate(0,-10px) scale(1)', opacity: 1, offset: 0.6 }, { transform: 'translate(0,-26px) scale(1)', opacity: 0 }],
  { duration: 1100, delay, easing: 'cubic-bezier(.2,.7,.3,1)' });
}
function bump(el: HTMLElement | null) {
  if (el) anim(el, [{ transform: 'scale(1.35)', color: '#b8860b' }, { transform: 'scale(1)' }], { duration: 320 });
}

// ------------------------------------------------------------------ end of turn

export type Payment = { town: number; glory: number; denarii: number; hop: number };
export type EndTurnFx = {
  cut: number[]; lost: number[]; burned: number[];
  /** Paying towns (the castra's base income too, as town = castra with glory 0; a debt as negative denarii at hop −1). See pay.ts. */
  pays: Payment[];
  /** Glory not tied to a town (the decree's per-turn share), shown at the Decree button. */
  extraGlory: number;
  counters: { glory: [number, number]; denarii: [number, number] };
  tick?: (i: number) => void;
  /** When the pay begins (ms): after the turn's battle (cuts, shields, fires) has played out. Default: 720 after a strike, else 150. */
  payAt?: number;
};

/**
 * The end of a turn, in three overlapping beats (about 1.3 s):
 * 1. strike: each cut road (as it stood) flashes red, shudders, scatters stones and fades over its rubble;
 * 2. consequence: towns lost send red rings and "cut off" (burned: "burned");
 * 3. reward: a debt due (loan instalment) leaves the castra first as a red −coin, then +★ / +coin rise from the castra and
 *    town by town outwards; the bar's counters tick as each appears, so the treasury never shows more than it will hold.
 */
export function fxEndTurn(root: HTMLElement, e: EndTurnFx): number {
  fxFinish();
  if (off()) return 0;
  const svg = root.querySelector<SVGSVGElement>('#map');
  if (!svg) return 0;
  const u = unit(svg), rm = reducedMotion();
  const roadEl = (id: number) => svg.querySelector<SVGGElement>(`g.road[data-road="${id}"]`);
  const townEl = (id: number) => svg.querySelector<SVGGElement>(`g.town[data-town="${id}"]`);

  // 1. strike
  for (const id of e.cut) {
    const g = roadEl(id), seg = g?.querySelector('path');
    if (!g || !seg) continue;
    const d = seg.getAttribute('d')!, L = layer(g, 1600);
    const red = mk('path', { d, stroke: '#ff3b1f', 'stroke-width': 16 * u, 'stroke-linecap': 'round', fill: 'none' }, L);
    const copy = mk('g', { class: 'road' }, L);
    for (const c of ['pave0', 'pave1', 'pave2']) mk('path', { d, class: c }, copy);
    pivot(copy);
    const p = copy.querySelector('path')!, len = p.getTotalLength(), mid = p.getPointAtLength(len / 2);
    if (rm) { anim(copy, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 }); anim(red, [{ opacity: 0 }, { opacity: 0.7 }, { opacity: 0 }], { duration: 400 }); continue; }
    anim(red, [{ opacity: 0 }, { opacity: 0.85, offset: 0.2 }, { opacity: 0 }], { duration: 520 });
    anim(copy, [{ transform: 'translate(0,0)' }, { transform: `translate(${-3 * u}px,${2 * u}px)`, offset: 0.15 }, { transform: `translate(${3 * u}px,${-2 * u}px)`, offset: 0.3 },
      { transform: `translate(${-2 * u}px,${u}px)`, offset: 0.45 }, { transform: 'translate(0,0)', opacity: 1, offset: 0.55 }, { transform: 'translate(0,0)', opacity: 0 }], { duration: 520 });
    for (let k = 0; k < 9; k++) {
      const q = p.getPointAtLength(len * (0.2 + 0.6 * Math.random()));
      const st = mk('rect', { x: q.x - 3 * u, y: q.y - 3 * u, width: 6 * u, height: 6 * u, rx: 1.5 * u, fill: k % 3 ? '#9b8a6a' : '#d8c38f', stroke: '#2b2116', 'stroke-width': u }, L);
      pivot(st);
      const dx = (Math.random() - 0.5) * 60 * u, dy = (-20 - Math.random() * 25) * u;
      anim(st, [{ transform: 'translate(0,0) rotate(0)', opacity: 0 }, { opacity: 1, offset: 0.1 }, { transform: `translate(${dx * 0.6}px,${dy}px) rotate(${dx * 4}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px,${dy + 30 * u}px) rotate(${dx * 8}deg)`, opacity: 0 }], { duration: 700, delay: 140 + k * 12, easing: 'cubic-bezier(.3,.6,.4,1)' });
    }
    const burst = mk('circle', { cx: mid.x, cy: mid.y, r: 22 * u, fill: 'url(#fxburst)' }, L);
    pivot(burst);
    anim(burst, [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1.3)', opacity: 0.95, offset: 0.3 }, { transform: 'scale(1.7)', opacity: 0 }], { duration: 480, delay: 60 });
  }
  if (e.cut.length && !svg.querySelector('#fxburst')) {
    mk('defs', {}, svg).innerHTML = '<radialGradient id="fxburst"><stop offset="0" stop-color="#fff3a0"/><stop offset=".45" stop-color="#ff8a1f"/><stop offset="1" stop-color="#ff3b1f" stop-opacity="0"/></radialGradient>';
  }

  // 2. consequence
  for (const [ids, label, col] of [[e.lost, 'cut off', '#e0301e'], [e.burned, 'burned', '#ff7a1a']] as const) {
    for (const id of ids) {
      const g = townEl(id);
      if (!g) continue;
      const c = center(g), L = layer(g, 1600);
      for (let k = 0; k < 2; k++) {
        const ring = mk('circle', { cx: c.x, cy: c.y, r: c.w * 0.42, fill: 'none', stroke: col, 'stroke-width': 5 * u }, L);
        pivot(ring);
        anim(ring, rm ? [{ opacity: 0 }, { opacity: 0.9 }, { opacity: 0 }] : [{ transform: 'scale(.8)', opacity: 0.95 }, { transform: 'scale(1.7)', opacity: 0 }], { duration: 600, delay: 350 + k * 220, easing: 'ease-out' });
      }
      // above the town and its siege badge; below it if that would leave the visible map
      floater(L, onScreen(root, L, c.x, 70 * u), onScreenY(root, L, c.y - c.h * 0.95, c.y + c.h * 0.85, 40 * u), label, 'r', 420, u);
    }
  }

  // 3. reward: castra first, then by distance; the whole ripple stays under ~0.6 s
  const ctr = (k: 'glory' | 'denarii') => root.querySelector<HTMLElement>(`[data-ctr="${k}"]`);
  const shown = { glory: e.counters.glory[0], denarii: e.counters.denarii[0] };
  const set = (k: 'glory' | 'denarii', v: number) => { shown[k] = v; const el = ctr(k); if (el) el.textContent = String(v); };
  set('glory', e.counters.glory[0]); set('denarii', e.counters.denarii[0]);
  finishers.push(() => { set('glory', e.counters.glory[1]); set('denarii', e.counters.denarii[1]); });
  const pays = e.pays.filter((p) => p.glory || p.denarii).sort((a, b) => a.hop - b.hop);
  const rising: Array<{ x: number; y: number }> = [];
  const gap = Math.min(130, 600 / Math.max(1, pays.length));
  const t0 = e.payAt ?? (e.cut.length || e.lost.length || e.burned.length ? 720 : 150); // a quiet turn pays at once
  pays.forEach((p, i) => {
    const g = townEl(p.town);
    if (!g) return;
    const c = center(g), t = t0 + i * gap, L = layer(g, t + 1300);
    const x = onScreen(root, L, c.x, 46 * u);
    // keep the numbers inside the visible map, and off a neighbour's numbers rising at the same time
    let y = c.y - c.h * 0.55;
    while (rising.some((q) => Math.abs(q.x - x) < 70 * u && Math.abs(q.y - y) < 22 * u)) y -= 24 * u;
    rising.push({ x, y });
    const both = p.glory && p.denarii;
    if (p.glory) { floater(L, x - (both ? 30 * u : 0), y, `+${p.glory}★`, 'g', t, u); later(t + 170, () => { set('glory', shown.glory + p.glory); bump(ctr('glory')); e.tick?.(i); }); }
    if (p.denarii) { floater(L, x + (both ? 38 * u : 0), y, p.denarii > 0 ? `+${p.denarii}` : `−${-p.denarii}`, p.denarii > 0 ? 'c' : 'r', t + 60, u, true); later(t + 230, () => { set('denarii', shown.denarii + p.denarii); bump(ctr('denarii')); }); }
  });
  const tEnd = t0 + pays.length * gap + 100;
  later(tEnd, () => {
    if (e.extraGlory) { bump(root.querySelector<HTMLElement>('#decree')); e.tick?.(pays.length); }
    set('glory', e.counters.glory[1]); set('denarii', e.counters.denarii[1]); // exact totals, whatever the floaters said
  });
  later(tEnd + 1200, () => { finishers = []; });
  return tEnd + 250; // the last number has risen most of the way
}

// ------------------------------------------------------------------ building

/** A road being built: three shovels dig along it while the paving is laid from the network outwards. */
export function fxRoad(root: HTMLElement, id: number, fromStart: boolean) {
  if (off()) return;
  const svg = root.querySelector<SVGSVGElement>('#map'), g = svg?.querySelector<SVGGElement>(`g.road[data-road="${id}"]`);
  if (!svg || !g) return;
  const u = unit(svg), rm = reducedMotion(), D = 380;
  const paths = [...g.querySelectorAll<SVGPathElement>('path.pave0, path.pave1')];
  const tex = g.querySelector<SVGPathElement>('path.pave2');
  if (rm) { anim(g, [{ opacity: 0.3 }, { opacity: 1 }], { duration: 250 }); return; }
  for (const p of paths) {
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len} ${len}`;
    anim(p, [{ strokeDashoffset: fromStart ? len : -len }, { strokeDashoffset: 0 }], { duration: D, easing: 'cubic-bezier(.4,.1,.3,1)' })
      ?.finished.then(() => { p.style.strokeDasharray = ''; }).catch(() => undefined);
  }
  if (tex) anim(tex, [{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], { duration: D + 120 });
  const ref = paths[0];
  if (!ref) return;
  const len = ref.getTotalLength(), L = layer(g, D + 700);
  [0.25, 0.55, 0.85].forEach((f, k) => {
    const at = ref.getPointAtLength(len * (fromStart ? f : 1 - f)), t = k * 110;
    const sh = mk('g', { transform: `translate(${at.x.toFixed(1)},${(at.y - 26 * u).toFixed(1)}) scale(${(1.9 * u).toFixed(3)})` }, L);
    const s = mk('g', {}, sh); // the shovel: handle, grip, blade
    mk('line', { x1: 0, y1: -16, x2: 0, y2: 6, stroke: '#6b4423', 'stroke-width': 3, 'stroke-linecap': 'round' }, s);
    mk('line', { x1: -4, y1: -16, x2: 4, y2: -16, stroke: '#6b4423', 'stroke-width': 3, 'stroke-linecap': 'round' }, s);
    mk('path', { d: 'M-5,5 L5,5 L4,14 Q0,18 -4,14 Z', fill: '#b9bcc2', stroke: '#2b2116', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, s);
    pivot(s); s.style.transformOrigin = 'center bottom';
    anim(s, [{ transform: 'rotate(-35deg) scale(.3)', opacity: 0 }, { transform: 'rotate(-35deg) scale(1)', opacity: 1, offset: 0.25 },
      { transform: 'rotate(15deg) translate(0,3px)', opacity: 1, offset: 0.55 }, { transform: 'rotate(-10deg)', opacity: 1, offset: 0.75 }, { transform: 'rotate(-10deg) scale(.6)', opacity: 0 }],
    { duration: 520, delay: t, easing: 'ease-in-out' });
    for (let j = 0; j < 3; j++) { // a puff of dirt from the blade
      const dot = mk('circle', { cx: at.x, cy: at.y, r: (2 + Math.random() * 1.5) * u, fill: j % 2 ? '#7a5a34' : '#a07a4a' }, L);
      const dx = (Math.random() - 0.5) * 22 * u, dy = (-10 - Math.random() * 10) * u;
      anim(dot, [{ transform: 'translate(0,0)', opacity: 0 }, { transform: 'translate(0,0)', opacity: 1, offset: 0.05 }, { transform: `translate(${dx}px,${dy}px)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx * 1.4}px,${dy + 14 * u}px)`, opacity: 0 }], { duration: 450, delay: t + 200, easing: 'ease-out' });
    }
  });
}

/** A garrison raised: the palisade ring grows while stakes are driven in, in time with the hammer. */
export function fxGarrison(root: HTMLElement, town: number) {
  if (off()) return;
  const svg = root.querySelector<SVGSVGElement>('#map'), g = svg?.querySelector<SVGGElement>(`g.town[data-town="${town}"]`);
  if (!svg || !g) return;
  const u = unit(svg), rm = reducedMotion();
  const ring = g.querySelector<SVGElement>('.garrison');
  if (rm) { if (ring) anim(ring, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 }); return; }
  if (ring) { pivot(ring); anim(ring, [{ transform: 'scale(.55)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 560, easing: 'ease-out' }); }
  const c = center((ring as unknown as SVGGraphicsElement) ?? g), r = (ring ? c.w / 2 : c.w * 0.45), L = layer(g, 1200);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 - Math.PI / 2, x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r;
    const stake = mk('path', { d: `M${(x - 2.5 * u).toFixed(1)},${(y + 6 * u).toFixed(1)} L${(x - 2.5 * u).toFixed(1)},${(y - 5 * u).toFixed(1)} L${x.toFixed(1)},${(y - 9 * u).toFixed(1)} L${(x + 2.5 * u).toFixed(1)},${(y - 5 * u).toFixed(1)} L${(x + 2.5 * u).toFixed(1)},${(y + 6 * u).toFixed(1)} Z`,
      fill: '#a8743c', stroke: '#2b2116', 'stroke-width': 1.2 * u, 'stroke-linejoin': 'round' }, L);
    pivot(stake); stake.style.transformOrigin = 'center bottom';
    const t = Math.floor(k / 3) * 180 + (k % 3) * 40; // in threes, on the hammer blows
    anim(stake, [{ transform: 'translate(0,-14px) scaleY(.4)', opacity: 0 }, { transform: 'translate(0,2px) scaleY(1.1)', opacity: 1, offset: 0.35 },
      { transform: 'translate(0,0) scaleY(1)', opacity: 1, offset: 0.7 }, { transform: 'translate(0,0) scaleY(1)', opacity: 0 }], { duration: 760, delay: t, easing: 'ease-out' });
  }
}

// ------------------------------------------------------------------ legions

/** A legion marches: its standard walks the towns on its route (already drawn at the destination), bobbing, raising dust. */
export function fxMarch(root: HTMLElement, legion: number, route: number[]) {
  if (off() || route.length < 2) return;
  const svg = root.querySelector<SVGSVGElement>('#map'), st = svg?.querySelector<SVGGElement>(`g.standard[data-leg="${legion}"]`);
  if (!svg || !st) return;
  const u = unit(svg), pts = route.map((t) => svg.querySelector<SVGGElement>(`g.town[data-town="${t}"]`)).map((g) => (g ? center(g) : null));
  if (pts.some((p) => !p)) return;
  const P = pts as Array<{ x: number; y: number }>, end = P[P.length - 1]!;
  const lens = P.slice(1).map((p, k) => Math.hypot(p.x - P[k]!.x, p.y - P[k]!.y)), tot = lens.reduce((a, b) => a + b, 0) || 1;
  const dur = 300 + 175 * lens.length;
  if (reducedMotion()) { anim(st, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 }); return; }
  let acc = 0;
  const kf: Keyframe[] = P.map((p, k) => { if (k) acc += lens[k - 1]!; return { transform: `translate(${(p.x - end.x).toFixed(1)}px,${(p.y - end.y).toFixed(1)}px)`, offset: acc / tot }; });
  anim(st, kf, { duration: dur, easing: 'ease-in-out' });
  const inner = mk('g', {}, st); [...st.childNodes].filter((n) => n !== inner).forEach((n) => inner.appendChild(n));
  pivot(inner); inner.style.transformOrigin = 'center bottom';
  anim(inner, [0, -6, 5, -5, 4, -3, 0].map((r, k) => ({ transform: `rotate(${r}deg) translate(0,${k % 2 ? -3 * u : 0}px)` })), { duration: dur, easing: 'linear' });
  const b = st.getBBox(), foot = { x: b.x + b.width / 2 - end.x, y: b.y + b.height - end.y }, L = layer(st, dur + 700);
  for (let k = 0; k < 7; k++) {
    const f = k / 7; let d = f * tot, i = 0;
    while (i < lens.length - 1 && d > lens[i]!) d -= lens[i++]!;
    const a = P[i]!, c = P[i + 1]!, q = d / (lens[i] || 1);
    const puff = mk('circle', { cx: a.x + (c.x - a.x) * q + foot.x, cy: a.y + (c.y - a.y) * q + foot.y, r: 9 * u, fill: '#c9b48a' }, L);
    pivot(puff);
    anim(puff, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 0.7, offset: 0.2 }, { transform: `scale(1.8) translate(0,${-4 * u}px)`, opacity: 0 }], { duration: 600, delay: f * dur });
  }
}

/** A new legion rises out of the castra. */
export function fxRecruit(root: HTMLElement, legion: number) {
  if (off()) return;
  const st = root.querySelector<SVGGElement>(`#map g.standard[data-leg="${legion}"]`);
  if (!st) return;
  if (reducedMotion()) { anim(st, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 }); return; }
  const inner = mk('g', {}, st); [...st.childNodes].filter((n) => n !== inner).forEach((n) => inner.appendChild(n));
  pivot(inner); inner.style.transformOrigin = 'center bottom';
  anim(inner, [{ transform: 'translate(0,20px) scale(.3)', opacity: 0 }, { transform: 'translate(0,-6px) scale(1.12)', opacity: 1, offset: 0.6 }, { transform: 'translate(0,0) scale(1)', opacity: 1 }], { duration: 600, easing: 'cubic-bezier(.3,.7,.4,1.4)' });
}

// ------------------------------------------------------------------ the map's news

/** A threat has just entered the forecast: its tribe's rim flares, its pitchforks and flames jump and shake. */
export function fxThreat(root: HTMLElement, keys: string[], delay = 0) {
  if (off()) return;
  const rm = reducedMotion();
  let n = 0;
  for (const key of keys) {
    const g = root.querySelector<SVGGElement>(`#map g[data-ev="${CSS.escape(key)}"]`);
    if (!g) continue;
    g.querySelectorAll<SVGElement>('path.revoltrim').forEach((r, k) => anim(r, rm ? [{ opacity: 0.55 }, { opacity: 1 }, { opacity: 0.55 }]
      : [{ opacity: 0.55, strokeWidth: '10px' }, { opacity: 1, strokeWidth: '22px', offset: 0.25 }, { opacity: 0.55, strokeWidth: '10px' }], { duration: 800, delay: delay + k * 40 }));
    if (rm) continue;
    const props = [...g.querySelectorAll<SVGGElement>(':scope > g[clip-path] > g'), ...g.querySelectorAll<SVGGElement>(':scope > g:not([clip-path])')];
    for (const prop of props) {
      const w = document.createElementNS(NS, 'g'); prop.parentElement!.insertBefore(w, prop); w.appendChild(prop);
      pivot(w); w.style.transformOrigin = 'center bottom';
      const a = 10 + (n % 3) * 4, d = delay + (n++ % 5) * 45;
      anim(w, [{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(0,-7px) rotate(${-a}deg)`, offset: 0.15 }, { transform: `translate(0,0) rotate(${a}deg)`, offset: 0.3 },
        { transform: `translate(0,-4px) rotate(${-a * 0.7}deg)`, offset: 0.45 }, { transform: `translate(0,0) rotate(${a * 0.5}deg)`, offset: 0.6 }, { transform: 'translate(0,0) rotate(0)' }], { duration: 700, delay: d, easing: 'ease-out' });
    }
  }
}

/** Towns that just joined Rome: a gold ring, a Roman banner springing up, and what they now pay each turn. */
export function fxJoin(root: HTMLElement, towns: Array<{ town: number; glory: number }>, delay: number) {
  if (off()) return;
  const svg = root.querySelector<SVGSVGElement>('#map');
  if (!svg) return;
  const u = unit(svg), rm = reducedMotion();
  towns.forEach(({ town, glory }, k) => {
    const g = svg.querySelector<SVGGElement>(`g.town[data-town="${town}"]`);
    if (!g) return;
    const c = center(g), L = layer(g, delay + 2400), t0 = delay + k * 120;
    const ring = mk('circle', { cx: c.x, cy: c.y, r: c.w * 0.45, fill: 'none', stroke: '#ffd23f', 'stroke-width': 16 * u }, L);
    pivot(ring);
    anim(ring, rm ? [{ opacity: 0 }, { opacity: 0.9 }, { opacity: 0 }] : [{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 0.95, offset: 0.3 }, { transform: 'scale(1.6)', opacity: 0 }], { duration: 700, delay: t0, easing: 'ease-out' });
    const ban = mk('g', { transform: `translate(${(c.x + c.w * 0.32).toFixed(1)},${(c.y - c.h * 0.25).toFixed(1)}) scale(${(2.2 * u).toFixed(3)})` }, L);
    const bi = mk('g', {}, ban);
    mk('line', { x1: 0, y1: 10, x2: 0, y2: -22, stroke: '#5a3a1a', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, bi);
    mk('line', { x1: -8, y1: -18, x2: 8, y2: -18, stroke: '#5a3a1a', 'stroke-width': 2 }, bi);
    mk('path', { d: 'M-7,-18 H7 V-4 L0,-1 L-7,-4 Z', fill: '#a3161a', stroke: '#2b2116', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }, bi);
    mk('circle', { cx: 0, cy: -11, r: 3, fill: '#e0b42a', stroke: '#2b2116', 'stroke-width': 0.8 }, bi);
    mk('circle', { cx: 0, cy: -24, r: 2.5, fill: '#e0b42a', stroke: '#2b2116', 'stroke-width': 0.8 }, bi);
    pivot(bi); bi.style.transformOrigin = 'center bottom';
    anim(bi, rm ? [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
      : [{ transform: 'scaleY(0)', opacity: 0 }, { transform: 'scaleY(1.25)', opacity: 1, offset: 0.15 }, { transform: 'scaleY(.92)', offset: 0.22 }, { transform: 'scaleY(1)', opacity: 1, offset: 0.8 }, { transform: 'scaleY(1)', opacity: 0 }],
    { duration: 1800, delay: t0 + 40, easing: 'ease-out' });
    if (glory) {
      const t = mk('text', { x: onScreen(root, L, c.x, 120 * u), y: c.y - c.h * 0.7, 'text-anchor': 'middle', class: 'fxnum g', style: `font-size:${(32 * u).toFixed(1)}px;stroke-width:${(8 * u).toFixed(1)}px` }, L);
      t.textContent = `+${glory}★ each turn`; pivot(t);
      anim(t, rm ? [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }]
        : [{ transform: 'translate(0,8px) scale(.7)', opacity: 0 }, { transform: 'translate(0,0) scale(1.08)', opacity: 1, offset: 0.15 }, { transform: 'translate(0,-6px) scale(1)', opacity: 1, offset: 0.75 }, { transform: 'translate(0,-16px)', opacity: 0 }],
      { duration: 1500, delay: t0 + 60, easing: 'cubic-bezier(.2,.7,.3,1)' });
    }
  });
}

// ------------------------------------------------------------------ gambits (HTML)

const SEAL = '<svg viewBox="-20 -20 40 40" width="46" height="46"><path d="M0,-17 C6,-19 9,-13 14,-11 C19,-6 16,-1 18,4 C17,10 11,12 8,16 C2,19 -3,16 -8,16 C-14,13 -15,8 -18,3 C-18,-3 -14,-7 -12,-12 C-8,-17 -4,-16 0,-17 Z" fill="#a3161a" stroke="#5a0c0c" stroke-width="1.5"/><circle r="10" fill="none" stroke="#e8b0a0" stroke-width="1.2" opacity=".7"/><text y="3.5" text-anchor="middle" font-size="8" font-weight="bold" fill="#f4d6c8" font-family="Georgia">SPQR</text></svg>';

/** An offer accepted: a wax seal stamps onto it (resolves when it lands). */
export function fxSeal(row: HTMLElement): Promise<void> {
  if (off()) return Promise.resolve();
  row.style.position = 'relative';
  const seal = Object.assign(document.createElement('div'), { innerHTML: SEAL });
  Object.assign(seal.style, { position: 'absolute', left: '42%', top: '50%', margin: '-23px 0 0 -23px', pointerEvents: 'none', zIndex: '3' });
  row.appendChild(seal);
  row.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
  if (reducedMotion()) return (anim(seal, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 })?.finished ?? Promise.resolve()).then(() => undefined, () => undefined);
  anim(row, [{ transform: 'translate(0,0)' }, { transform: 'translate(0,0)', offset: 0.45 }, { transform: 'translate(0,3px)', offset: 0.6 }, { transform: 'translate(0,-1px)', offset: 0.8 }, { transform: 'translate(0,0)' }], { duration: 420 });
  const a = anim(seal, [{ transform: 'scale(2.6) rotate(-25deg)', opacity: 0 }, { transform: 'scale(.92) rotate(6deg)', opacity: 1, offset: 0.7 }, { transform: 'scale(1) rotate(4deg)', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.5,0,.75,0)' });
  return (a?.finished ?? Promise.resolve()).then(() => new Promise<void>((r) => setTimeout(r, 120)), () => undefined);
}

/** Coins fly from `from` (a screen rectangle) into the treasury counter, which ticks up from `start`. */
export function fxCoins(root: HTMLElement, from: DOMRect, n: number, start: number, onCoin?: (i: number) => void) {
  const ctr = root.querySelector<HTMLElement>('[data-ctr="denarii"]');
  if (off() || !ctr || n <= 0) return;
  ctr.textContent = String(start);
  const to = ctr.getBoundingClientRect(), rm = reducedMotion();
  finishers.push(() => { ctr.textContent = String(start + n); });
  for (let i = 0; i < Math.min(n, 6); i++) {
    const x0 = from.left + from.width * 0.45 + i * 14, y0 = from.top + 6, coin = Object.assign(document.createElement('div'), { innerHTML: COIN });
    Object.assign(coin.style, { position: 'fixed', left: `${x0}px`, top: `${y0}px`, fontSize: '20px', pointerEvents: 'none', zIndex: '40' });
    document.body.appendChild(coin);
    const dx = to.left - x0, dy = to.top - y0 - 4, t = 60 + i * 110;
    anim(coin, rm ? [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }] : [{ transform: 'translate(0,0) scale(.6)', opacity: 0 }, { transform: `translate(${dx * 0.3}px,-30px) scale(1.1)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${dx}px,${dy}px) scale(.8)`, opacity: 1, offset: 0.95 }, { transform: `translate(${dx}px,${dy}px) scale(.8)`, opacity: 0 }], { duration: 560, delay: t, easing: 'cubic-bezier(.3,.2,.4,1)' })
      ?.finished.then(() => coin.remove(), () => coin.remove());
    later(t + 530, () => { const v = Math.min(start + n, start + Math.round(((i + 1) * n) / Math.min(n, 6))); ctr.textContent = String(v); bump(ctr); onCoin?.(i); });
  }
  later(60 + Math.min(n, 6) * 110 + 600, () => { ctr.textContent = String(start + n); document.querySelectorAll('body > div[style*="z-index: 40"]').forEach((d) => d.remove()); });
}

/** An offer declined: a line of fire eats the scroll from the left, embers and ash rise; resolves when it is gone. */
export function fxBurn(row: HTMLElement): Promise<void> {
  if (off()) return Promise.resolve();
  row.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
  const r = row.getBoundingClientRect();
  if (reducedMotion()) return (anim(row, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 })?.finished ?? Promise.resolve()).then(() => undefined, () => undefined);
  anim(row, [{ filter: 'none' }, { filter: 'sepia(1) brightness(.75) contrast(1.2)', offset: 0.3 }, { filter: 'sepia(1) brightness(.5)' }], { duration: 650 });
  const cut = anim(row, [{ clipPath: 'inset(-20px 0 -20px 0)' }, { clipPath: 'inset(-20px 0 -20px 100%)' }], { duration: 600, delay: 120, easing: 'cubic-bezier(.5,0,.6,1)' });
  const fire = document.createElement('div');
  Object.assign(fire.style, { position: 'fixed', top: `${r.top - 6}px`, left: `${r.left - 10}px`, width: '22px', height: `${r.height + 12}px`, pointerEvents: 'none', zIndex: '40', borderRadius: '10px',
    background: 'linear-gradient(90deg, rgba(40,20,5,0) 0%, #3a1a06 20%, #ff6a1a 45%, #ffd23f 60%, rgba(255,140,40,0) 100%)', filter: 'blur(1.5px)', boxShadow: '0 0 18px 6px rgba(255,120,30,.55)' });
  document.body.appendChild(fire);
  anim(fire, [{ transform: 'translateX(0)', opacity: 0 }, { opacity: 1, offset: 0.12 }, { transform: `translateX(${r.width}px)`, opacity: 1, offset: 0.9 }, { transform: `translateX(${r.width + 8}px)`, opacity: 0 }], { duration: 640, delay: 110, easing: 'cubic-bezier(.5,0,.6,1)' })
    ?.finished.then(() => fire.remove(), () => fire.remove());
  for (let i = 0; i < 26; i++) {
    const f = i / 26, ember = i % 3 === 0, dot = document.createElement('div');
    Object.assign(dot.style, { position: 'fixed', left: `${r.left + r.width * f}px`, top: `${r.top + r.height * (0.2 + 0.6 * Math.random())}px`, width: ember ? '4px' : '5px', height: ember ? '4px' : '5px', borderRadius: '50%',
      background: ember ? '#ffb02e' : '#6e665c', boxShadow: ember ? '0 0 6px 2px rgba(255,150,40,.8)' : 'none', pointerEvents: 'none', zIndex: '40' });
    document.body.appendChild(dot);
    anim(dot, [{ transform: 'translate(0,0)', opacity: 0 }, { opacity: 1, offset: 0.1 }, { transform: `translate(${(Math.random() - 0.5) * 30}px,${-30 - Math.random() * 40}px)`, opacity: 0 }], { duration: 500 + Math.random() * 400, delay: 120 + 600 * f, easing: 'ease-out' })
      ?.finished.then(() => dot.remove(), () => dot.remove());
  }
  return (cut?.finished ?? Promise.resolve()).then(() => undefined, () => undefined);
}

// ------------------------------------------------------------------ results page

/** The results page opens: the score counts up, then the chart's lines draw themselves (Caesar's last). */
export function fxResults(root: HTMLElement, onTick?: (i: number) => void, onLaurel?: () => void) {
  if (off() || reducedMotion()) return;
  const wreath = root.querySelector<SVGSVGElement>('.hero .laurel');
  if (wreath) { // Caesar beaten: the wreath grows from the knot, leaf by leaf, then a shine crosses the number
    onLaurel?.();
    wreath.querySelectorAll<SVGPathElement>('.lstem').forEach((st) => {
      const len = st.getTotalLength(); st.style.strokeDasharray = `${len} ${len}`;
      anim(st, [{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 700, easing: 'ease-out' })?.finished.then(() => { st.style.strokeDasharray = ''; }, () => undefined);
    });
    wreath.querySelectorAll<SVGGElement>('.lleaf').forEach((l, i) => {
      pivot(l); l.style.transformOrigin = 'left center';
      anim(l, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.2)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, delay: 80 + Number(l.dataset.k) * 75 + (i % 2) * 30 });
    });
    const num = root.querySelector<HTMLElement>('.hero .big');
    if (num) { num.classList.add('shine'); anim(num, [{ backgroundPosition: '100% 0' }, { backgroundPosition: '0% 0' }], { duration: 900, delay: 1100, easing: 'ease-in-out' }); }
  }
  const big = root.querySelector<HTMLElement>('.hero .big'), target = Number(big?.textContent);
  if (big && Number.isFinite(target) && target > 0) {
    const t0 = performance.now(), dur = 900;
    let last = -1;
    const step = (t: number) => {
      if (!big.isConnected) return;
      const k = Math.min(1, (t - t0) / dur), v = Math.round(target * (1 - Math.pow(1 - k, 3)));
      big.textContent = String(v);
      const tick = Math.floor(k * 6); if (tick > last && tick < 6) { last = tick; onTick?.(tick); }
      if (k < 1) requestAnimationFrame(step);
    };
    big.textContent = '0'; requestAnimationFrame(step);
  }
  [...root.querySelectorAll<SVGPolylineElement>('.scorechart polyline.ln')].reverse().forEach((pl, i) => {
    const len = pl.getTotalLength?.() ?? 0;
    if (!len) return;
    pl.style.strokeDasharray = `${len} ${len}`;
    anim(pl, [{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 900, delay: 150 + i * 200, easing: 'ease-out' })
      ?.finished.then(() => { pl.style.strokeDasharray = ''; }, () => undefined);
  });
}

// ------------------------------------------------------------------ the turn's news, continued

/** Sieges tick: smoke billows, flames flare, the red badge flips to its new count (or pops up, for a new siege). */
export function fxSiege(root: HTMLElement, sieges: Array<{ town: number; from: number; to: number }>, delay: number) {
  if (off()) return;
  const svg = root.querySelector<SVGSVGElement>('#map');
  if (!svg) return;
  const rm = reducedMotion();
  for (const { town, from, to } of sieges) {
    const g = svg.querySelector<SVGGElement>(`g.town[data-town="${town}"]`), badge = g?.querySelector<SVGGElement>('g.siegebadge'), smoke = g?.querySelector<SVGPathElement>('path.smoke');
    if (!g || !badge) continue;
    const text = badge.querySelector('text');
    const flip = document.createElementNS(NS, 'g');
    while (badge.firstChild) flip.appendChild(badge.firstChild);
    badge.appendChild(flip); pivot(flip);
    if (rm) { anim(flip, [{ opacity: 0.3 }, { opacity: 1 }], { duration: 300, delay }); continue; }
    if (from > 0 && text) { // the count turns over like a tile
      text.textContent = String(from);
      anim(flip, [{ transform: 'rotateX(0)' }, { transform: 'rotateX(90deg)', offset: 0.4 }, { transform: 'rotateX(0) scale(1.5)', offset: 0.7 }, { transform: 'rotateX(0) scale(1)' }], { duration: 650, delay });
      later(delay + 260, () => { text.textContent = String(to); });
      finishers.push(() => { text.textContent = String(to); });
    } else anim(flip, [{ transform: 'scale(0)' }, { transform: 'scale(1.4)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 450, delay, easing: 'ease-out' });
    const L = layer(badge, delay + 1400);
    const rw = mk('g', { transform: badge.getAttribute('transform') ?? '' }, L), last = to <= 1;
    const ring = mk('circle', { r: 12, fill: 'none', stroke: '#ff3b1f', 'stroke-width': 3 }, rw); pivot(ring);
    anim(ring, [{ transform: 'scale(1)', opacity: 0 }, { opacity: last ? 1 : 0.8, offset: 0.4 }, { transform: `scale(${last ? 3.2 : 2.4})`, opacity: 0 }], { duration: last ? 900 : 700, delay: delay + 160, easing: 'ease-out' });
    if (smoke) {
      const sb = smoke.getBBox();
      for (let k = 0; k < 6; k++) {
        const p = mk('circle', { cx: sb.x + sb.width / 2 + ((k % 3) - 1) * 4, cy: sb.y + sb.height * 0.8, r: 6 + k, fill: '#5a5048' }, L); pivot(p);
        anim(p, [{ transform: 'translate(0,0) scale(.4)', opacity: 0 }, { opacity: 0.55, offset: 0.25 }, { transform: `translate(${k % 2 ? 6 : -6}px,${-34 - k * 6}px) scale(1.5)`, opacity: 0 }], { duration: 900, delay: delay - 100 + k * 70, easing: 'ease-out' });
      }
      [smoke.nextElementSibling, smoke.nextElementSibling?.nextElementSibling].forEach((f, k) => {
        if (!(f instanceof SVGGElement) || f.classList.contains('siegebadge')) return;
        const w = document.createElementNS(NS, 'g'); f.before(w); w.appendChild(f); // the flame's own transform places it: scale a wrapper
        pivot(w); w.style.transformOrigin = 'center bottom';
        anim(w, [{ transform: 'scale(1)' }, { transform: 'scale(1.7)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 600, delay: delay + k * 60, easing: 'ease-out' });
      });
    }
  }
}

/** Cut roads that can be rebuilt again: stones lift away, the track returns with a gold shimmer. */
export function fxClear(root: HTMLElement, roads: number[], delay: number) {
  if (off()) return;
  const svg = root.querySelector<SVGSVGElement>('#map');
  if (!svg) return;
  const u = unit(svg), rm = reducedMotion();
  for (const id of roads) {
    const g = svg.querySelector<SVGGElement>(`g.road[data-road="${id}"]`), p = g?.querySelector<SVGPathElement>('path');
    if (!g || !p) continue;
    const tracks = [...g.querySelectorAll<SVGPathElement>('path.track0, path.track1')];
    tracks.forEach((t) => anim(t, [{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: rm ? 300 : 650, delay }));
    if (rm) continue;
    const len = p.getTotalLength(), L = layer(g, delay + 1400);
    for (let k = 0, n = Math.max(4, Math.round(len / 10)); k < n; k++) { // the rubble heaves up and is carted off
      const q = p.getPointAtLength(len * (0.12 + 0.76 * (k / (n - 1)))), j = (k * 37) % 11 - 5;
      const st = mk('rect', { x: q.x - 3.5 + j * 0.6, y: q.y - 2.5 + ((k * 53) % 9 - 4), width: 7, height: 5, rx: 1, fill: '#9a958a', stroke: '#1d1409', 'stroke-width': 1 }, L);
      pivot(st);
      anim(st, [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${j * 0.8}px,-6px) rotate(${j * 6}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${j * 2}px,-22px) rotate(${j * 14}deg)`, opacity: 0 }], { duration: 520, delay: delay + k * 30, easing: 'ease-in' });
      if (k % 2 === 0) { const d = mk('circle', { cx: q.x, cy: q.y, r: 5, fill: '#c9b98f' }, L); pivot(d);
        anim(d, [{ transform: 'scale(.3)', opacity: 0.7 }, { transform: 'scale(2.2)', opacity: 0 }], { duration: 500, delay: delay + 60 + k * 30, easing: 'ease-out' }); }
    }
    const gold = mk('path', { d: p.getAttribute('d')!, stroke: '#ffd23f', 'stroke-width': 9 * u, 'stroke-linecap': 'round', fill: 'none', 'stroke-dasharray': `${len * 0.3} ${len * 2}` }, L);
    anim(gold, [{ strokeDashoffset: `${len * 0.3}px`, opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { strokeDashoffset: `${-len}px`, opacity: 0 }], { duration: 650, delay: delay + 420, easing: 'ease-in-out' });
  }
}

/** A vote cast: a token in the faction's colour drops onto its card, the card glows, the tally bars grow. */
export function fxVote(root: HTMLElement, faction: string, colour: string) {
  if (off()) return;
  const card = root.querySelector<HTMLElement>(`.dcard.${CSS.escape(faction)}`);
  if (!card) return;
  const rm = reducedMotion();
  card.style.position = 'relative';
  const tok = Object.assign(document.createElement('div'), { className: 'vtoken', textContent: faction[0]!.toUpperCase() });
  tok.style.background = colour;
  card.appendChild(tok);
  anim(tok, rm ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: 'translateY(-120px) rotate(-30deg)', opacity: 0 }, { transform: 'translateY(0) rotate(0)', opacity: 1, offset: 0.55 },
    { transform: 'translateY(-10px) rotate(4deg)', offset: 0.75 }, { transform: 'translateY(0) rotate(0)', opacity: 1 }], { duration: 560, easing: 'ease-in' });
  anim(tok, [{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 1800, fill: 'forwards' })?.finished.then(() => tok.remove(), () => undefined);
  if (!rm) anim(card, [{ boxShadow: '0 0 0 0 rgba(212,160,23,0)' }, { boxShadow: '0 0 0 4px rgba(212,160,23,.8)', offset: 0.6 }, { boxShadow: '0 0 0 2px rgba(212,160,23,.5)' }], { duration: 700, delay: 250 });
  root.querySelectorAll<HTMLElement>('.vbar span').forEach((s) => anim(s, [{ width: '0%' }, { width: s.style.width }], { duration: rm ? 1 : 500, delay: rm ? 0 : 320, easing: 'cubic-bezier(.3,.7,.4,1)' }));
}

export { laurelSvg } from './laurel';
import { COIN } from './coin';

// ------------------------------------------------------------------ part 4: the decree, a town razed, a revolt held

/** The day's decree opens (first time each day only): the card springs up, the title stamps; the wax seal then cracks on its own time. */
export function fxDecreeOpen(root: HTMLElement, colour: string) {
  if (off()) return;
  const sheet = root.querySelector<HTMLElement>('.decreesheet'), box = sheet?.querySelector<HTMLElement>('.decreebox');
  if (!sheet || !box) return;
  const seal = Object.assign(document.createElement('div'), { className: 'dseal' });
  seal.setAttribute('aria-hidden', 'true');
  seal.innerHTML = `<i style="background:${colour}">SPQR</i><i style="background:${colour}">SPQR</i><b class="dcrack"></b>`;
  // on the sheet, over the card's top edge (the card itself scrolls, so it would clip a seal that overhangs it)
  const sb = sheet.getBoundingClientRect(), bb = box.getBoundingClientRect();
  seal.style.left = `${bb.left - sb.left + bb.width / 2 - 20}px`; seal.style.top = `${bb.top - sb.top - 18}px`;
  sheet.appendChild(seal);
  const [l, r, crack] = [...seal.children] as HTMLElement[];
  if (reducedMotion()) { anim(seal, [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 700 }); return; }
  anim(sheet, [{ backgroundColor: 'rgba(20,12,4,0)' }, { backgroundColor: 'rgba(20,12,4,.62)' }], { duration: 150 });
  for (const el of [box, seal]) anim(el, [{ transform: 'translateY(36px) scale(.96)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { duration: 200, easing: 'cubic-bezier(.2,.8,.3,1.1)' });
  const h = box.querySelector('h2');
  if (h) anim(h, [{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 180, delay: 150, easing: 'ease-out' });
  // the seal alone takes its time; nothing waits for it
  anim(seal, [{ transform: 'translate(0,0)' }, { transform: 'translate(-1.5px,0) rotate(-4deg)', offset: 0.3 }, { transform: 'translate(1.5px,0) rotate(4deg)', offset: 0.6 }, { transform: 'translate(0,0)' }], { duration: 160, delay: 220, fill: 'forwards' });
  anim(crack!, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 300, delay: 300 });
  for (const [half, k] of [[l!, -1], [r!, 1]] as const) {
    anim(half, [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${3 * k}px,2px) rotate(${6 * k}deg)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${16 * k}px,26px) rotate(${38 * k}deg)`, opacity: 1, offset: 0.75 }, { transform: `translate(${20 * k}px,34px) rotate(${45 * k}deg)`, opacity: 0 }],
    { duration: 750, delay: 420, easing: 'cubic-bezier(.3,0,.7,1)' });
  }
  later(1300, () => seal.remove());
}

/** The decree is put away: the card shrinks into the Decree button, which pulses. Resolves when done (at once if effects are off). */
export function fxDecreeStow(root: HTMLElement): Promise<void> {
  const sheet = root.querySelector<HTMLElement>('.decreesheet'), box = sheet?.querySelector<HTMLElement>('.decreebox'), btn = root.querySelector<HTMLElement>('#decree');
  if (off() || reducedMotion() || !sheet || !box || !btn || typeof box.animate !== 'function') return Promise.resolve();
  const a = box.getBoundingClientRect(), b = btn.getBoundingClientRect();
  if (!b.width) return Promise.resolve();
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2), k = b.width / a.width;
  anim(sheet, [{ backgroundColor: 'rgba(20,12,4,.62)' }, { backgroundColor: 'rgba(20,12,4,0)' }], { duration: 300 });
  const done = anim(box, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${k})`, opacity: 0.3 }], { duration: 300, easing: 'cubic-bezier(.5,0,.8,.4)' });
  return (done?.finished ?? Promise.resolve()).then(() => undefined, () => undefined);
}
/** After the re-render: the Decree button pulses where the card landed. */
export function fxDecreeLanded(root: HTMLElement) {
  const btn = root.querySelector<HTMLElement>('#decree');
  if (!btn || off() || reducedMotion()) return;
  anim(btn, [{ transform: 'scale(1.15)', boxShadow: '0 0 0 5px rgba(212,160,23,.7)' }, { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(212,160,23,0)' }], { duration: 350 });
}

/** A point of `from`'s local coordinates in `to`'s local coordinates. */
function toLocal(x: number, y: number, from: SVGGraphicsElement, to: SVGGraphicsElement) {
  const a = from.getCTM(), b = to.getCTM();
  if (!a || !b) return { x, y };
  const p = new DOMPoint(x, y).matrixTransform(b.inverse().multiply(a));
  return { x: p.x, y: p.y };
}
/** The settlement drawing of a town and its centre, in the coordinates of the drawing's parent. */
function townArt(svg: SVGSVGElement, id: number) {
  const g = svg.querySelector<SVGGElement>(`g.town[data-town="${id}"]`), art = g?.querySelector<SVGGElement>('circle.thit')?.nextElementSibling as SVGGElement | null;
  if (!g || !art || !art.parentElement) return null;
  const b = art.getBBox(), c = toLocal(b.x + b.width / 2, b.y + b.height / 2, art, art.parentElement as unknown as SVGGraphicsElement);
  return { art, parent: art.parentElement as unknown as SVGGElement, ...c };
}
const roadEnds = (g: SVGGElement) => (g.querySelector('path')?.getAttribute('d')?.match(/-?[\d.]+/g) ?? []).map(Number);

/**
 * A siege has run out: the town shudders and goes dark, its flames roar, and fire runs out along every road
 * that touched it, scorching them (the rule: the town survives, its roads burn). `roads`: the roads that burned.
 */
export function fxRaze(root: HTMLElement, towns: Array<{ town: number; roads: number[] }>) {
  if (off()) return;
  const svg = root.querySelector<SVGSVGElement>('#map');
  if (!svg) return;
  const u = unit(svg), rm = reducedMotion();
  for (const { town, roads } of towns) {
    const t = townArt(svg, town);
    if (!t) continue;
    const L = layer(t.art, 1800);
    if (!rm) { // the town shudders and darkens for a moment
      const w = document.createElementNS(NS, 'g'); t.art.before(w); w.appendChild(t.art); pivot(w);
      anim(w, [{ transform: 'translate(0,0)', filter: 'none' }, { transform: 'translate(-2px,0)', offset: 0.1 }, { transform: 'translate(2px,-1px)', offset: 0.2 }, { transform: 'translate(-2px,1px)', offset: 0.3 },
        { transform: 'translate(1px,0)', filter: 'brightness(.45) sepia(.6)', offset: 0.45 }, { transform: 'translate(0,0)', filter: 'brightness(.45) sepia(.6)', offset: 0.8 }, { transform: 'translate(0,0)', filter: 'none' }], { duration: 1300 });
      // the badge's last number, bursting
      const bd = mk('g', { transform: `translate(${t.x + 22},${t.y - 14})` }, L);
      bd.innerHTML = '<g class="siegebadge"><circle r="10"/><text y="4.4">0</text></g>';
      const bi = bd.firstElementChild as SVGGElement; pivot(bi);
      anim(bi, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.3)', opacity: 1, offset: 0.4 }, { transform: 'scale(1.8)', opacity: 0 }], { duration: 380 });
      // the town's own fire roars up
      for (const [dx, dy, k] of [[-8, -2, 0.9], [9, 2, 0.8], [0, -6, 1]] as const) {
        const f = mk('g', {}, L); f.innerHTML = `<g transform="translate(${t.x + dx},${t.y + dy}) scale(${k})"><path d="M0,8 C-7,6 -7,-2 -2,-8 C-2,-3 1,-3 1,-6 C6,-2 7,6 0,8 Z" fill="#f08a1c" stroke="#1d1409" stroke-width="1.2" stroke-linejoin="round"/><path d="M0,7 C-3,5 -3,1 0,-2 C1,1 3,3 0,7 Z" fill="#ffd84a"/></g>`;
        pivot(f); f.style.transformOrigin = 'center bottom';
        anim(f, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(2.4)', opacity: 1, offset: 0.3 }, { transform: 'scale(1.8)', opacity: 1, offset: 0.7 }, { transform: 'scale(0)', opacity: 0 }], { duration: 1200, easing: 'ease-out' });
      }
      for (let k = 0; k < 14; k++) { // embers
        const e = mk('circle', { cx: t.x + ((k % 5) - 2) * 4, cy: t.y, r: 1.6, fill: k % 3 ? '#ffb02e' : '#ff5a1f' }, L); pivot(e);
        anim(e, [{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${((k * 37) % 31) - 15}px,${-40 - ((k * 13) % 30)}px)`, opacity: 0 }], { duration: 900 + (k % 4) * 100, delay: 100 + k * 30, easing: 'ease-out' });
      }
      for (let k = 0; k < 7; k++) { // a column of smoke
        const p = mk('circle', { cx: t.x + ((k % 3) - 1) * 5, cy: t.y - 6, r: 7 + k, fill: '#4a423b' }, L); pivot(p);
        anim(p, [{ transform: 'translate(0,0) scale(.4)', opacity: 0 }, { opacity: 0.6, offset: 0.25 }, { transform: `translate(${k % 2 ? 8 : -8}px,${-46 - k * 7}px) scale(1.7)`, opacity: 0 }], { duration: 1200, delay: 150 + k * 80, easing: 'ease-out' });
      }
    }
    // fire runs out along each road, from the town to the far end, scorching it
    roads.forEach((id, k) => {
      const rg = svg.querySelector<SVGGElement>(`g.road[data-road="${id}"]`);
      if (!rg) return;
      const RL = layer(rg, 1800), here = toLocal(t.x, t.y, t.parent as unknown as SVGGraphicsElement, RL as unknown as SVGGraphicsElement), [x1, y1, x2, y2] = roadEnds(rg);
      if (x1 === undefined || y2 === undefined) return;
      const near1 = Math.hypot(x1 - here.x, y1! - here.y) <= Math.hypot(x2! - here.x, y2 - here.y);
      const a = near1 ? [x1, y1!] : [x2!, y2], b = near1 ? [x2!, y2] : [x1, y1!], len = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!), d = `M${a[0]},${a[1]} L${b[0]},${b[1]}`;
      const char = mk('path', { d, stroke: '#2a1a10', 'stroke-width': 9 * u, 'stroke-linecap': 'round', fill: 'none', 'stroke-dasharray': `${len} ${len}` }, RL);
      anim(char, rm ? [{ opacity: 0 }, { opacity: 0.8, offset: 0.4 }, { opacity: 0 }] : [{ strokeDashoffset: len }, { strokeDashoffset: len, offset: 0.2 }, { strokeDashoffset: 0, opacity: 0.85 }, { opacity: 0 }], { duration: 1300, delay: 120 + k * 60, easing: 'ease-in' });
      if (rm) return;
      const glow = mk('path', { d, stroke: '#ff8a1f', 'stroke-width': 6 * u, 'stroke-linecap': 'round', fill: 'none', 'stroke-dasharray': `${len * 0.22} ${len * 2}` }, RL);
      anim(glow, [{ strokeDashoffset: len * 0.22, opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { strokeDashoffset: -len * 0.8, opacity: 0 }], { duration: 650, delay: 200 + k * 60, easing: 'ease-in' });
      const fl = mk('g', {}, RL);
      fl.innerHTML = `<g transform="scale(${1.3 * u})"><path d="M0,8 C-7,6 -7,-2 -2,-8 C-2,-3 1,-3 1,-6 C6,-2 7,6 0,8 Z" fill="#f08a1c" stroke="#1d1409" stroke-width="1.2" stroke-linejoin="round"/><path d="M0,7 C-3,5 -3,1 0,-2 C1,1 3,3 0,7 Z" fill="#ffd84a"/></g>`;
      const at = (f: number) => `${a[0]! + (b[0]! - a[0]!) * f}px,${a[1]! + (b[1]! - a[1]!) * f}px`;
      anim(fl, [{ transform: `translate(${at(0)}) scale(.6)`, opacity: 0 }, { transform: `translate(${at(0.1)}) scale(1.2)`, opacity: 1, offset: 0.15 }, { transform: `translate(${at(0.85)}) scale(1)`, opacity: 1, offset: 0.85 }, { transform: `translate(${at(1)}) scale(.3)`, opacity: 0 }], { duration: 650, delay: 200 + k * 60, easing: 'ease-in' });
    });
  }
}

/**
 * Revolts that broke on a shield: the attack rushes in from the tribe's land, a scutum slams up on the protected town,
 * sparks, the pitchfork is flung back; the roads it saved gleam, "held" rises. One shield per protected town.
 */
export function fxHeld(root: HTMLElement, held: Array<{ by: number; roads: number[]; from: number[] }>, delay: number) {
  if (off()) return;
  const svg = root.querySelector<SVGSVGElement>('#map');
  if (!svg) return;
  const u = unit(svg), rm = reducedMotion();
  for (const { by, roads, from } of held) {
    const t = townArt(svg, by);
    if (!t) continue;
    const L = layer(t.art, delay + 1600);
    // where the trouble comes from: the centre of the revolting tribe's towns
    const pts = from.map((id) => townArt(svg, id)).filter((p): p is NonNullable<typeof p> => !!p).map((p) => toLocal(p.x, p.y, p.parent as unknown as SVGGraphicsElement, t.parent as unknown as SVGGraphicsElement));
    const fx0 = pts.length ? pts.reduce((s, p) => s + p.x, 0) / pts.length : t.x + 60, fy0 = pts.length ? pts.reduce((s, p) => s + p.y, 0) / pts.length : t.y - 60;
    let ux = fx0 - t.x, uy = fy0 - t.y; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
    if (ul < 1) { ux = 0.7; uy = -0.7; }
    const start = [t.x + ux * 95, t.y + uy * 95], hit = [t.x + ux * 26, t.y + uy * 26], back = [hit[0]! + ux * 30, hit[1]! + uy * 30 - 14];
    const sh = mk('g', {}, L);
    sh.innerHTML = `<g transform="translate(${t.x},${t.y - 4})"><g><rect x="-11" y="-15" width="22" height="30" rx="5" fill="#a3221a" stroke="#1d1409" stroke-width="1.6"/><rect x="-7.5" y="-11.5" width="15" height="23" rx="3" fill="none" stroke="#e0b12e" stroke-width="1.4"/><path d="M0,-11 V11 M-7,0 H7" stroke="#e0b12e" stroke-width="1.2"/><circle r="4" fill="#e0b12e" stroke="#1d1409" stroke-width="1"/></g></g>`;
    const shield = sh.firstElementChild!.firstElementChild as SVGGElement; pivot(shield);
    if (rm) { anim(shield, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1100, delay }); floater(L, onScreen(root, L, t.x, 60 * u), t.y - 52, 'held', 'b', delay + 350, u); continue; }
    const atk = mk('g', {}, L);
    atk.innerHTML = `<g transform="scale(1.5)"><g transform="rotate(${(Math.atan2(-uy, -ux) * 180) / Math.PI + 90})"><line x1="0" y1="12" x2="0" y2="-6" stroke="#7a4a24" stroke-width="2.6"/><path d="M-5,-12 V-6 H5 V-12 M0,-13 V-6" fill="none" stroke="#5a5a5a" stroke-width="1.8" stroke-linecap="round"/></g><g transform="translate(9,4) scale(.8)"><path d="M0,8 C-7,6 -7,-2 -2,-8 C-2,-3 1,-3 1,-6 C6,-2 7,6 0,8 Z" fill="#f08a1c" stroke="#1d1409" stroke-width="1.2"/><path d="M0,7 C-3,5 -3,1 0,-2 C1,1 3,3 0,7 Z" fill="#ffd84a"/></g></g>`;
    anim(atk, [{ transform: `translate(${start[0]}px,${start[1]}px) rotate(0)`, opacity: 0 }, { opacity: 1, offset: 0.12 }, { transform: `translate(${hit[0]}px,${hit[1]}px) rotate(0)`, opacity: 1, offset: 0.38 },
      { transform: `translate(${back[0]}px,${back[1]}px) rotate(${ux > 0 ? 160 : -160}deg)`, opacity: 0 }], { duration: 680, delay, easing: 'ease-in' });
    anim(shield, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(0)', opacity: 0, offset: 0.18 }, { transform: 'scale(1.35)', opacity: 1, offset: 0.32 }, { transform: 'scale(1) rotate(-6deg)', opacity: 1, offset: 0.42 },
      { transform: 'scale(1) rotate(0)', opacity: 1, offset: 0.8 }, { transform: 'scale(.8)', opacity: 0 }], { duration: 1400, delay, easing: 'ease-out' });
    const ring = mk('circle', { cx: t.x, cy: t.y - 4, r: 16, fill: 'none', stroke: '#ffe58a', 'stroke-width': 3 }, L); pivot(ring);
    anim(ring, [{ transform: 'scale(.6)', opacity: 1 }, { transform: 'scale(2.4)', opacity: 0 }], { duration: 450, delay: delay + 250, easing: 'ease-out' });
    for (let k = 0; k < 9; k++) {
      const ang = Math.atan2(uy, ux) + (k - 4) * 0.28;
      const sp = mk('line', { x1: hit[0]!, y1: hit[1]!, x2: hit[0]! + Math.cos(ang) * 5, y2: hit[1]! + Math.sin(ang) * 5, stroke: k % 2 ? '#fff3a0' : '#ffb02e', 'stroke-width': 2, 'stroke-linecap': 'round' }, L);
      anim(sp, [{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${Math.cos(ang) * 22}px,${Math.sin(ang) * 22}px)`, opacity: 0 }], { duration: 350, delay: delay + 255, easing: 'ease-out' });
    }
    roads.forEach((id, k) => { // the roads it saved gleam
      const rg = svg.querySelector<SVGGElement>(`g.road[data-road="${id}"]`), p = rg?.querySelector('path');
      if (!rg || !p) return;
      const RL = layer(rg, delay + 1200), len = p.getTotalLength();
      const g = mk('path', { d: p.getAttribute('d')!, stroke: '#cfe6ff', 'stroke-width': 6 * u, 'stroke-linecap': 'round', fill: 'none', 'stroke-dasharray': `${len * 0.3} ${len * 2}` }, RL);
      anim(g, [{ strokeDashoffset: len * 0.3, opacity: 0 }, { opacity: 0.95, offset: 0.2 }, { strokeDashoffset: -len, opacity: 0 }], { duration: 520, delay: delay + 380 + k * 50, easing: 'ease-in-out' });
    });
    floater(L, onScreen(root, L, t.x, 60 * u), onScreenY(root, L, t.y - 52, t.y + 46, 40 * u), 'held', 'b', delay + 350, u);
  }
}

/**
 * "You can zoom": a white hand pinches outwards twice over the middle of the map (2 s), once per device,
 * on touch screens only. Pure overlay: it never blocks a tap (pointer-events: none) and a tap ends it.
 */
export function fxPinchHint(root: HTMLElement): boolean {
  if (off()) return false;
  const wrap = root.querySelector<HTMLElement>('.mapwrap');
  if (!wrap) return false;
  const box = wrap.getBoundingClientRect();
  if (box.width < 50 || box.height < 50) return false;
  // On the page, not in the board: the game re-renders its whole view on every tap, which would wipe it.
  // Two white touch points move apart three times (no hand: the drawn hands read badly at this size, and the
  // Lottie version would not start in the Reddit app), with "Pinch to zoom" under them. A tap dismisses it.
  const el = document.createElement('div');
  el.className = 'pinchhint'; el.setAttribute('aria-hidden', 'true');
  el.style.position = 'fixed'; el.style.zIndex = '60'; el.style.left = `${box.left + box.width / 2}px`; el.style.top = `${box.top + box.height / 2}px`;
  el.innerHTML = '<div class="ph-anim"><svg viewBox="-60 -60 120 120"><g fill="#fff" stroke="#2a1d0e" stroke-width="3"><circle class="ph-d1" r="11"/><circle class="ph-d2" r="11"/></g></svg></div><span>Pinch to zoom</span>';
  document.body.appendChild(el);
  const rm = reducedMotion();
  const remove = () => el.remove();
  finishers.push(remove);
  anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' });
  const go = (sel: string, k: number) => { const d = el.querySelector(sel); if (d) anim(d, [{ transform: `translate(${-6 * k}px,${6 * k}px)` }, { transform: `translate(${-30 * k}px,${30 * k}px)`, offset: 0.5 }, { transform: `translate(${-30 * k}px,${30 * k}px)`, offset: 0.7 }, { transform: `translate(${-6 * k}px,${6 * k}px)` }], { duration: 1100, iterations: rm ? 1 : 3, easing: 'ease-in-out' }); };
  go('.ph-d1', 1); go('.ph-d2', -1);
  later(rm ? 1700 : 3500, () => { anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }); later(320, remove); });
  return true;
}

/** The last turn begins: the current turn box pulses red once (the End button already reads "End the day"). */
export function fxLastTurn(root: HTMLElement, delay: number) {
  if (off()) return;
  const cell = root.querySelector<HTMLElement>('.strip .cell.cur');
  if (!cell) return;
  anim(cell, reducedMotion() ? [{ opacity: 0.5 }, { opacity: 1 }]
    : [{ transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(179,38,30,0)' }, { transform: 'scale(1.06)', boxShadow: '0 0 0 5px rgba(179,38,30,.75)', offset: 0.35 }, { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(179,38,30,0)' }],
  { duration: 900, delay, easing: 'ease-out' });
  const btn = root.querySelector<HTMLElement>('#end');
  if (btn && !reducedMotion()) anim(btn, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.35)', offset: 0.4 }, { filter: 'brightness(1)' }], { duration: 900, delay: delay + 150 });
}

/** The streak grew today: its flame catches, flares and settles (results page). */
export function fxStreak(root: HTMLElement, delay: number) {
  if (off() || reducedMotion()) return;
  const sp = root.querySelector<HTMLElement>('.streak.grew'), fl = sp?.querySelector<HTMLElement>('.flame'), n = sp?.querySelector<HTMLElement>('b');
  if (!sp || !fl || !n) return;
  fl.style.display = 'inline-block'; n.style.display = 'inline-block';
  anim(fl, [{ transform: 'scale(.3) translateY(4px)', opacity: 0, filter: 'drop-shadow(0 0 0 #ff8a1f)' }, { transform: 'scale(1.7) translateY(-3px)', opacity: 1, filter: 'drop-shadow(0 0 6px #ff8a1f)', offset: 0.45 },
    { transform: 'scale(1.15) rotate(-6deg)', offset: 0.65 }, { transform: 'scale(1) rotate(0)', opacity: 1, filter: 'drop-shadow(0 0 0 #ff8a1f)' }], { duration: 750, delay, easing: 'ease-out' });
  const old = Number(n.textContent) - 1;
  if (old >= 1) { n.textContent = String(old); later(delay + 330, () => { n.textContent = String(old + 1); }); finishers.push(() => { n.textContent = String(old + 1); }); }
  anim(n, [{ transform: 'translateY(0)', color: 'inherit' }, { transform: 'translateY(-6px)', offset: 0.45 }, { transform: 'translateY(0)', color: '#c2410c' }], { duration: 600, delay: delay + 250, easing: 'ease-out' });
}

/** Skirmish personal best: the old best is struck through in red ink, the new one stamped beside it. */
export function fxBest(root: HTMLElement, delay: number) {
  if (off()) return;
  const old = root.querySelector<HTMLElement>('.oldbest'), nb = root.querySelector<HTMLElement>('.newbest');
  if (!old || !nb) return;
  if (reducedMotion()) { anim(nb, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay }); return; }
  old.classList.add('strike'); old.style.setProperty('--sx', '0');
  anim(old, [{ '--sx': '0' } as Keyframe, { '--sx': '1' } as Keyframe], { duration: 350, delay, easing: 'ease-in' });
  nb.style.display = 'inline-block';
  anim(nb, [{ transform: 'scale(2.2) rotate(-12deg)', opacity: 0 }, { transform: 'scale(.92) rotate(-3deg)', opacity: 1, offset: 0.7 }, { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: 380, delay: delay + 300, easing: 'ease-in' });
}
