// Bug reports (🐞 in the rules sheet and on the results page). Players describe the problem; the client attaches
// the context a moderator needs to reproduce it (day, mode, turn, version, screen size, and, if the player agrees,
// the campaign's action log, which replays the game exactly). Moderators read them in the Senate archives.
//
//   bugs            sorted set  id → submitted at (ms)
//   bug:{id}        string      JSON BugReport
//   bugs:new        string      number of reports not yet marked done
//   bugs:rl:{day}:{user|anon}   string  reports sent that day (rate limit), expires after 2 days
import { redis } from '@devvit/web/server';
import type { BugContext, BugReport, BugStatus } from '../../shared/bugs';
import { BUG_LIMITS } from '../../shared/bugs';

const BK = { list: 'bugs', one: (id: string) => `bug:${id}`, fresh: 'bugs:new', rl: (day: string, who: string) => `bugs:rl:${day}:${who}` };

export class BugLimit extends Error {}

/** Store a report. Throws BugLimit past the daily limit (per player; shared by all logged-out visitors). */
export async function submitBug(user: string | undefined, text: string, ctx: BugContext, today: string, now = Date.now()): Promise<string> {
  const who = user ?? 'anon', key = BK.rl(today, who);
  const n = await redis.incrBy(key, 1);
  await redis.expire(key, 2 * 86400);
  if (n > (user ? BUG_LIMITS.perUser : BUG_LIMITS.anonPerDay)) throw new BugLimit(user ? `That's ${BUG_LIMITS.perUser} reports today: thank you! Send more tomorrow.` : 'Too many reports from logged-out visitors today: log in to send one.');
  const id = `${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`;
  const report: BugReport = { id, at: now, user: user ?? null, text: text.slice(0, BUG_LIMITS.text), ctx, status: 'new' };
  await redis.set(BK.one(id), JSON.stringify(report));
  await redis.zAdd(BK.list, { member: id, score: now });
  await redis.incrBy(BK.fresh, 1);
  return id;
}

/** The newest reports first (at most `limit`). */
export async function listBugs(limit = 200): Promise<BugReport[]> {
  const ids = await redis.zRange(BK.list, 0, limit - 1, { by: 'rank', reverse: true });
  const out: BugReport[] = [];
  for (const { member } of ids) {
    const raw = await redis.get(BK.one(member));
    if (raw) out.push(JSON.parse(raw) as BugReport);
  }
  return out;
}

export async function setBugStatus(id: string, status: BugStatus): Promise<BugReport | null> {
  const raw = await redis.get(BK.one(id));
  if (!raw) return null;
  const r = JSON.parse(raw) as BugReport;
  if (r.status !== status) {
    await redis.incrBy(BK.fresh, status === 'new' ? 1 : -1);
    r.status = status;
    await redis.set(BK.one(id), JSON.stringify(r));
  }
  return r;
}

export const newBugCount = async () => Math.max(0, Number((await redis.get(BK.fresh)) ?? 0));
