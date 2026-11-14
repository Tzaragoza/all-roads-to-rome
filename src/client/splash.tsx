import './arlr/splash.css';

import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { dailyScenario, dateKey, prettyDate } from '../shared/daily';
import type { DailyPostData } from '../shared/daily';
import type { Faction } from '../shared/engine';
import { trpc } from './trpc';
import { versionLabel } from './arlr/version';
import type { Scenario } from '../shared/engine';

const TRIBE_COL = ['#c9a227', '#4f8a5b', '#7b5ea7', '#b5651d'];

/** Static preview of today's province: towns, candidate roads, castra. */
const MiniMap = ({ sc }: { sc: Scenario }) => (
  <svg className="minimap" viewBox="-2 -4 104 146" aria-hidden="true">
    {sc.roads.map((r) => {
      const A = sc.towns[r.a]!, B = sc.towns[r.b]!;
      return <line key={r.id} x1={A.x} y1={A.y} x2={B.x} y2={B.y} className="mm-road" />;
    })}
    {sc.towns.map((t) =>
      t.id === sc.castra ? (
        <circle key={t.id} cx={t.x} cy={t.y} r={4} className="mm-castra" />
      ) : (
        <circle key={t.id} cx={t.x} cy={t.y} r={2 + t.value * 0.5} fill={TRIBE_COL[t.tribe % TRIBE_COL.length]} className="mm-town" />
      )
    )}
  </svg>
);

type Init = Awaited<ReturnType<typeof trpc.day.init.query>>;

function postData(): Partial<DailyPostData> {
  try { return (context?.postData as Partial<DailyPostData> | undefined) ?? {}; } catch { return {}; }
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
    return () => { alive = false; };
  }, []);
  const played = init?.me ?? null;
  const players = init?.leaderboard.players ?? 0;
  return (
    <div className="splash">
      <MiniMap sc={sc} />
      <div className="card">
        <h1>All Roads Lead to Rome</h1>
        <div className="sub">{pretty} · the lands of the {sc.tribes.map((t) => t.name).join(', ')}</div>
        <div className="decree">
          <span className={`fac ${sc.decree.faction}`}>{sc.decree.faction}</span> {sc.decree.text}
        </div>
        <button className="play" onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}>
          {played ? 'See your campaign' : 'March on Gaul'}
        </button>
        <div className="foot">
          {played ? (
            <>
              Your score: <b>{played.total}</b>
              {init?.leaderboard.me ? <> · #{init.leaderboard.me.rank} of {players}</> : null}
              {init?.streak && init.streak.streak > 1 ? <> · 🔥 {init.streak.streak}</> : null}
            </>
          ) : (
            <>
              {par !== null ? <>Caesar's score: <b>{par}</b></> : null}
              {players ? <> · {players} general{players > 1 ? 's' : ''} marched today</> : null}
            </>
          )}
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
