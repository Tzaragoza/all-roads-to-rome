import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { redis } from '@devvit/web/server';
import { createDailyPost, createDemoPost, campaignNumber, roman } from '../core/post';
import { getPostId, getVotes, leaderboard } from '../core/game';
import { dateKey } from '../../shared/daily';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const post = await createDailyPost();
    // say what happened: a new post, or today's already existed (the job is idempotent)
    return c.json<UiResponse>(
      {
        showToast: post.created ? "Posted today's campaign" : "Today's campaign was already posted: opening it",
        navigateTo: `https://reddit.com/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create post',
      },
      400
    );
  }
});

/** Moderators: post the Demo (once; later calls open it). */
menu.post('/demo-create', async (c) => {
  try {
    const post = await createDemoPost();
    return c.json<UiResponse>({ showToast: post.created ? 'Posted the Demo' : 'The Demo was already posted: opening it', navigateTo: `https://reddit.com/comments/${post.id}` }, 200);
  } catch (error) {
    console.error(`Error creating demo: ${error}`);
    return c.json<UiResponse>({ showToast: `Failed to post the Demo: ${error}` }, 400);
  }
});

/** Moderators: is today running? Post, players, votes, last scheduled run, in one toast (no need to play first). */
menu.post('/status', async (c) => {
  try {
    const today = dateKey(), post = await getPostId(today);
    const [lb, votes, ops, errs, lastErr] = await Promise.all([leaderboard(today, undefined), getVotes(today), redis.hGetAll('ops'), redis.zCard('errors'), redis.zRange('errors', -1, -1, { by: 'rank' })]);
    let last = '';
    try { const e = JSON.parse(lastErr[0]?.member ?? '{}') as { msg?: string; at?: string }; if (e.msg) last = ` (last, ${e.at?.slice(11, 16) ?? '?'} UTC: ${e.msg.slice(0, 90)})`; } catch { /* ignore */ }
    const nVotes = Object.values(votes).reduce((n, v) => n + (v ?? 0), 0);
    const cron = ops?.cron ? `job ran ${ops.cron.slice(11, 16)} UTC` : 'job not seen yet';
    const text = post
      ? `Campaign ${roman(campaignNumber(today))}: ${lb.players} played, ${nVotes} voted · ${cron}${errs ? ` · ${errs} client errors kept${last}` : ''}`
      : `No post for ${today} yet (${cron}). Use "Post today's campaign".`;
    return c.json<UiResponse>({ showToast: text, ...(post ? { navigateTo: `https://reddit.com/comments/${post}` } : {}) }, 200);
  } catch (error) {
    return c.json<UiResponse>({ showToast: `Status unavailable: ${error}` }, 500);
  }
});
