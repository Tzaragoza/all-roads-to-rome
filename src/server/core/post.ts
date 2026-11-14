import { reddit } from '@devvit/web/server';
import { dateKey, prettyDate } from '../../shared/daily';
import type { DailyPostData } from '../../shared/daily';
import { factionFor, getPostId, setPostId } from './game';

/** Create the post for `date` unless it already exists (idempotent). Returns its id. */
export const createDailyPost = async (date: string = dateKey()) => {
  const existing = await getPostId(date);
  if (existing) return { id: existing, created: false };
  const faction = await factionFor(date);
  const postData: DailyPostData = { date, faction };
  const post = await reddit.submitCustomPost({
    title: `All Roads Lead to Rome: ${prettyDate(date)}`,
    postData,
    textFallback: { text: `Today's province of Gaul awaits. Open this post on the new Reddit or the app to play.` },
  });
  await setPostId(date, post.id);
  return { id: post.id, created: true };
};
