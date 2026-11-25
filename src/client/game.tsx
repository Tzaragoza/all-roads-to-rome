import './arlr/game.css';

import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { context, getShareData, navigateToPost, showShareSheet } from '@devvit/web/client';
import { mountGame } from './arlr/app';
import { bootDone, bootPaint } from './arlr/boot';
import { versionLabel } from './arlr/version';
import type { Challenge, DayView, Social } from './arlr/app';
import { dailyScenario, dateKey } from '../shared/daily';
import type { DailyPostData } from '../shared/daily';
import type { Faction } from '../shared/engine';
import { trpc } from './trpc';
import { SKIRMISHES } from '../shared/skirmish';
import { telemetry } from '@devvit/analytics/client/reddit';
import type { JourneyEvent } from './arlr/app';

// ---- challenge links. The payload is compact ("193.BlueTiger", "212.s217.BlueTiger") so the link stays
// short; Reddit wraps it in its own ?devvitshare= parameter. Older JSON payloads are still understood.
const me = () => { try { return context?.username ?? ''; } catch { return ''; } };
const challengeData = (score: number, sk?: number) => [score, ...(sk ? [`s${sk}`] : []), me()].join('.');
// Signed with the issuer's u/ name: a pasted or shared message must say whose score it is.
function challengeText(score: number, sk?: number) {
  const who = me() ? `u/${me()}` : 'I';
  const verb = me() ? 'scored' : 'just scored';
  const tail = me() ? `Can you beat ${who}?` : 'Try to beat me!';
  let demo = false;
  try { demo = !!(context?.postData as Partial<DailyPostData> | undefined)?.demo; } catch { /* no post data */ }
  if (!sk) return `⚔️ ${who} ${verb} ${score} on ${demo ? 'the Demo map' : "today's map"} of All Roads Lead to Rome. ${tail}`;
  const par = SKIRMISHES.find((e) => e.id === sk)?.par;
  return `⚔️ ${who} ${verb} ${score} on skirmish map #${sk} of All Roads Lead to Rome${par ? ` (Caesar: ${par})` : ''}. ${tail}`;
}
/** The same link Reddit's share sheet builds, without the title slug, for "Copy message". */
function challengeUrl(data: string) {
  let sub = '', id = '';
  try { sub = context?.subredditName ?? ''; id = (context?.postId ?? '').replace(/^t3_/, ''); } catch { /* outside Reddit */ }
  const share = encodeURIComponent(JSON.stringify({ hash: '', params: {}, path: '', userData: data }));
  return sub && id ? `https://www.reddit.com/r/${sub}/comments/${id}/?devvitshare=${share}` : '';
}

// ---- Devvit Journeys: one journey per campaign. Never awaited by the game, never throws.
let lastReceipt = 'none yet';
const note = (r: { receipt?: { status?: string } } | undefined) => { if (r?.receipt?.status) lastReceipt = r.receipt.status.replace('JOURNEY_RECEIPT_', ''); };
let journeyQueue: Promise<unknown> = Promise.resolve();
function journey(e: JourneyEvent) {
  journeyQueue = journeyQueue.then(async () => {
    try {
      if (e.kind === 'start') {
        telemetry.clearJourneyId();
        const r = await telemetry.startJourney(); note(r);
        note(await telemetry.interaction({ action: 'campaign_start', actionDetails: e.mode }));
      } else if (e.kind === 'progress') {
        if (telemetry.getActiveJourneyId()) note(await telemetry.progress({ progress: e.progress, action: e.action, ...(e.details ? { actionDetails: e.details } : {}) }));
      } else if (e.kind === 'interaction') {
        note(await telemetry.interaction({ action: e.action, ...(e.details ? { actionDetails: e.details } : {}) }));
      } else if (telemetry.getActiveJourneyId()) {
        note(await telemetry.endJourney({ complete: e.complete, game: { win: e.win, score: e.score } }));
        telemetry.clearJourneyId();
      }
    } catch (err) { console.warn('journey', err); }
  });
}

type Init = Awaited<ReturnType<typeof trpc.day.init.query>>;

const toView = (d: Init): DayView => ({
  par: d.par, username: d.username, me: d.me, myVote: d.myVote, votes: d.votes, streak: d.streak, leaderboard: d.leaderboard,
  isMod: d.isMod, rivals: d.rivals, policy: d.policy, late: d.late, offBoard: d.offBoard, today: d.today,
  tutorialDone: d.tutorialDone, tutorialStats: d.tutorialStats, practice: d.practice, achievements: d.achievements, skirmish: d.skirmish, avatars: d.avatars,
  demo: d.demo, todayPost: d.todayPost,
});

const social: Social = {
  finish: async (actions) => toView(await trpc.day.submit.mutate({ actions })),
  vote: async (faction) => toView(await trpc.day.vote.mutate({ faction })),
  share: async (mentions) => { await trpc.day.share.mutate({ mentions }); },
  follow: async (username, follow) => toView(await trpc.day.follow.mutate({ username, follow })),
  challengeCard: (score, sk) => ({ text: challengeText(score, sk), url: challengeUrl(challengeData(score, sk)) }),
  challenge: async (score, sk) => {
    await showShareSheet({ title: `All Roads Lead to Rome${sk ? ` · Skirmish #${sk}` : ''}`, text: challengeText(score, sk), data: challengeData(score, sk) });
  },
  subscribe: async () => { await trpc.day.subscribe.mutate(); },
  reset: async (scope) => toView(await trpc.day.debugReset.mutate({ scope })),
  history: async () => (await trpc.day.history.query()).days,
  skirmish: async (id, actions) => trpc.day.skirmish.mutate({ id, actions }),
  journey,
  journeyStatus: () => lastReceipt,
  practice: async (actions) => toView(await trpc.day.practice.mutate({ actions })),
  rivalPlan: async (username) => { const r = await trpc.day.rivalPlan.query({ username }); return { actions: r?.actions ?? null, fresh: r?.fresh ?? [] }; },
  openPost: (postId) => { navigateToPost(postId as `t3_${string}`, { presentation: 'expanded' }); },
  tutorial: async (event, step) => { await trpc.day.tutorial.mutate({ event, step }); },
  activity: (kind, mode) => { void trpc.day.activity.mutate({ kind, mode }).catch(() => undefined); },
  modStats: async () => trpc.day.modStats.query(),
  bug: async (text, ctx) => trpc.day.bug.mutate({ text, ctx }),
  bugs: async () => trpc.day.bugs.query(),
  bugStatus: async (id, status) => trpc.day.bugStatus.mutate({ id, status }),
};

/** A challenge link carries who challenged you and the score to beat. */
function readChallenge(): Challenge | null {
  try {
    const raw = getShareData();
    if (!raw) return null;
    const m = /^(\d{1,4})(?:\.s(\d{1,5}))?\.([A-Za-z0-9_-]{0,24})$/.exec(raw);
    if (m) return m[3] ? { from: m[3], score: Number(m[1]), ...(m[2] ? { sk: Number(m[2]) } : {}) } : null;
    const d = JSON.parse(raw) as { from?: unknown; score?: unknown; sk?: unknown };
    if (!(typeof d.from === 'string' && d.from && typeof d.score === 'number')) return null;
    return { from: d.from, score: d.score, ...(typeof d.sk === 'number' && Number.isInteger(d.sk) ? { sk: d.sk } : {}) };
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
      const unmount = mountGame(ref.current, { scenario, par, date });
      bootDone();
      return unmount;
    }
    const { scenario } = dailyScenario(init.date, init.faction);
    const unmount = mountGame(ref.current, { scenario, par: init.par, date: init.date, social, day: toView(init), challengedBy: readChallenge() });
    bootDone(); // the loading screen fades out over the game
    // the game is on screen: tell Reddit it is ready (startup time is measured by the platform)
    void telemetry?.appReady?.().then(note).catch(() => undefined);
    return unmount;
  }, [init]);

  return init === null ? null : <div ref={ref} />; // while loading, the boot screen from game.html is showing
};

// errors on players' phones reach the moderators' status menu (5 a session at most, never blocking the game)
let reported = 0;
const report = (msg: string, where: string) => {
  if (reported++ >= 5) return;
  void trpc.day.clientError.mutate({ msg: msg.slice(0, 300), where: where.slice(0, 300), build: versionLabel().slice(0, 60) }).catch(() => undefined);
};
window.addEventListener('error', (e) => report(e.message || 'error', `${e.filename ?? ''}:${e.lineno ?? 0}:${e.colno ?? 0}`));
window.addEventListener('unhandledrejection', (e) => report(String((e.reason as Error)?.message ?? e.reason), String((e.reason as Error)?.stack ?? '').split('\n')[1] ?? ''));

// the loading screen: today's map, paving itself while the server answers (built on the device, no request)
try {
  let pd: Partial<DailyPostData> | undefined;
  try { pd = context?.postData as Partial<DailyPostData> | undefined; } catch { pd = undefined; }
  bootPaint(dailyScenario(pd?.date ?? dateKey(), pd?.faction as Faction | undefined).scenario);
} catch { /* the title alone is fine */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Game />
  </StrictMode>
);
