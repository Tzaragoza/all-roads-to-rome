import './arlr/game.css';

import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { context, getShareData, navigateToPost, showShareSheet } from '@devvit/web/client';
import { mountGame } from './arlr/app';
import type { DayView, Social } from './arlr/app';
import { dailyScenario, dateKey } from '../shared/daily';
import type { DailyPostData } from '../shared/daily';
import type { Faction } from '../shared/engine';
import { trpc } from './trpc';

type Init = Awaited<ReturnType<typeof trpc.day.init.query>>;

const toView = (d: Init): DayView => ({
  par: d.par, username: d.username, me: d.me, myVote: d.myVote, votes: d.votes, streak: d.streak, leaderboard: d.leaderboard,
  isMod: d.isMod, rivals: d.rivals, policy: d.policy, late: d.late, offBoard: d.offBoard, today: d.today,
  tutorialDone: d.tutorialDone, tutorialStats: d.tutorialStats, practice: d.practice,
});

const social: Social = {
  finish: async (actions) => toView(await trpc.day.submit.mutate({ actions })),
  vote: async (faction) => toView(await trpc.day.vote.mutate({ faction })),
  share: async (mentions) => { await trpc.day.share.mutate({ mentions }); },
  follow: async (username, follow) => toView(await trpc.day.follow.mutate({ username, follow })),
  challenge: async (score) => {
    const from = (() => { try { return context?.username ?? ''; } catch { return ''; } })();
    await showShareSheet({
      title: 'All Roads Lead to Rome',
      text: `I scored ${score} on today's All Roads Lead to Rome. Can you beat it?`,
      data: JSON.stringify({ from, score }),
    });
  },
  subscribe: async () => { await trpc.day.subscribe.mutate(); },
  reset: async (scope) => toView(await trpc.day.debugReset.mutate({ scope })),
  history: async () => (await trpc.day.history.query()).days,
  practice: async (actions) => toView(await trpc.day.practice.mutate({ actions })),
  rivalPlan: async (username) => (await trpc.day.rivalPlan.query({ username }))?.actions ?? null,
  openPost: (postId) => { navigateToPost(postId as `t3_${string}`, { presentation: 'expanded' }); },
  tutorial: async (event, step) => { await trpc.day.tutorial.mutate({ event, step }); },
};

/** A challenge link carries who challenged you and the score to beat. */
function readChallenge(): { from: string; score: number } | null {
  try {
    const raw = getShareData();
    if (!raw) return null;
    const d = JSON.parse(raw) as { from?: unknown; score?: unknown };
    return typeof d.from === 'string' && d.from && typeof d.score === 'number' ? { from: d.from, score: d.score } : null;
  } catch { return null; }
}

export const Game = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [init, setInit] = useState<Init | null | 'offline'>(null);

  useEffect(() => {
    let alive = true;
    trpc.day.init.query()
      .then((d) => alive && setInit(d))
      .catch(() => alive && setInit('offline')); // e.g. opened outside Reddit: play without saving
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!ref.current || init === null) return;
    if (init === 'offline') {
      let pd: Partial<DailyPostData> | undefined;
      try { pd = context?.postData as Partial<DailyPostData> | undefined; } catch { pd = undefined; }
      const date = pd?.date ?? dateKey();
      const { scenario, par } = dailyScenario(date, pd?.faction as Faction | undefined);
      return mountGame(ref.current, { scenario, par, date });
    }
    const { scenario } = dailyScenario(init.date, init.faction);
    return mountGame(ref.current, { scenario, par: init.par, date: init.date, social, day: toView(init), challengedBy: readChallenge() });
  }, [init]);

  return init === null ? <div className="loading">Unrolling the map of Gaul…</div> : <div ref={ref} />;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Game />
  </StrictMode>
);
