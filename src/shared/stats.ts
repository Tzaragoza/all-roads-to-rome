// Moderator statistics ("Senate archives"): types shared by the server (src/server/core/stats.ts, which
// collects them) and the client (src/client/arlr/stats.ts, which shows them), plus pure helpers.
import type { Faction } from './engine';

export const ACT_KINDS = ['open', 'start', 'finish'] as const;
export const ACT_MODES = ['daily', 'demo', 'practice', 'skirmish', 'tutorial'] as const;
export type ActKind = (typeof ACT_KINDS)[number];
export type ActMode = (typeof ACT_MODES)[number];
/** First day opens and starts were recorded: earlier days only have finished games. */
export const ACTIVITY_SINCE = '2026-11-19';

export type Pair = { in: number; anon: number };
export type DayStat = {
  date: string; faction: Faction | null; par: number | null;
  /** Logged-in people who opened / started the daily that day (from ACTIVITY_SINCE; null before). */
  opened: number | null; started: number | null;
  /** Ranked finishes on the leaderboard (logged-in only), of which late (played after the day). */
  finished: number; late: number; beat: number;
  votes: Record<Faction, number>;
  /** Sessions (not people), all modes: opens, starts, finishes, split logged-in / logged-out. */
  sessions: Record<ActKind, Pair>;
  /** Sessions per mode (e.g. practice:start), logged-in + logged-out. */
  modes: Record<string, number>;
};
export type PlayerStat = {
  username: string; firstSeen: string | null; lastPlayed: string | null;
  /** Days with a ranked finish (date → score), and days the daily was opened (from ACTIVITY_SINCE). */
  days: Record<string, number>; opened: string[];
  streak: number; bestStreak: number; runs: number; beats: number; decrees: number;
  votes: number; shares: number; honours: number; rivals: number; skirmishMaps: number;
  tutorial: string; demo: boolean;
};
export type ModStats = { generatedAt: number; since: string; activitySince: string; days: DayStat[]; players: PlayerStat[]; capped: boolean; tutorial: Record<string, number> };


/** RFC 4180 CSV (Excel-friendly: quoted when needed, CRLF rows). */
export function toCsv(rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const cell = (v: string | number | boolean | null | undefined) => {
    const t = v === null || v === undefined ? '' : String(v);
    return /[",\r\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/** Derived columns of the player table. `today`: UTC date of the report. */
export function playerFacts(p: PlayerStat, days: DayStat[], today: string) {
  const par = new Map(days.map((d) => [d.date, d.par]));
  const ds = Object.keys(p.days).sort();
  const pcts = ds.map((d) => (par.get(d) ? (100 * p.days[d]!) / par.get(d)! : null)).filter((x): x is number => x !== null);
  const last = ds.at(-1) ?? null;
  const ago = (d: string | null) => (d ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 864e5) : null);
  return {
    finished: ds.length,
    lastFinished: last,
    daysSinceLast: ago(last),
    avgPct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
    bestPct: pcts.length ? Math.round(Math.max(...pcts)) : null,
    openedOnly: p.opened.filter((d) => !(d in p.days)).length,
  };
}

/** Day-1 retention per cohort: of the players first seen on day d, how many finished on d+1. */
export function retention(players: PlayerStat[], date: string, next: string): { cohort: number; back: number } {
  const cohort = players.filter((p) => p.firstSeen === date);
  return { cohort: cohort.length, back: cohort.filter((p) => next in p.days || p.opened.includes(next)).length };
}
