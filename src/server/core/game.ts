// Daily game state in Redis: results, leaderboard, streaks, faction votes.
import { reddit, redis } from '@devvit/web/server';
import { apply, eventsAsOf, heldAt, initialState, isOver, replay, score, scoreCurve, suppliedTowns } from '../../shared/engine';
import type { Action, Faction } from '../../shared/engine';
import { addDays, ballotFor, dailyScenario, defaultFaction, DEMO_DATE, DEMO_FACTION, DEMO_KEY, prettyDate } from '../../shared/daily';
import { ACHIEVEMENTS, counterAchievements, runAchievements, whyCounter, whyRun } from '../../shared/achievements';
import type { AchId, Counters, RunFacts } from '../../shared/achievements';
import type { Scenario, State } from '../../shared/engine';
import { skirmish } from '../../shared/skirmish';

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
  ach: (u: string) => `user:${u}:ach`, // hash: achievement id → JSON {at, date}
  achCount: 'stats:ach', // hash: achievement id → number of holders
  sk: (u: string) => `user:${u}:sk`, // hash: skirmish map id → JSON SkRecord
};

// ---------------------------------------------------------------- skirmish (unranked pool maps)

export type SkRecord = { best: number; curve: number[]; tries: number; at: number };
/** Skirmish unlocks once the player has finished today's campaign. */
export const skirmishUnlocked = async (user: string, today: string, demo = false) =>
  !!(await redis.hGet(K.user(user), `done:${today}`)) || (demo && !!(await redis.hGet(K.user(user), `done:${DEMO_KEY}`))); // on the Demo post, a Demo run unlocks it too
export async function skirmishRecords(user: string): Promise<Record<number, SkRecord>> {
  const h = await redis.hGetAll(K.sk(user));
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [Number(k), JSON.parse(v) as SkRecord]));
}
/** Record a finished skirmish (replay-validated): tries + personal best on that map. Earns no achievement. */
export async function submitSkirmish(user: string, id: number, actions: Action[], today: string, demo = false): Promise<SkRecord> {
  if (!(await skirmishUnlocked(user, today, demo))) throw new GameError("Finish today's campaign to unlock Skirmish");
  const sk = skirmish(id);
  if (!sk) throw new GameError('Unknown skirmish map');
  let final;
  try { final = replay(sk.scenario, actions); } catch (e) { throw new GameError(`Invalid game: ${(e as Error).message}`); }
  if (!isOver(sk.scenario, final)) throw new GameError('The campaign is not finished');
  const total = score(sk.scenario, final).total;
  const raw = await redis.hGet(K.sk(user), String(id));
  const prev = raw ? (JSON.parse(raw) as SkRecord) : null;
  const rec: SkRecord = prev && prev.best >= total ? { ...prev, tries: prev.tries + 1 } : { best: total, curve: scoreCurve(sk.scenario, final), tries: (prev?.tries ?? 0) + 1, at: Date.now() };
  await redis.hSet(K.sk(user), { [String(id)]: JSON.stringify(rec) });
  return rec;
}

// ---------------------------------------------------------------- achievements

/** `why`: one sentence saying how it was won (absent on honours won before 16 Nov 2026: the client shows the rule instead). */
export type Earned = { id: AchId; at: number; date: string; why?: string };
export type AchView = { earned: Earned[]; fresh: AchId[]; holders: Partial<Record<AchId, number>>; players: number };

/** Award achievements (first award wins and keeps its date and the reason); returns the ones that are new. */
export async function award(user: string, ids: AchId[], date: string, why: (id: AchId) => string | undefined = () => undefined): Promise<AchId[]> {
  const fresh: AchId[] = [];
  for (const id of [...new Set(ids)]) {
    const w = why(id);
    if (await redis.hSetNX(K.ach(user), id, JSON.stringify({ at: Date.now(), date, ...(w ? { why: w } : {}) }))) {
      fresh.push(id);
      await redis.hIncrBy(K.achCount, id, 1);
    }
  }
  return fresh;
}

/** Facts of a finished, replay-validated run, for the run-based achievements. */
export function runFacts(sc: Scenario, final: State, par: number | null, actions: readonly Action[] = []): RunFacts {
  const b = score(sc, final);
  // road cuts turned back by legions and garrisons, turn by turn (needs the moves, not just the end state)
  let held = 0, st = initialState(sc);
  for (const a of actions) { if (a.type === 'end') held += heldAt(sc, st, st.turn).length; st = apply(sc, st, a); }
  const spec = (k: string) => eventsAsOf().find((e) => e.kind === k)?.title ?? k;
  return {
    held, decree: sc.decree.kind === 'none' ? undefined : sc.decree.title,
    gambits: (final.accepted ?? []).map((i) => spec(sc.events[i]?.kind ?? '')).filter(Boolean),
    total: b.total, par, decreeMet: b.decreeMet, roadsLost: final.history.reduce((n, h) => n + h.cut.length, 0),
    towns: suppliedTowns(sc, final).length, allTowns: suppliedTowns(sc, final).length >= sc.towns.length - 1, denarii: final.denarii, gambit: (final.accepted ?? []).length > 0,
  };
}

/** After any finished run (ranked or practice): count it, then award what the run and the totals earn, with why. */
async function awardRun(user: string, date: string, facts: RunFacts, practice = false): Promise<AchId[]> {
  const runs = await redis.hIncrBy(K.user(user), 'runs', 1);
  if (facts.decreeMet && await redis.hSetNX(K.user(user), `dec:${date}`, '1')) await redis.hIncrBy(K.user(user), 'decrees', 1);
  if (facts.par && facts.total >= facts.par && await redis.hSetNX(K.user(user), `beat:${date}`, '1')) await redis.hIncrBy(K.user(user), 'beats', 1);
  const c = await counterTotals(user, runs), where = { day: prettyDate(date), practice };
  const fromRun = runAchievements(facts);
  return award(user, [...fromRun, ...counterAchievements(c)], date,
    (id) => (fromRun.includes(id) ? whyRun(id, facts, where) : undefined) ?? whyCounter(id, c, prettyDate(date)));
}
async function counterTotals(user: string, runs?: number): Promise<Counters> {
  const h = await redis.hGetAll(K.user(user));
  // games finished before achievements existed count too (official plays are in `played`)
  const n = Math.max(runs ?? Number(h.runs ?? 0), Number(h.played ?? 0));
  return { runs: n, bestStreak: Number(h.best ?? 0), decrees: Number(h.decrees ?? 0), beats: Number(h.beats ?? 0) };
}
async function counters(user: string): Promise<AchId[]> { return counterAchievements(await counterTotals(user)); }

/** A player's achievements, how many players hold each, and (with `fresh`) the ones just earned. */
export async function getAchievements(user: string, date: string, fresh: AchId[] = []): Promise<AchView> {
  // earlier play (streaks, games) is credited the first time the player is seen after the feature shipped
  const backfill = await award(user, await counters(user), date, () => 'Credited from your earlier campaigns when this honour was introduced.');
  const raw = await redis.hGetAll(K.ach(user));
  const earned = Object.entries(raw).filter(([id]) => ACHIEVEMENTS.some((a) => a.id === id))
    .map(([id, v]) => { const x = JSON.parse(v) as { at: number; date: string; why?: string }; return { id: id as AchId, at: x.at, date: x.date, ...(x.why ? { why: x.why } : {}) }; })
    .sort((a, b) => a.at - b.at);
  const counts = await redis.hGetAll(K.achCount);
  const holders = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v)])) as Partial<Record<AchId, number>>;
  return { earned, fresh: [...new Set([...fresh, ...backfill])], holders, players: Math.max(1, holders.hastatus ?? 0) };
}

/** Award one achievement for an action outside a game (vote, follow, share, tutorial); never throws. */
export async function awardFor(user: string, id: AchId, date: string, why?: string): Promise<AchId[]> {
  try { return await award(user, [id], date, () => why); } catch { return []; }
}

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
export async function submitPractice(date: string, user: string, actions: Action[], today: string): Promise<PracticeLog & { fresh: AchId[] }> {
  if (date > today) throw new GameError('This campaign has not started yet');
  const { scenario } = dailyScenario(date, await factionFor(date));
  let final;
  try { final = replay(scenario, actions); } catch (e) { throw new GameError(`Invalid game: ${(e as Error).message}`); }
  if (!isOver(scenario, final)) throw new GameError('The campaign is not finished');
  const total = score(scenario, final).total, at = Date.now();
  const log = await getPractice(date, user);
  const prevBest = personalBest((await getResult(date, user))?.total ?? null, log);
  log.runs.push({ total, at });
  if (log.runs.length > MAX_PRACTICE) log.runs = log.runs.slice(-MAX_PRACTICE);
  log.count = (log.count ?? 0) + 1;
  if (!log.best || total > log.best.total) log.best = { total, curve: scoreCurve(scenario, final), at };
  await redis.set(K.practice(date, user), JSON.stringify(log));
  const facts = runFacts(scenario, final, dailyScenario(date, await factionFor(date)).par, actions);
  const fresh = await awardRun(user, date, facts, true);
  if (prevBest !== null && total > prevBest) fresh.push(...await award(user, ['exercitatio'], date, () => `A practice run of ${total} beat your best of ${prevBest} on ${prettyDate(date)}.`));
  return { ...log, fresh };
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
  const { par } = dailyScenario(date, await factionFor(date));
  const achievements = await awardRun(user, date, runFacts(scenario, final, par, actions));
  return { result, streak, fresh: true, achievements };
}

// ---------------------------------------------------------------- the Demo post (one frozen map, endless replays)

/**
 * A finished Demo run (replay-validated). Every run counts: the latest is "your campaign" (results page,
 * chart, rivals' replays), the best goes on the Demo board, all runs are logged (tries, best curve).
 * Run-based honours are earned as in practice; the streak, the flair and the real day's board are untouched.
 */
export async function submitDemo(user: string, actions: Action[]): Promise<{ result: DayResult; fresh: AchId[]; pb: boolean }> {
  const { scenario, par } = dailyScenario(DEMO_DATE, DEMO_FACTION);
  let final;
  try { final = replay(scenario, actions); } catch (e) { throw new GameError(`Invalid game: ${(e as Error).message}`); }
  if (!isOver(scenario, final)) throw new GameError('The campaign is not finished');
  const b = score(scenario, final), curve = scoreCurve(scenario, final), now = Date.now();
  const result: DayResult = { total: b.total, glory: b.glory, decreeMet: b.decreeMet, lost: final.lost, towns: suppliedTowns(scenario, final).length, actions, curve, at: now };
  const log = await getPractice(DEMO_KEY, user);
  const pb = !log.best || b.total > log.best.total;
  const next: PracticeLog = {
    runs: [...log.runs, { total: b.total, at: now }].slice(-MAX_PRACTICE),
    best: pb ? { total: b.total, curve, at: now } : log.best, count: log.count + 1,
  };
  await redis.set(K.practice(DEMO_KEY, user), JSON.stringify(next));
  await redis.set(K.result(DEMO_KEY, user), JSON.stringify(result));
  await redis.hSet(K.user(user), { [`done:${DEMO_KEY}`]: '1' });
  const prev = await redis.zScore(K.lb(DEMO_KEY), user);
  if (prev === undefined || b.total > prev) await redis.zAdd(K.lb(DEMO_KEY), { member: user, score: b.total });
  const fresh = await awardRun(user, DEMO_KEY, runFacts(scenario, final, par, actions));
  return { result, fresh, pb };
}

/** The Demo's ballot: a real vote (same honours), tallied on the Demo only; it never decides a real day. */
export async function castDemoVote(user: string, faction: Faction): Promise<Votes> {
  if (!(await getResult(DEMO_KEY, user))) throw new GameError('Finish the campaign before voting');
  if (!ballotFor(addDays(DEMO_DATE, 1)).includes(faction)) throw new GameError('The Augurs are not on this ballot');
  if (await redis.hSetNX(K.user(user), `vote:${DEMO_KEY}`, faction)) {
    await redis.set(K.voted(DEMO_KEY, user), faction);
    await redis.hIncrBy(K.votes(DEMO_KEY), faction, 1);
    await award(user, faction === 'augures' ? ['voxPopuli', 'sibyl'] : ['voxPopuli'], DEMO_KEY, (id) => (id === 'sibyl' ? 'Consulted the Augures on the Demo.' : `Voted for the ${faction[0]!.toUpperCase()}${faction.slice(1)} on the Demo.`));
  }
  return getVotes(DEMO_KEY);
}

export async function castVote(date: string, user: string, faction: Faction, today: string): Promise<Votes> {
  if (date !== today) throw new GameError('Voting for this day has closed: tomorrow was decided at midnight');
  if (!(await getResult(date, user))) throw new GameError('Finish the campaign before voting');
  if (!ballotFor(addDays(date, 1)).includes(faction)) throw new GameError('The Augurs are not on tomorrow\'s ballot');
  const ok = await redis.hSetNX(K.user(user), `vote:${date}`, faction);
  if (ok) {
    await redis.set(K.voted(date, user), faction);
    await redis.hIncrBy(K.votes(date), faction, 1);
    const fac = faction[0]!.toUpperCase() + faction.slice(1);
    await award(user, faction === 'augures' ? ['voxPopuli', 'sibyl'] : ['voxPopuli'], date,
      (id) => (id === 'sibyl' ? `Consulted the Augures for the day after ${prettyDate(date)}.` : `Voted for the ${fac} on ${prettyDate(date)}.`));
  }
  return getVotes(date);
}

/** Spoiler-free comment text for sharing a result. */
export function shareText(date: string, r: DayResult, par: number | null, streak: number, rank: number | null, players: number, who?: string) {
  const pct = par ? ` (${Math.round((100 * r.total) / par)}% of Caesar)` : '';
  const parts = [
    `**${r.total}**${pct}`,
    `${r.towns} towns held`,
    r.lost ? `${r.lost} legion${r.lost > 1 ? 's' : ''} lost` : 'no legion lost',
    r.decreeMet ? 'decree fulfilled' : 'decree missed',
  ];
  if (rank) parts.push(`#${rank} of ${players}`);
  if (streak > 1) parts.push(`${streak}-day streak`);
  // signed: the comment must say whose campaign it is even where Reddit shows it without an author (app account, previews)
  return `🏛️ All Roads Lead to Rome, ${date}${who ? `, u/${who}` : ''}: ${parts.join(' · ')}`;
}

/** The optional challenge line appended to a share comment (Reddit notifies mentioned users). */
export function challengeLine(mentions: string[], from?: string): string {
  return mentions.length ? `\n\n${from ? `u/${from} challenges ` : ''}${mentions.map((m) => `u/${m}`).join(', ')}: your move. Can you beat it?` : '';
}

/** Flair text from the player's streak. */
/**
 * User flair: the service rank (same ladder as the achievements: Hastatus 1, Legionarius 10, Centurio 100
 * campaigns), the live streak and the number of honours. Kept under Reddit's 64-character limit.
 */
export function flairFor(streak: Streak, runs = streak.played, honours = 0): string {
  const n = Math.max(runs, streak.played);
  const title = n >= 100 ? 'Centurio' : n >= 30 ? 'Optio' : n >= 10 ? 'Legionarius' : 'Hastatus';
  return [title, streak.streak > 1 ? `🔥${streak.streak}` : '', honours ? `🏅${honours}` : ''].filter(Boolean).join(' · ');
}
/** Inputs of the flair beyond the streak: finished runs and honours held. */
export async function flairInputs(user: string): Promise<{ runs: number; honours: number }> {
  const [runs, honours] = await Promise.all([redis.hGet(K.user(user), 'runs'), redis.hLen(K.ach(user))]);
  return { runs: Number(runs ?? 0), honours };
}

// ---------------------------------------------------------------- snoovatars (cached a day)

/** Players' snoovatar URLs ('' when they have none); one Reddit call per player per day at most. */
export async function avatarsFor(users: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const u of [...new Set(users)].slice(0, 30)) {
    const key = `avatar:${u.toLowerCase()}`;
    let url = await redis.get(key);
    if (url === undefined) {
      try { url = (await reddit.getSnoovatarUrl(u)) ?? ''; } catch { url = ''; }
      await redis.set(key, url);
      await redis.expire(key, 86400);
    }
    if (url) out[u] = url;
  }
  return out;
}

// ---------------------------------------------------------------- the Senate's verdict (app comments)

export type DaySummary = { date: string; players: number; top: LeaderRow[]; par: number | null; beat: number; votes: Votes; faction: Faction };
/** What a finished day looked like: the podium, how many beat Caesar, and the vote for the next day. */
export async function daySummary(date: string): Promise<DaySummary> {
  const faction = await factionFor(date);
  const { par } = dailyScenario(date, faction);
  const lb = await leaderboard(date, undefined, 3);
  const beat = par === null ? 0 : (await redis.zRange(K.lb(date), par, Infinity, { by: 'score' })).length;
  return { date, players: lb.players, top: lb.board, par, beat, votes: await getVotes(date), faction };
}
const MEDAL = ['🥇', '🥈', '🥉'];
/** The app's comment closing a day, on that day's post. Names are written without u/ so nobody is pinged. */
export function verdictComment(d: DaySummary, nextDecree: { title: string; text: string; faction: Faction }): string {
  if (!d.players) return `**The Senate's verdict.** No general marched on this campaign. The next one belongs to the **${nextDecree.faction}**.`;
  const podium = d.top.map((r, i) => `${MEDAL[i]} ${r.username}: ${r.score}${d.par !== null ? ` (${r.score >= d.par ? '+' : '−'}${Math.abs(r.score - d.par)} vs Caesar)` : ''}`).join('  \n');
  const tally = (Object.entries(d.votes) as Array<[Faction, number]>).filter(([, n]) => n > 0).map(([f, n]) => `${f} ${n}`).join(', ');
  return [
    `**The Senate's verdict.** ${d.players} general${d.players > 1 ? 's' : ''} marched${d.par !== null ? `; ${d.beat} beat Caesar's ${d.par}` : ''}.`,
    '', podium, '',
    `The vote (${tally || 'no votes'}) gave the next campaign to the **${nextDecree.faction}**. Their decree, sealed until you march: >!**${nextDecree.title}**: ${nextDecree.text}!<`,
  ].join('\n');
}
/** The app's opening comment on a new day's post: the decree and how it was chosen. */
export function decreeComment(decree: { title: string; text: string; faction: Faction }, prev: DaySummary | null): string {
  const champ = prev?.top[0];
  return [
    // the decree stays sealed until you march (the post card and the game reveal it): Reddit's spoiler tag
    `📜 **Decree of the ${decree.faction}**, sealed until you march: >!**${decree.title}**: ${decree.text}!<`,
    prev && prev.players ? `Chosen by yesterday's vote. Yesterday's champion: ${champ!.username} with ${champ!.score}${prev.par !== null ? ` (Caesar ${prev.par})` : ''}.` : '',
    'Finish your campaign to vote for tomorrow\'s decree, then share your result here.',
  ].filter(Boolean).join('\n\n');
}

// ---------------------------------------------------------------- moderator debug tools

/** Wipe one player's game for a day (result, leaderboard entry, vote) and their streak record. */
export async function resetPlayer(date: string, user: string) {
  const vote = await getMyVote(date, user);
  if (vote) await redis.hIncrBy(K.votes(date), vote, -1);
  await redis.zRem(K.lb(date), [user]);
  await redis.hDel(K.late(date), [user]);
  for (const id of Object.keys(await redis.hGetAll(K.ach(user)))) await redis.hIncrBy(K.achCount, id, -1);
  await redis.del(K.result(date, user), K.voted(date, user), K.user(user), K.practice(date, user), K.ach(user), K.sk(user));
}

/** Wipe a whole day: every player's result and vote, the leaderboard, the tally and the decree faction. */
export async function resetDay(date: string) {
  const players = (await redis.zRange(K.lb(date), 0, -1, { by: 'rank' })).map((r) => r.member);
  for (const u of players) {
    await redis.del(K.result(date, u), K.voted(date, u), K.practice(date, u));
    await redis.hDel(K.user(u), [`done:${date}`, `vote:${date}`, `shared:${date}`]);
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
  await awardFor(user, 'socius', new Date().toISOString().slice(0, 10), `Followed ${name} as a rival.`);
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
      try { scenario ??= (date === DEMO_KEY ? dailyScenario(DEMO_DATE, DEMO_FACTION) : dailyScenario(date, await factionFor(date))).scenario; curve = scoreCurve(scenario, replay(scenario, res.actions)); } catch { curve = null; }
    }
    return { username: u, score: score ?? null, rank: asc === undefined ? null : players - asc, streak: st.streak, curve, best: personalBest(res?.total ?? null, pr), tries: date === DEMO_KEY ? pr.count ?? 0 : (res ? 1 : 0) + (pr.count ?? 0) };
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
  if (user && event === 'done') await awardFor(user, 'tirocinium', new Date().toISOString().slice(0, 10), `Finished the training campaign on ${prettyDate(new Date().toISOString().slice(0, 10))}.`);
}
export async function tutorialStats(): Promise<Record<string, number>> {
  const h = await redis.hGetAll('stats:tutorial');
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, Number(v)]));
}
