// Daily game state in Redis: results, leaderboard, streaks, faction votes.
import { redis } from '@devvit/web/server';
import { isOver, replay, score, scoreCurve, suppliedTowns } from '../../shared/engine';
import type { Action, Faction } from '../../shared/engine';
import { addDays, ballotFor, dailyScenario, defaultFaction } from '../../shared/daily';

const K = {
  faction: (d: string) => `day:${d}:faction`,
  post: (d: string) => `day:${d}:post`,
  lb: (d: string) => `day:${d}:lb`,
  result: (d: string, u: string) => `day:${d}:res:${u}`,
  votes: (d: string) => `day:${d}:votes`,
  voted: (d: string, u: string) => `day:${d}:voted:${u}`,
  late: (d: string) => `day:${d}:late`, // hash: users whose result on the board was played after the day
  practice: (d: string, u: string) => `day:${d}:practice:${u}`, // JSON PracticeLog: a player's unranked runs of the day
  user: (u: string) => `user:${u}`,
};

/**
 * A player's practice runs of one day: every score in order (latest MAX_PRACTICE kept), and the best
 * run's curve. Unranked: the leaderboard, streak and vote only ever use the official result.
 */
export type PracticeLog = { runs: Array<{ total: number; at: number }>; best: { total: number; curve: number[]; at: number } | null; count: number };
export const MAX_PRACTICE = 60;

export async function getPractice(date: string, user: string): Promise<PracticeLog> {
  const raw = await redis.get(K.practice(date, user));
  return raw ? (JSON.parse(raw) as PracticeLog) : { runs: [], best: null, count: 0 };
}

/** Record a finished practice run, validated by replay like an official one. */
export async function submitPractice(date: string, user: string, actions: Action[], today: string): Promise<PracticeLog> {
  if (date > today) throw new GameError('This campaign has not started yet');
  const { scenario } = dailyScenario(date, await factionFor(date));
  let final;
  try { final = replay(scenario, actions); } catch (e) { throw new GameError(`Invalid game: ${(e as Error).message}`); }
  if (!isOver(scenario, final)) throw new GameError('The campaign is not finished');
  const total = score(scenario, final).total, at = Date.now();
  const log = await getPractice(date, user);
  log.runs.push({ total, at });
  if (log.runs.length > MAX_PRACTICE) log.runs = log.runs.slice(-MAX_PRACTICE);
  log.count = (log.count ?? 0) + 1;
  if (!log.best || total > log.best.total) log.best = { total, curve: scoreCurve(scenario, final), at };
  await redis.set(K.practice(date, user), JSON.stringify(log));
  return log;
}

/** A player's personal best of the day: the better of the official score and every practice run. */
export function personalBest(official: number | null, log: PracticeLog | null): number | null {
  const xs = [official, log?.best?.total ?? null].filter((x): x is number => x !== null);
  return xs.length ? Math.max(...xs) : null;
}

export type DayResult = {
  total: number;
  glory: number;
  decreeMet: boolean;
  lost: number;
  towns: number;
  actions: Action[];
  /** Score after each turn, then at dusk (see scoreCurve). Missing on results saved before it existed. */
  curve?: number[];
  /** Played after its day (from an older post). */
  late?: boolean;
  at: number;
};
/**
 * What happens when someone plays a past day (moderator setting `latePlay`):
 * flagged = scored on that day's board with a ⏱ mark; ontime = scored but kept off the board
 * (shows where it would place); practice = not scored at all. Late plays never extend streaks.
 */
export type LatePolicy = 'flagged' | 'ontime' | 'practice';
export const LATE_POLICIES: LatePolicy[] = ['flagged', 'ontime', 'practice'];
export type Streak = { streak: number; best: number; played: number; last: string };
export type Votes = Record<Faction, number>;
export type LeaderRow = { rank: number; username: string; score: number; late?: boolean };

/** Faction of a day's Senate decree: stored once, decided by the previous day's vote. */
export async function factionFor(date: string): Promise<Faction> {
  const stored = await redis.get(K.faction(date));
  if (stored === 'populares' || stored === 'optimates' || stored === 'augures') return stored;
  const prev = await getVotes(addDays(date, -1));
  // the most votes among the factions on that day's ballot; a tie falls back to the seed's own faction
  const on = ballotFor(date), top = Math.max(...on.map((f) => prev[f]));
  const lead = on.filter((f) => prev[f] === top);
  const faction: Faction = top > 0 && lead.length === 1 ? lead[0]! : defaultFaction(date);
  await redis.set(K.faction(date), faction);
  return faction;
}

export async function getPostId(date: string) {
  return (await redis.get(K.post(date))) ?? null;
}
export async function setPostId(date: string, postId: string) {
  await redis.set(K.post(date), postId);
}

export async function getResult(date: string, user: string): Promise<DayResult | null> {
  const raw = await redis.get(K.result(date, user));
  return raw ? (JSON.parse(raw) as DayResult) : null;
}

export async function getStreak(user: string): Promise<Streak> {
  const h = await redis.hGetAll(K.user(user));
  return { streak: Number(h.streak ?? 0), best: Number(h.best ?? 0), played: Number(h.played ?? 0), last: h.last ?? '' };
}

/** Pure streak update, exported for tests. Playing an older post never breaks or extends a streak. */
export function nextStreak(prev: Streak, date: string): Streak {
  if (prev.last && date <= prev.last) return { ...prev, played: prev.played + 1 };
  const streak = prev.last === addDays(date, -1) ? prev.streak + 1 : 1;
  return { streak, best: Math.max(prev.best, streak), played: prev.played + 1, last: date };
}

export async function getVotes(date: string): Promise<Votes> {
  const h = await redis.hGetAll(K.votes(date));
  return { populares: Number(h.populares ?? 0), optimates: Number(h.optimates ?? 0), augures: Number(h.augures ?? 0) };
}
export async function getMyVote(date: string, user: string): Promise<Faction | null> {
  const v = await redis.get(K.voted(date, user));
  return v === 'populares' || v === 'optimates' || v === 'augures' ? v : null;
}

export async function leaderboard(date: string, user: string | undefined, top = 10) {
  const rows = await redis.zRange(K.lb(date), 0, top - 1, { by: 'rank', reverse: true });
  const late = await redis.hGetAll(K.late(date));
  const board: LeaderRow[] = rows.map((r, i) => ({ rank: i + 1, username: r.member, score: r.score, ...(late[r.member] ? { late: true } : {}) }));
  const players = await redis.zCard(K.lb(date));
  let me: LeaderRow | null = null;
  if (user) {
    const [s, asc] = await Promise.all([redis.zScore(K.lb(date), user), redis.zRank(K.lb(date), user)]);
    if (s !== undefined && asc !== undefined) me = { rank: players - asc, username: user, score: s, ...(late[user] ? { late: true } : {}) };
  }
  return { board, players, me };
}

/** Where a score kept off the board would place among that day's board (1 = top). */
export async function wouldRank(date: string, total: number): Promise<number> {
  const all = await redis.zRange(K.lb(date), 0, -1, { by: 'rank' });
  return 1 + all.filter((r) => r.score > total).length;
}

export class GameError extends Error {}

/** Validate a finished game by replaying it; store it once per user per day. */
export async function submitResult(date: string, user: string, actions: Action[], opts: { today: string; policy: LatePolicy }) {
  if (date > opts.today) throw new GameError('This campaign has not started yet');
  const late = date < opts.today;
  if (late && opts.policy === 'practice') throw new GameError('Past campaigns are practice only on this subreddit');
  const existing = await getResult(date, user);
  if (existing) return { result: existing, streak: await getStreak(user), fresh: false };

  const { scenario } = dailyScenario(date, await factionFor(date));
  let final;
  try {
    final = replay(scenario, actions);
  } catch (e) {
    throw new GameError(`Invalid game: ${(e as Error).message}`);
  }
  if (!isOver(scenario, final)) throw new GameError('The campaign is not finished');
  const b = score(scenario, final);
  const result: DayResult = {
    total: b.total, glory: b.glory, decreeMet: b.decreeMet, lost: final.lost,
    towns: suppliedTowns(scenario, final).length, actions, curve: scoreCurve(scenario, final), ...(late ? { late: true } : {}), at: Date.now(),
  };
  // first write wins, even if two submissions race
  const created = await redis.hSetNX(K.user(user), `done:${date}`, '1');
  if (!created) {
    const again = await getResult(date, user);
    if (again) return { result: again, streak: await getStreak(user), fresh: false };
  }
  await redis.set(K.result(date, user), JSON.stringify(result));
  if (!late || opts.policy === 'flagged') await redis.zAdd(K.lb(date), { member: user, score: result.total });
  if (late && opts.policy === 'flagged') await redis.hSet(K.late(date), { [user]: '1' });
  const prev = await getStreak(user);
  const streak = late ? { ...prev, played: prev.played + 1 } : nextStreak(prev, date); // late plays never extend a streak
  await redis.hSet(K.user(user), {
    streak: String(streak.streak), best: String(streak.best), played: String(streak.played), last: streak.last,
  });
  return { result, streak, fresh: true };
}

export async function castVote(date: string, user: string, faction: Faction, today: string): Promise<Votes> {
  if (date !== today) throw new GameError('Voting for this day has closed: tomorrow was decided at midnight');
  if (!(await getResult(date, user))) throw new GameError('Finish the campaign before voting');
  if (!ballotFor(addDays(date, 1)).includes(faction)) throw new GameError('The Augurs are not on tomorrow\'s ballot');
  const ok = await redis.hSetNX(K.user(user), `vote:${date}`, faction);
  if (ok) {
    await redis.set(K.voted(date, user), faction);
    await redis.hIncrBy(K.votes(date), faction, 1);
  }
  return getVotes(date);
}

/** Spoiler-free comment text for sharing a result. */
export function shareText(date: string, r: DayResult, par: number | null, streak: number, rank: number | null, players: number) {
  const pct = par ? ` (${Math.round((100 * r.total) / par)}% of Caesar)` : '';
  const parts = [
    `**${r.total}**${pct}`,
    `${r.towns} towns held`,
    r.lost ? `${r.lost} legion${r.lost > 1 ? 's' : ''} lost` : 'no legion lost',
    r.decreeMet ? 'decree fulfilled' : 'decree missed',
  ];
  if (rank) parts.push(`#${rank} of ${players}`);
  if (streak > 1) parts.push(`${streak}-day streak`);
  return `🏛️ All Roads Lead to Rome, ${date}: ${parts.join(' · ')}`;
}

/** The optional challenge line appended to a share comment (Reddit notifies mentioned users). */
export function challengeLine(mentions: string[]): string {
  return mentions.length ? `\n\n${mentions.map((m) => `u/${m}`).join(', ')}: your move. Can you beat it?` : '';
}

/** Flair text from the player's streak. */
export function flairFor(streak: Streak): string {
  const title = streak.played >= 30 ? 'Imperator' : streak.played >= 14 ? 'Legatus' : streak.played >= 5 ? 'Centurio' : 'Miles';
  return streak.streak > 1 ? `${title} · ${streak.streak}-day streak` : title;
}

// ---------------------------------------------------------------- moderator debug tools

/** Wipe one player's game for a day (result, leaderboard entry, vote) and their streak record. */
export async function resetPlayer(date: string, user: string) {
  const vote = await getMyVote(date, user);
  if (vote) await redis.hIncrBy(K.votes(date), vote, -1);
  await redis.zRem(K.lb(date), [user]);
  await redis.hDel(K.late(date), [user]);
  await redis.del(K.result(date, user), K.voted(date, user), K.user(user), K.practice(date, user));
}

/** Wipe a whole day: every player's result and vote, the leaderboard, the tally and the decree faction. */
export async function resetDay(date: string) {
  const players = (await redis.zRange(K.lb(date), 0, -1, { by: 'rank' })).map((r) => r.member);
  for (const u of players) {
    await redis.del(K.result(date, u), K.voted(date, u));
    await redis.hDel(K.user(u), [`done:${date}`, `vote:${date}`]);
  }
  await redis.del(K.lb(date), K.votes(date), K.late(date));
  return players.length;
}

// ---------------------------------------------------------------- rivals (one-way follows)

export const MAX_RIVALS = 20;
export const MAX_MENTIONS = 3;
const rivalsKey = (u: string) => `user:${u}:rivals`;
const norm = (u: string) => u.replace(/^u\//i, '').trim();

export async function getRivalNames(user: string): Promise<string[]> {
  return Object.keys(await redis.hGetAll(rivalsKey(user))).sort((a, b) => a.localeCompare(b));
}

export async function followRival(user: string, name: string) {
  const r = norm(name);
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(r)) throw new GameError('That is not a valid Reddit username');
  if (r.toLowerCase() === user.toLowerCase()) throw new GameError('You cannot rival yourself');
  const list = await getRivalNames(user);
  if (list.some((x) => x.toLowerCase() === r.toLowerCase())) return;
  if (list.length >= MAX_RIVALS) throw new GameError(`You can follow up to ${MAX_RIVALS} rivals`);
  await redis.hSet(rivalsKey(user), { [r]: String(Date.now()) });
}

export async function unfollowRival(user: string, name: string) {
  await redis.hDel(rivalsKey(user), [norm(name)]);
}

/**
 * A rival's moves for the day, to replay side by side with yours. Only after you have finished the
 * day yourself (no spoilers), and only for players you follow. Caesar's plan is never served.
 */
export async function rivalPlan(date: string, user: string, rival: string): Promise<Action[] | null> {
  if (!(await getResult(date, user))) throw new GameError('Finish your own campaign first');
  if (!(await getRivalNames(user)).includes(rival)) throw new GameError('Follow this general first');
  return (await getResult(date, rival))?.actions ?? null;
}

export type RivalRow = { username: string; score: number | null; rank: number | null; streak: number; curve: number[] | null; best: number | null; tries: number };

/** Each rival's standing for the day (null score = has not marched yet), best first. */
export async function rivalsFor(date: string, user: string): Promise<RivalRow[]> {
  const names = await getRivalNames(user);
  const players = await redis.zCard(K.lb(date));
  let scenario: ReturnType<typeof dailyScenario>['scenario'] | null = null; // only built for old results without a curve
  const rows = await Promise.all(names.map(async (u) => {
    const [score, asc, st, res, pr] = await Promise.all([redis.zScore(K.lb(date), u), redis.zRank(K.lb(date), u), getStreak(u), getResult(date, u), getPractice(date, u)]);
    let curve = res?.curve ?? null;
    if (res && !curve) {
      try { scenario ??= dailyScenario(date, await factionFor(date)).scenario; curve = scoreCurve(scenario, replay(scenario, res.actions)); } catch { curve = null; }
    }
    return { username: u, score: score ?? null, rank: asc === undefined ? null : players - asc, streak: st.streak, curve, best: personalBest(res?.total ?? null, pr), tries: (res ? 1 : 0) + (pr.count ?? 0) };
  }));
  return rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.username.localeCompare(b.username));
}

/**
 * Validate the rivals a player wants to mention in their share comment: only rivals who have
 * not played today, at most MAX_MENTIONS, and only one share comment per player per day.
 */
export async function checkShare(date: string, user: string, mentions: string[]): Promise<string[]> {
  if (mentions.length > MAX_MENTIONS) throw new GameError(`You can challenge at most ${MAX_MENTIONS} rivals per day`);
  const rivals = await rivalsFor(date, user);
  const ok = mentions.map(norm).filter((m) => rivals.some((r) => r.username.toLowerCase() === m.toLowerCase() && r.score === null));
  if (ok.length !== mentions.length) throw new GameError('You can only challenge rivals who have not marched today');
  const first = await redis.hSetNX(K.user(user), `shared:${date}`, '1');
  if (!first) throw new GameError('You already shared your result today');
  return ok;
}

export type HistoryDay = {
  date: string;
  par: number | null;
  postId: string | null;
  me: { total: number; late: boolean; rank: number | null } | null;
  players: number;
  rivals: Array<{ username: string; score: number }>;
};
/** The last `days` days up to `today` (newest first): your result, Caesar, the board size and your rivals' scores. */
export async function historyFor(user: string | undefined, today: string, days = 7): Promise<HistoryDay[]> {
  const rivals = user ? (await getRivalNames(user)).slice(0, 20) : [];
  const out: HistoryDay[] = [];
  for (let k = 0; k < days; k++) {
    const date = addDays(today, -k);
    const [postId, players] = await Promise.all([getPostId(date), redis.zCard(K.lb(date))]);
    const res = user ? await getResult(date, user) : null;
    if (!postId && !res && !players) continue; // nothing happened that day
    const { par } = dailyScenario(date, await factionFor(date));
    let rank: number | null = null;
    if (res && user) {
      const asc = await redis.zRank(K.lb(date), user);
      rank = asc === undefined ? null : players - asc;
    }
    const rs = await Promise.all(rivals.map(async (u) => ({ username: u, score: await redis.zScore(K.lb(date), u) })));
    out.push({
      date, par, postId, players,
      me: res ? { total: res.total, late: !!res.late, rank } : null,
      rivals: rs.filter((r) => r.score !== undefined).map((r) => ({ username: r.username, score: r.score! })),
    });
  }
  return out;
}

/** Has this player finished or skipped the tutorial (or simply played before)? */
export async function tutorialDone(user: string): Promise<boolean> {
  const h = await redis.hGetAll(K.user(user));
  return !!h.tutorial || Number(h.played ?? 0) > 0;
}
export type TutorialEvent = 'start' | 'done' | 'skip';
/** Record a tutorial event: remember done/skip for the player, and count it (with the step a skip happened at). */
export async function recordTutorial(user: string | undefined, event: TutorialEvent, step: string) {
  await redis.hIncrBy('stats:tutorial', event, 1);
  if (event === 'skip') await redis.hIncrBy('stats:tutorial', `skip@${step}`, 1);
  if (user && event !== 'start') await redis.hSet(K.user(user), { tutorial: event });
}
export async function tutorialStats(): Promise<Record<string, number>> {
  const h = await redis.hGetAll('stats:tutorial');
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, Number(v)]));
}
