import { notifications, reddit, redis } from '@devvit/web/server';
import { addDays, dailyScenario, dateKey, DEMO_DATE, DEMO_FACTION, DEMO_KEY, prettyDate } from '../../shared/daily';
import type { DailyPostData } from '../../shared/daily';
import { daySummary, decreeComment, factionFor, getPostId, setPostId, verdictComment } from './game';

/** Each Reddit extra is best effort: a failure is logged and never blocks the daily post. */
async function attempt(what: string, f: () => Promise<unknown>) {
  try { await f(); } catch (e) { console.warn(`${what} failed: ${e}`); }
}

/** The first daily campaign (13 November 2026 is Campaign I); numbers the posts so a day can be named. */
const FIRST_CAMPAIGN = '2026-11-13';
export const campaignNumber = (date: string) => Math.max(1, Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${FIRST_CAMPAIGN}T00:00:00Z`)) / 864e5) + 1);
export function roman(n: number): string {
  const R: Array<[number, string]> = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, r] of R) while (n >= v) { out += r; n -= v; }
  return out;
}

/** Create the post for `date` unless it already exists (idempotent). Returns its id. */
export const createDailyPost = async (date: string = dateKey()) => {
  const existing = await getPostId(date);
  if (existing) return { id: existing, created: false };
  const faction = await factionFor(date);
  const postData: DailyPostData = { date, faction };
  const post = await reddit.submitCustomPost({
    title: `All Roads Lead to Rome · Campaign ${roman(campaignNumber(date))} · ${prettyDate(date)}`,
    postData,
    textFallback: { text: `Today's province of Gaul awaits. Open this post on the new Reddit or the app to play.` },
  });
  await setPostId(date, post.id);

  const decree = dailyScenario(date, faction).scenario.decree;
  const yesterday = addDays(date, -1);
  const prevPost = await getPostId(yesterday);
  const prev = prevPost ? await daySummary(yesterday).catch(() => null) : null;
  // the Senate's verdict closes yesterday's post; the decree opens today's (app account, stickied)
  if (prevPost && prev) await attempt('verdict comment', async () => {
    const c = await reddit.submitComment({ id: prevPost as `t3_${string}`, text: verdictComment(prev, decree) });
    await c.distinguish(true);
  });
  await attempt('decree comment', async () => {
    const c = await reddit.submitComment({ id: post.id, text: decreeComment(decree, prev) });
    await c.distinguish(true);
  });
  // the app's game badge points to today's campaign until the next one
  await attempt('game badge', () => notifications.requestShowGameBadge({ post: post.id, expiresAt: new Date(Date.parse(`${addDays(date, 1)}T00:05:00Z`)) }));
  return { id: post.id, created: true };
};

/**
 * Self-healing daily post: if the 00:05 UTC job did not run, the first visitor of the day (on any older post)
 * creates today's post. A short Redis lock keeps two visitors from posting twice. Returns today's post id or null.
 */
export async function ensureTodayPost(today: string = dateKey()): Promise<string | null> {
  const existing = await getPostId(today);
  if (existing) return existing;
  if (Date.now() - Date.parse(`${today}T00:05:00Z`) < 10 * 60e3) return null; // give the scheduled job its 10 minutes
  const lock = await redis.hSetNX('postlock', today, String(Date.now()));
  if (!lock) return null;
  try { return (await createDailyPost(today)).id; } catch (e) { console.warn(`self-heal post failed: ${e}`); await redis.hDel('postlock', [today]); return null; }
}

/**
 * The Demo post (moderator menu): one frozen, published map with Caesar's score, replayed as often as anyone
 * likes on its own board. Idempotent: a second call opens the existing one. Not a daily: no decree comment, no badge.
 */
export async function createDemoPost(): Promise<{ id: string; created: boolean }> {
  const existing = await getPostId(DEMO_KEY);
  if (existing) return { id: existing, created: false };
  const lock = await redis.hSetNX('postlock', DEMO_KEY, String(Date.now()));
  if (!lock) throw new Error('The Demo is being posted');
  try {
    const postData: DailyPostData = { date: DEMO_DATE, faction: DEMO_FACTION, demo: true };
    const post = await reddit.submitCustomPost({
      title: 'All Roads Lead to Rome · Demo',
      postData,
      textFallback: { text: 'The Demo campaign of All Roads Lead to Rome: one province of Gaul, replay it as often as you like. Open this post on the new Reddit or the app to play.' },
    });
    await setPostId(DEMO_KEY, post.id);
    await attempt('demo comment', async () => {
      const { scenario, par } = dailyScenario(DEMO_DATE, DEMO_FACTION);
      const c = await reddit.submitComment({ id: post.id, text: demoComment(scenario.decree.title, par) });
      await c.distinguish(true);
    });
    return { id: post.id, created: true };
  } finally { await redis.hDel('postlock', [DEMO_KEY]); }
}

export function demoComment(decree: string, par: number | null): string {
  return [
    '**The Demo campaign.** One province of Gaul, the whole game, as often as you like.',
    '',
    `* Caesar marched this map for **${par ?? '?'} glory** under the decree *${decree}*. Every run you finish is scored: your best goes on the Demo board.`,
    '* First time? A two-minute guided campaign opens first (you can skip it).',
    '* After each run: your score curve against Caesar\'s, honours, the Senate\'s ballot, rivals to follow, a share card and a comment to challenge them.',
    '* The real game is the daily post: a new map every day at 00:05 UTC, one scored try, streaks and the Senate\'s vote. The Demo never touches those.',
  ].join('\n');
}
