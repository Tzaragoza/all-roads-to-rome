import { initTRPC, TRPCError } from '@trpc/server';
import { transformer } from '../shared/transformer';
import { Context } from './context';
import { context, reddit, settings } from '@devvit/web/server';
import { z } from 'zod';
import { dailyScenario, dateKey } from '../shared/daily';
import type { DailyPostData } from '../shared/daily';
import {
  castVote, challengeLine, rivalPlan, getPractice, submitPractice, checkShare, factionFor, flairFor, followRival, GameError, resetDay, resetPlayer, rivalsFor,
  unfollowRival, getMyVote, getResult, getStreak, getVotes, historyFor, LATE_POLICIES, leaderboard, shareText,
  recordTutorial, submitResult, tutorialDone, tutorialStats, wouldRank,
} from './core/game';
import type { LatePolicy } from './core/game';

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

async function dayState(date: string, username: string | undefined) {
  const faction = await factionFor(date);
  const { par } = dailyScenario(date, faction);
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
  const offBoard = me && !lb.me ? await wouldRank(date, me.total) : null;
  const tutorial = username ? await tutorialDone(username) : false;
  const practice = username ? await getPractice(date, username) : null;
  return { date, faction, par, username: username ?? null, leaderboard: lb, votes, me, myVote, streak, today, isMod: mod, rivals,
    policy, late: date < today, offBoard, tutorialDone: tutorial, tutorialStats: mod ? await tutorialStats() : null, practice };
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
      return dayState(await postDate(), username);
    }),

    /** Submit a finished game (its action log). The server replays it to compute the score. */
    submit: publicProcedure
      .input(z.object({ actions: z.array(ActionSchema).max(400) }))
      .mutation(async ({ input }) => {
        const username = await reddit.getCurrentUsername();
        if (!username) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Log in to save your score' });
        const date = await postDate();
        let res;
        try { res = await submitResult(date, username, input.actions, { today: dateKey(), policy: await latePolicy() }); } catch (e) { asTrpc(e); }
        if (res.fresh && context.subredditName) {
          // flair is cosmetic: never fail the submission because of it
          try {
            await reddit.setUserFlair({ subredditName: context.subredditName, username, text: flairFor(res.streak) });
          } catch (e) { console.warn(`flair failed: ${e}`); }
        }
        return dayState(date, username);
      }),

    vote: publicProcedure
      .input(z.object({ faction: z.enum(['populares', 'optimates', 'augures']) }))
      .mutation(async ({ input }) => {
        const username = await reddit.getCurrentUsername();
        if (!username) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Log in to vote' });
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
        const date = await postDate();
        try { await submitPractice(date, username, input.actions, dateKey()); } catch (e) { asTrpc(e); }
        return dayState(date, username);
      }),

    /** A followed rival's moves for this post's day, once the player has finished it. */
    rivalPlan: publicProcedure
      .input(z.object({ username: z.string().min(1).max(30) }))
      .query(async ({ input }) => {
        const username = await reddit.getCurrentUsername();
        if (!username) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Log in to compare' });
        const date = await postDate();
        try { return { actions: await rivalPlan(date, username, input.username) }; } catch (e) { asTrpc(e); }
      }),

    /** Post the player's spoiler-free result as a comment, as the player, optionally challenging rivals. */
    share: publicProcedure
      .input(z.object({ mentions: z.array(z.string()).max(3).default([]) }))
      .mutation(async ({ input }) => {
        const username = await reddit.getCurrentUsername();
        if (!username || !context.postId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Log in to share' });
        const date = await postDate();
        const st = await dayState(date, username);
        if (!st.me) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Finish the campaign first' });
        let mentions: string[] = [];
        try { mentions = await checkShare(date, username, input.mentions); } catch (e) { asTrpc(e); }
        const text = shareText(date, st.me, st.par, st.streak?.streak ?? 0, st.leaderboard.me?.rank ?? null, st.leaderboard.players)
          + challengeLine(mentions);
        await reddit.submitComment({ id: context.postId, text, runAs: 'USER' });
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
        return dayState(await postDate(), username);
      }),

    /** Moderator debug: wipe my game for this post's day, or the whole day. */
    debugReset: publicProcedure
      .input(z.object({ scope: z.enum(['me', 'day']) }))
      .mutation(async ({ input }) => {
        const username = await reddit.getCurrentUsername();
        if (!(await isMod(username))) throw new TRPCError({ code: 'FORBIDDEN', message: 'Moderators only' });
        const date = await postDate();
        if (input.scope === 'me') await resetPlayer(date, username!);
        else await resetDay(date);
        return dayState(date, username);
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
