// "Senate archives": the moderators' statistics screen (opened from Moderator tools on the results page).
// Data comes from the server (src/server/core/stats.ts, tRPC day.modStats); this module only draws it:
// key numbers, two daily charts, a sortable days table and a filterable, sortable player table, each with
// "Copy CSV" (file downloads are blocked inside Reddit; paste the clipboard into Excel or Sheets).
import type { DayStat, ModStats, PlayerStat } from '../../shared/stats';
import type { BugReport, BugStatus } from '../../shared/bugs';
import { playerFacts, retention, toCsv } from '../../shared/stats';
import { addDays } from '../../shared/daily';

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const COL = ['#2a78d6', '#eb6834', '#1baf7a']; // categorical slots 1-3 (validated on #fbf6ea)

type Range = 7 | 30 | 0;
type Sort = { key: string; desc: boolean };
const ui = {
  range: 30 as Range,
  daySort: { key: 'date', desc: true } as Sort,
  playerSort: { key: 'lastFinished', desc: true } as Sort,
  q: '', active: 0, minDays: 0, tutorial: '', all: false,
  bugsAll: false, bugsShowDone: false,
};

// ---- columns: one definition drives the table, its sorting and its CSV
type Col<T> = { key: string; label: string; get: (x: T) => string | number | null; show?: (x: T) => string; title?: string };
const dayCols: Col<DayStat>[] = [
  { key: 'date', label: 'Day', get: (d) => d.date, show: (d) => (d.date === 'demo' ? 'Demo post' : short(d.date)) },
  { key: 'faction', label: 'Decree', get: (d) => d.faction ?? '' },
  { key: 'opened', label: 'Opened', get: (d) => d.opened, title: 'Logged-in people who opened the daily' },
  { key: 'started', label: 'Started', get: (d) => d.started, title: 'Logged-in people who made a first move' },
  { key: 'finished', label: 'Finished', get: (d) => d.finished, title: 'Ranked finishes (the leaderboard)' },
  { key: 'conv', label: 'Opened→finished', get: (d) => (d.opened ? Math.round((100 * d.finished) / d.opened) : null), show: (d) => (d.opened ? `${Math.round((100 * d.finished) / d.opened)}%` : '–') },
  { key: 'beat', label: 'Beat Caesar', get: (d) => d.beat },
  { key: 'late', label: 'Late', get: (d) => d.late, title: 'Played after the day (flagged ⏱)' },
  { key: 'par', label: 'Caesar', get: (d) => d.par },
  { key: 'vP', label: 'Votes P', get: (d) => d.votes.populares, title: 'Populares' },
  { key: 'vO', label: 'Votes O', get: (d) => d.votes.optimates, title: 'Optimates' },
  { key: 'vA', label: 'Votes A', get: (d) => d.votes.augures, title: 'Augures' },
  { key: 'aO', label: 'Anon opens', get: (d) => d.sessions.open.anon, title: 'Logged-out sessions that opened the game' },
  { key: 'aS', label: 'Anon starts', get: (d) => d.sessions.start.anon },
  { key: 'aF', label: 'Anon finishes', get: (d) => d.sessions.finish.anon },
  { key: 'pr', label: 'Practice runs', get: (d) => d.modes['practice:finish'] ?? 0, title: 'Finished practice runs (sessions, all players)' },
  { key: 'sk', label: 'Skirmishes', get: (d) => d.modes['skirmish:finish'] ?? 0, title: 'Finished skirmishes (sessions, all players)' },
];
type PRow = PlayerStat & ReturnType<typeof playerFacts>;
const playerCols: Col<PRow>[] = [
  { key: 'username', label: 'Player', get: (p) => p.username },
  { key: 'firstSeen', label: 'First seen', get: (p) => p.firstSeen },
  { key: 'lastFinished', label: 'Last finished', get: (p) => p.lastFinished, show: (p) => (p.lastFinished ? `${short(p.lastFinished)}${p.daysSinceLast ? ` <span class="muted">(${p.daysSinceLast}d)</span>` : ''}` : '–') },
  { key: 'finished', label: 'Days finished', get: (p) => p.finished },
  { key: 'openedOnly', label: 'Opened, not finished', get: (p) => p.openedOnly, title: 'Days opened without a ranked finish (since opens are recorded)' },
  { key: 'avgPct', label: 'Avg % Caesar', get: (p) => p.avgPct, show: (p) => (p.avgPct === null ? '–' : `${p.avgPct}%`) },
  { key: 'bestPct', label: 'Best %', get: (p) => p.bestPct, show: (p) => (p.bestPct === null ? '–' : `${p.bestPct}%`) },
  { key: 'beats', label: 'Beat Caesar', get: (p) => p.beats },
  { key: 'streak', label: 'Streak', get: (p) => p.streak },
  { key: 'bestStreak', label: 'Best streak', get: (p) => p.bestStreak },
  { key: 'runs', label: 'Runs', get: (p) => p.runs, title: 'Every finished run: daily, practice, Demo' },
  { key: 'skirmishMaps', label: 'Skirmish maps', get: (p) => p.skirmishMaps },
  { key: 'honours', label: 'Honours', get: (p) => p.honours },
  { key: 'votes', label: 'Votes', get: (p) => p.votes },
  { key: 'shares', label: 'Shares', get: (p) => p.shares },
  { key: 'rivals', label: 'Rivals', get: (p) => p.rivals, title: 'Generals this player follows' },
  { key: 'tutorial', label: 'Tutorial', get: (p) => p.tutorial || 'none' },
  { key: 'demo', label: 'Demo', get: (p) => (p.demo ? 'yes' : '') },
];

function sorted<T>(rows: T[], cols: Col<T>[], s: Sort): T[] {
  const c = cols.find((x) => x.key === s.key) ?? cols[0]!;
  return rows.slice().sort((a, b) => {
    const x = c.get(a), y = c.get(b);
    if (x === y) return 0;
    if (x === null || x === '') return 1; // empty cells last, whatever the direction
    if (y === null || y === '') return -1;
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return s.desc ? -r : r;
  });
}
function table<T>(id: string, rows: T[], cols: Col<T>[], s: Sort): string {
  const head = cols.map((c) => `<th data-sort="${id}:${c.key}"${c.title ? ` title="${esc(c.title)}"` : ''} class="${s.key === c.key ? (s.desc ? 'desc' : 'asc') : ''}">${c.label}</th>`).join('');
  const body = rows.map((r) => `<tr>${cols.map((c) => { const v = c.get(r); return `<td>${c.show ? c.show(r) : v === null || v === '' ? '–' : esc(String(v))}</td>`; }).join('')}</tr>`).join('');
  return `<div class="stscroll"><table class="sttab" id="${id}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
const csv = <T>(rows: T[], cols: Col<T>[]) => toCsv([cols.map((c) => c.label), ...rows.map((r) => cols.map((c) => c.get(r)))]);

// ---- a small multi-line chart (one y-axis, gaps where a series has no data), with hover per day
type Series = { name: string; v: Array<number | null>; col: string };
function lineChart(dates: string[], series: Series[], label: string): string {
  const W = 520, H = 200, L = 34, R = 84, T = 10, B = 26, n = dates.length;
  const max = Math.max(4, ...series.flatMap((s) => s.v.filter((x): x is number => x !== null)));
  const step = max > 200 ? 50 : max > 80 ? 20 : max > 40 ? 10 : max > 16 ? 5 : max > 8 ? 2 : 1, top = Math.ceil(max / step) * step;
  const X = (i: number) => L + (n < 2 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1)), Y = (v: number) => T + (H - T - B) * (1 - v / top);
  let g = '';
  for (let v = 0; v <= top; v += step * Math.max(1, Math.round(top / step / 5))) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L - 6}" y="${Y(v) + 4}" class="ytick">${v}</text>`;
  const every = Math.max(1, Math.ceil(n / 8));
  dates.forEach((d, i) => { if ((n - 1 - i) % every === 0) g += `<text x="${X(i)}" y="${H - B + 16}" class="xtick">${d.slice(8)}/${d.slice(5, 7)}</text>`; });
  for (const s of [...series].reverse()) {
    let path = '', pen = false;
    s.v.forEach((v, i) => { if (v === null) { pen = false; return; } path += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)} `; pen = true; });
    g += `<path d="${path}" class="ln" style="stroke:${s.col}"/>`;
    if (n <= 31) s.v.forEach((v, i) => { if (v !== null) g += `<circle cx="${X(i)}" cy="${Y(v)}" r="2.5" style="fill:${s.col}"/>`; });
  }
  // direct labels at the right end, spread so they never overlap
  const ends = series.map((s) => { const k = s.v.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).at(-1); return k === undefined ? null : { s, y: Y(s.v[k]!), v: s.v[k]! }; })
    .filter((e): e is { s: Series; y: number; v: number } => !!e).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) ends[k]!.y = Math.max(ends[k]!.y, ends[k - 1]!.y + 13);
  for (const e of ends) g += `<circle cx="${W - R + 10}" cy="${e.y}" r="3.5" style="fill:${e.s.col}"/><text x="${W - R + 17}" y="${e.y + 4}" class="endlab">${e.s.name} ${e.v}</text>`;
  g += `<line class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" style="display:none"/><rect class="hover" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" data-n="${n}"/>`;
  const legend = series.map((s) => `<span class="lg"><i style="background:${s.col}"></i>${s.name}</span>`).join('');
  return `<div class="lgrow2">${legend}</div><div class="chartbox stchart" data-series='${esc(JSON.stringify({ dates, series }))}'><svg viewBox="0 0 ${W} ${H}" class="scorechart" role="img" aria-label="${esc(label)}">${g}</svg><div class="tip" style="display:none"></div></div>`;
}
function wireCharts(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.stchart').forEach((box) => {
    const svg = box.querySelector('svg')!, tip = box.querySelector<HTMLElement>('.tip')!, hover = svg.querySelector<SVGRectElement>('.hover')!, cross = svg.querySelector<SVGLineElement>('.cross')!;
    const { dates, series } = JSON.parse(box.dataset.series!) as { dates: string[]; series: Series[] };
    const W = 520, L = 34, R = 84, n = dates.length;
    const show = (clientX: number) => {
      const r = svg.getBoundingClientRect(), x = ((clientX - r.left) / r.width) * W;
      const i = n < 2 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((x - L) * (n - 1)) / (W - L - R))));
      const cx = n < 2 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (n - 1);
      cross.setAttribute('x1', String(cx)); cross.setAttribute('x2', String(cx)); cross.style.display = '';
      tip.innerHTML = `<b>${short(dates[i]!)}</b>` + series.map((s) => `<div><i style="background:${s.col}"></i>${s.name} <b>${s.v[i] ?? '–'}</b></div>`).join('');
      tip.style.display = '';
      tip.style.left = `${Math.min(r.width - 150, Math.max(0, (cx / W) * r.width + 10))}px`;
    };
    hover.addEventListener('pointermove', (e) => show(e.clientX));
    hover.addEventListener('pointerdown', (e) => show(e.clientX));
    hover.addEventListener('pointerleave', () => { tip.style.display = 'none'; cross.style.display = 'none'; });
  });
}

// ---- the player filters (applied in place, so typing keeps the keyboard focus)
function playerRows(st: ModStats, today: string): PRow[] {
  const days = st.days.filter((d) => d.date !== 'demo');
  return st.players.map((p) => ({ ...p, ...playerFacts(p, days, today) }));
}
function filtered(rows: PRow[]): PRow[] {
  const q = ui.q.trim().toLowerCase();
  return rows.filter((p) => (!q || p.username.toLowerCase().includes(q))
    && (!ui.active || (p.daysSinceLast !== null && p.daysSinceLast < ui.active))
    && p.finished >= ui.minDays
    && (!ui.tutorial || (ui.tutorial === 'none' ? !p.tutorial : p.tutorial === ui.tutorial)));
}
const PAGE = 100;
function playerTable(rows: PRow[]): string {
  const f = sorted(filtered(rows), playerCols, ui.playerSort);
  const shown = ui.all ? f : f.slice(0, PAGE);
  return `<div class="muted small stcount">${f.length} of ${rows.length} players${f.length > shown.length ? ` · showing ${shown.length} <button type="button" class="link" id="stall">Show all</button>` : ''}</div>${table('stp', shown, playerCols, ui.playerSort)}`;
}

// ---- 🐞 bug reports, newest first; a report can be copied whole (with its moves) to replay it
const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function bugSection(bugs: BugReport[] | null): string {
  if (!bugs) return '';
  const fresh = bugs.filter((b) => b.status === 'new').length;
  const list = bugs.filter((b) => ui.bugsShowDone || b.status === 'new');
  const shown = ui.bugsAll ? list : list.slice(0, 10);
  const card = (b: BugReport) => `<div class="bugcard ${b.status}">
      <div class="bugmeta"><b>${b.user ? esc(b.user) : '<i>logged out</i>'}</b> · ${when(b.at)}${b.status === 'done' ? ' · <span class="muted">done</span>' : ''}</div>
      <div class="bugtxt">${esc(b.text)}</div>
      <div class="muted small">${esc([b.ctx.day === 'demo' ? 'Demo post' : b.ctx.day, b.ctx.mode, b.ctx.skirmish ? `skirmish #${b.ctx.skirmish}` : '', `${b.ctx.view}, turn ${b.ctx.turn}`, `🪙${b.ctx.denarii} ★${b.ctx.glory}`, b.ctx.skin, b.ctx.screen, b.ctx.version].filter(Boolean).join(' · '))}${b.ctx.actions ? ` · ${b.ctx.actions.length} moves attached` : ' · no moves'}</div>
      <div class="muted small bugagent">${esc(b.ctx.agent)}</div>
      <div class="bugbtns"><button type="button" data-bugstatus="${esc(b.id)}:${b.status === 'new' ? 'done' : 'new'}">${b.status === 'new' ? '✓ Mark done' : 'Reopen'}</button><button type="button" data-bugcopy="${esc(b.id)}">Copy report${b.ctx.actions ? ' and moves' : ''}</button></div>
    </div>`;
  return `<section class="rcard bugs"><div class="sthead"><h3>🐞 Bug reports <span class="muted">${fresh} new · ${bugs.length} in all</span></h3>
      <label class="small"><input type="checkbox" id="bugdone" ${ui.bugsShowDone ? 'checked' : ''}> show done</label></div>
    ${list.length ? shown.map(card).join('') : `<div class="muted">${bugs.length ? 'Nothing new: every report is marked done.' : 'No bug reports yet.'}</div>`}
    ${list.length > shown.length ? `<div class="center"><button type="button" class="link" id="bugall">Show all ${list.length}</button></div>` : ''}
  </section>`;
}

/** The whole screen. `st`: null while loading; `err`: why it failed; `bugs`: the bug reports (null if unavailable). */
export function statsScreen(st: ModStats | null, err: string, today: string, bugs: BugReport[] | null = null): string {
  const top = `<div class="sttop"><button id="stback">‹ Back to the results</button><h2>📊 Senate archives</h2><button id="stload">↻ Refresh</button></div>`;
  if (!st) return `<div class="results stats">${top}<section class="rcard"><div class="muted">${err ? `Could not load the archives: ${esc(err)}` : 'Counting the legions…'}</div></section></div>`;
  const days = st.days.filter((d) => d.date !== 'demo');
  const demo = st.days.find((d) => d.date === 'demo');
  const asc = days.slice().reverse();
  const win = ui.range ? asc.slice(-ui.range) : asc;
  const dates = win.map((d) => d.date);
  const t = days.find((d) => d.date === today), y = days.find((d) => d.date === addDays(today, -1));
  const rows = playerRows(st, today);
  const ret2 = retention(st.players, addDays(today, -2), addDays(today, -1));
  const tile = (v: string | number, k: string, sub = '') => `<div class="sttile"><b>${v}</b><span>${k}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const active7 = rows.filter((p) => p.daysSinceLast !== null && p.daysSinceLast < 7).length;
  const tiles = `<div class="sttiles">
    ${tile(t?.opened ?? '–', 'opened today', 'logged-in people')}
    ${tile(t?.finished ?? 0, 'finished today', y ? `yesterday ${y.finished}` : '')}
    ${tile(t ? t.sessions.open.anon : 0, 'logged-out opens today', 'sessions, not people')}
    ${tile(active7, 'active players', 'finished in the last 7 days')}
    ${tile(st.players.length, 'players ever', st.capped ? 'table capped: most recent shown' : 'logged in')}
    ${tile(ret2.cohort ? `${Math.round((100 * ret2.back) / ret2.cohort)}%` : '–', 'came back next day', ret2.cohort ? `${ret2.back} of ${ret2.cohort} new on ${short(addDays(today, -2))}` : 'no new players that day')}
  </div>`;
  const rangeBtn = (r: Range, l: string) => `<button type="button" data-range="${r}" class="${ui.range === r ? 'on' : ''}">${l}</button>`;
  const before = dates.filter((d) => d < st.activitySince).length;
  const charts = `<section class="rcard"><div class="sthead"><h3>Per day</h3><div class="strange">${rangeBtn(7, '7 days')}${rangeBtn(30, '30 days')}${rangeBtn(0, 'All')}</div></div>
    <h4>Logged-in players (people)</h4>
    ${lineChart(dates, [
    { name: 'Opened', v: win.map((d) => d.opened), col: COL[0]! },
    { name: 'Started', v: win.map((d) => d.started), col: COL[1]! },
    { name: 'Finished', v: win.map((d) => d.finished), col: COL[2]! },
  ], 'Logged-in players per day: opened, started, finished')}
    ${before ? `<div class="muted small">Opened and Started begin on ${short(st.activitySince)}: before that only finished games were recorded.</div>` : ''}
    <h4>Logged-out visitors (sessions)</h4>
    ${lineChart(dates, [
    { name: 'Opened', v: win.map((d) => (d.date < st.activitySince ? null : d.sessions.open.anon)), col: COL[0]! },
    { name: 'Started', v: win.map((d) => (d.date < st.activitySince ? null : d.sessions.start.anon)), col: COL[1]! },
    { name: 'Finished', v: win.map((d) => (d.date < st.activitySince ? null : d.sessions.finish.anon)), col: COL[2]! },
  ], 'Logged-out sessions per day: opened, started, finished')}
    <div class="muted small">Logged-out visitors have no Reddit identity: each opening counts once, so one person opening twice counts twice.</div>
  </section>`;
  const dayTable = `<section class="rcard"><div class="sthead"><h3>Days</h3><button type="button" data-csv="days">Copy CSV</button></div>
    ${table('std', sorted([...days, ...(demo ? [demo] : [])], dayCols, ui.daySort), dayCols, ui.daySort)}
    <div class="muted small">Tap a column to sort. The Demo post has its own board; its finishes are the players on it.</div></section>`;
  const tut = st.tutorial;
  const players = `<section class="rcard"><div class="sthead"><h3>Players</h3><button type="button" data-csv="players">Copy CSV</button></div>
    <div class="stfilters">
      <input type="search" id="stq" placeholder="Search a username" value="${esc(ui.q)}" autocomplete="off">
      <label>Active <select id="stactive">${[[0, 'any time'], [1, 'today'], [7, 'last 7 days'], [30, 'last 30 days']].map(([v, l]) => `<option value="${v}"${ui.active === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Days finished ≥ <input type="number" id="stmin" min="0" value="${ui.minDays}"></label>
      <label>Tutorial <select id="sttut">${[['', 'any'], ['done', 'finished'], ['skip', 'skipped'], ['none', 'never']].map(([v, l]) => `<option value="${v}"${ui.tutorial === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <div id="stplayers">${playerTable(rows)}</div>
    <div class="muted small">Logged-in players only. Copy CSV copies the filtered rows, all of them. Tutorial overall: ${tut.start ?? 0} started, ${tut.done ?? 0} finished, ${tut.skip ?? 0} skipped.</div></section>`;
  const note = `<section class="rcard stnote"><div class="muted small">What apps can see: Reddit gives a Devvit app the username of logged-in players and nothing about where anyone is. For views by country, open the post's insights in the Reddit iOS app. Updated ${new Date(st.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.</div></section>`;
  return `<div class="results stats">${top}${tiles}${bugSection(bugs)}${charts}${dayTable}${players}${note}</div>`;
}

/** Wire the screen. `copy` puts text on the clipboard (true on success); `onBack`/`onReload` leave or refetch. */
export function wireStats(root: HTMLElement, st: ModStats | null, today: string, h: { onBack: () => void; onReload: () => void; rerender: () => void; copy: (t: string) => Promise<boolean>; bugs?: BugReport[] | null; setBug?: (id: string, status: BugStatus) => Promise<void> }) {
  root.querySelectorAll<HTMLButtonElement>('[data-bugstatus]').forEach((b) => (b.onclick = async () => {
    const [id, status] = b.dataset.bugstatus!.split(':') as [string, BugStatus];
    b.disabled = true; await h.setBug?.(id, status); h.rerender();
  }));
  root.querySelectorAll<HTMLButtonElement>('[data-bugcopy]').forEach((b) => (b.onclick = async () => {
    const r = h.bugs?.find((x) => x.id === b.dataset.bugcopy);
    if (!r) return;
    const ok = await h.copy(JSON.stringify(r, null, 1));
    b.textContent = ok ? 'Copied ✓' : 'Copy failed';
  }));
  root.querySelector('#bugall')?.addEventListener('click', () => { ui.bugsAll = true; h.rerender(); });
  const bd = root.querySelector<HTMLInputElement>('#bugdone');
  if (bd) bd.onchange = () => { ui.bugsShowDone = bd.checked; h.rerender(); };
  root.querySelector('#stback')?.addEventListener('click', h.onBack);
  root.querySelector('#stload')?.addEventListener('click', h.onReload);
  if (!st) return;
  wireCharts(root);
  const rows = playerRows(st, today), days = st.days;
  const refreshPlayers = () => {
    const box = root.querySelector<HTMLElement>('#stplayers');
    if (box) { box.innerHTML = playerTable(rows); wireSort(); root.querySelector('#stall')?.addEventListener('click', () => { ui.all = true; refreshPlayers(); }); }
  };
  const wireSort = () => root.querySelectorAll<HTMLElement>('[data-sort]').forEach((th) => (th.onclick = () => {
    const [id, key] = th.dataset.sort!.split(':') as [string, string];
    const s = id === 'std' ? ui.daySort : ui.playerSort;
    if (s.key === key) s.desc = !s.desc; else { s.key = key; s.desc = !['username', 'firstSeen', 'tutorial'].includes(key); }
    if (id === 'std') h.rerender(); else refreshPlayers();
  }));
  wireSort();
  root.querySelector('#stall')?.addEventListener('click', () => { ui.all = true; refreshPlayers(); });
  root.querySelectorAll<HTMLButtonElement>('[data-range]').forEach((b) => (b.onclick = () => { ui.range = Number(b.dataset.range) as Range; h.rerender(); }));
  const q = root.querySelector<HTMLInputElement>('#stq'), act = root.querySelector<HTMLSelectElement>('#stactive'), min = root.querySelector<HTMLInputElement>('#stmin'), tut = root.querySelector<HTMLSelectElement>('#sttut');
  if (q) q.oninput = () => { ui.q = q.value; ui.all = false; refreshPlayers(); };
  if (act) act.onchange = () => { ui.active = Number(act.value); refreshPlayers(); };
  if (min) min.oninput = () => { ui.minDays = Math.max(0, Number(min.value) || 0); refreshPlayers(); };
  if (tut) tut.onchange = () => { ui.tutorial = tut.value; refreshPlayers(); };
  root.querySelectorAll<HTMLButtonElement>('[data-csv]').forEach((b) => (b.onclick = async () => {
    const text = b.dataset.csv === 'days' ? csv(sorted(days, dayCols, ui.daySort), dayCols) : csv(sorted(filtered(rows), playerCols, ui.playerSort), playerCols);
    const ok = await h.copy(text);
    b.textContent = ok ? 'Copied ✓ paste into Excel' : 'Copy failed';
    setTimeout(() => { b.textContent = 'Copy CSV'; }, 2500);
  }));
}
