// Moderator statistics ("Senate archives"): who opened, started and finished the game, day by day, and a table
// of every known player. Only aggregate counts exist for logged-out visitors: Reddit gives them no identity.
//
// Recorded from 2026-11-19 on (`recordActivity`, called by the game client):
//   act:{day}              hash   `${kind}:${mode}:${in|anon}` → count of events (sessions, not people)
//   act:{day}:{kind}       zset   logged-in username → first time that day (daily and Demo modes only): unique people
//   players                zset   username → first time seen (also backfilled from every leaderboard)
// Finished games before that date are still known: they are the day's leaderboard (`day:{d}:lb`).
import { redis } from '@devvit/web/server';
import { addDays, DEMO_KEY, SEASON_START } from '../../shared/daily';
import { dailyScenario } from '../../shared/daily';
import { factionFor, getVotes } from './game';

import { ACT_KINDS, ACT_MODES, ACTIVITY_SINCE } from '../../shared/stats';
import type { ActKind, ActMode, DayStat, ModStats, Pair, PlayerStat } from '../../shared/stats';
export { ACT_KINDS, ACT_MODES };

const AK = {
  counts: (d: string) => `act:${d}`,
  users: (d: string, k: ActKind) => `act:${d}:${k}`,
  players: 'players',
};

/** One event from the game client. `day`: the post's day (or DEMO_KEY). Never throws: stats must not break play. */
export async function recordActivity(day: string, user: string | undefined, kind: ActKind, mode: ActMode, now = Date.now()) {
  try {
    await redis.hIncrBy(AK.counts(day), `${kind}:${mode}:${user ? 'in' : 'anon'}`, 1);
    if (!user) return;
    if (mode === 'daily' || mode === 'demo') {
      if ((await redis.zScore(AK.users(day, kind), user)) === undefined) await redis.zAdd(AK.users(day, kind), { member: user, score: now });
    }
    if ((await redis.zScore(AK.players, user)) === undefined) await redis.zAdd(AK.players, { member: user, score: now });
  } catch { /* best effort */ }
}

const MAX_PLAYERS = 1500; // per request; Devvit requests are time-limited

const pair = (h: Record<string, string>, kind: ActKind): Pair => {
  const out = { in: 0, anon: 0 };
  for (const [k, v] of Object.entries(h)) {
    const [kk, , who] = k.split(':');
    if (kk === kind) out[who === 'anon' ? 'anon' : 'in'] += Number(v);
  }
  return out;
};

/** Every day from the first published one to `today`, newest first, plus the Demo post. */
export async function modStats(today: string): Promise<ModStats> {
  const dates: string[] = [];
  for (let d = today; d >= SEASON_START; d = addDays(d, -1)) dates.push(d);
  const days: DayStat[] = [];
  const finishes = new Map<string, Record<string, number>>(), opens = new Map<string, string[]>();
  for (const date of [...dates, DEMO_KEY]) {
    const demo = date === DEMO_KEY;
    const [lb, late, counts, op, st] = await Promise.all([
      redis.zRange(`day:${date}:lb`, 0, -1, { by: 'rank' }),
      redis.hGetAll(`day:${date}:late`),
      redis.hGetAll(AK.counts(date)),
      redis.zRange(AK.users(date, 'open'), 0, -1, { by: 'rank' }),
      redis.zCard(AK.users(date, 'start')),
    ]);
    const faction = demo ? null : await factionFor(date);
    const par = demo || !faction ? null : dailyScenario(date, faction).par;
    if (!demo) {
      for (const r of lb) { const m = finishes.get(r.member) ?? {}; m[date] = r.score; finishes.set(r.member, m); }
      for (const r of op) opens.set(r.member, [...(opens.get(r.member) ?? []), date]);
    }
    const modes: Record<string, number> = {};
    for (const [k, v] of Object.entries(counts)) { const [kind, mode] = k.split(':'); modes[`${mode}:${kind}`] = (modes[`${mode}:${kind}`] ?? 0) + Number(v); }
    const before = !demo && date < ACTIVITY_SINCE;
    days.push({
      date, faction, par,
      opened: before ? null : op.length, started: before ? null : st,
      finished: lb.length, late: Object.keys(late).length, beat: par === null ? 0 : lb.filter((r) => r.score >= par).length,
      votes: await getVotes(date),
      sessions: { open: pair(counts, 'open'), start: pair(counts, 'start'), finish: pair(counts, 'finish') },
      modes,
    });
  }

  // the player index: everyone seen by recordActivity, plus everyone on a leaderboard (backfilled once found)
  const known = new Map((await redis.zRange(AK.players, 0, -1, { by: 'rank' })).map((r) => [r.member, r.score]));
  for (const [u, ds] of finishes) {
    const first = Math.min(...Object.keys(ds).map((d) => Date.parse(`${d}T00:00:00Z`)));
    if (!known.has(u) || known.get(u)! > first) { known.set(u, first); await redis.zAdd(AK.players, { member: u, score: first }); }
  }
  const names = [...known.keys()];
  const capped = names.length > MAX_PLAYERS;
  const lastOf = (u: string) => Math.max(known.get(u)!, ...Object.keys(finishes.get(u) ?? {}).map((d) => Date.parse(`${d}T00:00:00Z`)));
  const chosen = names.sort((a, b) => lastOf(b) - lastOf(a)).slice(0, MAX_PLAYERS);
  const players = await Promise.all(chosen.map(async (u): Promise<PlayerStat> => {
    const [h, honours, rivals, sk] = await Promise.all([
      redis.hGetAll(`user:${u}`), redis.hLen(`user:${u}:ach`), redis.hLen(`user:${u}:rivals`), redis.hLen(`user:${u}:sk`),
    ]);
    const count = (prefix: string) => Object.keys(h).filter((k) => k.startsWith(prefix)).length;
    return {
      username: u, firstSeen: new Date(known.get(u)!).toISOString().slice(0, 10), lastPlayed: h.last ?? null,
      days: finishes.get(u) ?? {}, opened: opens.get(u) ?? [],
      streak: Number(h.streak ?? 0), bestStreak: Number(h.best ?? 0), runs: Number(h.runs ?? 0), beats: Number(h.beats ?? 0), decrees: Number(h.decrees ?? 0),
      votes: count('vote:'), shares: count('shared:'), honours, rivals, skirmishMaps: sk,
      tutorial: h.tutorial ?? '', demo: !!h[`done:${DEMO_KEY}`],
    };
  }));
  return { generatedAt: Date.now(), since: SEASON_START, activitySince: ACTIVITY_SINCE, days, players, capped, tutorial: await redis.hGetAll('stats:tutorial').then((t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Number(v)]))) };
}
