import './arlr/splash.css';

import { context, navigateToPost, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { addDays, dailyScenario, dateKey, prettyDate } from '../shared/daily';
import { telemetry } from '@devvit/analytics/client/reddit';
import type { DailyPostData } from '../shared/daily';
import type { Faction } from '../shared/engine';
import { trpc } from './trpc';
import { versionLabel } from './arlr/version';
import type { Action, Scenario } from '../shared/engine';
import { replay, supplied } from '../shared/engine';
import { laurelSvg } from './arlr/laurel';

const TRIBE_COL = ['#f0b81c', '#2f86e0', '#a24fd6', '#d4d4d4']; // the board's tribe colours (app.ts TRIBE_COL), the white one greyed for parchment

/** Today's province: towns and candidate roads; with `mine`, the roads you built in gold and the towns you held in colour. */
const MiniMap = ({ sc, mine }: { sc: Scenario; mine?: { built: boolean[]; sup: boolean[] } | null }) => (
  <svg className="minimap" viewBox="-2 -4 104 146" aria-hidden="true">
    {sc.roads.map((r) => {
      const A = sc.towns[r.a]!, B = sc.towns[r.b]!;
      return <line key={r.id} x1={A.x} y1={A.y} x2={B.x} y2={B.y} className={mine?.built[r.id] ? 'mm-mine' : 'mm-road'} />;
    })}
    {sc.towns.map((t) =>
      t.id === sc.castra ? (
        <circle key={t.id} cx={t.x} cy={t.y} r={4} className="mm-castra" />
      ) : (
        <circle key={t.id} cx={t.x} cy={t.y} r={2 + t.value * 0.5} fill={TRIBE_COL[t.tribe % TRIBE_COL.length]} className="mm-town" opacity={mine && !mine.sup[t.id] ? 0.35 : 1} />
      )
    )}
  </svg>
);

type Init = Awaited<ReturnType<typeof trpc.day.init.query>>;

function postData(): Partial<DailyPostData> {
  try { return (context?.postData as Partial<DailyPostData> | undefined) ?? {}; } catch { return {}; }
}

const FAC_COL: Record<string, string> = { populares: '#8b1a1a', optimates: '#1f5fa8', augures: '#2e6b34' };

/** Time to the next daily post (00:05 UTC), in words; worked out once (a resting card does not tick). */
function nextMapIn(now = Date.now()): string {
  const d = new Date(now), next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (d.getUTCHours() === 0 && d.getUTCMinutes() < 5 ? 0 : 1), 0, 5);
  const min = Math.max(1, Math.round((next - now) / 60000));
  return min < 60 ? `${min} min` : `${Math.round(min / 60)} h`;
}

/** Your roads on today's map: what you had built at dusk in gold, the towns you held in colour. */
function playedMap(sc: Scenario, actions: Action[]) {
  try { const s = replay(sc, actions), sup = supplied(sc, s); return { built: s.built, sup }; } catch { return null; }
}

export const Splash = () => {
  // The post's own data gives the date and faction instantly; the server adds player status.
  const pd = postData();
  const date = pd.date ?? dateKey();
  const { scenario: sc, par } = dailyScenario(date, pd.faction as Faction | undefined);
  const pretty = prettyDate(date);
  const [init, setInit] = useState<Init | null>(null);
  useEffect(() => {
    let alive = true;
    trpc.day.init.query().then((d) => alive && setInit(d)).catch(() => undefined);
    void telemetry?.appReady?.().catch(() => undefined); // Devvit Journeys: the feed card is on screen
    return () => { alive = false; };
  }, []);
  const played = init?.me ?? null;
  const players = init?.leaderboard.players ?? 0;
  const me = init?.username ?? null;
  const avatar = me ? init?.avatars?.[me] : undefined;
  const streak = init?.streak && init.streak.streak > 1 ? init.streak.streak : 0;
  // a live streak that this post would extend: remind, once, in the footer
  const atRisk = !played && init?.streak && init.streak.streak >= 2 && init.streak.last === addDays(date, -1) ? init.streak.streak : 0;
  const open = (e: MouseEvent<HTMLButtonElement>) => requestExpandedMode(e.nativeEvent, 'game');
  const today = date === dateKey();

  if (pd.demo) {
    // ---- the Demo: one frozen map, endless scored runs, its own board; first-timers get the guided campaign
    const best = init?.leaderboard.me?.score ?? null, champ = init?.leaderboard.board[0];
    const mine = played ? playedMap(sc, played.actions) : null;
    return (
      <div className={`splash${played ? ' played' : ''}`}>
        <MiniMap sc={sc} mine={mine} />
        <div className="card">
          <h1>All Roads Lead to Rome</h1>
          <div className="sub">Demo · one province of Gaul, replay it as often as you like</div>
          {par !== null ? <div className="target">Caesar marched for <b>{par}</b> <i className="rico glory" aria-hidden="true">★</i>glory.{best !== null ? <> Your best: <b>{best}</b>{init?.leaderboard.me ? <> (#{init.leaderboard.me.rank} of {players})</> : null}.</> : ' Can you do better?'}</div> : null}
          <div className="btns">
            <button className="play" onClick={open}>{played ? 'March again' : 'March on Gaul'}</button>
            {init?.todayPost ? <button className="play sec" onClick={() => navigateToPost(init.todayPost as `t3_${string}`)}>Today's campaign</button> : null}
          </div>
          <div className="foot">
            {played || init?.tutorialDone ? null : <>New here? A two-minute guided campaign comes first (skippable).<br /></>}
            {champ ? <>{players} general{players > 1 ? 's' : ''} on the Demo board; the laurels hold at <b>{champ.score}</b> by <b className="who">{champ.username}</b>.</> : null}
            {init && !init.username ? <><br />Log in to Reddit to save your runs.</> : null}
          </div>
          <div className="ver">{versionLabel()}</div>
        </div>
      </div>
    );
  }

  if (played) {
    // ---- you have played: the card is your result, on your map
    const mine = playedMap(sc, played.actions);
    const beat = par !== null && played.total >= par;
    return (
      <div className="splash played">
        <MiniMap sc={sc} mine={mine} />
        <div className="card">
          <div className="mini">All Roads Lead to Rome</div>
          <div className="res">
            <div className={`score${beat ? ' won' : ''}`}>
              {beat ? <span className="wreath" dangerouslySetInnerHTML={{ __html: laurelSvg() }} /> : null}
              <b>{played.total}</b>
            </div>
            <div className="vs">
              {par !== null ? (beat ? <><span className="won">Caesar beaten</span> ({par})</> : <><span className="lost">{par - played.total} short of Caesar</span> ({par})</>) : null}
              <br />
              {avatar ? <img className="me" src={avatar} alt="" referrerPolicy="no-referrer" onError={(e) => e.currentTarget.remove()} /> : null}
              {init?.leaderboard.me ? <>#{init.leaderboard.me.rank} of {players}{today ? ' today' : ''}</> : null}
              {streak ? <> · 🔥 {streak}</> : null}
            </div>
          </div>
          <div className="decsmall"><span className={`fac ${sc.decree.faction}`}>{sc.decree.faction}</span> {sc.decree.text}</div>
          <div className="btns">
            <button className="play sec" onClick={open}>See your campaign</button>
            {today ? <button className="play" onClick={(e) => { try { localStorage.setItem('arlr.intent', `skirmish:${Date.now()}`); } catch { /* the game opens on the results; Skirmish is one tap there */ } open(e); }}>⚔️ Skirmish</button> : null}
          </div>
          <div className="foot">{today ? <>Next map in {nextMapIn()}{streak ? <> · 🔥 {streak}: march tomorrow to keep it</> : null}{init?.myVote ? '' : ' · vote for tomorrow’s decree inside'}</> : null}</div>
          <div className="ver">{versionLabel()}</div>
        </div>
      </div>
    );
  }

  // ---- an older day's post you didn't play: the campaign is over; point to today's
  if (!today && init) {
    const champ = init.leaderboard.board[0];
    return (
      <div className="splash">
        <MiniMap sc={sc} />
        <div className="card">
          <h1>All Roads Lead to Rome</h1>
          <div className="sub">{pretty} · this campaign is over</div>
          <div className="target">{players ? <>{players} general{players > 1 ? 's' : ''} marched{champ ? <>; the laurels went to <b className="who">{champ.username}</b> with <b>{champ.score}</b></> : null}.</> : 'No general marched on this day.'}</div>
          {init.todayPost ? <button className="play" onClick={() => navigateToPost(init.todayPost as `t3_${string}`)}>Today's campaign</button> : null}
          <div className="foot"><button className="link" onClick={open}>Play this day anyway{init.policy === 'practice' ? ' (practice)' : ' (late)'}</button></div>
          <div className="ver">{versionLabel()}</div>
        </div>
      </div>
    );
  }

  // ---- not played (or not known yet): the invitation; the decree stays sealed until you march
  const fac = sc.decree.faction;
  return (
    <div className="splash">
      <MiniMap sc={sc} />
      <div className="card">
        <h1>All Roads Lead to Rome</h1>
        <div className="sub">{pretty} · the lands of the {sc.tribes.map((t) => t.name).join(', ')}</div>
        {sc.decree.kind === 'none' ? null : (
          <div className="sealed">
            <div className="wax" style={{ background: FAC_COL[fac] ?? '#8b1a1a' }}>SPQR</div>
            <div>Decree of the <b className={`fac ${fac}`}>{fac}</b>, sealed until you march.
              <div className="q">{fac === 'augures' ? 'The Sibylline Books were opened.' : 'Chosen by yesterday’s vote.'} It opens on the first turn.</div></div>
          </div>
        )}
        {par !== null ? <div className="target">Caesar marched for <b>{par}</b> <i className="rico glory" aria-hidden="true">★</i>glory. Can you do better?</div> : null}
        <button className="play" onClick={open}>March on Gaul</button>
        <div className="foot">
          {atRisk ? <><span className="risk">🔥 {atRisk}-day streak: march today to keep it</span>{players ? ' · ' : ''}</> : null}
          {players ? <>{players} general{players > 1 ? 's' : ''} marched today</> : null}
          {init && !init.username ? <><br />Log in to Reddit to save your score.</> : null}
        </div>
        <div className="ver">{versionLabel()}</div>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
