// Generation walkthrough: traces the real generator on one calendar day and writes
// docs/09-generation-walkthrough.md plus its figures (docs/img/walkthrough/*.svg).
// Usage: npx tsx scripts/sim/walkthrough.ts [date] [--fast]
//   --fast skips the calendar fairness re-evaluation (the slow part, ~10 s per seed).
import { mkdirSync, writeFileSync } from 'node:fs';
import season from '../../src/shared/season.json';
import { DEFAULT_GEN, EVENTS, Rng, decreesOf, eventSpec, generate } from '../../src/shared/engine';
import type { Faction, GenTrace, Scenario } from '../../src/shared/engine';
import { evaluate, FACTIONS, THRESHOLDS } from './fairness';
import type { Verdict } from './fairness';

const DATE = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? '2026-12-21';
const FAST = process.argv.includes('--fast');
const IMG = 'docs/img/walkthrough';
mkdirSync(IMG, { recursive: true });

const entry = (season as Array<{ date: string; seed: string; par: Record<Faction, number>; tries: number }>).find((e) => e.date === DATE);
if (!entry) throw new Error(`${DATE} is not in season.json`);
const SEED = entry.seed;
const trace: GenTrace = {};
const sc = generate(SEED, { trace });
const T = trace as Required<GenTrace>;

// ---------------------------------------------------------------- svg helpers
const INK = '#2b2116', PAPER = '#f3ead6', MUTED = '#9c8f74', GOLD = '#b8860b', RED = '#a3271f', BLUE = '#3f6f9f', GREEN = '#3f7f4f';
const TRIBE = ['#c9a227', '#4f8a5b', '#7b5ea7', '#b5651d'];
const TERRAIN_COL: Record<string, string> = { plain: '#b9a86a', forest: '#4f7a45', hills: '#8a6a4a' };
const TONE_COL: Record<string, string> = { threat: RED, hardship: BLUE, boon: GREEN };
const S = 3; // board units -> px
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Georgia,serif" font-size="11" fill="${INK}">` +
  `<rect width="${w}" height="${h}" fill="${PAPER}"/>${body}</svg>`;
const text = (x: number, y: number, s: string, a = '') => `<text x="${x}" y="${y}" ${a}>${esc(s)}</text>`;
const PAD = 24;
const P = (i: number, ox = 0, oy = 0) => [ox + PAD + T.points[i]!.x * S, oy + 24 + T.points[i]!.y * S] as const;
const MAP_W = 100 * S + 2 * PAD, MAP_H = 140 * S + 30;

type EdgeStyle = { a: number; b: number; stroke: string; w: number; dash?: string; label?: string; labelCol?: string };
type NodeStyle = { i: number; fill: string; r?: number; label?: string; sub?: string; ring?: string };
function mapPanel(title: string, edges: EdgeStyle[], nodes: NodeStyle[], ox = 0, extra = ''): string {
  let out = text(ox + 8, 16, title, 'font-weight="bold" font-size="13"');
  for (const e of edges) {
    const [x1, y1] = P(e.a, ox), [x2, y2] = P(e.b, ox);
    out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${e.stroke}" stroke-width="${e.w}" ${e.dash ? `stroke-dasharray="${e.dash}"` : ''} stroke-linecap="round"/>`;
    if (e.label) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      out += `<circle cx="${mx}" cy="${my}" r="8" fill="${PAPER}" stroke="${e.labelCol ?? MUTED}"/>` + text(mx, my + 3.5, e.label, 'text-anchor="middle" font-size="9"');
    }
  }
  for (const n of nodes) {
    const [x, y] = P(n.i, ox);
    if (n.ring) out += `<circle cx="${x}" cy="${y}" r="${(n.r ?? 6) + 4}" fill="none" stroke="${n.ring}" stroke-width="2"/>`;
    out += `<circle cx="${x}" cy="${y}" r="${n.r ?? 6}" fill="${n.fill}" stroke="#fff" stroke-width="1.2"/>`;
    if (n.label) out += text(x, y - (n.r ?? 6) - 3, n.label, 'text-anchor="middle" font-size="9.5"');
    if (n.sub) out += text(x, y + (n.r ?? 6) + 10, n.sub, `text-anchor="middle" font-size="9" fill="${GOLD}"`);
  }
  return out + extra;
}
const castraNode = (extra: Partial<NodeStyle> = {}): NodeStyle => ({ i: 0, fill: '#8b1a1a', r: 8, label: 'Castra', ...extra });
const write = (name: string, content: string) => writeFileSync(`${IMG}/${name}`, content);
const tribeName = (k: number) => sc.tribes[k]!.name;
const townName = (i: number) => sc.towns[i]!.name;
const roadsByPair = new Map(sc.roads.map((r) => [`${r.a}-${r.b}`, r]));

// ---------------------------------------------------------------- 00 pipeline
{
  const steps = [
    ['Date', `${DATE}`], ['Calendar', `seed "${SEED}"`], ['Vote', 'faction'],
    ['Towns', 'Poisson disc'], ['Candidates', 'Gabriel + MST'], ['Pruning', '30% non-MST'],
    ['Costs', 'terrain + depth'], ['Tribes', 'seeds + BFS'], ['Values', 'by depth'],
    ['Events', 'budget → picks → turns'], ['Decree', 'own stream'], ['Scenario', 'same for all'],
  ];
  const bw = 112, bh = 44, gap = 18, perRow = 6;
  let body = '';
  steps.forEach(([h, s], k) => {
    const row = Math.floor(k / perRow), col = row % 2 ? perRow - 1 - (k % perRow) : k % perRow;
    const x = 10 + col * (bw + gap), y = 14 + row * (bh + 40);
    const offline = k <= 1, server = k === 2;
    body += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="6" fill="${offline ? '#e8dcc0' : server ? '#e6d2cf' : '#fffaf0'}" stroke="${INK}"/>`;
    body += text(x + bw / 2, y + 18, h!, 'text-anchor="middle" font-weight="bold"') + text(x + bw / 2, y + 34, s!, `text-anchor="middle" font-size="10" fill="#5a4a36"`);
    if (k < steps.length - 1) {
      const nrow = Math.floor((k + 1) / perRow);
      if (nrow === row) {
        const dir = row % 2 ? -1 : 1, x1 = dir > 0 ? x + bw : x, x2 = x1 + dir * gap;
        body += `<line x1="${x1}" y1="${y + bh / 2}" x2="${x2 - dir * 3}" y2="${y + bh / 2}" stroke="${INK}" marker-end="url(#ar)"/>`;
      } else body += `<line x1="${x + bw / 2}" y1="${y + bh}" x2="${x + bw / 2}" y2="${y + bh + 36}" stroke="${INK}" marker-end="url(#ar)"/>`;
    }
  });
  const W = 10 + perRow * (bw + gap), H = 14 + 2 * (bh + 40) + 20;
  body += text(10, H - 8, 'beige = precomputed offline (season.json) · pink = decided on the server from yesterday\'s vote · white = generate(seed, { faction }), identical on client and server', 'font-size="10" fill="#5a4a36"');
  write('00-pipeline.svg', svg(W, H, `<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="${INK}"/></marker></defs>` + body));
}

// ---------------------------------------------------------------- 01 calendar
const tried = Array.from({ length: entry.tries }, (_, k) => (k === 0 ? DATE : `${DATE}#${k}`));
const verdicts: Array<Record<Faction, Verdict> | null> = tried.map((s) => {
  if (FAST) return null;
  process.stderr.write(`evaluating ${s}…\n`);
  return evaluate(s);
});
{
  const tw = 150, th = 230, sc2 = 1.35;
  let body = '';
  tried.forEach((s, k) => {
    const m = generate(s), ox = 10 + k * (tw + 12);
    const ok = s === SEED;
    body += `<rect x="${ox}" y="8" width="${tw}" height="${th}" rx="6" fill="#fffaf0" stroke="${ok ? GREEN : RED}" stroke-width="${ok ? 3 : 1.5}"/>`;
    body += text(ox + 8, 26, `"${s}"`, 'font-weight="bold"');
    for (const r of m.roads) {
      const a = m.towns[r.a]!, b = m.towns[r.b]!;
      body += `<line x1="${ox + 6 + a.x * sc2}" y1="${32 + a.y * sc2}" x2="${ox + 6 + b.x * sc2}" y2="${32 + b.y * sc2}" stroke="${MUTED}" stroke-width="1"/>`;
    }
    for (const t of m.towns) body += `<circle cx="${ox + 6 + t.x * sc2}" cy="${32 + t.y * sc2}" r="${t.id ? 2 + t.value * 0.6 : 4}" fill="${t.id ? TRIBE[t.tribe] : '#8b1a1a'}"/>`;
    const v = verdicts[k];
    const why = v ? FACTIONS.map((f) => v[f].why).filter(Boolean) : [];
    body += text(ox + tw / 2, th + 26, ok ? 'ACCEPTED' : 'rejected', `text-anchor="middle" font-weight="bold" fill="${ok ? GREEN : RED}"`);
    body += text(ox + tw / 2, th + 40, ok ? `par ${entry.par.populares} / ${entry.par.optimates}` : (why[0] ?? (v ? '' : 'see table')), 'text-anchor="middle" font-size="9.5"');
  });
  write('01-calendar.svg', svg(10 + tried.length * (tw + 12), th + 52, body));
}

// ---------------------------------------------------------------- 02 decree
const decreeDraw = FACTIONS.map((f) => {
  const u = new Rng(`${SEED}/decree/${f}`).next();
  const pool = decreesOf(f);
  const idx = Math.floor(u * pool.length);
  return { f, u, pool, idx, chosen: generate(SEED, { faction: f }).decree };
});
{
  const exampleVotes = { populares: 41, optimates: 57 };
  let body = text(10, 22, `Yesterday's vote (example numbers): Populares ${exampleVotes.populares} · Optimates ${exampleVotes.optimates}`, 'font-weight="bold" font-size="12"');
  body += text(10, 40, `→ majority wins; a tie or no votes falls back to the seed's default faction (${T.faction.value}).`, 'font-size="10.5"');
  decreeDraw.forEach(({ f, u, pool, idx, chosen }, c) => {
    const ox = 10 + c * 330, win = (exampleVotes.optimates > exampleVotes.populares ? 'optimates' : 'populares') === f;
    body += `<rect x="${ox}" y="54" width="318" height="${48 + pool.length * 34}" rx="8" fill="${win ? '#fffaf0' : '#ece4d0'}" stroke="${win ? GOLD : MUTED}" stroke-width="${win ? 2.5 : 1}"/>`;
    body += text(ox + 10, 74, `${f[0]!.toUpperCase() + f.slice(1)} pool${win ? ' — plays today' : ' — shown on the ballot only'}`, 'font-weight="bold"');
    body += text(ox + 10, 90, `u = Rng("${SEED}/decree/${f}").next() = ${u.toFixed(3)} → index ⌊u × ${pool.length}⌋ = ${idx}`, 'font-size="9.5" fill="#5a4a36"');
    pool.forEach((d, k) => {
      const y = 98 + k * 34, sel = k === idx;
      body += `<rect x="${ox + 10}" y="${y}" width="298" height="28" rx="4" fill="${sel ? '#f4e2a8' : PAPER}" stroke="${sel ? GOLD : MUTED}"/>`;
      body += text(ox + 18, y + 12, `${k}. ${d.title}`, `font-weight="${sel ? 'bold' : 'normal'}" font-size="10.5"`);
      body += text(ox + 18, y + 24, sel ? chosen.text.slice(0, 62) + (chosen.text.length > 62 ? '…' : '') : `metric: ${d.target.metric} ${d.target.direction}`, 'font-size="9" fill="#5a4a36"');
    });
  });
  write('02-decree.svg', svg(680, 110 + Math.max(...decreeDraw.map((d) => d.pool.length)) * 34, body));
}

// ---------------------------------------------------------------- 03-05 network
const allNodes = (f: (i: number) => Partial<NodeStyle> = () => ({})): NodeStyle[] =>
  T.points.map((_, i) => (i === 0 ? castraNode(f(0)) : { i, fill: '#6b5a44', r: 4.5, ...f(i) }));
{
  const discs = T.points.map((_, i) => { const [x, y] = P(i); return `<circle cx="${x}" cy="${y}" r="${(DEFAULT_GEN.minDist / 2) * S}" fill="#c9b98f" fill-opacity="0.25" stroke="${MUTED}" stroke-dasharray="3 3"/>`; }).join('');
  const [cx, cy] = P(0);
  const a = mapPanel('1 · Towns: Poisson-disc sampling', [], allNodes((i) => ({ label: i ? String(i) : 'Castra' })), 0,
    '') .replace('</text>', '</text>' + discs);
  const note = text(8, MAP_H - 4, `${T.points.length} points, none closer than ${DEFAULT_GEN.minDist}; castra fixed at (${T.points[0]!.x}, ${T.points[0]!.y})`, 'font-size="9.5"');
  write('03-points.svg', svg(MAP_W, MAP_H, a + note + `<circle cx="${cx}" cy="${cy}" r="3" fill="#fff"/>`));
}
const key = (e: [number, number]) => `${e[0]}-${e[1]}`;
const mstSet = new Set(T.mst.map(key)), prunedSet = new Set(T.pruned.map(key));
{
  const left = mapPanel('2 · Candidate roads: Gabriel graph', T.gabriel.map(([a, b]) => ({ a, b, stroke: mstSet.has(`${a}-${b}`) ? INK : MUTED, w: mstSet.has(`${a}-${b}`) ? 3 : 1.4 })), allNodes());
  const right = mapPanel('3 · Pruning: 30% of non-MST edges', T.gabriel.map(([a, b]) => {
    const k = `${a}-${b}`;
    return prunedSet.has(k) ? { a, b, stroke: RED, w: 1.6, dash: '4 4' } : { a, b, stroke: mstSet.has(k) ? INK : '#6b5a44', w: mstSet.has(k) ? 3 : 1.8 };
  }), allNodes(), MAP_W + 20);
  const legend = text(8, MAP_H - 4, `${T.gabriel.length} Gabriel edges · ${T.mst.length} in the MST (thick, never removed)`, 'font-size="9.5"') +
    text(MAP_W + 28, MAP_H - 4, `${T.pruned.length} pruned (red dashed) → ${sc.roads.length} candidate roads`, 'font-size="9.5"');
  write('04-candidates.svg', svg(MAP_W * 2 + 20, MAP_H, left + right + legend));
}
{
  const hopCol = (h: number) => ['#8b1a1a', '#e9d8a6', '#d9b86a', '#c4943d', '#a26a2a', '#7a4a1e', '#55331a'][Math.min(h, 6)]!;
  const left = mapPanel('4 · Depth: hops from the castra (BFS)', sc.roads.map((r) => ({ a: r.a, b: r.b, stroke: MUTED, w: 1.6 })),
    allNodes((i) => ({ fill: hopCol(T.hop[i]!), r: 7, sub: i ? `hop ${T.hop[i]}` : '' })));
  const right = mapPanel('5 · Road cost = harder tile + ⌊0.7 × depth⌋', sc.roads.map((r) => {
    const tc = { plain: 1, forest: 2, hills: 3 }[r.terrain], d = r.cost - tc;
    return { a: r.a, b: r.b, stroke: TERRAIN_COL[r.terrain]!, w: 3.2, label: d ? `${tc}+${d}` : `${tc}`, labelCol: TERRAIN_COL[r.terrain] };
  }), allNodes(), MAP_W + 20);
  const legend = text(MAP_W + 28, MAP_H - 4, 'plain 1 (p .50) · forest 2 (p .33) · hills 3 (p .17); depth = hop of the far end', 'font-size="9.5"');
  write('05-depth-cost.svg', svg(MAP_W * 2 + 20, MAP_H, left + right + legend));
}
{
  const order = new Map(T.bfsOrder.map((t, k) => [t, k + 1]));
  const left = mapPanel('6 · Tribes: farthest seeds, then BFS', sc.roads.map((r) => ({ a: r.a, b: r.b, stroke: MUTED, w: 1.4 })),
    allNodes((i) => (i ? { fill: TRIBE[sc.towns[i]!.tribe]!, r: 7, ring: T.tribeSeeds.includes(i) ? INK : undefined, sub: order.has(i) ? `#${order.get(i)}` : '' } : {})));
  const right = mapPanel('7 · Values: ★ from depth, with noise', sc.roads.map((r) => ({ a: r.a, b: r.b, stroke: MUTED, w: 1.4 })),
    allNodes((i) => (i ? { fill: TRIBE[sc.towns[i]!.tribe]!, r: 4 + sc.towns[i]!.value * 1.6, label: townName(i), sub: `${'★'.repeat(sc.towns[i]!.value)} (${T.rawValue[i]!.toFixed(2)})` } : {})), MAP_W + 20);
  const legend = text(8, MAP_H - 4, `ringed = tribe seeds (${T.tribeSeeds.map((s) => `${townName(s)} → ${tribeName(sc.towns[s]!.tribe)}`).join(', ')}); #n = BFS claim order`, 'font-size="9.5"');
  write('06-tribes-values.svg', svg(MAP_W * 2 + 20, MAP_H, left + right + legend));
}

// ---------------------------------------------------------------- 07 budget
{
  const tones = ['threat', 'hardship', 'boon'] as const;
  const maxN = 6, cw = 44;
  let body = text(10, 20, 'Step 1 · How many events of each tone? n = Rng.int(min, max)', 'font-weight="bold" font-size="12"');
  tones.forEach((tone, k) => {
    const [lo, hi] = DEFAULT_GEN.budget[tone], y = 40 + k * 46, n = T.counts[tone];
    body += text(10, y + 20, tone, `font-weight="bold" fill="${TONE_COL[tone]}"`);
    for (let v = 0; v <= maxN; v++) {
      const x = 90 + v * cw, inRange = v >= lo && v <= hi;
      body += `<rect x="${x}" y="${y}" width="${cw - 4}" height="30" rx="4" fill="${v === n ? TONE_COL[tone] : inRange ? '#fffaf0' : '#e5dcc6'}" stroke="${inRange ? TONE_COL[tone] : '#d6cbb2'}"/>`;
      body += text(x + (cw - 4) / 2, y + 20, String(v), `text-anchor="middle" fill="${v === n ? '#fff' : inRange ? INK : '#b9ad92'}" font-weight="${v === n ? 'bold' : 'normal'}"`);
    }
    body += text(90 + (maxN + 1) * cw + 8, y + 20, `range [${lo}, ${hi}] → drew ${n}`, 'font-size="10.5"');
  });
  write('07-budget.svg', svg(560, 40 + 3 * 46 + 6, body));
}

// ---------------------------------------------------------------- 08 picks
{
  const rowH = 58, bw = 300;
  let body = text(10, 20, 'Step 2 · For each slot: pick a kind by weight, then a turn in its window, then a tribe', 'font-weight="bold" font-size="12"');
  T.picks.forEach((p, k) => {
    const y = 36 + k * rowH, total = p.pool.reduce((s, e) => s + e.weight, 0);
    body += text(10, y + 18, `${k + 1}. ${p.tone}`, `font-weight="bold" fill="${TONE_COL[p.tone]}"`);
    let x = 90;
    for (const e of p.pool) {
      const w = (e.weight / total) * bw, sel = e.kind === p.chosen;
      body += `<rect x="${x}" y="${y + 4}" width="${w - 2}" height="22" fill="${sel ? TONE_COL[p.tone] : '#fffaf0'}" stroke="${TONE_COL[p.tone]}"/>`;
      body += text(x + w / 2 - 1, y + 19, `${e.kind} ${Math.round((100 * e.weight) / total)}%`, `text-anchor="middle" font-size="9" fill="${sel ? '#fff' : INK}"`);
      x += w;
    }
    const excluded = EVENTS.filter((e) => e.tone === p.tone && !p.pool.some((q) => q.kind === e.kind)).map((e) => `${e.kind} (cap ${e.gen.maxPerDay} reached)`);
    body += text(90, y + 40, excluded.length ? `excluded: ${excluded.join(', ')}` : `pool: ${p.pool.map((e) => `${e.kind} ${e.used}/${e.cap}`).join(' · ')}`, 'font-size="9" fill="#5a4a36"');
    // turn strip
    const tx = 410;
    for (let t = 1; t <= sc.rules.turns; t++) {
      const allowed = p.turnOptions.includes(t), sel = t === p.turn;
      body += `<rect x="${tx + (t - 1) * 22}" y="${y + 4}" width="19" height="22" rx="3" fill="${sel ? TONE_COL[p.tone] : allowed ? '#fffaf0' : '#e5dcc6'}" stroke="${allowed ? TONE_COL[p.tone] : '#d6cbb2'}"/>`;
      body += text(tx + (t - 1) * 22 + 9.5, y + 19, String(t), `text-anchor="middle" font-size="9" fill="${sel ? '#fff' : allowed ? INK : '#b9ad92'}"`);
    }
    body += text(tx + sc.rules.turns * 22 + 6, y + 19, `→ turn ${p.turn}, ${tribeName(p.tribe)}${p.town !== undefined ? `, ${townName(p.town)}` : ''}${p.skipped ? ` (skipped: ${p.skipped})` : ''}`, 'font-size="10"');
  });
  body += text(410, 32, 'turns 1–10 (grey = outside window or taken by another threat)', 'font-size="9" fill="#5a4a36"');
  write('08-picks.svg', svg(900, 44 + T.picks.length * rowH, body));
}

// ---------------------------------------------------------------- 09 timeline
{
  const cw = 64, rh = 46, ox = 110, oy = 44;
  let body = text(10, 20, 'Step 3 · The day\'s calendar: sorted by turn, consecutive threats moved off the same tribe', 'font-weight="bold" font-size="12"');
  for (let t = 1; t <= sc.rules.turns; t++) body += text(ox + (t - 0.5) * cw, oy - 6, `T${t}`, 'text-anchor="middle" font-weight="bold"');
  sc.tribes.forEach((tr, k) => {
    body += `<rect x="10" y="${oy + k * rh}" width="${ox - 16}" height="${rh - 6}" rx="4" fill="${TRIBE[k]}"/>` + text(16, oy + k * rh + 25, tr.name, 'fill="#fff" font-weight="bold"');
    for (let t = 1; t <= sc.rules.turns; t++) body += `<rect x="${ox + (t - 1) * cw + 2}" y="${oy + k * rh}" width="${cw - 4}" height="${rh - 6}" rx="4" fill="#fffaf0" stroke="#e0d5bd"/>`;
  });
  const slot = new Map<string, number>();
  for (const e of sc.events) {
    const spec = eventSpec(e.kind)!, k = `${e.tribe}-${e.turn}`, n = slot.get(k) ?? 0;
    slot.set(k, n + 1);
    const x = ox + (e.turn - 1) * cw + 5, y = oy + e.tribe * rh + 3 + n * 17;
    body += `<rect x="${x}" y="${y}" width="${cw - 10}" height="15" rx="3" fill="${TONE_COL[spec.tone]}"/>` + text(x + (cw - 10) / 2, y + 11, spec.title, 'text-anchor="middle" font-size="8" fill="#fff"');
  }
  for (const r of T.reassigned) {
    const x = ox + (r.turn - 0.5) * cw, y1 = oy + r.from * rh + 20, y2 = oy + r.to * rh + 10;
    body += `<line x1="${x + 24}" y1="${y1}" x2="${x + 24}" y2="${y2}" stroke="${INK}" stroke-width="1.5" stroke-dasharray="3 2" marker-end="url(#ar2)"/>`;
    body += `<text x="${x - 26}" y="${y1 + 4}" font-size="9" fill="${RED}" text-decoration="line-through">${esc(eventSpec(r.kind)!.title.split(' ')[0]!)}</text>`;
  }
  const H = oy + sc.tribes.length * rh + 30;
  body += text(10, H - 10, 'Forecast: on turn t the player sees the events of turns t and t+1. Red = threat (cuts roads), blue = hardship, green = boon.', 'font-size="10"');
  write('09-timeline.svg', svg(ox + sc.rules.turns * cw + 10, H, `<defs><marker id="ar2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L10,5L0,10z" fill="${INK}"/></marker></defs>` + body));
}

// ---------------------------------------------------------------- 10 final
{
  const boom = sc.events.filter((e) => e.effect.type === 'boom').map((e) => e.town!);
  const panel = mapPanel(`8 · The map instance for ${DATE}`, sc.roads.map((r) => ({ a: r.a, b: r.b, stroke: '#9c8f74', w: 1.6, dash: '4 4', label: String(r.cost) })),
    allNodes((i) => (i ? { fill: TRIBE[sc.towns[i]!.tribe]!, r: 4 + sc.towns[i]!.value * 1.6, label: townName(i), sub: '★'.repeat(sc.towns[i]!.value), ring: boom.includes(i) ? '#9aa0b5' : undefined } : {})));
  const legend = text(8, MAP_H - 4, `${sc.tribes.map((t, k) => `${t.name} (${sc.towns.filter((x) => x.tribe === k).length} towns)`).join(' · ')}${boom.length ? ' · grey ring = silver vein target' : ''}`, 'font-size="9.5"');
  write('10-final.svg', svg(MAP_W, MAP_H, panel + legend));
}

// ---------------------------------------------------------------- markdown
const pct = (x: number) => `${Math.round(100 * x)}%`;
const fmtVerdict = (s: string, v: Record<Faction, Verdict> | null) =>
  FACTIONS.map((f) => (v ? `| \`${s}\` | ${f} | ${v[f].par} | ${pct(v[f].forecast / v[f].par)} | ${pct(v[f].greedy / v[f].par)} | ${pct(v[f].random / v[f].par)} | ${v[f].ok ? 'ok' : `**${v[f].why}**`} |` : `| \`${s}\` | ${f} | – | – | – | – | (run without --fast) |`)).join('\n');
const tribeSizes = sc.tribes.map((t, k) => `${t.name} ${sc.towns.filter((x) => x.tribe === k).length}`).join(', ');
const valueHist = [1, 2, 3, 4].map((v) => `${v}★ × ${sc.towns.filter((t) => t.id && t.value === v).length}`).join(', ');
const pickLines = T.picks.map((p, k) => {
  const total = p.pool.reduce((s, e) => s + e.weight, 0);
  const pr = p.pool.find((e) => e.kind === p.chosen)!;
  return `${k + 1}. **${p.tone}** → \`${p.chosen}\` (weight ${pr.weight}/${total} = ${pct(pr.weight / total)}) · turn ${p.turn} (window ${eventSpec(p.chosen)!.gen.minTurn}–${eventSpec(p.chosen)!.gen.maxTurn}${p.turnOptions.length < eventSpec(p.chosen)!.gen.maxTurn - eventSpec(p.chosen)!.gen.minTurn + 1 ? `, minus turn${p.tone === 'threat' ? 's' : ''} ${Array.from({ length: eventSpec(p.chosen)!.gen.maxTurn - eventSpec(p.chosen)!.gen.minTurn + 1 }, (_, j) => eventSpec(p.chosen)!.gen.minTurn + j).filter((t) => !p.turnOptions.includes(t)).join(', ')} already holding a threat` : ''}) · tribe ${tribeName(p.tribe)}${p.town !== undefined ? ` · town ${townName(p.town)}` : ''}`;
}).join('\n');
const evLines = sc.events.map((e) => `| ${e.turn} | ${eventSpec(e.kind)!.title} | ${eventSpec(e.kind)!.tone} | ${tribeName(e.tribe)}${e.town !== undefined ? ` (${townName(e.town)})` : ''} |`).join('\n');

const md = `# 09 · Generation walkthrough: ${DATE}

*Generated by \`npx tsx scripts/sim/walkthrough.ts ${DATE}\` from a trace of the real generator (\`generate(seed, { trace })\`). Rerun it after changing the generator, the events or the decrees; every number and figure below is recomputed.*

This page follows one real day of the calendar from its date to the map players receive. Background on each step: [01 · Daily pipeline](01-daily-pipeline.md), [02 · Map generation](02-map-generation.md), [03 · Events](03-events.md), [04 · Decrees and vote](04-decrees-and-vote.md).

![pipeline](img/walkthrough/00-pipeline.svg)

There are **three random streams**, all derived from strings so that the client, the server and the offline tools agree:

| Stream | Seeded with | Draws |
|---|---|---|
| map | \`"${SEED}"\` | towns, pruning, tile terrain, names, tribes, values, events, default faction (in that order) |
| decree | \`"${SEED}/decree/populares"\` and \`"…/optimates"\` | one decree per faction |
| fairness | \`"${SEED}/r0"\`…\`"/r9"\` | random reference players (offline only) |

Because the map stream is consumed in a fixed order, **any change to an early step reshuffles everything after it** (e.g. a new event in the registry changes every future event calendar, not the towns).

## 0 · Date → seed (offline, \`season.json\`)

The season script tries \`"${DATE}"\`, then \`"${DATE}#1"\`, \`"#2"\`… and keeps the first seed that is fair **for both factions**. For each candidate and faction it computes Caesar's score (beam-search solver, *par*) and three reference players:

- **forecast bot** (plays sensibly with the forecast) must reach ≥ ${pct(THRESHOLDS.forecastMin)} of par, otherwise the map is a *trap*;
- the better of two **greedy bots** must stay ≤ ${pct(THRESHOLDS.greedyMax)} of par, otherwise the map is *trivial*;
- **random play** (mean of 10 games) must stay ≤ ${pct(THRESHOLDS.randomMax)} of par.

For ${DATE} it took **${entry.tries} tries**:

![calendar](img/walkthrough/01-calendar.svg)

| seed | faction | par | forecast/par | greedy/par | random/par | verdict |
|---|---|---|---|---|---|---|
${tried.map((s, k) => fmtVerdict(s, verdicts[k]!)).join('\n')}

Stored: \`{ date: "${DATE}", seed: "${SEED}", par: { populares: ${entry.par.populares}, optimates: ${entry.par.optimates} }, tries: ${entry.tries} }\`.

## 1 · Vote → faction → decree

At rollover the server reads the previous day's vote (\`factionFor\` in \`src/server/core/game.ts\`): the faction with more votes plays; on a tie or no votes, the seed's **default faction** is used (the last draw of the map stream: \`${T.faction.value}\` for this seed).

The decree comes from its **own** stream, so the decree never changes the map, and both candidates for tomorrow can be shown on today's ballot:

![decree](img/walkthrough/02-decree.svg)

${decreeDraw.map(({ f, u, pool, idx, chosen }) => `- **${f}**: \`u = ${u.toFixed(3)}\`, pool of ${pool.length} → index ${idx} → **${chosen.title}**: ${chosen.text}`).join('\n')}

Parameters marked \`maxHop\` / \`maxHop-1\` in the registry are resolved against the map's depth (here max hop = ${Math.max(...T.hop.filter((h) => h !== Infinity))}). The decree's \`rules\` overrides (e.g. cheaper recruits) are merged into the day's rules.

*Weakness:* \`pick\` indexes the faction's pool by registry order, so inserting a decree in the middle of \`DECREES\` changes the decree of every future day, and decrees are uniform (no weights, no "not twice in a row").

## 2 · The network

![points](img/walkthrough/03-points.svg)

**Towns.** Rejection sampling of ${DEFAULT_GEN.towns - 1} towns (+ castra fixed at the southern edge) in a ${sc.width}×${sc.height} board, each at least \`minDist = ${DEFAULT_GEN.minDist}\` from all others (discs of radius ${DEFAULT_GEN.minDist / 2} never overlap). After 5000 failed tries the distance relaxes by 10%.

![candidates](img/walkthrough/04-candidates.svg)

**Candidate roads.** The Gabriel graph joins *i* and *j* when no third town lies inside the circle whose diameter is *ij*: a planar, local, "natural-looking" road set (${T.gabriel.length} edges here). Its minimum spanning tree (${T.mst.length} edges) is protected so the map stays connected; each other edge is removed with probability ${DEFAULT_GEN.pruneFraction} (${T.pruned.length} removed). Result: **${sc.roads.length} candidate roads**, which the player may build.

![depth and cost](img/walkthrough/05-depth-cost.svg)

**Depth and cost.** BFS from the castra gives each town's hop count (max ${Math.max(...T.hop.filter((h) => h !== Infinity))}). Each town tile draws a terrain (plain 1, forest 2, hills 3; weights \`${DEFAULT_GEN.tileTerrain.join(' / ')}\`); a road takes the harder of its two tiles and adds a logistics surcharge \`⌊${DEFAULT_GEN.depthCost} × hop of its far end⌋\`, so deep roads cost more.

![tribes and values](img/walkthrough/06-tribes-values.svg)

**Tribes.** ${sc.tribes.length} seeds are chosen among towns at hop ≥ 2: the first is the deepest (ties broken by a shuffle), each next one the farthest (Euclidean) from the seeds already picked. A multi-source BFS then lets each tribe claim neighbours in turn (#n = claim order). Sizes: ${tribeSizes}.

**Values.** \`★ = clamp(round(0.8·hop + U), 1, 4)\` with \`U ∈ [−0.6, 0.4)\`: deep towns are worth more, with a little noise (raw value in brackets). Here: ${valueHist}.

## 3 · Events

The event generator reads the registry (\`src/shared/engine/events.ts\`); nothing about specific events is hard-coded.

![budget](img/walkthrough/07-budget.svg)

**How many.** For each tone, a count is drawn uniformly in the budget \`${JSON.stringify(DEFAULT_GEN.budget)}\`. This day: ${T.counts.threat} threats, ${T.counts.hardship} hardship, ${T.counts.boon} boons.

![picks](img/walkthrough/08-picks.svg)

**Which, when, where.** Each slot picks an event kind by \`weight\` among the kinds of that tone still under their \`maxPerDay\`, then a turn in the kind's \`[minTurn, maxTurn]\` window (threats skip turns already holding a threat), then a tribe uniformly. A boom also picks one town of that tribe.

${pickLines}

![timeline](img/walkthrough/09-timeline.svg)

**Calendar.** Events are sorted by turn. Walking through the threats in order, a threat on the same tribe as the previous threat is moved to the next tribe${T.reassigned.length ? ` (here: ${T.reassigned.map((r) => `turn ${r.turn} ${r.kind} moved from ${tribeName(r.from)} to ${tribeName(r.to)}`).join('; ')})` : ' (not needed this day)'}. The final schedule:

| turn | event | tone | tribe |
|---|---|---|---|
${evLines}

## 4 · The map instance

![final](img/walkthrough/10-final.svg)

\`generate("${SEED}", { faction })\` returns this scenario on the client and on the server. Only the decree (and its rule overrides) depends on the faction; towns, roads, costs, tribes, values and events are identical for both. The server re-plays each submitted game against this same scenario to validate the score.

## Critique of the pipeline

- **Fairness is checked; variety is not.** The calendar rejects unfair seeds but never compares a day with the previous ones: two consecutive days can share a decree, an event mix or a map shape. A cheap "distance to the last N days" filter would fix it.
- **Values saturate.** ${sc.towns.filter((t) => t.id && t.value === 4).length} of ${sc.towns.length - 1} towns are 4★ here: with \`0.8·hop\`, every town at hop ≥ 6 hits the cap (and 90% of hop-5 towns), so on deep maps "go deeper" stops paying after hop 5 while road costs keep rising and the value signal flattens. Scaling by the map's own max hop (\`4·hop/maxHop\`) would keep the gradient on every map.
- **The reassignment step biases tribes.** Moving a repeated threat to \`(tribe + 1) mod n\` makes the next tribe slightly more likely to be hit than the others. Redrawing among the other tribes would remove the bias.
- **Order coupling.** Everything shares one map stream in a fixed order. Adding a draw early in the pipeline silently changes every later step and every future calendar. Giving events their own stream (\`seed + "/events"\`), like the decree, would let the event registry evolve without touching the maps.
- **The acceptance test is a hard threshold on noisy proxies.** Here the accepted seed passes with the forecast bot at ${(() => { const v = verdicts.at(-1); return v ? FACTIONS.map((f) => pct(v[f].forecast / v[f].par)).join(' / ') : '–'; })()} of par against a ${pct(THRESHOLDS.forecastMin)} floor, while a rejected seed was refused for one faction only. The bots are crude stand-ins for humans, so a margin of a few points means little; the filter mostly removes the extremes.
- **Rejection reasons are opaque to players.** A day that needed ${entry.tries} tries is not harder or easier in any visible way; that is by design, but it means the fairness thresholds are the only difficulty control.
`;
writeFileSync('docs/09-generation-walkthrough.md', md);
process.stderr.write(`wrote docs/09-generation-walkthrough.md and ${IMG}/*.svg for ${DATE} (${SEED})\n`);
