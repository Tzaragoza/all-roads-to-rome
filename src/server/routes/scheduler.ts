import { Hono } from 'hono';
import { createDailyPost } from '../core/post';

export const scheduler = new Hono();

/** Cron (devvit.json): create today's post shortly after the UTC rollover. */
scheduler.post('/daily-post', async (c) => {
  try {
    const post = await createDailyPost();
    console.log(`daily-post: ${post.created ? 'created' : 'already existed'} ${post.id}`);
    return c.json({ status: 'ok', postId: post.id }, 200);
  } catch (error) {
    console.error(`daily-post failed: ${error}`);
    return c.json({ status: 'error' }, 500);
  }
});
