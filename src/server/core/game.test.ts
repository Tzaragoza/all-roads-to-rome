import { expect } from 'vitest';
import { test } from '../test';
import { apply, initialState, isOver, legalActions, Rng } from '../../shared/engine';
import type { Action } from '../../shared/engine';
import { addDays, augurBallot, dailyScenario } from '../../shared/daily';
import {
  castVote, factionFor, flairFor, getResult, getStreak, getVotes, historyFor, leaderboard, nextStreak, recordTutorial, shareText, submitResult,
  tutorialDone, tutorialStats, rivalPlan, followRival, getPractice, submitPractice, personalBest, rivalsFor, getAchievements, resetPlayer, submitSkirmish, skirmishRecords,
} from './game';

const DATE = '2026-11-20';
const ON = { today: DATE, policy: 'flagged' as const };

/** A random but legal finished game for DATE under the stored faction. */
async function playRandom(seed: string, date = DATE): Promise<Action[]> {
  const { scenario: sc } = dailyScenario(date, await factionFor(date));
  const rng = new Rng(seed);
  let s = initialState(sc);
  const log: Action[] = [];
  while (!isOver(sc, s)) {
    const acts = legalActions(sc, s);
    const a = rng.next() < 0.35 ? acts[acts.length - 1]! : rng.pick(acts);
    log.push(a);
    s = apply(sc, s, a);
  }
  return log;
}

test('submits once per user per day, validated by replay', async () => {
  const actions = await playRandom('a');
  const first = await submitResult(DATE, 'alice', actions, ON);
  expect(first.fresh).toBe(true);
  expect(first.streak.streak).toBe(1);
  // a second submission (even a different game) does not overwrite
  const second = await submitResult(DATE, 'alice', await playRandom('b'), ON);
  expect(second.fresh).toBe(false);
  expect(second.result.total).toBe(first.result.total);
  expect((await getResult(DATE, 'alice'))?.total).toBe(first.result.total);
});

test('rejects unfinished or illegal games', async () => {
  const actions = await playRandom('c');
  await expect(submitResult(DATE, 'bob', actions.slice(0, 3), ON)).rejects.toThrow(/not finished/);
  await expect(submitResult(DATE, 'bob', [{ type: 'road', road: 999 }, ...actions], ON)).rejects.toThrow(/Invalid game/);
  expect(await getResult(DATE, 'bob')).toBe(null);
});

test('leaderboard ranks players by score', async () => {
  const scores: Record<string, number> = {};
  for (const [u, seed] of [['u1', 's1'], ['u2', 's2'], ['u3', 's3']] as const) {
    scores[u] = (await submitResult(DATE, u, await playRandom(seed), ON)).result.total;
  }
  const lb = await leaderboard(DATE, 'u2');
  expect(lb.players).toBe(3);
  expect(lb.board.map((r) => r.score)).toEqual([...Object.values(scores)].sort((a, b) => b - a));
  expect(lb.me?.score).toBe(scores.u2);
  expect(lb.board[lb.me!.rank - 1]!.username === 'u2' || lb.board[lb.me!.rank - 1]!.score === scores.u2).toBe(true);
});

test('votes require a finished game, count once, and set the decree faction of the next day', async () => {
  await expect(castVote(DATE, 'carol', 'optimates', DATE)).rejects.toThrow(/Finish/);
  await submitResult(DATE, 'carol', await playRandom('d'), ON);
  await submitResult(DATE, 'dan', await playRandom('e'), ON);
  await castVote(DATE, 'carol', 'optimates', DATE);
  await castVote(DATE, 'carol', 'populares', DATE); // ignored: already voted
  await castVote(DATE, 'dan', 'optimates', DATE);
  expect(await getVotes(DATE)).toEqual({ populares: 0, optimates: 2, augures: 0 });
  expect(await factionFor(addDays(DATE, 1))).toBe('optimates');
});

test('a rival\'s plan: only after finishing, only for followed generals', async () => {
  const d = DATE;
  await submitResult(d, 'flavia', await playRandom('fl'), ON);
  await expect(rivalPlan(d, 'gaius', 'flavia')).rejects.toThrow(/Finish/);
  await submitResult(d, 'gaius', await playRandom('ga'), ON);
  await expect(rivalPlan(d, 'gaius', 'flavia')).rejects.toThrow(/Follow/);
  await followRival('gaius', 'flavia');
  expect((await rivalPlan(d, 'gaius', 'flavia'))?.length).toBeGreaterThan(0);
});

test('the Augurs can only be voted for on days they are on the ballot', async () => {
  const on = Array.from({ length: 60 }, (_, k) => addDays('2026-11-15', k)).find((d) => augurBallot(addDays(d, 1)));
  const off = Array.from({ length: 60 }, (_, k) => addDays('2026-11-15', k)).find((d) => !augurBallot(addDays(d, 1)));
  expect(on && off).toBeTruthy();
  for (const [d, ok] of [[on!, true], [off!, false]] as const) {
    await submitResult(d, 'erin', await playRandom(`aug-${d}`, d), { today: d, policy: 'flagged' });
    const v = castVote(d, 'erin', 'augures', d);
    if (ok) { await v; expect((await getVotes(d)).augures).toBe(1); expect(await factionFor(addDays(d, 1))).toBe('augures'); }
    else await expect(v).rejects.toThrow(/Augurs/);
  }
});

test('streaks extend on consecutive days, reset after a gap, ignore older posts', () => {
  let st = { streak: 0, best: 0, played: 0, last: '' };
  st = nextStreak(st, '2026-11-20');
  st = nextStreak(st, '2026-11-21');
  expect(st.streak).toBe(2);
  st = nextStreak(st, '2026-11-19'); // archive post
  expect([st.streak, st.last, st.played]).toEqual([2, '2026-11-21', 3]);
  st = nextStreak(st, '2026-11-24');
  expect([st.streak, st.best]).toEqual([1, 2]);
});

test('share text and flair stay spoiler-free and short', () => {
  const txt = shareText(DATE, { total: 210, glory: 200, decreeMet: true, lost: 0, towns: 9, actions: [], at: 0 }, 250, 3, 2, 14);
  expect(txt).toContain('84% of Caesar');
  expect(txt).toContain('#2 of 14');
  expect(shareText(DATE, { total: 210, glory: 200, decreeMet: true, lost: 0, towns: 9, actions: [], at: 0 }, 250, 3, 2, 14, 'gus')).toContain(', u/gus:'); // signed
  expect(txt).not.toMatch(/Alesia|Lugdunum|castra|forest|hills/i); // no map spoilers
  expect(flairFor({ streak: 4, best: 4, played: 6, last: DATE })).toBe('Hastatus · 🔥4');
  expect(flairFor({ streak: 1, best: 4, played: 12, last: DATE }, 30, 7)).toBe('Optio · 🏅7');
  expect(flairFor({ streak: 1, best: 4, played: 12, last: DATE }, 29, 0)).toBe('Legionarius');
  expect(flairFor({ streak: 7, best: 7, played: 100, last: DATE }, 140, 20).length).toBeLessThanOrEqual(64);
});

test('moderator resets wipe a player or a whole day', async () => {
  const { resetPlayer, resetDay } = await import('./game');
  await submitResult(DATE, 'eve', await playRandom('f'), ON);
  await submitResult(DATE, 'fay', await playRandom('g'), ON);
  await castVote(DATE, 'eve', 'populares', DATE);
  await resetPlayer(DATE, 'eve');
  expect(await getResult(DATE, 'eve')).toBe(null);
  expect((await getVotes(DATE)).populares).toBe(0);
  expect((await leaderboard(DATE, 'eve')).me).toBe(null);
  expect((await submitResult(DATE, 'eve', await playRandom('h'), ON)).fresh).toBe(true); // can replay
  expect(await resetDay(DATE)).toBe(2);
  expect((await leaderboard(DATE, undefined)).players).toBe(0);
  expect(await getResult(DATE, 'fay')).toBe(null);
});

test('rivals: follow, compare, and capped challenge mentions once per day', async () => {
  const { followRival, unfollowRival, rivalsFor, checkShare, challengeLine, MAX_RIVALS } = await import('./game');
  await submitResult(DATE, 'gus', await playRandom('i'), ON);
  await submitResult(DATE, 'hal', await playRandom('j'), ON);
  await followRival('gus', 'u/hal');
  await followRival('gus', 'ivy');
  await followRival('gus', 'jo_e');
  await followRival('gus', 'kim');
  await followRival('gus', 'HAL'); // duplicate (case-insensitive) is ignored
  await expect(followRival('gus', 'gus')).rejects.toThrow(/yourself/);
  await expect(followRival('gus', 'bad name!')).rejects.toThrow(/valid/);
  const rows = await rivalsFor(DATE, 'gus');
  expect(rows.map((r) => r.username)).toEqual(['hal', 'ivy', 'jo_e', 'kim']);
  expect(rows[0]!.score).not.toBe(null);
  expect(rows[1]!.score).toBe(null);
  await expect(checkShare(DATE, 'gus', ['hal'])).rejects.toThrow(/not marched/); // hal already played
  await expect(checkShare(DATE, 'gus', ['ivy', 'jo_e', 'kim', 'hal'])).rejects.toThrow(/at most 3/);
  expect(await checkShare(DATE, 'gus', ['ivy', 'kim'])).toEqual(['ivy', 'kim']);
  await expect(checkShare(DATE, 'gus', [])).rejects.toThrow(/already shared/); // one share per day
  expect(challengeLine(['ivy', 'kim'])).toContain('u/ivy, u/kim: your move');
  expect(challengeLine(['ivy'], 'gus')).toContain('u/gus challenges u/ivy: your move');
  await unfollowRival('gus', 'kim');
  expect((await rivalsFor(DATE, 'gus')).length).toBe(3);
  for (let i = 0; i < MAX_RIVALS; i++) await followRival('max', `user_${i}`);
  await expect(followRival('max', 'one_more')).rejects.toThrow(/up to/);
});

test('late plays: flagged on the board, kept off it, or refused; never extend streaks; voting closes', async () => {
  const LATER = addDays(DATE, 2);
  // flagged: on the board with a late mark, streak untouched
  await submitResult(DATE, 'ivy', await playRandom('k'), { today: LATER, policy: 'flagged' });
  const lb = await leaderboard(DATE, 'ivy');
  expect(lb.me?.late).toBe(true);
  expect((await getResult(DATE, 'ivy'))?.late).toBe(true);
  expect((await getStreak('ivy')).streak).toBe(0);
  await expect(castVote(DATE, 'ivy', 'populares', LATER)).rejects.toThrow(/closed/);
  // ontime: scored but kept off the board
  await submitResult(DATE, 'jo', await playRandom('l'), { today: LATER, policy: 'ontime' });
  expect((await leaderboard(DATE, 'jo')).me).toBeNull();
  expect(await getResult(DATE, 'jo')).not.toBeNull();
  // practice: refused
  await expect(submitResult(DATE, 'kim', await playRandom('m'), { today: LATER, policy: 'practice' })).rejects.toThrow(/practice only/);
  // a future day cannot be played
  await expect(submitResult(LATER, 'kim', await playRandom('m'), { today: DATE, policy: 'flagged' })).rejects.toThrow(/not started/);
  // history lists the day with my late result
  const h = await historyFor('ivy', LATER);
  const day = h.find((d) => d.date === DATE)!;
  expect(day.me?.late).toBe(true);
  expect(day.par).not.toBeNull();
});

test('tutorial: new players see it, done or skipped is remembered, returning players skip it, events are counted', async () => {
  expect(await tutorialDone('newbie')).toBe(false);
  await recordTutorial('newbie', 'start', 'welcome');
  expect(await tutorialDone('newbie')).toBe(false); // starting is not finishing
  await recordTutorial('newbie', 'skip', 'march');
  expect(await tutorialDone('newbie')).toBe(true);
  await recordTutorial('pro', 'done', 'senate');
  expect(await tutorialDone('pro')).toBe(true);
  await submitResult(DATE, 'veteran', await playRandom('z'), ON);
  expect(await tutorialDone('veteran')).toBe(true); // played before: no tutorial
  const st = await tutorialStats();
  expect([st.start, st.skip, st.done, st['skip@march']]).toEqual([1, 1, 1, 1]);
});

test('practice runs: every score kept, best tracked, ranking untouched', async () => {
  const d = DATE;
  const off = await submitResult(d, 'livia', await playRandom('l0'), ON);
  const board0 = await leaderboard(d, 'livia');
  const totals: number[] = [];
  for (const seed of ['l1', 'l2', 'l3', 'l4']) totals.push((await submitPractice(d, 'livia', await playRandom(seed), d)).runs.at(-1)!.total);
  const log = await getPractice(d, 'livia');
  expect(log.count).toBe(4);
  expect(log.runs.map((r) => r.total)).toEqual(totals);
  expect(log.best?.total).toBe(Math.max(...totals));
  expect(log.best?.curve.at(-1)).toBe(log.best?.total);
  // the official score and the board are unchanged by practice
  expect((await getResult(d, 'livia'))?.total).toBe(off.result.total);
  expect(await leaderboard(d, 'livia')).toEqual(board0);
  expect(personalBest(off.result.total, log)).toBe(Math.max(off.result.total, ...totals));
  expect(personalBest(null, null)).toBe(null);
  // rivals see the personal best and the number of tries
  await followRival('marcus', 'livia');
  const row = (await rivalsFor(d, 'marcus')).find((r) => r.username === 'livia')!;
  expect(row.score).toBe(off.result.total);
  expect(row.best).toBe(Math.max(off.result.total, ...totals));
  expect(row.tries).toBe(5);
});

test('practice runs are validated like official ones', async () => {
  const actions = await playRandom('p');
  await expect(submitPractice(DATE, 'nero', actions.slice(0, 3), DATE)).rejects.toThrow(/not finished/);
  await expect(submitPractice(DATE, 'nero', [{ type: 'road', road: 999 }, ...actions], DATE)).rejects.toThrow(/Invalid game/);
  await expect(submitPractice(addDays(DATE, 1), 'nero', actions, DATE)).rejects.toThrow(/not started/);
  expect((await getPractice(DATE, 'nero')).count).toBe(0);
});

test('achievements: awarded once with their date, from runs, counters, votes and follows', async () => {
  const d = DATE;
  const first = await submitResult(d, 'titus', await playRandom('t0'), ON);
  expect(first.achievements).toContain('hastatus');
  let a = await getAchievements('titus', d);
  expect(a.earned.find((e) => e.id === 'hastatus')?.date).toBe(d);
  expect(a.earned.some((e) => e.id === 'legionarius')).toBe(false);
  for (let k = 1; k < 10; k++) await submitPractice(d, 'titus', await playRandom(`t${k}`), d);
  a = await getAchievements('titus', d);
  expect(a.earned.some((e) => e.id === 'legionarius')).toBe(true);
  // awarded once: the holder count does not grow on later runs
  await submitPractice(d, 'titus', await playRandom('t10'), d);
  expect((await getAchievements('titus', d)).holders.hastatus).toBe(1);
  await castVote(d, 'titus', 'populares', d);
  await followRival('titus', 'flavia');
  const ids = (await getAchievements('titus', d)).earned.map((e) => e.id);
  expect(ids).toEqual(expect.arrayContaining(['voxPopuli', 'socius']));
  // every award made now carries the reason it was won
  const why = async (id: string) => (await getAchievements('titus', d)).earned.find((e) => e.id === id)?.why ?? '';
  expect(await why('hastatus')).toMatch(/first finished campaign/);
  expect(await why('legionarius')).toMatch(/10th finished campaign/);
  expect(await why('voxPopuli')).toMatch(/Voted for the Populares on 20 November/);
  expect(await why('socius')).toMatch(/Followed flavia/);
  expect(ids).not.toContain('sibyl');
  // a moderator reset wipes them and the holder counts
  await resetPlayer(d, 'titus');
  const after = await getAchievements('titus', d);
  expect(after.earned).toEqual([]);
  expect(after.holders.hastatus ?? 0).toBe(0);
});

test('skirmish: locked until today is played, then best and tries per map, no achievements', async () => {
  const { skirmish, SKIRMISHES } = await import('../../shared/skirmish');
  if (!SKIRMISHES.length) return;
  const sk = skirmish(1)!;
  const play = (seed: string) => {
    const rng = new Rng(seed); let s = initialState(sk.scenario); const log: Action[] = [];
    while (!isOver(sk.scenario, s)) { const acts = legalActions(sk.scenario, s); const a = rng.next() < 0.35 ? acts[acts.length - 1]! : rng.pick(acts); log.push(a); s = apply(sk.scenario, s, a); }
    return log;
  };
  await expect(submitSkirmish('vibia', 1, play('s1'), DATE)).rejects.toThrow(/unlock/);
  await submitResult(DATE, 'vibia', await playRandom('v0'), ON);
  const before = (await getAchievements('vibia', DATE)).earned.length;
  const r1 = await submitSkirmish('vibia', 1, play('s1'), DATE);
  const r2 = await submitSkirmish('vibia', 1, play('s2'), DATE);
  expect(r2.tries).toBe(2);
  expect(r2.best).toBe(Math.max(r1.best, r2.best));
  expect((await skirmishRecords('vibia'))[1]?.tries).toBe(2);
  await expect(submitSkirmish('vibia', 99999, play('s1'), DATE)).rejects.toThrow(/Unknown/);
  await expect(submitSkirmish('vibia', 1, play('s1').slice(0, 2), DATE)).rejects.toThrow(/not finished/);
  expect((await getAchievements('vibia', DATE)).earned.length).toBe(before);
});

test("the Senate's verdict and decree comments: podium, Caesar, vote, and no u/ pings", async () => {
  const { daySummary, verdictComment, decreeComment } = await import('./game');
  const d = '2026-11-21';
  const on = { today: d, policy: 'flagged' as const };
  for (const [u, seed] of [['aulus', 'a1'], ['brutus', 'b1'], ['cassia', 'c1'], ['decima', 'd1']] as const) {
    await submitResult(d, u, await playRandom(seed, d), on);
  }
  await castVote(d, 'aulus', 'optimates', d);
  const sum = await daySummary(d);
  expect(sum.players).toBe(4);
  expect(sum.top.length).toBe(3);
  expect(sum.top[0]!.score).toBeGreaterThanOrEqual(sum.top[2]!.score);
  const next = { title: 'Pax Romana', text: 'Lose no road.', faction: 'optimates' as const };
  const v = verdictComment(sum, next);
  expect(v).toContain('4 generals marched');
  expect(v).toContain('🥇');
  expect(v).toContain('optimates 1');
  expect(v).not.toMatch(/u\//);
  const c = decreeComment(next, sum);
  expect(c).toContain('Pax Romana');
  expect(c).toMatch(/>!\*\*Pax Romana\*\*/); // sealed: Reddit spoiler tag around the decree
  expect(c).toContain(`champion: ${sum.top[0]!.username}`);
  expect(c).not.toMatch(/u\//);
  expect(verdictComment({ ...sum, players: 0, top: [] }, next)).toContain('No general marched');
});

test('daily posts are numbered in Roman numerals from Campaign I on 13 November 2026', async () => {
  const { campaignNumber, roman } = await import('./post');
  expect(campaignNumber('2026-11-13')).toBe(1);
  expect(roman(campaignNumber('2026-11-16'))).toBe('IV');
  expect(roman(campaignNumber('2026-12-08'))).toBe('XXVI');
  expect(roman(1999)).toBe('MCMXCIX');
});

test('achievement rules and reasons: Optio, Veni vidi vici, Testudo', async () => {
  const { counterAchievements, runAchievements, whyCounter, whyRun } = await import('../../shared/achievements');
  expect(counterAchievements({ runs: 29, bestStreak: 0, decrees: 0 })).not.toContain('optio');
  expect(counterAchievements({ runs: 30, bestStreak: 0, decrees: 0 })).toContain('optio');
  expect(counterAchievements({ runs: 1, bestStreak: 0, decrees: 0, beats: 3 })).toContain('venividivici');
  expect(whyCounter('optio', { runs: 30, bestStreak: 0, decrees: 0 }, '20 November')).toBe('Your 30th finished campaign (practice runs count), 20 November.');
  expect(whyCounter('venividivici', { runs: 9, bestStreak: 0, decrees: 0, beats: 3 }, '20 November')).toMatch(/3rd different day/);
  const f = { total: 230, par: 215, decreeMet: true, roadsLost: 0, towns: 11, allTowns: false, denarii: 31, gambit: true, held: 3, decree: 'Marian reforms', gambits: ['Money-lenders'] };
  expect(runAchievements(f)).toEqual(expect.arrayContaining(['rubicon', 'alea', 'senatus', 'pax', 'aerarium', 'fortuna', 'testudo']));
  expect(runAchievements({ ...f, held: 2 })).not.toContain('testudo');
  const w = { day: '20 November', practice: false };
  expect(whyRun('rubicon', f, w)).toBe("Scored 230 against Caesar's 215 in the campaign of 20 November.");
  expect(whyRun('testudo', f, { ...w, practice: true })).toBe('Your legions and garrisons turned back 3 road cuts in a practice run of 20 November.');
  expect(whyRun('fortuna', f, w)).toMatch(/Accepted Money-lenders/);
});

test('runFacts counts the road cuts that legions and garrisons turned back', async () => {
  const { runFacts } = await import('./game');
  const { heldAt, replay } = await import('../../shared/engine');
  const { scenario: sc } = dailyScenario(DATE);
  const acts = await playRandom('held', DATE);
  // the same count, turn by turn, computed independently
  let n = 0, st = initialState(sc);
  for (const a of acts) { if (a.type === 'end') n += heldAt(sc, st, st.turn).length; st = apply(sc, st, a); }
  expect(runFacts(sc, replay(sc, acts), null, acts).held).toBe(n);
  expect(runFacts(sc, replay(sc, acts), null).held).toBe(0); // without the moves nothing can be counted
});

// ---------------------------------------------------------------- the Demo post
import { DEMO_DATE, DEMO_FACTION, DEMO_KEY } from '../../shared/daily';
import { castDemoVote, submitDemo } from './game';
import { replay, score } from '../../shared/engine';

/** A random finished game on the Demo map. */
function playDemo(seed: string): Action[] {
  const { scenario: sc } = dailyScenario(DEMO_DATE, DEMO_FACTION);
  const rng = new Rng(seed);
  let s = initialState(sc);
  const log: Action[] = [];
  while (!isOver(sc, s)) { const acts = legalActions(sc, s); const a = rng.next() < 0.35 ? acts[acts.length - 1]! : rng.pick(acts); log.push(a); s = apply(sc, s, a); }
  return log;
}

test('the Demo scores every run: latest is "yours", best is on its board, the real day and streak are untouched', async () => {
  const { scenario: sc } = dailyScenario(DEMO_DATE, DEMO_FACTION);
  const runs = ['d1', 'd2', 'd3', 'd4'].map(playDemo), totals = runs.map((a) => score(sc, replay(sc, a)).total);
  for (const a of runs) await submitDemo('dana', a);
  expect((await getResult(DEMO_KEY, 'dana'))?.total).toBe(totals[3]);
  expect((await leaderboard(DEMO_KEY, 'dana')).me?.score).toBe(Math.max(...totals));
  const log = await getPractice(DEMO_KEY, 'dana');
  expect(log.count).toBe(4);
  expect(log.best?.total).toBe(Math.max(...totals));
  expect((await getStreak('dana')).played).toBe(0);
  expect(await getResult(DEMO_DATE, 'dana')).toBe(null);
  expect((await leaderboard(DEMO_DATE, undefined)).players).toBe(0);
  // honours come from Demo runs as from any run
  expect((await getAchievements('dana', DEMO_DATE)).earned.some((e) => e.id === 'hastatus')).toBe(true);
  // a rival's tries on the Demo are its runs
  await followRival('erin', 'dana');
  expect((await rivalsFor(DEMO_KEY, 'erin'))[0]).toMatchObject({ username: 'dana', tries: 4, best: Math.max(...totals) });
  await expect(submitDemo('dana', runs[0]!.slice(0, 2))).rejects.toThrow(/not finished/);
});

test('the Demo ballot needs a run, counts once, and never decides a real day', async () => {
  await expect(castDemoVote('fay', 'populares')).rejects.toThrow(/Finish/);
  await submitDemo('fay', playDemo('f'));
  await castDemoVote('fay', 'populares');
  await castDemoVote('fay', 'optimates');
  expect(await getVotes(DEMO_KEY)).toMatchObject({ populares: 1, optimates: 0 });
  expect(await getVotes(DEMO_DATE)).toMatchObject({ populares: 0, optimates: 0 });
});

test('a Demo run unlocks Skirmish only on the Demo post', async () => {
  await submitDemo('gus', playDemo('g'));
  const { skirmish } = await import('../../shared/skirmish');
  const sk = skirmish(1)!;
  let st = initialState(sk.scenario); const acts: Action[] = [];
  while (!isOver(sk.scenario, st)) { const a: Action = { type: 'end' }; acts.push(a); st = apply(sk.scenario, st, a); }
  await expect(submitSkirmish('gus', 1, acts, DATE)).rejects.toThrow(/unlock/);
  await submitSkirmish('gus', 1, acts, DATE, true);
  expect((await skirmishRecords('gus'))[1]?.tries).toBe(1);
});
