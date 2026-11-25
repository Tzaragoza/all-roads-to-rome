import { initTRPC, TRPCError } from '@trpc/server';
import { transformer } from '../shared/transformer';
import { Context } from './context';
import { context, reddit, redis, settings } from '@devvit/web/server';
import { z } from 'zod';
import { addDays, dailyScenario, dateKey, DEMO_DATE, DEMO_FACTION, DEMO_KEY, prettyDate } from '../shared/daily';
import type { DailyPostData } from '../shared/daily';
import {
  castDemoVote, castVote, challengeLine, submitDemo, rivalPlan, getPractice, submitPractice, getAchievements, awardFor, skirmishRecords, skirmishUnlocked, submitSkirmish, avatarsFor, flairInputs, checkShare, factionFor, flairFor, followRival, GameError, resetDay, resetPlayer, rivalsFor,
  unfollowRival, getMyVote, getResult, getStreak, getVotes, historyFor, LATE_POLICIES, leaderboard, shareText,
  recordChallenges, recordTutorial, settleDay, submitResult, tutorialDone, tutorialStats, wouldRank,
} from './core/game';
import type { LatePolicy } from './core/game';
import type { AchId } from '../shared/achievements';
import { ensureTodayPost } from './core/post';
import { ACT_KINDS, ACT_MODES, modStats, recordActivity } from './core/stats';
import { BugLimit, listBugs, newBugCount, setBugStatus, submitBug } from './core/bugs';
import { BUG_LIMITS } from '../shared/bugs';

const t = initTRPC.context<Context>().create({ transformer });

export const router = t.router;
export const publicProcedure = t.procedure;

const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('road'), road: z.number().int().nonnegative() }),
  z.object({ type: z.literal('camp'), legion: z.number().int().nonnegative(), town: z.number().int().nonnegative() }),
  z.object({ type: z.literal('garrison'), town: z.number().int().nonnegative() }),
  z.object({ type: z.literal('recruit') }),
  z.object({ type: z.literal('accept'), event: z.number().int().nonnegative() }),
  z.object({ type: z.literal('end') }),
]);

/**
 * The date this post plays. Normally stored on the post (postData). Posts made by early versions
 * of the app have none: they play the day they were created (UTC), not "today", so an old post
 * never turns into a copy of today's map. Cached per post (a post's date never changes).
 */
const postDates = new Map<string, string>();
async function postDate(): Promise<string> {
  const d = (context.postData as Partial<DailyPostData> | undefined)?.date;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const id = context.postId;
  if (!id) return dateKey();
  const hit = postDates.get(id);
  if (hit) return hit;
  try {
    const created = dateKey((await reddit.getPostById(id)).createdAt);
    postDates.set(id, created);
    return created;
  } catch {
    return dateKey();
  }
}

/** Is this the Demo post (one frozen map, replayed at will, its own board)? Its store key stands in for the date. */
const isDemo = () => !!(context.postData as Partial<DailyPostData> | undefined)?.demo;
/** The store key of this post: its date, or DEMO_KEY on the Demo. */
async function postKey(): Promise<string> { return isDemo() ? DEMO_KEY : postDate(); }

/** The subreddit's late-play rule (moderator setting `latePlay`, default: flagged). */
async function latePolicy(): Promise<LatePolicy> {
  try {
    const v = await settings.get<string | string[]>('latePlay');
    const x = Array.isArray(v) ? v[0] : v;
    return LATE_POLICIES.includes(x as LatePolicy) ? (x as LatePolicy) : 'flagged';
  } catch { return 'flagged'; }
}

/** Moderators of the subreddit get the debug tools. */
async function isMod(username: string | undefined): Promise<boolean> {
  if (!username || !context.subredditName) return false;
  try {
    const mods = await reddit.getModerators({ subredditName: context.subredditName, username }).all();
    return mods.some((m) => m.username.toLowerCase() === username.toLowerCase());
  } catch { return false; }
}

async function dayState(date: string, username: string | undefined, fresh: AchId[] = []) {
  const demo = date === DEMO_KEY;
  const faction = demo ? DEMO_FACTION : await factionFor(date);
  const { par } = dailyScenario(demo ? DEMO_DATE : date, faction);
  const [lb, votes, me, myVote, streak] = await Promise.all([
    leaderboard(date, username),
    getVotes(date),
    username ? getResult(date, username) : Promise.resolve(null),
    username ? getMyVote(date, username) : Promise.resolve(null),
    username ? getStreak(username) : Promise.resolve(null),
  ]);
  const [mod, rivals, policy] = await Promise.all([isMod(username), username ? rivalsFor(date, username) : Promise.resolve([]), latePolicy()]);
  const today = dateKey();
  // a late play kept off the board (policy "ontime"): where it would have placed
  const offBoard = me && !lb.me && !demo ? await wouldRank(date, me.total) : null;
  const tutorial = username ? await tutorialDone(username) : false;
  const practice = username ? await getPractice(date, username) : null;
  const achievements = username ? await getAchievements(username, demo ? today : date, fresh) : null;
  const avatars = await avatarsFor([...lb.board.map((r) => r.username), ...rivals.map((r) => r.username), ...(username ? [username] : [])]).catch((): Record<string, string> => ({}));
  const skirmish = username ? { unlocked: await skirmishUnlocked(username, dateKey(), demo), records: await skirmishRecords(username) } : null;
  // an older day's post links to today's (and creates it if the scheduled job failed)
  const todayPost = demo || date < today ? await ensureTodayPost(today).catch(() => null) : null;
  return { date: demo ? DEMO_DATE : date, demo, faction, par, username: username ?? null, leaderboard: lb, votes, me, myVote, streak, today, isMod: mod, rivals,
    policy, late: !demo && date < today, todayPost, offBoard, tutorialDone: tutorial, tutorialStats: mod ? await tutorialStats() : null, bugsNew: mod ? await newBugCount() : 0, practice, achievements, skirmish, avatars };
}

function asTrpc(e: unknown): never {
  if (e instanceof GameError) throw new TRPCError({ code: 'BAD_REQUEST', message: e.message });
  throw e;
}

export const appRouter = t.router({
  day: t.router({
    /** Everything the splash and the game need for this post's day. */
    init: publicProcedure.query(async () => {
      const username = await reddit.getCurrentUsername();
      // yesterday's podium (Princeps), in case the daily job did not run; once per day, never fails the load
      await settleDay(addDays(dateKey(), -1)).catch((e) => console.warn(`settleDay failed: ${e}`));
      return dayState(await postKey(), username);
    }),

    /** Submit a finished game (its action log). The server replays it to compute the score. */
    submit: publicProcedure
      .input(z.object({ actions: z.array(ActionSchema).max(400) }))
      .mutation(async ({ input }) => {
        const username = await reddit.getCurrentUsername();
        if (!username) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Log in to save your score' });
        if (isDemo()) {
          let r;
          try { r = await submitDemo(username, input.actions); } catch (e) { asTrpc(e); }
          return dayState(DEMO_KEY, username, r.fresh);
        }
        const date = await postDate();
        let res;
        try { res = await submitResult(date, username, input.actions, { today: dateKey(), policy: await latePolicy() }); } catch (e) { asTrpc(e); }
        if (res.fresh && context.subredditName) {
          // flair is cosmetic: never fail the submission because of it
          try {
            await reddit.setUserFlair({ subredditName: context.subredditName, username, text: (await flairInputs(username).then((f) => flairFor(res.streak, f.runs, f.honours)).catch(() => flairFor(res.streak))) });
          } catch (e) { console.warn(`flair failed: ${e}`); }
        }
        return dayState(date, username, res.fresh ? res.achievements ?? [] : []);
      }),

    vote: publicProcedure
      .input(z.object({ faction: z.enum(['populares', 'optimates', 'augures']) }))
      .mutation(async ({ input }) => {
        const username = await reddit.getCurrentUsername();
        if (!username) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Log in to vote' });
        if (isDemo()) {
          try { await castDemoVote(username, input.faction); } catch (e) { asTrpc(e); }
          return dayState(DEMO_KEY, username);
        }
        const date = await postDate();
        try { await castVote(date, username, input.faction, dateKey()); } catch (e) { asTrpc(e); }
        return dayState(date, username);
      }),

    /** Record a finished practice run (unranked): every score is kept, with the personal best. */
    practice: publicProcedure
      .input(z.object({ actions: z.array(ActionSchema).max(400) }))
      .mutation(async ({ input }) => {
        const username = await reddit.getCurrentUsername();
        if (!username) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Log in to keep your practice runs' });
        if (isDemo()) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Every Demo run is scored: there is no practice here' });
        const date = await postDate();
        let fresh: AchId[] = [];
        try { fresh = (await submitPractice(date, username, input.actions, dateKey())).fresh; } catch (e) { asTrpc(e); }
        return dayState(date, username, fresh);
      }),

    /** Record a finished Skirmish (pool map): unranked, personal best per map. */
    skirmish: publicProcedure
      .input(z.object({ id: z.number().int().min(1).max(10000), actions: z.array(ActionSchema).max(400) }))
      .mutation(async ({ input }) => {
        const username = await reddit.getCurrentUsername();
        if (!username) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Log in to keep your skirmish scores' });
        let fresh: AchId[] = [];
        try { fresh = (await submitSkirmish(username, input.id, input.actions, dateKey(), isDemo())).fresh; } catch (e) { asTrpc(e); }
        return { unlocked: true, records: await skirmishRecords(username), achievements: await getAchievements(username, dateKey(), fresh) };
      }),

    /** A followed rival's moves for this post's day, once the player has finished it. */
    /** A client error from a player's device (window error / unhandled rejection): kept, last 200, for the status menu. */
    clientError: publicProcedure
      .input(z.object({ msg: z.string().max(300), where: z.string().max(300), build: z.string().max(60) }))
      .mutation(async ({ input }) => {
        const now = Date.now();
        await redis.zAdd('errors', { member: JSON.stringify({ ...input, at: new Date(now).toISOString(), post: context.postId ?? '' }), score: now });
        await redis.zRemRangeByRank('errors', 0, -201);
        return true;
      }),

    rivalPlan: publicProcedure
      .input(z.object({ username: z.string().min(1).max(30) }))
      .query(async ({ input }) => {
        const username = await reddit.getCurrentUsername();
        if (!username) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Log in to compare' });
        const date = await postKey();
        let actions;
        try { actions = await rivalPlan(date, username, input.username); } catch (e) { asTrpc(e); }
        // Speculator: watched a rival's campaign turn by turn (the client grants it locally on `fresh`)
        const fresh = actions ? await awardFor(username, 'speculator', date === DEMO_KEY ? dateKey() : date, `Watched ${input.username}'s campaign turn by turn on ${prettyDate(date)}.`) : [];
        return { actions, fresh };
      }),

    /** Post the player's spoiler-free result as a comment, as the player, optionally challenging rivals. */
    share: publicProcedure
      .input(z.object({ mentions: z.array(z.string()).max(3).default([]) }))
      .mutation(async ({ input }) => {
        const username = await reddit.getCurrentUsername();
        if (!username || !context.postId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Log in to share' });
        const date = await postKey();
        const st = await dayState(date, username);
        if (!st.me) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Finish the campaign first' });
        let mentions: string[] = [];
        try { mentions = await checkShare(date, username, input.mentions); } catch (e) { asTrpc(e); }
        if (date !== DEMO_KEY) await recordChallenges(date, username, mentions); // Responsum, when they march
        const text = shareText(date === DEMO_KEY ? 'Demo' : date, st.me, st.par, st.streak?.streak ?? 0, st.leaderboard.me?.rank ?? null, st.leaderboard.players, username)
          + challengeLine(mentions, username);
        await reddit.submitComment({ id: context.postId, text, runAs: 'USER' });
        await awardFor(username, 'acta', date, `Shared your result in the comments of ${prettyDate(date)}.`);
        return { ok: true };
      }),

    follow: publicProcedure
      .input(z.object({ username: z.string().max(25), follow: z.boolean() }))
      .mutation(async ({ input }) => {
        const username = await reddit.getCurrentUsername();
        if (!username) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Log in to follow rivals' });
        try {
          if (input.follow) await followRival(username, input.username);
          else await unfollowRival(username, input.username);
        } catch (e) { asTrpc(e); }
        return dayState(await postKey(), username);
      }),

    /** Moderator debug: wipe my game for this post's day, or the whole day. */
    debugReset: publicProcedure
      .input(z.object({ scope: z.enum(['me', 'day']) }))
      .mutation(async ({ input }) => {
        const username = await reddit.getCurrentUsername();
        if (!(await isMod(username))) throw new TRPCError({ code: 'FORBIDDEN', message: 'Moderators only' });
        const date = await postKey();
        if (input.scope === 'me') await resetPlayer(date, username!);
        else await resetDay(date);
        return dayState(date, username);
      }),

    /** Game client telemetry for the moderator stats: the game was opened, a campaign started or finished. Never fails. */
    activity: publicProcedure
      .input(z.object({ kind: z.enum(ACT_KINDS), mode: z.enum(ACT_MODES) }))
      .mutation(async ({ input }) => {
        const username = await reddit.getCurrentUsername().catch(() => undefined);
        await recordActivity(await postKey(), username, input.kind, input.mode);
        return null;
      }),

    /** 🐞 A bug report from anyone (logged-out visitors too), with the context the client gathered. Rate-limited. */
    bug: publicProcedure
      .input(z.object({
        text: z.string().trim().min(3).max(BUG_LIMITS.text),
        ctx: z.object({
          version: z.string().max(80), day: z.string().max(20), mode: z.string().max(20), view: z.string().max(20),
          skirmish: z.number().int().nullable(), skin: z.string().max(20), turn: z.number().int(), denarii: z.number().int(), glory: z.number().int(),
          screen: z.string().max(40), agent: z.string().max(300), actions: z.array(z.unknown()).max(BUG_LIMITS.actions).nullable(),
        }),
      }))
      .mutation(async ({ input }) => {
        const username = await reddit.getCurrentUsername().catch(() => undefined);
        try { return { id: await submitBug(username, input.text, input.ctx, dateKey()) }; }
        catch (e) { if (e instanceof BugLimit) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: e.message }); throw e; }
      }),

    /** Moderators: the newest bug reports. */
    bugs: publicProcedure.query(async () => {
      if (!(await isMod(await reddit.getCurrentUsername()))) throw new TRPCError({ code: 'FORBIDDEN', message: 'Moderators only' });
      return listBugs();
    }),

    /** Moderators: mark a report done (or new again). */
    bugStatus: publicProcedure
      .input(z.object({ id: z.string().max(40), status: z.enum(['new', 'done']) }))
      .mutation(async ({ input }) => {
        if (!(await isMod(await reddit.getCurrentUsername()))) throw new TRPCError({ code: 'FORBIDDEN', message: 'Moderators only' });
        return setBugStatus(input.id, input.status);
      }),

    /** Moderators: every day's opens, starts, finishes and votes, and the table of known players (Senate archives). */
    modStats: publicProcedure.query(async () => {
      const username = await reddit.getCurrentUsername();
      if (!(await isMod(username))) throw new TRPCError({ code: 'FORBIDDEN', message: 'Moderators only' });
      return modStats(dateKey());
    }),

    /** Your last 7 days: score, Caesar, rank and rivals, with each day's post for navigation. */
    history: publicProcedure.query(async () => {
      const username = await reddit.getCurrentUsername();
      return { subreddit: context.subredditName ?? null, days: await historyFor(username, dateKey()) };
    }),

    /** Tutorial started, finished or skipped (counts it; done/skip are remembered for the player). */
    tutorial: publicProcedure
      .input(z.object({ event: z.enum(['start', 'done', 'skip']), step: z.string().max(20) }))
      .mutation(async ({ input }) => {
        const username = await reddit.getCurrentUsername();
        await recordTutorial(username, input.event, input.step);
        return { ok: true };
      }),

    subscribe: publicProcedure.mutation(async () => {
      await reddit.subscribeToCurrentSubreddit();
      return { ok: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
