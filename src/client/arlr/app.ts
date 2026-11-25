// All Roads Lead to Rome: game view (expanded post). Vanilla DOM + SVG rendered into a root element.
import {
  apply, budgetAsOf, checkAction, gambitOffers, townGlory, suppliedTowns, liveEvents, shores, decreeRule, decreeSpec, decreeStatus, eventsAsOf, isThreat, roadToll, townValue, replay, roadCost, forecastPreview, garrisonCost, initialState, isOver, protectedTowns, recruitCost,
  cloneState, heldAt, roadDistance, roadsCutBy, Rng, score, scoreCurve, supplied, townIncome, visibleEvents, yieldPerTurn,
} from '../../shared/engine';
import type { Action, Faction, GameEvent, Scenario, State, TownId } from '../../shared/engine';
import { STEPS as TUT_STEPS, TUTORIAL } from './tutorial';
import type { TutTarget } from './tutorial';
import {
  amphora, bowl, buildBoard, pirateShip, warband, castraIcon, cloud, coins, dagger, flame, K, MINI, miniKey, olive, pitchfork, purse, stakes, sickle, snowflake, polyD, settlement, settlementSize, sheaf, silverPeak, spotsIn, swords, TRIBE_ART,
  setBoardTheme, boardTheme,
} from './board-art';
import type { Board, Pt } from './board-art';
import { play, setSound, soundOn } from './sfx';
import { watchResources } from './resources';
import { watchSkin } from './skin';
import { palm, ripple, dune, mesa, bigDune } from './board-egypt';
import { COIN } from './coin';
import { watchFit } from './fit';
import { turnPayments } from './pay';
import { statsScreen, wireStats } from './stats';
import { bugSheet, bugState, wireBugSheet } from './bug';
import type { BugContext, BugReport, BugStatus } from '../../shared/bugs';
import type { ActMode, ModStats } from '../../shared/stats';
import { fxActive, fxBurn, fxCoins, fxEndTurn, fxFinish, fxGarrison, fxJoin, fxMarch, fxRecruit, fxResults, fxRoad, fxSeal, fxThreat, fxSiege, fxClear, fxVote, laurelSvg, reducedMotion, fxDecreeOpen, fxDecreeStow, fxDecreeLanded, fxRaze, fxHeld, fxPinchHint, fxLastTurn, fxStreak, fxBest } from './fx';
import type { EndTurnFx } from './fx';
import { shareBlob, sharePicture, shareSvg } from './share-image';
import { musicOn, setMusic, startMusicOnGesture } from './music';
import { versionLabel } from './version';
import { addDays, ballotFor, dailyScenario, prettyDate } from '../../shared/daily';
import { ACHIEVEMENTS, ACH_BY_ID, HIDDEN_HOW } from '../../shared/achievements';
import { SKIRMISHES, SKIRMISH_AS_OF, skirmish } from '../../shared/skirmish';
import type { Skirmish } from '../../shared/skirmish';
import type { AchId, Tier } from '../../shared/achievements';

const TRIBE_COL = ['#f0b81c', '#2f86e0', '#a24fd6', '#e8e8e8']; // = TRIBE_ART
const TRIBE_INK = ['#2b2116', '#fff', '#fff', '#2b2116']; // readable text on each tribe colour
const TRIBE_SYM = ['▲', '●', '■', '◆']; // = the marks on each tribe's border (not colour alone)
/** A tribe's name as a coloured tag, matching its borders and region name on the map. */
const tribeTag = (k: number, suffix = '') => k < 0 ? '<span class="tribe rome">Rome</span>'
  : `<span class="tribe" data-tribe="${k}" style="background:${TRIBE_COL[k % TRIBE_COL.length]};color:${TRIBE_INK[k % TRIBE_INK.length]}" title="A Gallic tribe: tap to see its lands"><i class="tsym">${TRIBE_SYM[k % TRIBE_SYM.length]}</i>${sc.tribes[k]!.name}${suffix}</span>`;
/** Colour every tribe name in a piece of HTML (text only, never inside tags) with its map colour. */
function colorTribes(html: string): string {
  const names = sc.tribes.map((t, k) => ({ k, name: t.name })).filter((x) => x.name);
  if (!names.length) return html;
  const re = new RegExp(`\\b(${names.map((x) => x.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g');
  const byName = new Map(names.map((x) => [x.name, x.k]));
  return html.split(/(<[^>]*>)/).map((part) => part.startsWith('<') ? part : part.replace(re, (m) => {
    const k = byName.get(m)!;
    return `<span class="tribe tiny" style="background:${TRIBE_COL[k % TRIBE_COL.length]};color:${TRIBE_INK[k % TRIBE_INK.length]}"><i class="tsym">${TRIBE_SYM[k % TRIBE_SYM.length]}</i>${m}</span>`;
  })).join('');
}
const escHtml = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let root: HTMLElement;
const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;

let sc: Scenario, s: State, undoStack: State[] = [], msg = '', par: number | null = null, sel: TownId | null = null;
let lensOverride: 'map' | 'military' | null = null; // manual choice, cleared at end of turn
let lens: 'map' | 'military' = 'map';
let showRules = false;
// ---- guided first campaign (tutorial.ts): the real game is set aside while it runs
type Saved = { sc: Scenario; s: State; log: Action[]; undoStack: State[]; practice: boolean; par: number | null };
let tut: { step: number; saved: Saved } | null = null;
let tutPrompt = false;
const TUT_KEY = 'arlr.tutorial';
const tutorialDoneHere = () => { try { return !!localStorage.getItem(TUT_KEY); } catch { return false; } };
// ---- end-turn confirmation, turn summary card, road preview
let confirmEnd = false;
let confirmTimer: ReturnType<typeof setTimeout> | undefined;
let turnCard: string | null = null;
/**
 * Set when the stored result of this day cannot be replayed on the current game (the day's events or
 * rules changed after it was played, e.g. during development). The stored score stands and is shown;
 * the moves cannot be drawn.
 */
let staleResult = false;
/** Gambit offers the player waved away (client only; an offer not accepted simply expires). */
let declined = new Set<number>();
/** A short vibration on phones (follows the sound switch). */
function buzz(p: number | number[]) { try { if (sound && 'vibrate' in navigator) navigator.vibrate(p); } catch { /* unsupported */ } }
let hlTribe: number | null = null; // tribe whose lands are highlighted (tap a tribe tag)
let hlTimer: ReturnType<typeof setTimeout> | undefined;
let resumed = false; // this campaign was restored from the device
let decreeModal = false; // the Senate's decree, read before the campaign and on demand
let decreeIntro = false; // the decree is opening by itself (first visit of the day): its seal cracks once
const decreeSeenKey = (d: string) => `arlr.decree.${d}`;
const decreeSeen = (d: string) => { try { return localStorage.getItem(decreeSeenKey(d)) === '1'; } catch { return false; } };
let dateLabel = '';
/** The Demo post: one frozen map, every run scored (best on its own board), tutorial forced on first visit. */
let demo = false;
/** Device key of this post's campaign and decree (the Demo keeps its own, apart from its map's real day). */
const storeKey = () => (demo ? 'demo' : dateLabel);
let moving: number | null = null; // legion index in movement mode
let sound = soundOn();
let music = musicOn();

function autoLens(): 'map' | 'military' {
  const revolt = visibleEvents(sc, s.turn, s).some(isThreat);
  const legionSelected = sel !== null && sel !== sc.castra && s.legions.includes(sel);
  return revolt || legionSelected ? 'military' : 'map';
}

/** Server-side view of the day (from the tRPC `day.*` procedures). */
export type DayView = {
  par: number | null;
  username: string | null;
  me: { total: number; actions: Action[]; glory?: number; decreeMet?: boolean; lost?: number; curve?: number[] } | null;
  myVote: Faction | null;
  votes: Record<Faction, number>;
  streak: { streak: number; best: number; played: number; last?: string } | null;
  leaderboard: { board: Array<{ rank: number; username: string; score: number; late?: boolean }>; players: number; me: { rank: number; late?: boolean } | null };
  /** Late-play rule of the subreddit, whether this post's day is over, and (rule "ontime") where a late play would place. */
  policy?: 'flagged' | 'ontime' | 'practice';
  late?: boolean;
  offBoard?: number | null;
  today?: string;
  tutorialDone?: boolean;
  tutorialStats?: Record<string, number> | null;
  /** Moderators: bug reports not yet marked done. */
  bugsNew?: number;
  isMod?: boolean;
  rivals?: Array<{ username: string; score: number | null; rank: number | null; streak: number; curve?: number[] | null; best?: number | null; tries?: number }>;
  /** Unranked practice runs of this day: every score (newest last, capped), the best run's curve, and the total count. */
  practice?: PracticeView | null;
  achievements?: AchView | null;
  /** Snoovatar URLs of the players shown (leaderboard, rivals, you). */
  avatars?: Record<string, string>;
  /** Skirmish: unlocked once today's campaign is played; personal best per pool map. */
  skirmish?: SkView | null;
  /** The Demo post (see `demo`); `todayPost` then points to the real daily. */
  demo?: boolean;
  todayPost?: string | null;
};
export type AchView = { earned: Array<{ id: AchId; at: number; date: string; why?: string }>; fresh: AchId[]; holders: Partial<Record<AchId, number>>; players: number };
export type SkRecord = { best: number; curve: number[]; tries: number; at: number };
export type SkView = { unlocked: boolean; records: Record<number, SkRecord>; achievements?: AchView | null };
export type PracticeView = { runs: Array<{ total: number; at: number }>; best: { total: number; curve: number[]; at: number } | null; count: number };
/** Reddit features, injected by the host page so this module stays platform-agnostic. */
export type Social = {
  finish(actions: Action[]): Promise<DayView>;
  vote(f: Faction): Promise<DayView>;
  share(mentions: string[]): Promise<void>;
  follow(username: string, follow: boolean): Promise<DayView>;
  /** Open the native share sheet with a challenge (today's map, or skirmish map `sk`). */
  challenge(score: number, sk?: number): Promise<void>;
  /** The challenge message and its link, for copying. */
  challengeCard?(score: number, sk?: number): { text: string; url: string };
  subscribe(): Promise<void>;
  reset(scope: 'me' | 'day'): Promise<DayView>;
  history(): Promise<HistoryDay[]>;
  /** A rival's moves for the day (null: not marched yet), and the honours watching them earned (Speculator). */
  rivalPlan?(username: string): Promise<{ actions: Action[] | null; fresh: AchId[] }>;
  /** Record a finished practice run (unranked). */
  practice?(actions: Action[]): Promise<DayView>;
  /** Record a finished skirmish; returns the player's skirmish records. */
  skirmish?(id: number, actions: Action[]): Promise<SkView>;
  /** Devvit Journeys: one journey per campaign, progress per turn, key interactions. Best effort. */
  journey?(e: JourneyEvent): void;
  /** Last Journeys receipt status (moderator diagnostics). */
  journeyStatus?(): string;
  openPost(postId: string): void;
  tutorial?(event: 'start' | 'done' | 'skip', step: string): Promise<void>;
  /** Moderator stats: the game was opened, a campaign started or finished (fire and forget). */
  activity?(kind: 'open' | 'start' | 'finish', mode: ActMode): void;
  /** Moderators: the Senate archives (stats.ts). */
  modStats?(): Promise<ModStats>;
  /** 🐞 Send a bug report (bug.ts); moderators list and close them in the Senate archives. */
  bug?(text: string, ctx: BugContext): Promise<{ id: string }>;
  bugs?(): Promise<BugReport[]>;
  bugStatus?(id: string, status: BugStatus): Promise<BugReport | null>;
};
export type { ActMode, ModStats };
export type HistoryDay = {
  date: string; par: number | null; postId: string | null; players: number;
  me: { total: number; late: boolean; rank: number | null } | null;
  rivals: Array<{ username: string; score: number }>;
};
export type GameOptions = { scenario: Scenario; par: number | null; date: string; social?: Social; day?: DayView | null;
  challengedBy?: Challenge | null };
export type JourneyEvent =
  | { kind: 'start'; mode: string }
  | { kind: 'progress'; progress: number; action: string; details?: string }
  | { kind: 'interaction'; action: string; details?: string }
  | { kind: 'end'; complete: boolean; win: boolean; score: number };
export type Challenge = { from: string; score: number; sk?: number };

let social: Social | undefined;
let day: DayView | null = null;
let log: Action[] = [];
let socialMsg = '';
let msgTimer: ReturnType<typeof setTimeout> | undefined;
/** Show a transient message: closes on ×, fades on its own. */
// ---- achievements: a medal toast whenever the server reports a new one
let seenAch: Set<string> | null = null;
let achEl: HTMLDivElement | null = null, achTimer: ReturnType<typeof setTimeout> | undefined;
const TIER_NAME: Record<Tier, string> = { copper: 'Copper', silver: 'Silver', gold: 'Gold' };
const medal = (id: AchId, locked = false) => { const a = ACH_BY_ID[id]; return `<span class="medal ${a.tier}${locked ? ' locked' : ''}" aria-hidden="true"><span>${a.glyph === '🪙' ? COIN : a.glyph}</span></span>`; };
function checkAchievements() {
  const av = day?.achievements;
  if (!av) return;
  const ids = av.earned.map((e) => e.id);
  if (!seenAch) { seenAch = new Set(ids.filter((id) => !av.fresh.includes(id))); }
  const fresh = ids.filter((id) => !seenAch!.has(id));
  if (!fresh.length) return;
  fresh.forEach((id) => { seenAch!.add(id); track('achievement', id); });
  achEl ??= Object.assign(document.createElement('div'), { className: 'achtoast', onclick: () => achEl?.classList.remove('on') });
  if (!achEl.isConnected) document.body.appendChild(achEl);
  const whyOf = (id: AchId) => av.earned.find((e) => e.id === id)?.why;
  achEl.innerHTML = fresh.slice(0, 3).map((id) => `<div class="achrow">${medal(id)}<div><small>Achievement unlocked · ${TIER_NAME[ACH_BY_ID[id].tier]}</small><b>${ACH_BY_ID[id].name}</b>${whyOf(id) ? `<small class="awhy">${esc(whyOf(id)!)}</small>` : ''}</div></div>`).join('')
    + (fresh.length > 3 ? `<small>and ${fresh.length - 3} more</small>` : '');
  achEl.classList.add('on');
  if (sound) fresh.slice(0, 3).forEach((id, i) => setTimeout(() => play('medal', ['copper', 'silver', 'gold'].indexOf(ACH_BY_ID[id].tier)), 350 + i * 250));
  achSparks(achEl);
  if (achTimer) clearTimeout(achTimer);
  achTimer = setTimeout(() => achEl?.classList.remove('on'), 4200);
}
/** Sparks burst from each medal as it lands (the spin itself is CSS: .achtoast.on .medal). */
function achSparks(el: HTMLElement) {
  if (reducedMotion() || document.documentElement.hasAttribute('data-nofx')) return;
  el.querySelectorAll<HTMLElement>('.medal').forEach((m, i) => {
    for (let k = 0; k < 10; k++) {
      const sp = Object.assign(document.createElement('i'), { className: 'spark' });
      sp.style.left = `${m.offsetLeft + m.offsetWidth / 2 - 2}px`; sp.style.top = `${m.offsetTop + m.offsetHeight / 2 - 2}px`;
      el.appendChild(sp);
      const a = (k / 10) * Math.PI * 2, r = 22 + (k % 3) * 8;
      sp.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * r}px,${Math.sin(a) * r}px) scale(.3)`, opacity: 0 }], { duration: 600, delay: 450 + i * 250, easing: 'ease-out', fill: 'both' })
        .finished.then(() => sp.remove(), () => sp.remove());
    }
  });
}
/** Mirror an award the server just made without sending back the whole day (share, tutorial). */
function grantLocal(id: AchId, why?: string) {
  const av = day?.achievements;
  if (!av || av.earned.some((e) => e.id === id)) return;
  av.earned.push({ id, at: Date.now(), date: new Date().toISOString().slice(0, 10), ...(why ? { why } : {}) });
  av.holders[id] = (av.holders[id] ?? 0) + 1;
}

function say(text: string, ms: number) {
  msg = text;
  if (msgTimer) clearTimeout(msgTimer);
  if (text) msgTimer = setTimeout(() => { msg = ''; render(); }, ms);
}
let busy = false;
let shared = false;
let joined = false;
let view: 'map' | 'results' = 'map';
let practice = false; // replaying an already-scored day: nothing is submitted
let official: State | null = null; // final state of the scored game (for the results page)
/** Side-by-side replay with a rival (after finishing): your state and theirs after each turn. */
type Compare = { name: string; mine: State[]; theirs: State[]; k: number };
let compare: Compare | null = null;
let cmpRival: State | null = null; // read by svg() while the comparison is drawn
let confirmReset: 'me' | 'day' | null = null;
const mentionSel = new Set<string>();
let rivalInput = '';
let challengedBy: Challenge | null = null;

/** Mount the game into `el`. Returns a cleanup function. */
// Landscape screens show the same board rotated a quarter turn (castra on the left). Only the
// drawing changes: the rules use the road graph, never coordinates, so the puzzle is identical.
const WIDE_QUERY = '(min-aspect-ratio: 1/1) and (min-width: 820px), (min-aspect-ratio: 3/2) and (min-width: 640px) and (max-height: 500px)'; // keep in sync with game.css (landscape phones get the side panel too)
const TOUCH_QUERY = '(pointer: coarse)';
let wideMq: MediaQueryList | null = null;
// Optional "turn the phone" mode: the whole UI is rotated a quarter turn in CSS, so it works
// even when the Reddit app keeps its webview in portrait. Off by default; remembered per device.
const PHONE_SIDEWAYS = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="7" width="19" height="10" rx="2"/><path d="M6 4.5a8 8 0 0 1 9-1"/><path d="M14.5 1.5l.6 2.2-2.2.4"/></svg>';
const PHONE_UPRIGHT = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2"/></svg>';
let sideways = false;
try { sideways = localStorage.getItem('arlr.sideways') === '1'; } catch { /* storage unavailable */ }
const nativeWide = () => wideMq?.matches ?? false;
const isTouch = () => (typeof window.matchMedia === 'function' ? window.matchMedia(TOUCH_QUERY).matches : false);
function setSideways(on: boolean) {
  sideways = on;
  try { localStorage.setItem('arlr.sideways', on ? '1' : '0'); } catch { /* ignore */ }
  rotated = null;
  render();
}
// Board orientation is chosen from the map area's shape: whichever draws the province larger.
let rotated: Scenario | null = null;
let boardRotated = false;
let mapArea = { w: 0, h: 0 };

function rotatedScenario(): Scenario {
  rotated ??= { ...sc, towns: sc.towns.map((t) => ({ ...t, x: sc.height - t.y, y: t.x })) };
  return rotated;
}
/** UI scale for a base zoom (screen px per art px): small maps get bigger nodes and labels. */
const uiScale = (zoom: number) => Math.max(1, Math.min(1.6, 0.85 / zoom));
/**
 * Box around everything drawn for a town, in art pixels at UI scale 1, relative to the town:
 * settlement, name above, stars and the event-icon row below, one legion standard to the right.
 * Uses the town's base value so the frame never moves during a game.
 */
function labelBox(t: Scenario['towns'][number]) {
  const nameW = t.name.length * 14 * 0.62 + 8; // Georgia bold 14px, halo included
  if (t.id === sc.castra) return { top: 44, bottom: 28, left: Math.max(40, nameW / 2), right: Math.max(40, nameW / 2) + 30 };
  const z = settlementSize(t.value);
  const sh = shores(sc), nb = (sh.coast[t.id] ? 1 : 0) + (sh.frontier[t.id] ? 1 : 0);
  const v = Math.min(5, t.value + 1), row = v * 12.4 + 6 + Math.max(0, townIncome(sc, v)) * 12; // stars (+ a boom) and coins
  const badge = nb ? row / 2 + 5 + nb * 15 : 0; // port/frontier badges sit at either end of that row (or beside the name)
  const half = Math.max(z.top * 1.1, nameW / 2, row / 2, badge);
  return { top: z.top + 4 + 13, bottom: z.bottom + 33 + 12, left: half, right: Math.max(half, z.top * 0.8 + 4 + 20) };
}
/**
 * The map's frame in board units: the extent of every town's drawing, so no name, star or
 * standard is ever clipped, whichever way the board is turned. The UI scale depends on the
 * frame and the frame on the UI scale, so it is solved by a short fixed-point iteration.
 */
function frame(v: Scenario) {
  const PAD = 1.5; // board units of breathing room
  const at = (u: number) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const t of v.towns) {
      const b = labelBox(t), k = u / K;
      x0 = Math.min(x0, t.x - b.left * k); x1 = Math.max(x1, t.x + b.right * k);
      y0 = Math.min(y0, t.y - b.top * k); y1 = Math.max(y1, t.y + b.bottom * k);
    }
    return { x: x0 - PAD, y: y0 - PAD, w: x1 - x0 + 2 * PAD, h: y1 - y0 + 2 * PAD };
  };
  let u = 1.6, f = at(u);
  for (let i = 0; i < 3 && mapArea.w && mapArea.h; i++) {
    const nu = uiScale(Math.min(mapArea.w / f.w, mapArea.h / f.h) / K);
    if (Math.abs(nu - u) < 0.01) break;
    u = nu; f = at(u);
  }
  return { ...f, u };
}
function chooseOrientation(): boolean {
  // Phones and tablets: never flip on their own (a panel growing or shrinking used to turn the
  // board mid-game). Upright in portrait; turned only when the player holds the device sideways or
  // taps the landscape button.
  if (isTouch()) return sideways || window.innerWidth > window.innerHeight * 1.15;
  const { w, h } = mapArea;
  if (!w || !h) return boardRotated;
  const a = frame(sc), b = frame(rotatedScenario());
  const scaleUpright = Math.min(w / a.w, h / a.h), scaleRot = Math.min(w / b.w, h / b.h);
  // hysteresis: only switch when clearly better, so small resizes don't flip the board
  return boardRotated ? scaleRot > scaleUpright * 0.95 : scaleRot > scaleUpright * 1.05;
}
function viewScenario(): Scenario {
  return boardRotated ? rotatedScenario() : sc;
}

export function mountGame(el: HTMLElement, opts: GameOptions): () => void {
  root = el;
  root.innerHTML = '<div id="app"></div>';
  setBoardTheme(prefTheme()); // Gaul; Aegyptus skirmishes switch it while they are played
  const unwatchSkin = watchSkin(document.body), unwatchRes = watchResources(document.body), unwatchFit = watchFit(root);
  music = musicOn();
  root.addEventListener('pointerdown', () => startMusicOnGesture(), { once: true });
  root.addEventListener('pointerdown', () => { if (fxActive()) fxFinish(); }, { capture: true });
  document.addEventListener('keydown', onKey);
  // music lives in the rules sheet on narrow phones (the bar keeps only what is used every turn)
  root.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).id;
    if (id === 'mus2') { music = !music; setMusic(music); render(); }
    if (id === 'reload') location.reload(); // the campaign is kept on the device: it resumes after the reload
  });
  Object.assign(bugState, { open: false, sending: false, sent: false, error: '' });
  wireBugSheet(root, { render: () => render(), context: bugContext, ...(opts.social?.bug ? { send: opts.social.bug } : {}) });
  sc = opts.scenario; par = opts.par; dateLabel = opts.date; demo = !!opts.day?.demo;
  s = initialState(sc); undoStack = []; msg = ''; sel = null; moving = null; lensOverride = null; rotated = null;
  social = opts.social; day = opts.day ?? null; log = []; declined = new Set(); socialMsg = ''; busy = false; shared = false; joined = false;
  seenAch = null; sk = null; view = 'map'; resumed = false; practice = false; practiceNote = null; official = null; confirmReset = null; mentionSel.clear(); rivalInput = '';
  challengedBy = opts.challengedBy ?? null;
  history = null; historyState = 'idle'; statsOpen = false; statsData = null;
  decreeModal = false;
  if (!opts.social) say('You are playing offline: this game will not be saved or ranked. <button id="reload" class="link">Try to reconnect</button>', 12000);
  else if (challengedBy?.sk) say(`⚔️ u/${esc(challengedBy.from)} challenges you on Skirmish #${challengedBy.sk}: beat ${challengedBy.score}!${opts.day?.me ? '' : " Finish today's campaign to unlock it."}`, 9000);
  else if (challengedBy && !opts.day?.me) say(`⚔️ u/${esc(challengedBy.from)} challenges you: beat ${challengedBy.score}!`, 9000);
  if (!day?.me && day?.late && day.policy === 'practice') {
    practice = true;
    say(`This is the campaign of ${prettyDate(dateLabel)}. Past campaigns are practice only here: nothing is scored.`, 8000);
  } else if (!day?.me && day?.late) {
    say(day.policy === 'ontime'
      ? `Campaign of ${prettyDate(dateLabel)}, played late: it is scored, but stays off that day's leaderboard.`
      : `Campaign of ${prettyDate(dateLabel)}, played late: your score will carry a ⏱ on that day's board. Late plays don't extend streaks.`, 8000);
  }
  if (day?.me) {
    // already played today: open on the results page; the final board is one tap away
    staleResult = false;
    try { s = replay(sc, day.me.actions); log = day.me.actions.slice(); official = s; } catch { s = initialState(sc); staleResult = true; }
    view = 'results'; resultsFx = true;
  }
  tut = null; confirmEnd = false; turnCard = null;
  pruneRuns();
  if (day?.me) forget(`${RUN_KEY}${storeKey()}`);
  else if (view === 'map' && !practice) {
    const r = restore(`${RUN_KEY}${storeKey()}`);
    if (r) {
      s = r.s; log = r.log; resumed = true;
      if (isOver(sc, s)) { official = s; view = 'results'; resultsFx = true; void finish(); } // finished but never saved: send it now
      else say(`Welcome back: your campaign resumes at turn ${s.turn}.`, 5000);
    }
  }
  tutPrompt = view === 'map' && !day?.me && !(day?.tutorialDone ?? false) && !tutorialDoneHere();
  // the Demo opens straight into the guided campaign for a first-timer (its coach bubble keeps "Skip tutorial")
  const forceTut = demo && tutPrompt && !resumed;
  if (forceTut) tutPrompt = false;
  if (view === 'map' && !day?.me && !decreeSeen(storeKey()) && !tutPrompt && !resumed) decreeModal = decreeIntro = true;
  // the post card's "Skirmish" button: open straight into a skirmish once today's campaign is done
  let intent: string | null = null;
  try { intent = localStorage.getItem('arlr.intent'); localStorage.removeItem('arlr.intent'); } catch { /* ignore */ }
  const goSkirmish = intent?.startsWith('skirmish:') && Date.now() - Number(intent.slice(9)) < 120e3 && !!day?.me && SKIRMISHES.length > 0;
  wideMq = typeof window.matchMedia === 'function' ? window.matchMedia(WIDE_QUERY) : null;
  const onResize = () => render();
  wideMq?.addEventListener('change', onResize);
  // re-render when the map area changes shape enough to prefer the other orientation
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    const el = root.querySelector<HTMLElement>('.mapwrap');
    if (!el) return;
    mapArea = { w: el.clientWidth, h: el.clientHeight };
    if (chooseOrientation() !== boardRotated) render();
  }) : null;
  ro?.observe($('app'));
  render();
  social?.activity?.('open', demo ? 'demo' : 'daily'); // moderator stats: the game was opened (counted by the server, never awaited)
  if (forceTut) { startTutorial(); say('Welcome to the Demo: a two-minute guided campaign first. Skip it any time.', 6000); render(); }
  else if (goSkirmish && skUnlocked()) startSkirmish(challengedBy?.sk);
  else if (view === 'map' && !decreeModal && !tutPrompt) setTimeout(pinchHint, 900); // e.g. a resumed campaign
  return () => { unwatchSkin(); unwatchRes(); unwatchFit(); ro?.disconnect(); wideMq?.removeEventListener('change', onResize); document.removeEventListener('keydown', onKey); root.innerHTML = ''; };
}

/**
 * An event's spec as it stood on the day being played (dated revisions applied), so the forecast
 * text always matches what the event does: the day's date, Skirmish's freeze date, or the latest.
 */
function evSpec(kind: string) {
  const day = sk ? SKIRMISH_AS_OF : /^\d{4}-\d{2}-\d{2}$/.test(dateLabel) && !tut ? dateLabel : undefined;
  return eventsAsOf(day).find((e) => e.kind === kind) ?? eventsAsOf().find((e) => e.kind === kind);
}

/** A stable key for an event on the board (also for accepted gambit parts, which are not in sc.events). */
const evKey = (e: GameEvent) => `${e.kind}/${e.tribe}/${e.turn}${e.from !== undefined ? `/g${e.from}` : ''}`;

/** "1 road", "3 roads" (irregular plural as third argument). */
const pl = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** The day being played, for headers: "14 November" (Skirmish and odd labels pass through). */
const niceDate = () => (demo ? 'Demo' : /^\d{4}-\d{2}-\d{2}$/.test(dateLabel) ? prettyDate(dateLabel) : dateLabel);

/** A tap the tutorial step doesn't expect: say what it does expect, by name. */
function tutWrongTap(step: (typeof TUT_STEPS)[number]): string {
  const tg = typeof step.target === 'function' ? step.target({ s, moving }) : step.target;
  const name = (t: number) => sc.towns[t]!.name;
  if (tg?.road !== undefined) { const r = sc.roads[tg.road]!; return `Not that one: tap the glowing road from ${name(r.a)} to ${name(r.b)}.`; }
  if (tg?.town !== undefined) return `Not that one: tap ${name(tg.town)}, circled in gold.`;
  if (tg?.legion !== undefined) return "Not that one: tap your legion's standard (the banner marked I).";
  if (tg?.el === '#end') return 'Not yet: tap End turn.';
  return step.next ? `Read this step, then tap ${step.next}.` : 'Follow the highlighted step, or skip the tutorial.';
}

/** Denarii the treasury gains (or loses) at the end of this turn: towns, base income, harvests, caravans, loan instalments. */
const netIncome = (y: ReturnType<typeof yieldPerTurn>) => y.income + y.bonusIncome + y.purseGain - y.purseDebt;
const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

/** A refusal, with what to do about it. */
function withFix(err: string): string {
  const y = yieldPerTurn(sc, s);
  const e = err.replace(/(\d+) turn\(s\)/, (_, n: string) => pl(Number(n), 'turn'));
  if (/costs \d+ denarii/.test(e)) return `${e}: you have ${s.denarii}, ${signed(netIncome(y))} at the end of this turn.`;
  if (e.startsWith('Roads must extend')) return `${e}: start from a town already linked to Rome.`;
  if (e.startsWith('Legions can only march along')) return `${e}: build a road to that town first.`;
  if (e.startsWith('This legion already marched')) return `${e}: it can march again next turn.`;
  return e;
}

/** Keyboard play on desktop. */
function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  if ((e.key === 'Enter' || e.key === ' ') && t?.matches?.('#map g.road, #map g.town')) {
    e.preventDefault(); (t.querySelector('.hit, .thit') ?? t).dispatchEvent(new MouseEvent('click', { bubbles: true })); return;
  }
  if (e.key === 'Escape') {
    if (shareImg) { URL.revokeObjectURL(shareImg.url); shareImg = null; }
    else if (chal) chal = null;
    else if (showRules) showRules = false;
    else if (decreeModal && !decreeIntro) decreeModal = false;
    else if (sel !== null || moving !== null) { sel = null; moving = null; }
    else return;
    render(); return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || view !== 'map' || showRules || decreeModal || tutPrompt) return;
  const k = e.key.toLowerCase();
  if (k === 'e' && !isOver(sc, s)) act({ type: 'end' });
  else if (k === 'u') undo();
  else if (k === 'm') { lensOverride = lens === 'map' ? 'military' : 'map'; render(); }
}

/** Touch screens, first board of all: show once that the map can be pinched to zoom. */
function pinchHint() {
  if (!isTouch() || tut || view !== 'map' || decreeModal || tutPrompt) return;
  // every board, on touch screens: it is short, and a tap dismisses it
  fxPinchHint(root);
}

/** Which kind of campaign is being played, for analytics. */
const modeName = () => (tut ? 'tutorial' : sk ? 'skirmish' : practice ? 'practice' : 'daily');
/** 🐞 What a bug report carries besides the player's words (bug.ts): where they were, and their moves. */
function bugContext(): BugContext {
  let agent = '';
  try { agent = navigator.userAgent.slice(0, 300); } catch { /* no navigator */ }
  return {
    version: versionLabel().slice(0, 80), day: demo ? 'demo' : dateLabel, mode: actMode(), view: statsOpen ? 'stats' : view,
    skirmish: sk ? sk.entry.id : null, skin: boardTheme(), turn: s.turn, denarii: s.denarii, glory: s.glory,
    screen: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}`, agent,
    actions: log.length ? (log.slice(0, 600) as unknown[]) : null,
  };
}
const bugSheetHtml = () => bugSheet(log.length > 0, !!day?.username);

/** The mode as the moderator stats count it (the Demo post's own campaign is 'demo'). */
const actMode = (): ActMode => (modeName() === 'daily' && demo ? 'demo' : modeName());
const track = (action: string, details?: string) => social?.journey?.({ kind: 'interaction', action, ...(details ? { details } : {}) });

function act(a: Action) {
  if (tut) {
    const step = TUT_STEPS[tut.step]!;
    if (!(step.allow?.(a) ?? false)) { say(tutWrongTap(step), 3000); buzz([10, 40, 10]); render(); return; }
  }
  if (a.type === 'end' && !tut && !confirmEnd) {
    const pv = forecastPreview(sc, s);
    if (pv && pv.turn === s.turn && pv.cut.length) { // a second tap within 4 s confirms
      confirmEnd = true; buzz(15);
      if (confirmTimer) clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => { if (confirmEnd) { confirmEnd = false; render(); } }, 4000);
      render(); return;
    }
  }
  confirmEnd = false;
  const err = checkAction(sc, s, a);
  if (err) { say(`⚠ ${withFix(err)}`, 4000); play('error'); buzz([10, 40, 10]); render(); return; }
  buzz(a.type === 'road' ? 12 : a.type === 'end' ? [18, 60, 18] : 20);
  const before = s;
  if (a.type === 'end') undoStack = []; else undoStack.push(s);
  if (!log.length) { social?.journey?.({ kind: 'start', mode: modeName() }); social?.activity?.('start', actMode()); }
  s = apply(sc, s, a);
  log.push(a);
  persist();
  if (a.type === 'end') social?.journey?.({ kind: 'progress', progress: Math.min(1, (s.turn - 1) / sc.rules.turns), action: 'turn_end', details: `turn ${s.turn - 1}` });
  if (isOver(sc, s)) { const b = score(sc, s); social?.journey?.({ kind: 'end', complete: true, win: par !== null && b.total >= par, score: b.total }); social?.activity?.('finish', actMode()); }
  if (isOver(sc, s)) void finish();
  if (a.type !== 'end') play(a.type === 'camp' ? 'march' : a.type === 'accept' ? 'garrison' : a.type);
  if (a.type === 'end') {
    sel = null; lensOverride = null; moving = null; tipNow = false;
    const rec = s.history[s.history.length - 1]!;
    play(rec.burned.length ? 'burn' : rec.cut.length ? 'revolt' : 'turn');
    if (isOver(sc, s) && par !== null && score(sc, s).total >= par) setTimeout(() => play('win'), 700);
    showTurnCard(before, rec);
    if (rec.cut.length || rec.burned.length) buzz([40, 60, 40]);
    say('', 0);
  } else say('', 0);
  render();
  // one-shot effects, drawn over the freshly rendered board (fx.ts)
  if (a.type === 'end') {
    // The turn plays out in order, quickly: 1. battle (revolts strike or break on shields, sieges burn their roads),
    // 2. consequences (towns cut off, sieges tick), 3. pay (castra outwards), 4. news (rubble cleared, new threats, dusk).
    // Purely visual: the state is already final, and a tap skips to it.
    const rec = s.history[s.history.length - 1]!, fxe = endTurnFx(before, s);
    const razed = rec.burned.map((t) => ({ town: t, roads: sc.roads.filter((r) => (r.a === t || r.b === t) && before.built[r.id] && !rec.cut.includes(r.id)).map((r) => r.id) }));
    const held = new Map<number, { by: number; roads: number[]; from: number[] }>();
    for (const h of heldAt(sc, before, before.turn)) { // one shield per legion or garrison that held, drawn where it stands
      const e = held.get(h.source) ?? { by: h.source, roads: [], from: sc.towns.filter((t) => t.tribe === h.tribe).map((t) => t.id) };
      e.roads.push(h.road); held.set(h.source, e);
    }
    const battle = rec.cut.length > 0 || held.size > 0 || razed.length > 0 || fxe.lost.length > 0;
    const sieges = sc.towns.filter((t) => (s.siege[t.id] ?? 0) > 0 && (!before.siege[t.id] || s.siege[t.id]! < before.siege[t.id]!)).map((t) => ({ town: t.id, from: before.siege[t.id] ?? 0, to: s.siege[t.id]! }));
    fxe.payAt = razed.length ? 1050 : held.size ? 900 : battle ? 800 : sieges.length ? 650 : 150;
    // fxEndTurn first: it clears any effect still running (fxFinish), then draws the strike, the rings and the pay
    const paid = fxEndTurn(root, fxe);
    // 1. battle
    if (held.size) { fxHeld(root, [...held.values()], 0); play('clang'); }
    if (razed.length) { fxRaze(root, razed); play('raze'); }
    // 2. consequences (cut off / burned rings come from fxEndTurn); sieges tick (or begin): the badge turns over, a low bell
    const sd = battle ? 450 : 100;
    if (sieges.length) { fxSiege(root, sieges, sd); sfxLater('siege', sd); }
    // 3. pay: drawn by fxEndTurn above, from fxe.payAt
    // 4. news for the next turn, once the pay has landed
    const news = Math.max(1400, paid + 100);
    const cleared = sc.roads.filter((r) => before.rubble[r.id] && !s.rubble[r.id] && !s.built[r.id]).map((r) => r.id);
    if (cleared.length) { fxClear(root, cleared, news - 200); sfxLater('clear', news - 200); }
    const was = new Set(visibleEvents(sc, before.turn, before).filter(isThreat).map(evKey));
    const fresh = isOver(sc, s) ? [] : visibleEvents(sc, s.turn, s).filter((e) => isThreat(e) && !was.has(evKey(e))).map(evKey);
    if (fresh.length) { fxThreat(root, fresh, news); sfxLater('threat', news); }
    if (isOver(sc, s) && !isOver(sc, before)) duskFx(paid);
    else if (s.turn === sc.rules.turns && !tut) { fxLastTurn(root, news + 200); sfxLater('lastturn', news + 200); } // the last turn begins
  } else if (a.type === 'road') {
    const r = sc.roads[a.road]!, supB = supplied(sc, before), supA = supplied(sc, s);
    fxRoad(root, a.road, supB[r.a]!);
    const joined = sc.towns.filter((t) => t.id !== sc.castra && supA[t.id] && !supB[t.id]).map((t) => ({ town: t.id, glory: townGlory(sc, t, townValue(s, t)) }));
    if (joined.length) { fxJoin(root, joined, 380); setTimeout(() => play('fanfare'), 380); }
  } else if (a.type === 'garrison') fxGarrison(root, a.town);
  else if (a.type === 'recruit') fxRecruit(root, s.legions.length - 1);
  else if (a.type === 'camp') fxMarch(root, a.legion, marchRoute(before, before.legions[a.legion]!, a.town));
}

/** The towns a legion passes through on built roads (shortest route), for the march animation. */
function marchRoute(st: State, from: number, to: number): number[] {
  const prev = new Map<number, number>([[from, -1]]), q = [from];
  while (q.length) {
    const x = q.shift()!;
    if (x === to) break;
    for (const r of sc.roads) {
      if (!st.built[r.id]) continue;
      const y = r.a === x ? r.b : r.b === x ? r.a : -1;
      if (y >= 0 && !prev.has(y)) { prev.set(y, x); q.push(y); }
    }
  }
  if (!prev.has(to)) return [from, to];
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]!)!);
  return path;
}

/** What the end of a turn did, for the animation: cuts, losses, and who paid what (pay.ts). */
function endTurnFx(before: State, after: State): EndTurnFx {
  const rec = after.history[after.history.length - 1]!;
  const supB = supplied(sc, before), supA = supplied(sc, after), { pays, extraGlory } = turnPayments(sc, before, after);
  return {
    cut: rec.cut, burned: rec.burned,
    lost: sc.towns.filter((t) => supB[t.id] && !supA[t.id] && !rec.burned.includes(t.id) && t.id !== sc.castra).map((t) => t.id),
    pays, extraGlory,
    // after the last turn the glory counter lands on the final score (decree bonus and lost legions included), as the bar shows
    counters: { glory: [before.glory, isOver(sc, after) ? score(sc, after).total : after.glory] as [number, number], denarii: [before.denarii, after.denarii] as [number, number] },
    tick: (i: number) => play('tick', i),
  };
}

/**
 * One slim line in the panel, never over the map: the marching instruction, else the last message,
 * else what the last turn did. Replaces the old pop-ups (hints, turn card, toasts).
 */
function statusLine(): string {
  if (moving !== null && !tut) return `<div class="status move" style="--leg:${LEGION_COL[moving % LEGION_COL.length]}"><span class="legtag">${ROMAN[moving] ?? moving + 1}</span> Tap a ringed town to march · tap the standard again to cancel</div>`;
  if (msg && !tut) return `<div class="status msg2"><span>${msg}</span><button id="msgx" aria-label="Close">×</button></div>`;
  // once per device, the first time a revolt shows in the forecast of a real campaign: how to answer it
  if (!tut && !isOver(sc, s) && visibleEvents(sc, s.turn, s).some(isThreat)) {
    let seen = true;
    try { seen = !!localStorage.getItem('arlr.tip.shield'); if (!seen) localStorage.setItem('arlr.tip.shield', '1'); } catch { /* ignore */ }
    if (!seen) tipNow = true;
  }
  const tip = tipNow ? '<div class="status tip">Tip: a legion parked on a town shields every road touching it. Tap its standard, then the town.</div>' : '';
  return (turnCard ? `<div class="status last">${turnCard}</div>` : '') + tip;
}
let tipNow = false;

/** What the turn that just ended did, as one line for the status line. */
function showTurnCard(before: State, rec: State['history'][number]) {
  const bits: string[] = [`<b>Turn ${before.turn}:</b> +${rec.glory} glory · ${signed(rec.income)} denarii`];
  const hit = [...new Set(liveEvents(sc, before).filter((e) => e.turn === before.turn && isThreat(e) && e.kind !== 'idus').map((e) => e.tribe))].map((t) => tribeTag(t));
  if (rec.cut.length) bits.push(`<span class="bad">⚔ ${rec.cut.length} road${rec.cut.length > 1 ? 's' : ''} cut${hit.length ? ` by ${hit.join(' ')}` : ''}</span>`);
  for (const t of rec.burned) bits.push(`<span class="bad">🔥 ${sc.towns[t]!.name} burned</span>`);
  if (rec.lostLegions.length) bits.push(`<span class="bad">⚑ ${rec.lostLegions.length} legion${rec.lostLegions.length > 1 ? 's' : ''} lost</span>`);
  sc.towns.forEach((t) => { if (s.siege[t.id]! > 0 && !before.siege[t.id]) bits.push(`<span class="warn">⏳ ${t.name} cut off: relink within ${s.siege[t.id]} turn${s.siege[t.id]! > 1 ? 's' : ''}</span>`); });
  turnCard = bits.join(' · ');
}

// No undo during training: the steps advance on what is built, and undoing a finished step would
// leave the coach waiting for something that no longer exists.
function undo() { if (tut) return; const p = undoStack.pop(); if (p) { s = p; log.pop(); persist(); msg = ''; moving = null; render(); } }

// ---- the campaign in progress is kept on the device, so closing the view (or the phone killing it) loses nothing
const RUN_KEY = 'arlr.run.';
/** Where this campaign is kept: the daily by date, Skirmish by map; tutorial and practice runs are not kept. */
const runKey = () => (tut ? null : sk ? `${RUN_KEY}sk.${sk.entry.id}` : practice ? null : `${RUN_KEY}${storeKey()}`);
function persist() {
  const k = runKey();
  if (!k) return;
  try { if (log.length) localStorage.setItem(k, JSON.stringify(log)); else localStorage.removeItem(k); } catch { /* storage full or blocked */ }
}
function forget(k = runKey()) { if (k) try { localStorage.removeItem(k); } catch { /* ignore */ } }
/** A kept campaign for `k`, replayed; null if none or it no longer replays (a code change). */
function restore(k: string | null): { s: State; log: Action[] } | null {
  if (!k) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(k) ?? 'null') as Action[] | null;
    if (!Array.isArray(saved) || !saved.length) return null;
    return { s: replay(sc, saved), log: saved };
  } catch { forget(k); return null; }
}
/** Old kept runs (other days) are dropped, so storage never grows. */
function pruneRuns() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(RUN_KEY) && !k.startsWith(`${RUN_KEY}sk.`) && k !== `${RUN_KEY}${storeKey()}`) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}

// ---- tutorial
function tutView() { return { s, moving }; }
/** Id of the current tutorial step (or ''). The decree button appears from the decree lesson on. */
const tutStepId = () => (tut ? TUT_STEPS[Math.min(tut.step, TUT_STEPS.length - 1)]!.id : '');
let tutDecreeSeen = false;
function tutTarget(): TutTarget | null {
  if (!tut) return null;
  const t = TUT_STEPS[tut.step]!.target;
  return t ? (typeof t === 'function' ? t(tutView()) : t) : null;
}
/** Move past every step whose goal is already met. */
function tutCheck() {
  if (!tut) return;
  while (tut.step < TUT_STEPS.length && TUT_STEPS[tut.step]!.done?.(tutView())) tut.step++;
  if (tutStepId() === 'decree') tutDecreeSeen = true;
}
function startTutorial() {
  const saved: Saved = { sc, s, log, undoStack, practice, par };
  tutDecreeSeen = false;
  sc = TUTORIAL; par = null; s = initialState(sc); log = []; declined = new Set(); undoStack = []; practice = true;
  sel = null; moving = null; lensOverride = null; rotated = null; view = 'map';
  tutPrompt = false; decreeModal = false; showRules = false; turnCard = null; confirmEnd = false; msg = '';
  tut = { step: 0, saved };
  void social?.tutorial?.('start', TUT_STEPS[0]!.id).catch(() => undefined);
  render();
}
function endTutorial(how: 'done' | 'skip') {
  const step = tut ? TUT_STEPS[Math.min(tut.step, TUT_STEPS.length - 1)]!.id : 'prompt';
  if (tut) ({ sc, s, log, undoStack, practice, par } = tut.saved);
  if (how === 'done' && social) grantLocal('tirocinium');
  track(`tutorial_${how}`, step);
  tut = null; tutPrompt = false; sel = null; moving = null; lensOverride = null; rotated = null; turnCard = null; msg = '';
  try { localStorage.setItem(TUT_KEY, how); } catch { /* storage unavailable */ }
  void social?.tutorial?.(how, step).catch(() => undefined);
  if (day) day.tutorialDone = true;
  if (!day?.me && !decreeSeen(storeKey())) decreeModal = decreeIntro = true; // first visit: the decree comes next
  render();
}

async function finish() {
  if (sk) { void finishSkirmish(); return; }
  if (practice) { if (!tut) void finishPractice(); return; }
  official = s;
  if (!social) { forget(`${RUN_KEY}${storeKey()}`); return; } // offline: nothing to send, nothing to keep
  if (day?.me && !demo) return;
  if (demo) { const total = score(sc, s).total, prev = myBest(); practiceNote = day?.me ? { total, pb: prev === null || total > prev, prev } : null; }
  busy = true; socialMsg = 'Sending your report to the Senate…'; submitFailed = false;
  try { day = await social.finish(log.slice()); socialMsg = ''; forget(`${RUN_KEY}${storeKey()}`); }
  catch (e) {
    const why = (e as Error).message || 'no answer';
    if (!retried) { retried = true; busy = false; setTimeout(() => void finish(), 3000); socialMsg = 'The Senate did not answer: trying again…'; render(); return; }
    submitFailed = true; socialMsg = `Couldn't save your score (${why}). Your campaign is kept on this device.`;
  }
  busy = false; render();
}
let submitFailed = false, retried = false;

async function doReset(scope: 'me' | 'day') {
  if (!social || busy) return;
  if (confirmReset !== scope) { confirmReset = scope; render(); return; } // second tap confirms
  confirmReset = null; busy = true; render();
  try {
    day = await social.reset(scope);
    s = initialState(sc); log = []; declined = new Set(); undoStack = []; official = null; practice = false; shared = false;
    view = 'map'; socialMsg = scope === 'me' ? 'Your game was wiped: play again.' : "Today's board was wiped.";
    say(socialMsg, 4000);
  } catch (e) { socialMsg = (e as Error).message; }
  busy = false; render();
}

/** Personal-best note of the last practice run: set when it beat every earlier score of the day. */
/** Play the results page's opening animation on its next render (set when the page is opened). */
let resultsFx = false;
/** A sound some way into the show (skipped by <html data-nofx>, like the effects). */
function sfxLater(k: Parameters<typeof play>[0], ms: number) { setTimeout(() => { if (!document.documentElement.hasAttribute('data-nofx')) play(k); }, ms); }
/** The day is over: the board settles into dusk once, after the turn's ripple; it stays dim after that. */
function duskFx(after = 1200) {
  const d = root.querySelector<HTMLElement>('.mapwrap .dusk');
  if (!d || document.documentElement.hasAttribute('data-nofx') || reducedMotion()) return;
  d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1400, delay: after, easing: 'ease-in-out', fill: 'backwards' });
  sfxLater('dusk', after + 100);
}
const FACTION_COL: Record<string, string> = { populares: '#8b1a1a', optimates: '#1f5fa8', augures: '#2e6b34' };
let practiceNote: { total: number; pb: boolean; prev: number | null } | null = null;
async function finishPractice() {
  const total = score(sc, s).total;
  const prev = myBest();
  practiceNote = { total, pb: prev === null || total > prev, prev };
  if (!social?.practice || !day?.username) return; // offline: the note still shows, nothing is kept
  busy = true; render();
  try { day = await social.practice(log.slice()); socialMsg = ''; }
  catch (e) { socialMsg = (e as Error).message || 'Could not keep your practice run'; }
  busy = false; render();
}
/** Best score of the day so far: the official run or any kept practice run. */
function myBest(): number | null {
  const xs = [day?.me?.total ?? null, day?.practice?.best?.total ?? null].filter((x): x is number => x !== null);
  return xs.length ? Math.max(...xs) : null;
}

// ---- Skirmish: pool maps with Caesar's score, unlocked after today's campaign, never ranked
let sk: (Skirmish & { saved: Saved }) | null = null;
let skNote: { total: number; pb: boolean; prev: number | null } | null = null;
const skUnlocked = () => !social || !day?.username ? isOver(sc, official ?? s) || !!day?.me : !!day?.skirmish?.unlocked;
/** Open a skirmish map: the given one, or a random map not played yet. */
function startSkirmish(id?: number) {
  const played = new Set(Object.keys(day?.skirmish?.records ?? {}).map(Number));
  const fresh = SKIRMISHES.filter((e) => !played.has(e.id));
  // an unfinished skirmish kept on this device comes back first (unless a map was asked for: Retry starts it over)
  let kept: number | undefined;
  if (id === undefined) try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(`${RUN_KEY}sk.`)) { kept = Number(k.slice(RUN_KEY.length + 3)); break; } } } catch { /* ignore */ }
  if (id !== undefined) forget(`${RUN_KEY}sk.${id}`);
  const pick = id ?? kept ?? (fresh.length ? fresh : SKIRMISHES)[Math.floor(Math.random() * (fresh.length || SKIRMISHES.length))]?.id;
  const next = pick ? skirmish(pick) : null;
  if (!next) { say('No skirmish map available.', 3000); render(); return; }
  const saved: Saved = sk?.saved ?? { sc, s, log, undoStack, practice, par };
  sk = { ...next, saved }; skNote = null; track('skirmish_start', `#${next.entry.id}`);
  sc = next.scenario; par = next.entry.par; s = initialState(sc); log = []; declined = new Set(); undoStack = []; practice = true;
  setBoardTheme(next.entry.theme ?? prefTheme());
  sel = null; moving = null; lensOverride = null; rotated = null; turnCard = null; confirmEnd = false; view = 'map';
  const back = restore(runKey());
  if (back && !isOver(sc, back.s)) { s = back.s; log = back.log; say(`Skirmish #${next.entry.id} resumes at turn ${s.turn}.`, 5000); render(); setTimeout(pinchHint, 900); return; }
  forget();
  decreeModal = decreeIntro = true; // read the decree first: every skirmish has its own
  say(`Skirmish #${next.entry.id}: Caesar scored ${next.entry.par}. Unranked.`, 5000); render();
}
function leaveSkirmish() {
  if (!sk) return;
  ({ sc, s, log, undoStack, practice, par } = sk.saved);
  sk = null; skNote = null; sel = null; moving = null; rotated = null; turnCard = null; view = 'results'; setBoardTheme(prefTheme()); render();
}
async function finishSkirmish() {
  if (!sk) return;
  const total = score(sc, s).total, prev = day?.skirmish?.records[sk.entry.id]?.best ?? null;
  skNote = { total, pb: prev === null || total > prev, prev };
  if (!social?.skirmish || !day?.username) { forget(); return; }
  busy = true; render();
  try {
    const v = await social.skirmish(sk.entry.id, log.slice());
    if (day) { day.skirmish = { unlocked: v.unlocked, records: v.records }; if (v.achievements) day.achievements = v.achievements; } // skirmish honours toast on the next render
    socialMsg = ''; forget();
  }
  catch (e) { socialMsg = (e as Error).message || 'Could not keep your skirmish score'; }
  busy = false; render();
}
/** Results of a skirmish: score vs Caesar, best on this map, retry / new map / challenge / back. */
function renderSkirmish() {
  const e = sk!.entry, b = score(sc, s), rec = day?.skirmish?.records[e.id];
  const pct = Math.round((100 * b.total) / e.par), beat = b.total >= e.par;
  const done = Object.keys(day?.skirmish?.records ?? {}).length;
  const ch = challengedBy?.sk === e.id ? `<div class="pracline">u/${esc(challengedBy.from)} scored <b>${challengedBy.score}</b>: ${b.total > challengedBy.score ? 'you win the duel!' : b.total === challengedBy.score ? 'a draw.' : 'try again.'}</div>` : '';
  $('app').innerHTML = `
  <div class="results">
    <div class="rtop"><b>All Roads Lead to Rome</b> <span class="muted">· Skirmish #${e.id}</span>
      <span class="icons"><button id="rules" title="How to play">?</button></span></div>
    <section class="hero prac">
      <div class="htag">Skirmish · unranked</div>
      <h2>${beat ? 'You out-marched Caesar!' : 'Skirmish over'}</h2>
      ${beat ? `<div class="wreath">${laurelSvg()}<div class="big">${b.total}</div></div>` : `<div class="big">${b.total}</div>`}
      <div class="vs">${pct}% of Caesar's ${e.par}</div>
      <div class="rank">${rec ? `Your best on this map: ${skNote?.pb && skNote.prev !== null ? `<s class="oldbest">${skNote.prev}</s> ` : ''}<b class="newbest">${rec.best}</b> · ${pl(rec.tries, 'try', 'tries')}` : ''}${skNote?.pb && rec && rec.tries > 1 ? ' · <span class="pb">New personal best!</span>' : ''}</div>
      ${ch}
    </section>
    ${chartSection(s)}
    <section class="rcard">
      <table class="brk"><tr><td>Glory from your towns</td><td>${b.glory}</td></tr>
      <tr><td>Decree: ${sc.decree.title}</td><td>${b.decree ? '+' + b.decree : 'missed'}</td></tr>
      <tr><td>Legions lost</td><td>${b.penalty ? '−' + b.penalty : '0'}</td></tr>
      <tr class="tot"><td>Score</td><td>${b.total}</td></tr></table>
      <div class="muted small">Skirmishes are unranked; they earn the Skirmish honours. ${done ? `You have fought ${done} of ${SKIRMISHES.length} maps.` : ''}</div>
    </section>
    <section class="ractions">
      <button id="skretry">Retry #${e.id}</button>
      <button id="sknew">⚔️ New skirmish</button>
      ${social ? `<button id="skchal">⚔️ Challenge a friend on #${e.id}</button>` : ''}
      <button id="shareimg">🖼 Share as image</button>
      <button id="skback">Back to ${demo ? 'the Demo' : "today's campaign"}</button>
    </section>
    ${socialMsg ? `<div class="muted small center">${esc(socialMsg)}</div>` : ''}
  </div>
  ${showRules ? rulesSheet() : ''}${challengeSheet()}${imgSheet()}${bugSheetHtml()}`;
  wireChart(); wireImgSheet();
  root.querySelector('#shareimg')?.addEventListener('click', () => void shareResultImage());
  if (resultsFx) { resultsFx = false; fxResults(root, (i) => play('tick', i), () => sfxLater('win', 900)); if (skNote?.pb && skNote.prev !== null) { fxBest(root, 1300); sfxLater('seal', 1500); } }
  $('rules').onclick = () => { showRules = !showRules; render(); };
  root.querySelector('#rulesx')?.addEventListener('click', () => { showRules = false; render(); });
  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((x) => (x.onclick = () => { rulesTab = x.dataset.tab as typeof rulesTab; render(); }));
  $('skretry').onclick = () => startSkirmish(e.id);
  $('sknew').onclick = () => startSkirmish();
  $('skback').onclick = () => leaveSkirmish();
  root.querySelector('#skchal')?.addEventListener('click', () => { chal = { score: rec?.best ?? b.total, sk: e.id }; render(); });
  wireChallenge();
}

/** The Demo: march the same map again; this run is scored too (your best stays on the board). */
function marchAgain() {
  practiceNote = null; track('demo_again');
  practice = false; official = null; s = initialState(sc); log = []; declined = new Set(); undoStack = []; sel = null; moving = null; retried = false;
  forget(`${RUN_KEY}${storeKey()}`);
  view = 'map'; say('Another march on the same province: this run is scored too.', 4000); render(); setTimeout(pinchHint, 900);
}
function startPractice() {
  if (demo) { marchAgain(); return; }
  practiceNote = null; track('practice_start');
  practice = true; s = initialState(sc); log = []; declined = new Set(); undoStack = []; sel = null; moving = null;
  view = 'map'; say('Practice run: nothing is scored.', 4000); render(); setTimeout(pinchHint, 900);
}

async function doVote(f: Faction) {
  track('vote', f);
  if (!social || busy) return;
  busy = true; render();
  let ok = false;
  try { day = await social.vote(f); socialMsg = ''; ok = true; } catch (e) { socialMsg = (e as Error).message; }
  busy = false; render();
  if (ok) { fxVote(root, f, FACTION_COL[f] ?? '#c9971f'); play('clack'); }
}

async function doShare() {
  if (!social || busy || shared) return;
  busy = true; render();
  try {
    await social.share([...mentionSel]); shared = true; grantLocal('acta'); track('share', mentionSel.size ? 'challenge' : 'result');
    socialMsg = mentionSel.size ? `Posted, and ${[...mentionSel].map((m) => 'u/' + m).join(', ')} will be notified.` : 'Your report is posted in the comments.';
    mentionSel.clear();
  } catch (e) { socialMsg = (e as Error).message || 'Could not post the comment'; }
  busy = false; render();
}

async function doFollow(name: string, follow: boolean) {
  track(follow ? 'follow' : 'unfollow');
  if (!social || busy || !name.trim()) return;
  busy = true; render();
  try {
    day = await social.follow(name.trim(), follow); socialMsg = ''; if (follow) rivalInput = '';
    if (follow) { const added = (day.rivals ?? []).find((r) => r.username.toLowerCase() === name.trim().replace(/^u\//i, '').toLowerCase()); if (added && slots) addToChart(added.username); }
    historyState = 'idle'; // reload "Your record" for the rivals you follow now (the old one stays on screen meanwhile)
  } catch (e) { socialMsg = (e as Error).message; }
  busy = false; render();
}

// ---- the challenge card: the message as it will read, then Copy message / Copy link / Share
let chal: { score: number; sk?: number; copied?: string | undefined } | null = null;
async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back below */ }
  try {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}
function challengeSheet(): string {
  if (!chal || !social) return '';
  const card = social.challengeCard?.(chal.score, chal.sk) ?? { text: '', url: '' };
  const where = card.url ? card.url.replace(/^https:\/\/www\./, '').replace(/\?.*$/, '') : '';
  return `<div class="sheet chalsheet"><div class="sheetbox chalbox"><button id="chalx" class="x" aria-label="Close">×</button>
    <h3>⚔️ Challenge a friend</h3>
    <div class="chalcard"><div class="chalmsg">${esc(card.text)}</div>
      ${where ? `<div class="challink"><span class="seal">🏛️</span><span><b>Accept the challenge</b><small>${esc(where)}</small></span></div>` : ''}</div>
    <div class="chalbtns">
      ${card.url ? `<button id="chalcopy" class="primary">${chal.copied === 'msg' ? 'Copied ✓' : 'Copy message'}</button><button id="challink">${chal.copied === 'link' ? 'Copied ✓' : 'Copy link only'}</button>` : ''}
      <button id="chalshare"${card.url ? '' : ' class="primary"'}>Share…</button>
    </div>
    <div class="muted small">Your friend opens the post and sees your score to beat${chal.sk ? ` on Skirmish #${chal.sk}` : ''}.</div>
  </div></div>`;
}
function wireChallenge() {
  if (!chal) return;
  const card = social?.challengeCard?.(chal.score, chal.sk);
  root.querySelector('#chalx')?.addEventListener('click', () => { chal = null; render(); });
  root.querySelector('#chalcopy')?.addEventListener('click', () => void copyText(`${card!.text}\n${card!.url}`).then((ok) => { if (chal) chal.copied = ok ? 'msg' : undefined; track('challenge', 'copy'); render(); }));
  root.querySelector('#challink')?.addEventListener('click', () => void copyText(card!.url).then((ok) => { if (chal) chal.copied = ok ? 'link' : undefined; track('challenge', 'link'); render(); }));
  root.querySelector('#chalshare')?.addEventListener('click', () => { const c = chal!; track('challenge', 'share'); void social?.challenge(c.score, c.sk).catch((e: Error) => { socialMsg = e.message; render(); }); });
}
// ---- the result as a picture (share-image.ts): drawn on the device, shown in a sheet, shared or saved from there
let shareImg: { url: string; blob: Blob } | null = null;
async function shareResultImage() {
  if (busy) return;
  track('share_image', modeName());
  // a skirmish or a practice run is the board in play (s); `official` and day.me belong to today's ranked campaign
  const run = !!sk || practice;
  const fin = run ? s : official ?? s, stored = !run && staleResult && day?.me ? day.me : null;
  const total = stored ? stored.total : score(sc, fin).total;
  const lines = chartLinesFor(fin, run ? undefined : stored?.curve ?? day?.me?.curve);
  const p = sk ? sk.entry.par : day?.par ?? par;
  const lb = day?.leaderboard;
  const ranking = sk ? '' : practice ? 'Practice run' : [lb?.me ? `#${lb.me.rank} of ${pl(lb.players, 'general')}` : '', day?.streak && day.streak.streak > 1 ? `🔥 ${day.streak.streak}-day streak` : ''].filter(Boolean).join(' · ');
  const svg = shareSvg({
    sc, fin, total, par: p, you: lines[0]!.curve, caesar: lines.find((l) => l.name === 'Caesar')?.curve ?? null,
    title: sk ? `Skirmish #${sk.entry.id}` : demo ? 'The Demo campaign' : `Campaign of ${niceDate()}`, subtitle: `The lands of the ${sc.tribes.map((t) => t.name).join(', ')}`,
    ranking, mode: sk ? 'skirmish' : practice ? 'practice' : 'daily',
  });
  const blob = await shareBlob(svg);
  if (!blob) { say("Couldn't draw the picture on this device.", 3000); render(); return; }
  if (shareImg) URL.revokeObjectURL(shareImg.url);
  shareImg = { url: URL.createObjectURL(blob), blob };
  render();
}
function imgSheet(): string {
  if (!shareImg) return '';
  return `<div class="sheet imgsheet"><div class="sheetbox"><button id="imgx" class="x" aria-label="Close">×</button>
    <img src="${shareImg.url}" alt="Your result: score, Caesar's score and your roads on today's map">
    <div class="imgbtns"><button id="imgshare" class="primary">Share…</button></div>
    <div class="muted small center">If nothing opens, press and hold the picture to save it.</div></div></div>`;
}
function wireImgSheet() {
  root.querySelector('#imgx')?.addEventListener('click', () => { if (shareImg) URL.revokeObjectURL(shareImg.url); shareImg = null; render(); });
  root.querySelector('#imgshare')?.addEventListener('click', () => {
    if (!shareImg) return;
    const text = sk ? `I scored ${score(sc, s).total} on Skirmish #${sk.entry.id} of All Roads Lead to Rome. Can you beat Caesar?` : `My campaign in All Roads Lead to Rome, ${demo ? 'the Demo' : niceDate()}. Can you out-march Caesar?`;
    void sharePicture(shareImg.blob, text).then((r) => {
      const m = { shared: '', cancelled: '', copied: 'Picture copied: paste it in a comment or a chat.', downloaded: 'Picture saved to your downloads.', failed: 'Sharing is blocked here: press and hold the picture to save it.' }[r];
      if (m) { say(m, 4000); render(); }
    });
  });
}

async function doChallenge() {
  if (!social) return;
  chal = { score: score(sc, official ?? s).total }; render();
}

async function doJoin() {
  if (!social || busy || joined) return;
  busy = true; render();
  try { await social.subscribe(); joined = true; } catch (e) { socialMsg = (e as Error).message; }
  busy = false; render();
}


const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
// legion colours avoid red (revolt warnings) and green (harvest)
const LEGION_COL = ['#1f5fa8', '#c27c0e', '#7a3fa0', '#0f7c80', '#a0457a', '#555'];

/** Towns each legion can still reach this turn (empty if it already marched or is cut off). */
function legionReach(sup: boolean[]): Array<Set<number>> {
  return s.legions.map((from, i) => {
    const out = new Set<number>();
    if (s.moved[i] || !sup[from]) return out;
    const d = roadDistance(sc, s, from);
    for (const t of sc.towns) if (t.id !== from && sup[t.id] && d[t.id]! <= sc.rules.legionRange) out.add(t.id);
    return out;
  });
}

// ---- board art: static tiles cached per day and orientation, re-attached after each render
/** The board skin outside Aegyptus skirmishes: Gaul (a preview of Egypt with localStorage arlr.theme = 'egypt'). */
const prefTheme = (): 'gaul' | 'egypt' => { try { return localStorage.getItem('arlr.theme') === 'egypt' ? 'egypt' : 'gaul'; } catch { return 'gaul'; } };
let boardCache: { key: string; board: Board; node: SVGSVGElement | null } | null = null;
function getBoard(): Board {
  const key = `${sc.seed}|${boardRotated}|${boardTheme()}`;
  if (boardCache?.key !== key) boardCache = { key, board: buildBoard(sc, boardRotated), node: null };
  return boardCache.board;
}
function boardNode(vb: string): SVGSVGElement {
  const b = getBoard();
  if (!boardCache!.node) {
    const tpl = document.createElement('template');
    tpl.innerHTML = `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet" class="board" aria-hidden="true">${b.markup}</svg>`;
    boardCache!.node = tpl.content.firstElementChild as SVGSVGElement;
  }
  if (boardCache!.node.getAttribute('viewBox') !== vb) boardCache!.node.setAttribute('viewBox', vb);
  return boardCache!.node;
}
// ---- pinch / drag / wheel zoom. The camera is a zoom factor and a centre in board units; it
// only changes the viewBox of the two map layers, so gestures never re-render the map.
const cam = { z: 1, cx: NaN, cy: NaN, key: '' };
const ZMAX = 4;
function camBox(fr: { x: number; y: number; w: number; h: number }) {
  const key = `${sc.seed}|${boardRotated}|${boardTheme()}`;
  if (cam.key !== key) { cam.key = key; cam.z = 1; cam.cx = NaN; }
  const w = fr.w / cam.z, h = fr.h / cam.z;
  if (Number.isNaN(cam.cx)) { cam.cx = fr.x + fr.w / 2; cam.cy = fr.y + fr.h / 2; }
  cam.cx = Math.min(fr.x + fr.w - w / 2, Math.max(fr.x + w / 2, cam.cx));
  cam.cy = Math.min(fr.y + fr.h - h / 2, Math.max(fr.y + h / 2, cam.cy));
  return { x: cam.cx - w / 2, y: cam.cy - h / 2, w, h };
}
const vbStr = (b: { x: number; y: number; w: number; h: number }) => `${b.x.toFixed(2)} ${b.y.toFixed(2)} ${b.w.toFixed(2)} ${b.h.toFixed(2)}`;
function applyCam() {
  const vb = vbStr(camBox(frame(viewScenario())));
  root.querySelector('#map')?.setAttribute('viewBox', vb);
  boardCache?.node?.setAttribute('viewBox', vb);
  root.querySelector('#zoomreset')?.classList.toggle('show', cam.z > 1.02);
  root.querySelector('.mapwrap')?.classList.toggle('zoomed', cam.z > 1.02);
}
let pressedAt: { x: number; y: number } | null = null;
let suppressClick = false;
let camTimer: ReturnType<typeof setTimeout> | undefined;
const settle = () => { if (camTimer) clearTimeout(camTimer); camTimer = setTimeout(() => render(), 160); };
function wireZoom(wrap: HTMLElement) {
  const pts = new Map<number, { x: number; y: number }>();
  let start: { x: number; y: number } | null = null, moved = false, pinchD = 0;
  const unitsPerPx = () => { const b = camBox(frame(viewScenario())); return Math.max(b.w / wrap.clientWidth, b.h / wrap.clientHeight); };
  const turned = () => root.querySelector('#app')?.classList.contains('sideways') ?? false;
  /** Screen offset -> offset in the map's own frame (sideways mode rotates the app 90° clockwise). */
  const local = (dx: number, dy: number) => (turned() ? { x: dy, y: -dx } : { x: dx, y: dy });
  const toBoard = (sx: number, sy: number) => {
    const r = wrap.getBoundingClientRect(), upp = unitsPerPx(), o = local(sx - r.left - r.width / 2, sy - r.top - r.height / 2);
    return { x: cam.cx + o.x * upp, y: cam.cy + o.y * upp };
  };
  const zoomAt = (sx: number, sy: number, factor: number) => {
    const p = toBoard(sx, sy);
    cam.z = Math.min(ZMAX, Math.max(1, cam.z * factor));
    const r = wrap.getBoundingClientRect(), upp = unitsPerPx(), o = local(sx - r.left - r.width / 2, sy - r.top - r.height / 2);
    cam.cx = p.x - o.x * upp; cam.cy = p.y - o.y * upp;
    applyCam();
  };
  wrap.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { start = { x: e.clientX, y: e.clientY }; moved = false; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinchD = Math.hypot(a!.x - b!.x, a!.y - b!.y); moved = true; }
  });
  wrap.addEventListener('pointermove', (e) => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (pts.size >= 2) {
      pts.set(e.pointerId, cur);
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinchD > 0) zoomAt((a!.x + b!.x) / 2, (a!.y + b!.y) / 2, d / pinchD);
      pinchD = d;
      return;
    }
    if (!moved && start && Math.hypot(cur.x - start.x, cur.y - start.y) < 8) return; // still a tap
    moved = true;
    if (cam.z > 1) { const upp = unitsPerPx(), o = local(cur.x - prev.x, cur.y - prev.y); cam.cx -= o.x * upp; cam.cy -= o.y * upp; applyCam(); }
    pts.set(e.pointerId, cur);
  });
  const end = (e: PointerEvent) => {
    if (!pts.delete(e.pointerId)) return;
    if (pts.size === 0) { if (moved) { suppressClick = true; setTimeout(() => (suppressClick = false), 0); settle(); } start = null; pinchD = 0; }
    if (pts.size === 1) pinchD = 0;
  };
  wrap.addEventListener('pointerup', end);
  wrap.addEventListener('pointercancel', end);
  wrap.addEventListener('dblclick', (e) => { zoomAt(e.clientX, e.clientY, 2); settle(); });
  wrap.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); settle(); }, { passive: false });
}
function attachBoard() {
  const slot = root.querySelector('.bgslot'), map = root.querySelector('#map');
  if (slot && map) slot.appendChild(boardNode(map.getAttribute('viewBox')!));
}

const n1 = (x: number) => x.toFixed(1);
/** Wheat field overlay for a tile (deterministic per tile). */
function wheat(tile: Pt[], seed: string): string {
  const rng = new Rng(seed), c = { x: tile.reduce((a, p) => a + p.x, 0) / tile.length, y: tile.reduce((a, p) => a + p.y, 0) / tile.length };
  const th = rng.next() * Math.PI, u = { x: Math.cos(th), y: Math.sin(th) }, v = { x: -u.y, y: u.x };
  const pal = ['#efc94a', '#e2b232', '#f5d966', '#d9a72a'];
  let g = '', o = -300;
  while (o < 300) {
    const w = 8 + rng.next() * 6, col = pal[Math.floor(rng.next() * pal.length)]!;
    const a = { x: c.x + v.x * o - u.x * 400, y: c.y + v.y * o - u.y * 400 }, b = { x: c.x + v.x * o + u.x * 400, y: c.y + v.y * o + u.y * 400 };
    g += `<path d="M${n1(a.x)},${n1(a.y)} L${n1(b.x)},${n1(b.y)} L${n1(b.x + v.x * w)},${n1(b.y + v.y * w)} L${n1(a.x + v.x * w)},${n1(a.y + v.y * w)} Z" fill="${col}"/>`;
    o += w;
  }
  return g;
}

function svg(): string {
  const v = viewScenario(); // same graph, display coordinates for this screen shape
  const B = getBoard(), P = B.town;
  // UI scale: grow nodes, labels and roads when the map gets few screen pixels (phone, post view)
  const fr0 = frame(v);
  const u = cam.z > 1.001 ? uiScale((mapArea.w && mapArea.h ? Math.min(mapArea.w / fr0.w, mapArea.h / fr0.h) / K : 0.5) * cam.z) : fr0.u;
  const about = (x: number, y: number, inner: string) => `<g transform="translate(${n1(x)} ${n1(y)}) scale(${u.toFixed(3)}) translate(${n1(-x)} ${n1(-y)})">${inner}</g>`;
  const sup = supplied(sc, s), prot = protectedTowns(sc, s), pv = forecastPreview(sc, s);
  const threatened = new Set(pv?.cut ?? []), stranded = new Set(pv?.stranded ?? []);
  const mil = lens === 'military';
  const ev = visibleEvents(sc, s.turn, s);
  const out: string[] = [];
  const clipFor = (i: number) => `url(#tc${i})`;
  const defs: string[] = [];
  const clipped = new Set<number>();
  const clip = (i: number) => { if (!clipped.has(i) && B.tile[i]) { clipped.add(i); defs.push(`<clipPath id="tc${i}"><path d="${polyD(B.tile[i]!)}"/></clipPath>`); } return clipFor(i); };
  const tribeTowns = (k: number) => sc.towns.filter((t) => t.id !== sc.castra && t.tribe === k && B.tile[t.id]).map((t) => t.id);
  const icons = new Map<number, Array<{ kind: string; now: boolean }>>();
  const addIcon = (t: number, kind: string, now: boolean) => { const l = icons.get(t) ?? []; if (!l.some((x) => x.kind === kind)) l.push({ kind, now }); icons.set(t, l); };
  const touches = (rid: number, t: number) => sc.roads[rid]!.a === t || sc.roads[rid]!.b === t;
  // event art keeps clear of towns and of their names (a name is wide: three points along it)
  const avoid = [...P, ...v.towns.flatMap((t) => {
    if (t.id === sc.castra) return [];
    const { x, y } = P[t.id]!, z = settlementSize(townValue(s, t)), hw = (t.name.length * 14 * 0.62 * u) / 2, ny = y - u * (z.top + 9);
    return [{ x: x - hw * 0.7, y: ny }, { x, y: ny }, { x: x + hw * 0.7, y: ny }];
  })];

  // ---- event overlays on the tiles (decoration only; never intercept taps)
  const fx: string[] = [];
  // a toll's look: alliance (discount), snow (terrain-limited), or rain
  const tollKind = (t: { surcharge: number; terrain?: unknown }) => (t.surcharge < 0 ? 'alliance' : t.terrain ? 'snows' : 'toll');
  const tollArt = (kind: string, i: number, faint: boolean) => {
    const op = faint ? ' opacity=".75"' : '';
    if (kind === 'alliance') {
      if (!faint) fx.push(`<path d="${polyD(B.tile[i]!)}" class="allytint"/>`);
      for (const p of spotsIn(B.tile[i]!, `${sc.seed}/ally/${i}`, 2, 34, avoid, 44)) fx.push(`<g${op}>${olive(p.x, p.y, 1.6)}</g>`);
    } else if (kind === 'snows') {
      if (!faint) fx.push(`<path d="${polyD(B.tile[i]!)}" fill="url(#snowHatch)"/>`);
      for (const p of spotsIn(B.tile[i]!, `${sc.seed}/snow/${i}`, 3, 28, avoid, 40)) fx.push(`<g${op}>${snowflake(p.x, p.y, 1.3)}</g>`);
    } else {
      if (!faint) fx.push(`<path d="${polyD(B.tile[i]!)}" fill="url(#rainHatch)"/>`);
      for (const p of spotsIn(B.tile[i]!, `${sc.seed}/rain/${i}`, 1, 40, avoid, 50)) fx.push(`<g${op}>${cloud(p.x, p.y)}</g>`);
    }
  };
  for (const x of (s.tolls ?? []).filter((x) => s.turn <= x.until)) for (const i of tribeTowns(x.tribe)) {
    tollArt(tollKind(x), i, false);
    if (sc.roads.some((r) => touches(r.id, i) && !s.built[r.id] && !s.rubble[r.id])) addIcon(i, tollKind(x), true);
  }
  for (const e of ev) {
    const now = e.turn === s.turn;
    const eff = e.effect;
    const fx0 = fx.length; // this event's art is wrapped below, so animations can find it (fx.ts: fxThreat)
    if (eff.type === 'toll') {
      for (const i of tribeTowns(e.tribe)) {
        tollArt(tollKind(eff), i, true);
        if (sc.roads.some((r) => touches(r.id, i) && !s.built[r.id] && !s.rubble[r.id])) addIcon(i, tollKind(eff), now);
      }
    } else if (eff.type === 'gambit') {
      const i = sc.events.indexOf(e);
      if (!(s.accepted ?? []).includes(i) && !declined.has(i)) for (const t of e.town !== undefined ? [e.town] : tribeTowns(e.tribe)) if (B.tile[t]) addIcon(t, 'gambit', now);
    } else if (eff.type === 'settle' && e.town !== undefined && B.tile[e.town]) {
      fx.push(`<ellipse cx="${n1(P[e.town]!.x)}" cy="${n1(P[e.town]!.y + 6)}" rx="44" ry="26" class="settleghost"/>`);
      const sp = spotsIn(B.tile[e.town]!, `${sc.seed}/vet/${e.town}`, 1, 40, avoid, 42)[0];
      if (sp) fx.push(`<g clip-path="${clip(e.town)}">${stakes(sp.x, sp.y, 1.8)}</g>`);
      addIcon(e.town, 'veterans', now);
    } else if (eff.type === 'purse') {
      for (const i of tribeTowns(e.tribe)) {
        fx.push(`<g clip-path="${clip(i)}">${spotsIn(B.tile[i]!, `${sc.seed}/purse/${i}`, 1, 40, avoid, 40).map((p) => purse(p.x, p.y, 1.5)).join('')}</g>`);
        if (sup[i]) addIcon(i, 'caravan', now);
      }
    } else if (eff.type === 'levy') {
      for (const i of tribeTowns(e.tribe)) for (const p of spotsIn(B.tile[i]!, `${sc.seed}/levy/${i}`, 1, 40, avoid, 40)) fx.push(`<g clip-path="${clip(i)}" opacity="${now ? 1 : 0.75}">${amphora(p.x, p.y, 1.5)}</g>`);
    } else if (eff.type === 'boom' && e.town !== undefined && B.tile[e.town]) {
      const sp = spotsIn(B.tile[e.town]!, `${sc.seed}/silver/${e.town}`, 1, 40, avoid, 42)[0] ?? { x: P[e.town]!.x + 40, y: P[e.town]!.y + 22 };
      fx.push(`<g clip-path="${clip(e.town)}">${silverPeak(sp.x, sp.y)}</g>`);
      addIcon(e.town, 'boom', now);
    } else if (eff.type === 'cut' && eff.mode === 'hub') { // Ides of March: daggers at the most-connected town
      const rids = roadsCutBy(sc, s, e.tribe, 'hub', new Array<boolean>(sc.towns.length).fill(false));
      const cnt = new Map<number, number>();
      for (const r of rids) for (const t of [sc.roads[r]!.a, sc.roads[r]!.b]) cnt.set(t, (cnt.get(t) ?? 0) + 1);
      const hub = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (hub !== undefined && P[hub]) { fx.push(dagger(P[hub]!.x + 34, P[hub]!.y - 30, 1.3 * u)); addIcon(hub, 'idus', now); }
    } else if (eff.type === 'cut' && eff.mode !== 'all') {
      const rid = roadsCutBy(sc, s, e.tribe, eff.mode, prot)[0];
      if (rid !== undefined) {
        const rd = sc.roads[rid]!, far = sc.towns[rd.a]!.hop >= sc.towns[rd.b]!.hop ? rd.a : rd.b, near = far === rd.a ? rd.b : rd.a;
        const a = P[far]!, b = P[near]!, l = Math.hypot(b.x - a.x, b.y - a.y) || 1, p = { x: a.x + (b.x - a.x) * 0.3, y: a.y + (b.y - a.y) * 0.3 };
        const art = eff.mode === 'cheapest' ? dagger : swords, key = eff.mode === 'cheapest' ? 'bandits' : 'raid';
        fx.push(art(p.x - ((b.y - a.y) / l) * 26 * u, p.y + ((b.x - a.x) / l) * 26 * u, 1.1 * u));
        addIcon(rd.a, key, now); addIcon(rd.b, key, now);
      }
    } else if (eff.type === 'cut') {
      const druid = eff.pierce === 'garrison', where = eff.where, sh = where ? shores(sc)[where] : null;
      const hit = roadsCutBy(sc, s, e.tribe, 'all', druid ? protectedTowns(sc, s, true) : prot, where);
      const key = druid ? 'druids' : where === 'coast' ? 'pirates' : where === 'frontier' ? 'germani' : 'revolt';
      for (const i of tribeTowns(e.tribe).filter((t) => !sh || sh[t])) {
        const atRisk = hit.some((rid) => touches(rid, i));
        fx.push(`<path d="${polyD(B.tile[i]!)}" class="revoltrim${now ? ' now' : ''}" clip-path="${clip(i)}"/>`);
        const spots = spotsIn(B.tile[i]!, `${sc.seed}/revolt/${i}`, atRisk ? 4 : 2, 30, avoid, 40);
        const prop = (p: Pt, k: number) => druid ? sickle(p.x, p.y, 1.5) : where === 'coast' ? pirateShip(p.x, p.y, 1.6) : where === 'frontier' ? warband(p.x, p.y, 1.6) : pitchfork(p.x, p.y, (k * 37) % 50 - 25);
        fx.push(`<g clip-path="${clip(i)}">${spots.map((p, k) => (atRisk && k % 2 === 0 ? flame(p.x, p.y, 1.2) : prop(p, k))).join('')}</g>`);
        if (atRisk) addIcon(i, key, now);
      }
    } else if (eff.type === 'yield' && eff.income < 1) { // famine
      for (const i of tribeTowns(e.tribe)) {
        if (now) fx.push(`<path d="${polyD(B.tile[i]!)}" fill="url(#dryHatch)"/>`);
        fx.push(`<g clip-path="${clip(i)}">${spotsIn(B.tile[i]!, `${sc.seed}/famine/${i}`, 1, 40, avoid, 40).map((p) => bowl(p.x, p.y, 1.5)).join('')}</g>`);
        if (sup[i]) addIcon(i, 'famine', now);
      }
    } else if (eff.type === 'yield') {
      for (const i of tribeTowns(e.tribe)) {
        if (e.kind === 'harvest' || eff.glory > 1) {
          fx.push(`<g clip-path="${clip(i)}" opacity="${now ? 0.85 : 0.55}">${wheat(B.tile[i]!, `${sc.seed}/wheat/${i}`)}</g>`);
          fx.push(`<g clip-path="${clip(i)}">${spotsIn(B.tile[i]!, `${sc.seed}/sheaf/${i}`, 3, 26, avoid, 34).map((p) => sheaf(p.x, p.y, 1.1)).join('')}</g>`);
        } else {
          fx.push(`<g clip-path="${clip(i)}">${spotsIn(B.tile[i]!, `${sc.seed}/coins/${i}`, 1, 40, avoid, 40).map((p) => coins(p.x, p.y, 1.1)).join('')}</g>`);
        }
        if (sup[i]) addIcon(i, e.kind === 'harvest' || eff.glory > 1 ? 'harvest' : 'tribute', now);
      }
    }
    if (fx.length > fx0) fx.splice(fx0, fx.length - fx0, `<g data-ev="${evKey(e)}">${fx.slice(fx0).join('')}</g>`);
  }
  if (mil) out.push('<rect x="-5000" y="-5000" width="10000" height="10000" class="lensdim"/>');
  if (hlTribe !== null) {
    // the highlighted tribe's lands glow; every other town tile dims
    for (const t of sc.towns) {
      if (t.id === sc.castra || !B.tile[t.id]) continue;
      out.push(t.tribe === hlTribe ? `<path d="${polyD(B.tile[t.id]!)}" class="hlown"/>` : `<path d="${polyD(B.tile[t.id]!)}" class="hlother"/>`);
    }
  }
  out.push(`<g class="fx">${fx.join('')}</g>`);

  // ---- legion reach: march targets (moving) or zones (military lens)
  const reachAll = legionReach(sup);
  const moveSet = moving !== null ? reachAll[moving]! : null;
  if (moveSet) {
    for (const t of moveSet) out.push(`<circle cx="${n1(P[t]!.x)}" cy="${n1(P[t]!.y + 4)}" r="${n1(34 * u)}" class="dest" style="stroke:${LEGION_COL[moving! % LEGION_COL.length]}"/>`);
  } else if (mil) {
    reachAll.forEach((set, i) => { for (const t of set) out.push(`<circle cx="${n1(P[t]!.x)}" cy="${n1(P[t]!.y + 4)}" r="${n1((30 - i * 5) * u)}" class="zone" style="stroke:${LEGION_COL[i % LEGION_COL.length]}"/>`); });
  }

  // ---- roads
  const roads: string[] = [], stones: string[] = [];
  for (const r of sc.roads) {
    const A = P[r.a]!, Bp = P[r.b]!, d = `M${n1(A.x)},${n1(A.y)} L${n1(Bp.x)},${n1(Bp.y)}`, m = { x: (A.x + Bp.x) / 2, y: (A.y + Bp.y) / 2 };
    const built = s.built[r.id];
    const buildable = !built && !checkAction(sc, s, { type: 'road', road: r.id });
    const shielded = built && (prot[r.a] || prot[r.b]);
    const cls = built ? (threatened.has(r.id) ? 'road built threat' : shielded && mil ? 'road built shielded' : 'road built')
      : s.rubble[r.id] ? 'road rubble' : buildable ? 'road open' : 'road closed';
    let g = `<path d="${d}" class="hit"/>`;
    if (built) {
      g += `<path d="${d}" class="glow"/><path d="${d}" class="pave0"/><path d="${d}" class="pave1"/><path d="${d}" class="pave2"/>`;
    } else if (s.rubble[r.id]) {
      g += `<path d="${d}" class="ruin"/>`;
      const rng = new Rng(`${sc.seed}/rubble/${r.id}`), l = Math.hypot(Bp.x - A.x, Bp.y - A.y), ux = (Bp.x - A.x) / l, uy = (Bp.y - A.y) / l;
      for (let k = 18; k < l - 18; k += 8) {
        const x = A.x + ux * k + (rng.next() - 0.5) * 12, y = A.y + uy * k + (rng.next() - 0.5) * 12;
        g += `<rect x="${n1(x - 2.5)}" y="${n1(y - 2)}" width="5" height="4" class="block" transform="rotate(${n1(rng.next() * 90)} ${n1(x)} ${n1(y)})"/>`;
      }
      stones.push(`<g class="ruinbadge" transform="translate(${n1(m.x)},${n1(m.y)}) scale(${u.toFixed(3)})"><rect x="-17" y="-10" width="34" height="20" rx="10"/><path d="M-10,-5 l5,5 m0,-5 l-5,5"/><text x="5" y="4.5">${s.rubble[r.id]}</text></g>`);
    } else {
      g += `<path d="${d}" class="track0"/><path d="${d}" class="track1"/>`;
      const toll = roadToll(sc, s, r.id) > 0;
      const poor = roadCost(sc, s, r.id) > s.denarii;
      stones.push(`<g class="mile${toll ? ' toll' : ''}${buildable ? '' : ' closed'}${poor ? ' poor' : ''}${mil ? ' faded' : ''}" transform="translate(${n1(m.x)},${n1(m.y)}) scale(${u.toFixed(3)})"><path d="M-8,10 L-8,-4 Q-8,-11 0,-11 Q8,-11 8,-4 L8,10 Z"/><text y="4.5">${roadCost(sc, s, r.id)}</text></g>`);
    }
    const rname = `Road ${sc.towns[r.a]!.name} to ${sc.towns[r.b]!.name}: ${built ? 'built' : s.rubble[r.id] ? `rubble for ${pl(s.rubble[r.id]!, 'turn')}` : `${roadCost(sc, s, r.id)} denarii${buildable ? '' : ', not reachable yet'}`}`;
    roads.push(`<g class="${cls}${mil && !built ? ' faded' : ''}" data-road="${r.id}" role="button" tabindex="${buildable ? 0 : -1}" aria-label="${attr(rname)}">${g}</g>`);
  }
  out.push(roads.join(''));
  if (cmpRival) out.push(rivalLayer(P));
  const tg = tutTarget();
  if (tg?.road !== undefined) {
    const r = sc.roads[tg.road]!, A = P[r.a]!, Bp = P[r.b]!;
    out.push(`<path d="M${n1(A.x)},${n1(A.y)} L${n1(Bp.x)},${n1(Bp.y)}" class="tutglow"/>`);
  }
  if (tg?.town !== undefined) out.push(`<circle cx="${n1(P[tg.town]!.x)}" cy="${n1(P[tg.town]!.y + 4)}" r="${n1(40 * u)}" class="tutring"/>`);

  // ---- towns
  const towns: string[] = [], labels: string[] = [];
  const nameDx = new Map<number, number>(), nameDy = new Map<number, number>();
  // what a town's event pill must not cover (board units): every other town's name, stars and settlement
  type Box = { x0: number; y0: number; x1: number; y1: number; t: number };
  const obstacles: Box[] = [], placed: Box[] = [];
  const over = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  // each town's settlement-and-row box first: a name must not sit on a neighbour's stars and coins
  const rowBox = new Map<number, Box>(), starBox = new Map<number, Box>(); // starBox: just the stars and coins
  for (const t of v.towns) {
    const { x, y } = P[t.id]!, isC = t.id === sc.castra, z = isC ? { top: 30, bottom: 26 } : settlementSize(townValue(s, t));
    const sh = shores(sc), nb = isC ? 0 : (sh.coast[t.id] ? 1 : 0) + (sh.frontier[t.id] ? 1 : 0), tv = townValue(s, t);
    const rowHalf = isC ? 0 : (tv * 12.4 + (townIncome(sc, tv) ? 6 + townIncome(sc, tv) * 12 : 0) + (nb ? 5 + nb * 15 : 0)) / 2;
    rowBox.set(t.id, { x0: x - u * Math.max(z.top, rowHalf), x1: x + u * Math.max(z.top, rowHalf), y0: y - u * z.top, y1: y + u * (z.bottom + 18), t: t.id });
    if (!isC) starBox.set(t.id, { x0: x - u * rowHalf, x1: x + u * rowHalf, y0: y + u * (z.bottom + 4), y1: y + u * (z.bottom + 18), t: t.id });
  }
  // names: centred above the settlement unless that covers a neighbour's stars and coins, or its name;
  // then slid sideways (art units) to the spot with the least overlap, preferring small slides
  const names: Box[] = [];
  // a slid name must stay inside the envelope of the centred labels and rows (what the camera frames)
  let envL = Infinity, envR = -Infinity;
  for (const t of v.towns) {
    const { x } = P[t.id]!, nw = (t.id === sc.castra ? 6 : t.name.length) * 14 * 0.62 + 8, rb = rowBox.get(t.id)!;
    envL = Math.min(envL, x - (u * nw) / 2, rb.x0); envR = Math.max(envR, x + (u * nw) / 2, rb.x1);
  }
  const dx0 = (b: Box) => b.x0 < envL || b.x1 > envR;
  for (const t of v.towns) {
    const { x, y } = P[t.id]!, isC = t.id === sc.castra, z = isC ? { top: 30, bottom: 26 } : settlementSize(townValue(s, t));
    const nw = (isC ? 6 : t.name.length) * 14 * 0.62 + 8, ny = y + u * (isC ? -30 : -z.top - 4);
    const below = isC ? 0 : z.bottom + 34 + z.top + 4; // from above the settlement to under its stars row
    const at = (dx: number, dy = 0): Box => ({ x0: x + u * (dx - nw / 2), x1: x + u * (dx + nw / 2), y0: ny + u * (dy - 13), y1: ny + u * (dy + 4), t: t.id });
    const cost = (b: Box) => [...starBox.values()].reduce((n, o) => n + (o.t !== t.id ? over(b, o) : 0), 0) + names.reduce((n, o) => n + over(b, o), 0)
      + (dx0(b) ? 1e6 : 0);
    const c0 = at(0);
    let best = 0, bestC = cost(c0);
    let bestY = 0;
    // then sideways, then under the stars row (a town right below a neighbour cannot slide out of its row)
    if (!isC && bestC > 0) for (const [dx, dy] of [[10, 0], [-10, 0], [20, 0], [-20, 0], [30, 0], [-30, 0], [40, 0], [-40, 0], [0, below], [10, below], [-10, below], [20, below], [-20, below]] as const) {
      const c = cost(at(dx, dy)) + Math.abs(dx) * 0.01 + (dy ? 0.5 : 0); if (c < bestC) { best = dx; bestY = dy; bestC = c; }
    }
    nameDx.set(t.id, best); nameDy.set(t.id, bestY);
    const b = at(best, bestY); names.push(b);
    if (bestY) placed.push(b); // under its own row: the town's own event pill must avoid it too
    obstacles.push(b, rowBox.get(t.id)!); // name, then settlement and its row
  }
  // road price milestones and rubble badges, at each unbuilt road's midpoint: an event pill must not cover them
  for (const r of sc.roads) {
    if (s.built[r.id]) continue;
    const A = P[r.a]!, Bp = P[r.b]!, mx = (A.x + Bp.x) / 2, my = (A.y + Bp.y) / 2, hw = s.rubble[r.id] ? 18 : 10;
    obstacles.push({ x0: mx - u * hw, x1: mx + u * hw, y0: my - u * 12, y1: my + u * 11, t: -1 });
  }
  const hits = (b: Box, own: number) => b.x0 < fr0.x || b.x1 > fr0.x + fr0.w || b.y0 < fr0.y || b.y1 > fr0.y + fr0.h || obstacles.some((o) => o.t !== own && o.x0 < b.x1 && b.x0 < o.x1 && o.y0 < b.y1 && b.y0 < o.y1)
    || placed.some((o) => o.x0 < b.x1 && b.x0 < o.x1 && o.y0 < b.y1 && b.y0 < o.y1);
  for (const t of v.towns) {
    const { x, y } = P[t.id]!, isC = t.id === sc.castra;
    const lab0 = labels.length;
    const here = s.legions.map((p, i) => (p === t.id ? i : -1)).filter((i) => i >= 0);
    const dim = moveSet && !moveSet.has(t.id) && !here.includes(moving!);
    let g = `<circle cx="${n1(x)}" cy="${n1(y + 4)}" r="30" class="thit"/>`;
    if (isC) {
      g += `<g transform="translate(${n1(x)},${n1(y)})">${castraIcon()}</g>`;
      labels.push(`<text x="${n1(x)}" y="${n1(y - 30)}" class="tname">Castra</text>`);
    } else {
      const tv = townValue(s, t), z = settlementSize(tv), besieged = (s.siege[t.id] ?? 0) > 0;
      if (mil && prot[t.id]) g += `<ellipse cx="${n1(x)}" cy="${n1(y + 6)}" rx="${z.top + 6}" ry="${z.bottom + 6}" class="halo"/>`;
      if (s.garrison[t.id]) g += `<ellipse cx="${n1(x)}" cy="${n1(y + 6)}" rx="${z.top + 10}" ry="${z.bottom + 9}" class="garrison"/>`;
      if (sel === t.id) g += `<ellipse cx="${n1(x)}" cy="${n1(y + 6)}" rx="${z.top + 4}" ry="${z.bottom + 5}" class="selring"/>`;
      g += `<g transform="translate(${n1(x)},${n1(y)})">${settlement(tv, sup[t.id]! || besieged, TRIBE_ART[t.tribe % TRIBE_ART.length]!)}</g>`;
      if (besieged) g += `<path d="M${n1(x - 6)},${n1(y - 4)} c-8,-9 6,-14 -1,-24 c-7,-9 6,-13 0,-22" class="smoke"/>${flame(x - 8, y - 2, 0.9)}${flame(x + 9, y + 2, 0.8)}<g class="siegebadge" transform="translate(${n1(x + z.top - 2)},${n1(y - 14)})"><circle r="10"/><text y="4.4">${s.siege[t.id]}</text></g>`;
      else if (stranded.has(t.id)) g += `<g class="warnbadge" transform="translate(${n1(x + z.top - 2)},${n1(y - 14)})"><circle r="10"/><text y="4.6">!</text></g>`;
      const boom = ev.some((e) => e.effect.type === 'boom' && e.town === t.id);
      // stars (glory per turn) and coins (denarii per turn), side by side, centred; ghosts = coming from an event
      const inc = townIncome(sc, tv), incNext = boom ? townIncome(sc, tv + 1) : inc;
      const sh = shores(sc);
      const badges = [sh.coast[t.id] && 'port', sh.frontier[t.id] && 'frontier'].filter(Boolean) as Array<'port' | 'frontier'>;
      // the town's row: stars (glory), coins (denarii), then what kind of place it is (port, frontier)
      const nStars = tv + (boom ? 1 : 0), nCoins = Math.max(inc, incNext), SW = 12.4, CW = 12, BW = 15, gap = nCoins ? 6 : 0;
      const total = nStars * SW + gap + nCoins * CW, x0 = x - total / 2, sy = y + z.bottom + 16;
      const starTip = `${t.name}: ${tv}★, pays ${townGlory(sc, t, tv)} glory a turn once linked${tv > t.value ? ` (+${tv - t.value}★ from silver)` : ''}${boom ? '; a coming event adds 1★' : ''}`;
      const coinTip = `${t.name} pays ${inc} denarii a turn once linked (towns of 3★ and more pay ★ − 2)${incNext > inc ? `; after the coming event, ${incNext}` : ''}`;
      const coinsSvg = Array.from({ length: nCoins }, (_, k) => {
        const cx = x0 + nStars * SW + gap + k * CW + CW / 2;
        return `<g class="tcoin${k >= inc ? ' ghost' : ''}"><circle cx="${n1(cx)}" cy="${n1(sy - 4.6)}" r="5.2"/><text x="${n1(cx)}" y="${n1(sy - 2.3)}">D</text></g>`;
      }).join('');
      // port/frontier badges: right of the stars row; if that covers a road price or a neighbour, left of it, then beside the name
      const bw = badges.length * BW, nameW = t.name.length * 14 * 0.62, ny0 = -z.top - 9 + (nameDy.get(t.id) ?? 0);
      const ndx = nameDx.get(t.id) ?? 0, bspots: Array<[number, number]> = [[total / 2 + 5, sy - y - 4.6], [-total / 2 - 5 - bw, sy - y - 4.6], [ndx - nameW / 2 - 4 - bw, ny0], [ndx + nameW / 2 + 4, ny0]];
      const bbox = ([dx, dy]: [number, number]): Box => ({ x0: x + u * (dx - 1), x1: x + u * (dx + bw + 1), y0: y + u * (dy - 8), y1: y + u * (dy + 8), t: t.id });
      // least-bad spot: covering a road price costs most, then leaving the frame, then touching a neighbour's label
      const cost = (b: Box) => (b.x0 < fr0.x || b.x1 > fr0.x + fr0.w || b.y0 < fr0.y || b.y1 > fr0.y + fr0.h ? 5 : 0)
        + obstacles.reduce((n, o) => n + (o.t !== t.id && o.x0 < b.x1 && b.x0 < o.x1 && o.y0 < b.y1 && b.y0 < o.y1 ? (o.t === -1 ? 10 : 1) : 0), 0)
        + placed.reduce((n, o) => n + (o.x0 < b.x1 && b.x0 < o.x1 && o.y0 < b.y1 && b.y0 < o.y1 ? 2 : 0), 0);
      const bspot = badges.length ? bspots.map((sp, k) => ({ sp, c: cost(bbox(sp)) + k * 0.01 })).sort((a, b) => a.c - b.c)[0]!.sp : bspots[0]!;
      if (badges.length) placed.push(bbox(bspot));
      const badgeSvg = badges.map((b, k) => `<g class="tipme shorebadge" data-tip="${attr(b === 'port' ? `${t.name} is a port (its land meets the sea): pirates can strike its roads, and some decrees reward ports.` : `${t.name} is on the frontier (by the mountains at the edge of the map): Germanic warbands can strike its roads, and some decrees reward frontier forts.`)}"><g transform="translate(${n1(x + bspot[0] + k * BW + BW / 2)},${n1(y + bspot[1])}) scale(.74)">${(b === 'port' ? MINI.anchor : MINI.tower)!(0, 0)}</g></g>`).join('');
      labels.push(`<text x="${n1(x + (nameDx.get(t.id) ?? 0))}" y="${n1(y - z.top - 4 + (nameDy.get(t.id) ?? 0))}" class="tname${sup[t.id] ? '' : ' off'}${t.name.length > 12 ? ' long' : ''}">${t.name}</text>` +
        badgeSvg +
        `<g class="tipme" data-tip="${attr(starTip)}"><text x="${n1(x0)}" y="${n1(sy)}" class="tstars" style="text-anchor:start">${'★'.repeat(t.value)}${tv > t.value ? `<tspan class="boom">${'★'.repeat(tv - t.value)}</tspan>` : ''}${boom ? '<tspan class="ghost">★</tspan>' : ''}</text></g>` +
        (nCoins ? `<g class="tipme" data-tip="${attr(coinTip)}">${coinsSvg}</g>` : ''));
      const ic = icons.get(t.id);
      if (ic?.length) {
        // the pill goes under the stars, unless that covers a neighbour's name: then right, left, or above the name
        const w = ic.length * 22, side = z.top + 16 + w / 2;
        const spots = [[0, z.bottom + 33], [side, 6], [-side, 6], [0, -z.top - 30]] as const;
        const boxAt = ([dx, dy]: readonly [number, number]): Box => ({ x0: x + u * (dx - w / 2 - 3), x1: x + u * (dx + w / 2 + 3), y0: y + u * (dy - 11), y1: y + u * (dy + 11), t: t.id });
        const spot = spots.find((sp) => !hits(boxAt(sp), t.id)) ?? spots[0];
        placed.push(boxAt(spot));
        const px = x + spot[0], yy = y + spot[1];
        let row = `<rect x="${n1(px - w / 2 - 3)}" y="${n1(yy - 11)}" width="${w + 6}" height="22" rx="11" class="pill"/>`;
        ic.forEach((it, k) => { const cx = px - w / 2 + 11 + k * 22; row += `<g class="tipme" data-tip="${attr(iconTip(it.kind, it.now))}"><circle cx="${n1(cx)}" cy="${n1(yy)}" r="10" class="${it.now ? 'evnow' : 'evnext'} ${ICON_TONE[it.kind] ?? 't'}"/>${MINI[it.kind]!(cx, yy)}</g>`; });
        labels.push(`<g class="evrow">${row}</g>`);
      }
    }
    if (labels.length > lab0) labels.splice(lab0, labels.length - lab0, about(x, y, labels.slice(lab0).join('')));
    // standards: one per legion here, to the right of the settlement
    const sz = isC ? 30 : settlementSize(townValue(s, t)).top;
    const flags = here.map((i, k) => {
      const fx2 = x + sz * 0.8 + 4 + k * 17, fy = y + 6;
      return `<g class="standard ${s.moved[i] ? 'done' : ''} ${moving === i ? 'active' : ''} ${tutTarget()?.legion === i ? 'tutpulse' : ''}" data-leg="${i}">` +
        (tutTarget()?.legion === i ? `<circle cx="${n1(fx2 + 4)}" cy="${n1(fy - 14)}" r="26" class="tutring"/>` : '') +
        `<rect class="leghit" x="${n1(fx2 - 11)}" y="${n1(fy - 36)}" width="30" height="46"/><line x1="${n1(fx2)}" y1="${n1(fy + 8)}" x2="${n1(fx2)}" y2="${n1(fy - 28)}"/>` +
        `<circle cx="${n1(fx2)}" cy="${n1(fy - 30)}" r="3.4" class="eagle"/>` +
        `<path d="M${n1(fx2)},${n1(fy - 24)} h15 v12 l-7.5,-3 l-7.5,3 z" style="fill:${LEGION_COL[i % LEGION_COL.length]}"/>` +
        `<text x="${n1(fx2 + 7.5)}" y="${n1(fy - 15)}">${ROMAN[i] ?? i + 1}</text></g>`;
    }).join('');
    const tlabel = isC ? 'Castra, your camp' : `${t.name}, ${pl(townValue(s, t), 'star')}, ${sup[t.id] ? 'linked to Rome' : 'not linked'}${(s.siege[t.id] ?? 0) > 0 ? `, besieged: burns in ${pl(s.siege[t.id]!, 'turn')}` : ''}${here.length ? `, ${pl(here.length, 'legion')} here` : ''}`;
    towns.push(`<g class="town ${sup[t.id] ? 'sup' : 'unsup'} ${sel === t.id ? 'sel' : ''} ${dim ? 'dim' : ''}" data-town="${t.id}" role="button" tabindex="0" aria-label="${attr(tlabel)}">${about(x, y, g + flags)}</g>`);
  }
  out.push(stones.join(''), towns.join(''), `<g class="labels">${labels.join('')}</g>`);
  const vb = vbStr(camBox(frame(v)));
  return `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet" id="map" class="${mil ? 'mil' : ''} ${moveSet ? 'moving' : ''}${confirmEnd ? ' confirming' : ''}" style="--u:${u.toFixed(3)}">` +
    `<defs>${defs.join('')}${boardTheme() === 'egypt' ? '<pattern id="rainHatch" width="14" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)"><line x1="0" y1="3" x2="9" y2="3" stroke="#a8762e" stroke-width="1.6" opacity=".7" stroke-linecap="round"/><line x1="6" y1="8" x2="12" y2="8" stroke="#f3dca0" stroke-width="1.2" opacity=".9" stroke-linecap="round"/></pattern><pattern id="snowHatch" width="16" height="12" patternUnits="userSpaceOnUse"><path d="M1,4 q4,-3 8,0 t8,0" stroke="#fff3d6" stroke-width="1.3" fill="none" opacity=".85"/></pattern>' : '<pattern id="rainHatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(25)"><line x1="0" y1="0" x2="0" y2="7" stroke="#2f6f9f" stroke-width="1.6" opacity=".75"/><line x1="6" y1="5" x2="6" y2="10" stroke="#bfe0f5" stroke-width="1.2" opacity=".9"/></pattern><pattern id="snowHatch" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r="1.6" fill="#fff" opacity=".85"/><circle cx="10" cy="10" r="1.2" fill="#fff" opacity=".8"/><circle cx="11" cy="2" r=".9" fill="#fff" opacity=".7"/></pattern>'}<pattern id="dryHatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)"><path d="M0,8 l4,-2 3,3 4,-2" stroke="#7a5a2a" stroke-width="1.2" fill="none" opacity=".55"/></pattern></defs>` +
    `<g transform="scale(${1 / K})">${out.join('')}</g></svg>`;
}

/** Roads one cut event would destroy if it struck the network as it stands now. */
function wouldCut(e: GameEvent): number {
  if (e.effect.type !== 'cut') return 0;
  const p = e.effect.pierce === 'all' ? new Array<boolean>(sc.towns.length).fill(false) : protectedTowns(sc, s, e.effect.pierce === 'garrison');
  return roadsCutBy(sc, s, e.tribe, e.effect.mode, p, e.effect.where).length;
}

/**
 * The forecast as one strip of the day's ten turns. Played and unforeseen turns are narrow numbers;
 * the foreseen turns (this one and the next, or more under a decree) hold one icon per event, ringed
 * in its tribe's colour, with ⚠N when it would cut N of your roads now. Tap or hover an icon for the
 * full text. Effects in force sit on the current turn. Open gambit offers get one line below.
 */
function forecast(): string {
  const ev = visibleEvents(sc, s.turn, s);
  const T = sc.rules.turns, horizon = s.turn + sc.rules.eventLookahead - 1;
  const left = (until: number) => { const n = until - s.turn + 1; return `${n} turn${n > 1 ? 's' : ''} left`; };
  const tribeCol = (t: number) => TRIBE_ART[t % TRIBE_ART.length]!;
  const chip = (icon: string, tip: string, tone: string, tribe: number | null, badge = '', extra = '') =>
    `<button type="button" class="chip ${tone}${extra}" data-tip="${attr(tip)}"${tribe !== null ? ` data-hl="${tribe}" style="--tc:${tribeCol(tribe)}"` : ''}>${icon}${tribe !== null ? `<i>${sc.tribes[tribe] ? TRIBE_SYM[tribe % TRIBE_SYM.length] : ''}</i>` : ''}${badge}</button>`;
  const plain = (h: string) => h.replace(/<[^>]+>/g, '');
  const offers = gambitOffers(sc, s);
  const evChip = (e: GameEvent) => {
    const when = e.turn === s.turn ? 'at the end of this turn' : e.turn === s.turn + 1 ? 'at the end of next turn' : `at the end of turn ${e.turn}`;
    const tribe = sc.tribes[e.tribe]!;
    if (e.from !== undefined) {
      const g = evSpec(sc.events[e.from]!.kind);
      const n = wouldCut(e);
      return chip(evEmoji(e.kind) ?? '⚖️', `${g?.title ?? 'Gambit'} (accepted), ${tribe.name}, ${when}: ${e.note}.${isThreat(e) ? (n ? ` As things stand: ${n} road${n > 1 ? 's' : ''} cut.` : ' Your roads are safe.') : ''}`, isThreat(e) ? 'threat' : 'gambit', e.tribe, isThreat(e) ? (n ? `<b class="bad">${n}</b>` : '<b class="ok">✓</b>') : '');
    }
    const spec = evSpec(e.kind), tone = e.effect.type === 'gambit' ? 'gambit' : spec?.tone ?? 'threat';
    const text = spec ? plain(spec.text({ who: tribe.name, town: e.town !== undefined ? sc.towns[e.town]!.name : '', when })) : e.kind;
    if (e.effect.type === 'gambit') {
      const i = sc.events.indexOf(e), st = (s.accepted ?? []).includes(i) ? ' (accepted)' : declined.has(i) ? ' (declined)' : offers.includes(i) ? ' Accept or decline it below.' : '';
      return chip(evEmoji(e.kind) ?? '⚖️', `${spec?.title ?? 'Gambit'}: ${text}${st}`, 'gambit', e.tribe, '', (s.accepted ?? []).includes(i) ? ' taken' : '');
    }
    const n = wouldCut(e);
    const risk = isThreat(e) ? (n ? ` As things stand: ${n} road${n > 1 ? 's' : ''} cut.` : ' Your roads are safe.') : '';
    const named = spec && text.toLowerCase().startsWith(spec.title.toLowerCase()) ? text : `${spec?.title ?? e.kind}: ${text}`;
    return chip(evEmoji(e.kind) ?? '•', `${named}${risk}`, tone, e.kind === 'idus' ? null : e.tribe, isThreat(e) ? (n ? `<b class="bad">${n}</b>` : '<b class="ok">✓</b>') : '');
  };
  const inForce = [
    ...(s.tolls ?? []).filter((x) => s.turn <= x.until).map((x) => {
      const which = x.terrain ? `${(x.terrain as string[]).join(' and ')} roads` : 'roads';
      return x.surcharge < 0
        ? chip('🫒', `In force: ${which} touching ${sc.tribes[x.tribe]!.name} towns cost ${x.surcharge} (${left(x.until)}).`, 'boon now', x.tribe)
        : chip(x.terrain ? '❄️' : '🌧️', `In force: ${which} touching ${sc.tribes[x.tribe]!.name} towns cost +${x.surcharge} (${left(x.until)}).`, 'hardship now', x.tribe);
    }),
    ...(s.levies ?? []).filter((x) => s.turn <= x.until).map((x) => chip('🏺', `In force: legions and garrisons cost +${x.surcharge} (${left(x.until)}).`, 'hardship now', null)),
  ];
  // played turns and unforeseen turns collapse into one small cell each ("1–2", "5–10")
  const span = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);
  const cells = [
    s.turn > 1 ? `<div class="cell past" title="Turns played">${span(1, Math.min(T, s.turn - 1))}</div>` : '',
    ...Array.from({ length: Math.max(0, Math.min(T, horizon) - s.turn + 1) }, (_, k) => {
      const t = s.turn + k;
      const chips = [...(t === s.turn ? inForce : []), ...ev.filter((e) => e.turn === t).map(evChip)];
      return `<div class="cell ${t === s.turn ? 'cur' : 'seen'}"><span class="tn">${t === s.turn ? `Turn ${t}` : t === s.turn + 1 ? 'Next' : `Turn ${t}`}</span><span class="chips">${chips.join('') || '<span class="quiet">quiet</span>'}</span></div>`;
    }),
    horizon < T ? `<div class="cell fog" title="Not yet foreseen: the forecast sees ${sc.rules.eventLookahead} turns ahead">${span(horizon + 1, T)}</div>` : '',
  ].join('');
  const offerRows = ev.filter((e) => e.effect.type === 'gambit').map((e) => gambitLine(e, e.turn === s.turn ? 'at the end of this turn' : 'at the end of next turn', offers)).join('');
  return `<div class="strip" aria-label="Forecast">${cells}</div>${offerRows}`;
}

/** A price in denarii: green when affordable now, red when not. */
const costTag = (n: number) => `<span class="price ${s.denarii >= n ? 'ok' : 'no'}">${COIN}${n}<span class="pw" data-noico> ${n === 1 ? 'denarius' : 'denarii'}</span></span>`;

function townPanel(): string {
  if (sel === null) return '';
  const t = sc.towns[sel]!, sup = supplied(sc, s);
  const tribe = t.tribe >= 0 ? tribeTag(t.tribe, ' tribe') : tribeTag(-1);
  const btns: string[] = [];
  s.legions.forEach((p, i) => {
    if (p === t.id) return;
    const ok = !checkAction(sc, s, { type: 'camp', legion: i, town: t.id });
    if (ok) btns.push(`<button data-camp="${i}" class="legbtn" style="--leg:${LEGION_COL[i % LEGION_COL.length]}"><span class="legtag">${ROMAN[i] ?? i + 1}</span>March from ${sc.towns[p]!.name}</button>`);
  });
  if (t.id !== sc.castra && !s.garrison[t.id])
    btns.push(`<button data-garrison ${checkAction(sc, s, { type: 'garrison', town: t.id }) ? 'disabled' : ''}>Build garrison ${costTag(garrisonCost(sc, s, t.id))}</button>`); // this town's price: a decree's garrison deal makes some towns cheaper
  const here = s.legions.filter((p) => p === t.id).length;
  return `<div class="panel"><b>${t.name}</b> ${tribe} <span class="muted">${t.value ? ` · ${'★'.repeat(townValue(s, t))} glory${townIncome(sc, townValue(s, t)) ? ` + ${townIncome(sc, townValue(s, t))} denarii` : ''}/turn` : ''} · ${sup[t.id] ? 'supplied' : 'not connected'}</span>
    ${here && t.id !== sc.castra ? `<div class="muted">${here === 1 ? 'A legion is' : `${here} legions are`} camped here: roads touching this town are shielded.</div>` : ''}
    ${s.garrison[t.id] ? '<div class="muted">Garrisoned: roads touching this town and its neighbours are shielded.</div>' : ''}
    <div class="btns">${btns.join('') || `<span class="muted">No orders available here${s.legions.some((p) => p !== t.id) ? ` (legions march at most ${sc.rules.legionRange} roads per turn, once)` : ''}.</span>`}</div></div>`;
}

// ---- results chart: score after each turn, you vs Caesar vs rivals
// fixed order: you, Caesar, then one colour per rival *slot* (validated on the card surface #fbf6ea, dataviz validator: CVD ΔE ≥ 9.1)
const SERIES_COL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
type Line = { name: string; curve: number[]; col: string; you?: boolean; dash?: boolean; rival?: string };

// ---- which rivals the charts draw. Both charts (Turn by turn, Your record) share one selection, kept on this device.
// A rival sits in a fixed slot, so its colour never changes when another is hidden or added ("colour follows the entity").
// Tapping a rival's legend chip hides it (it keeps its slot and can be tapped back on); "+ Add" searches your rivals.
const MAX_SHOWN = 4; // past 4 rival lines (6 with You and Caesar) a chart stops being readable
type Slot = { name: string; on: boolean } | null;
let slots: Slot[] | null = null; // null: never chosen on this device, use the default
let pickOpen: 'turn' | 'record' | null = null;
const slotKey = () => `arlr.chartRivals.${day?.username ?? ''}`;
const rivalNames = () => (day?.rivals ?? []).map((r) => r.username);
/** Default: the best three rivals today, then those who played most in the last week. */
function defaultSlots(): Slot[] {
  const today = (day?.rivals ?? []).filter((r) => r.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((r) => r.username);
  const freq = new Map<string, number>();
  for (const d of history ?? []) for (const r of d.rivals) freq.set(r.username, (freq.get(r.username) ?? 0) + 1);
  const often = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const names = [...new Set([...today, ...often])].filter((n) => rivalNames().includes(n)).slice(0, 3);
  return Array.from({ length: MAX_SHOWN }, (_, k) => (names[k] ? { name: names[k]!, on: true } : null));
}
/** The slots in use: the player's choice (minus rivals no longer followed), else the default. */
function chartSlots(): Slot[] {
  if (!slots) {
    try { const v = JSON.parse(localStorage.getItem(slotKey()) ?? 'null') as unknown; if (Array.isArray(v) && v.length === MAX_SHOWN) slots = v as Slot[]; } catch { /* storage unavailable */ }
  }
  const followed = new Set(rivalNames());
  return (slots ?? defaultSlots()).map((x) => (x && followed.has(x.name) ? x : null));
}
function setSlots(next: Slot[]) {
  slots = next;
  try { localStorage.setItem(slotKey(), JSON.stringify(next)); } catch { /* storage unavailable */ }
}
const slotCol = (k: number) => SERIES_COL[2 + k]!;
/** Show a rival on the charts: a free slot, else the first hidden one. False when 4 are already shown. */
function addToChart(name: string): boolean {
  const cur = chartSlots();
  if (cur.some((x) => x?.name === name)) { setSlots(cur.map((x) => (x?.name === name ? { name, on: true } : x))); return true; }
  let k = cur.indexOf(null);
  if (k < 0) k = cur.findIndex((x) => x && !x.on);
  if (k < 0) return false;
  cur[k] = { name, on: true };
  setSlots(cur);
  return true;
}
/** The legend's rival chips (tap to hide or show) and the "+ Add" search, for one chart. `drawn`: rivals that chart has data for. */
function rivalLegend(where: 'turn' | 'record', drawn: Set<string>): string {
  if (!day?.username || !(day.rivals ?? []).length) return '';
  const chips = chartSlots().map((x, k) => {
    if (!x) return '';
    const nodata = x.on && !drawn.has(x.name);
    return `<button type="button" class="lg rchip${x.on ? '' : ' off'}${nodata ? ' nodata' : ''}" data-chip="${esc(x.name)}" aria-pressed="${x.on}" title="${x.on ? 'Hide from the chart' : 'Show on the chart'}"><i style="background:${slotCol(k)}"></i>${esc(x.name)}${nodata ? ` <span class="muted">${where === 'turn' ? '(not played)' : '(no days)'}</span>` : ''}</button>`;
  }).join('');
  const more = (day.rivals ?? []).length > chartSlots().filter((x) => x?.on).length;
  const add = more ? `<button type="button" class="lg rchip addchip" data-pickopen="${where}" aria-expanded="${pickOpen === where}">+ Add rival</button>` : '';
  const pop = pickOpen === where ? `<div class="rpick" data-pick="${where}"><input type="search" class="rpickq" placeholder="Search your ${(day.rivals ?? []).length} rivals" autocomplete="off" maxlength="23"><div class="rpicklist"></div><div class="muted small rpicknote">Up to ${MAX_SHOWN} rivals on the charts; tap a name in the legend to hide it.</div></div>` : '';
  return chips + add + pop;
}
/** Matches for the search box (rivals not shown yet first), as buttons. */
function pickMatches(q: string): string {
  const shown = new Set(chartSlots().filter((x) => x?.on).map((x) => x!.name));
  const ql = q.trim().toLowerCase();
  const list = (day?.rivals ?? []).filter((r) => !shown.has(r.username) && r.username.toLowerCase().includes(ql))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.username.localeCompare(b.username)).slice(0, 8);
  if (!list.length) return `<div class="muted small">${ql ? 'No rival by that name.' : 'All your rivals are on the chart.'}</div>`;
  return list.map((r) => `<button type="button" class="rpickrow" data-pickadd="${esc(r.username)}">${avatar(r.username)}<span class="rpn">${esc(r.username)}</span><span class="muted">${r.score !== null ? `${r.score} today` : 'not played today'}</span></button>`).join('');
}
function wireRivalPicker() {
  root.querySelectorAll<HTMLButtonElement>('[data-chip]').forEach((b) => (b.onclick = () => {
    const name = b.dataset.chip!;
    setSlots(chartSlots().map((x) => (x?.name === name ? { name, on: !x.on } : x)));
    render();
  }));
  root.querySelectorAll<HTMLButtonElement>('[data-pickopen]').forEach((b) => (b.onclick = () => {
    const w = b.dataset.pickopen as 'turn' | 'record';
    pickOpen = pickOpen === w ? null : w;
    render();
  }));
  const box = root.querySelector<HTMLElement>('.rpick');
  if (!box) return;
  const q = box.querySelector<HTMLInputElement>('.rpickq')!, list = box.querySelector<HTMLElement>('.rpicklist')!;
  // typing filters in place: a full render would drop the keyboard focus on phones
  const fill = () => {
    list.innerHTML = pickMatches(q.value);
    list.querySelectorAll<HTMLButtonElement>('[data-pickadd]').forEach((b) => (b.onclick = () => {
      if (!addToChart(b.dataset.pickadd!)) { box.querySelector('.rpicknote')!.textContent = `${MAX_SHOWN} rivals are already on the chart: tap one in the legend to hide it first.`; return; }
      pickOpen = null; render();
    }));
  };
  q.oninput = fill; fill();
  q.onkeydown = (e) => { if (e.key === 'Escape') { pickOpen = null; render(); } };
  q.focus({ preventScroll: true });
}
let chartLines: Line[] = [];
function chartLinesFor(fin: State, myCurve?: number[]): Line[] {
  const lines: Line[] = [{ name: 'You', curve: myCurve ?? scoreCurve(sc, fin), col: SERIES_COL[0]!, you: true }];
  // your best practice run, when it beats the run shown as yours
  const pb = sk ? (day?.skirmish?.records[sk.entry.id] ? { total: day.skirmish.records[sk.entry.id]!.best, curve: day.skirmish.records[sk.entry.id]!.curve } : null) : day?.practice?.best;
  if (pb && pb.curve.length === lines[0]!.curve.length && pb.total > lines[0]!.curve.at(-1)!) lines.push({ name: 'Your best', curve: pb.curve, col: SERIES_COL[0]!, dash: true });
  const caesar = sk ? sk.entry.curve : dailyScenario(dateLabel, sc.decree.faction).parCurve;
  if (caesar) lines.push({ name: 'Caesar', curve: caesar, col: SERIES_COL[1]! });
  if (sk) return lines; // skirmish: no rivals on the chart
  const me = day?.username?.toLowerCase();
  chartSlots().forEach((x, k) => {
    const r = x?.on ? (day?.rivals ?? []).find((y) => y.username === x.name && y.curve && y.username.toLowerCase() !== me) : undefined;
    if (r) lines.push({ name: esc(r.username), curve: r.curve!, col: slotCol(k), rival: r.username });
  });
  return lines;
}
function chartSection(fin: State, myCurve?: number[]): string {
  const lines = (chartLines = chartLinesFor(fin, myCurve));
  const T = sc.rules.turns, W = 480, H = 250, L = 34, R = 96, Tp = 12, B = 28;
  const max = Math.max(10, ...lines.flatMap((l) => l.curve));
  const step = max > 300 ? 100 : max > 120 ? 50 : 20, top = Math.ceil(max / step) * step;
  const X = (i: number) => L + (i * (W - L - R)) / (T + 1); // 0 = start, 1..T = turns, T+1 = dusk
  const Y = (v: number) => Tp + (H - Tp - B) * (1 - v / top);
  const pts = (c: number[]) => [0, ...c].map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  let g = '';
  for (let v = 0; v <= top; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L - 6}" y="${Y(v) + 4}" class="ytick">${v}</text>`;
  for (let i = 1; i <= T + 1; i++) g += `<text x="${X(i)}" y="${H - B + 16}" class="xtick">${i <= T ? i : 'End'}</text>`;
  // losses on your line: turns where roads were cut, towns burned or legions lost
  const losses = fin.history.map((h, k) => ({ k, cut: h.cut.length, burned: h.burned.length, lost: h.lostLegions.length })).filter((x) => x.cut || x.burned || x.lost);
  for (const ln of [...lines].reverse()) g += `<polyline points="${pts(ln.curve)}" class="ln${ln.you ? ' you' : ''}${ln.dash ? ' dash' : ''}" style="stroke:${ln.col}"/>`;
  const you = lines[0]!;
  for (const x of losses) g += `<g class="loss"><circle cx="${X(x.k + 1)}" cy="${Y(you.curve[x.k]!)}" r="5.5" style="stroke:${you.col}"/><path d="M${X(x.k + 1) - 2.5},${Y(you.curve[x.k]!) - 2.5} l5,5 m0,-5 l-5,5"/></g>`;
  // direct labels at the end, spread so they never overlap
  const ends = lines.map((l) => ({ l, y: Y(l.curve.at(-1)!) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) ends[k]!.y = Math.max(ends[k]!.y, ends[k - 1]!.y + 14);
  for (const e of ends) {
    const ey = Y(e.l.curve.at(-1)!);
    g += `<line x1="${X(T + 1) + 4}" y1="${ey}" x2="${X(T + 1) + 12}" y2="${e.y}" class="leader"/><circle cx="${X(T + 1) + 17}" cy="${e.y}" r="3.5" style="fill:${e.l.col}"/><text x="${X(T + 1) + 24}" y="${e.y + 4}" class="endlab">${e.l.name} ${e.l.curve.at(-1)}</text>`;
  }
  g += `<line class="cross" x1="0" x2="0" y1="${Tp}" y2="${H - B}" style="display:none"/><rect class="hover" x="${L}" y="${Tp}" width="${W - L - R}" height="${H - Tp - B}"/>`;
  // insight: where Caesar pulled away, and where you bled
  let insight = '';
  const c = lines.find((l) => l.name === 'Caesar');
  if (c) {
    const gain = (cv: number[], i: number) => cv[i]! - (i ? cv[i - 1]! : 0);
    let worst = -1, wd = 0;
    for (let i = 0; i < T; i++) { const d = gain(c.curve, i) - gain(you.curve, i); if (d > wd) { wd = d; worst = i; } }
    const parts: string[] = [];
    if (worst >= 0) parts.push(`Caesar pulled furthest ahead on <b>turn ${worst + 1}</b> (+${gain(c.curve, worst)} vs your +${gain(you.curve, worst)}).`);
    insight = parts.join(' '); // one sentence; the per-turn detail is in the table
  }
  if (losses.length) {
    const cut = losses.reduce((n, x) => n + x.cut, 0), burned = losses.reduce((n, x) => n + x.burned, 0), lost = losses.reduce((n, x) => n + x.lost, 0);
    const worstT = losses.reduce((a, x) => (x.cut + x.burned + x.lost > a.cut + a.burned + a.lost ? x : a));
    const what = [cut ? `${pl(cut, 'road')} cut` : '', burned ? `${pl(burned, 'town')} burned` : '', lost ? `${pl(lost, 'legion')} lost` : ''].filter(Boolean).join(', ');
    insight += ` You suffered ${what}${losses.length > 1 ? `, the worst on turn ${worstT.k + 1}` : ` on turn ${worstT.k + 1}`}.`;
  }
  const legend = lines.filter((l) => !l.rival).map((l) => `<span class="lg"><i class="${l.dash ? 'dash' : ''}" style="${l.dash ? `border-color:${l.col}` : `background:${l.col}`}"></i>${l.name}</span>`).join('')
    + (sk ? '' : rivalLegend('turn', new Set(lines.filter((l) => l.rival).map((l) => l.rival!))))
    + (losses.length ? '<span class="lg"><i class="lossk">✕</i>roads cut or towns lost</span>' : '');
  const rows = Array.from({ length: T + 1 }, (_, i) => `<tr><td>${i < T ? i + 1 : 'End'}</td>${lines.map((l) => `<td>${l.curve[i]} <span class="muted">(${(l.curve[i]! - (i ? l.curve[i - 1]! : 0)) >= 0 ? '+' : ''}${l.curve[i]! - (i ? l.curve[i - 1]! : 0)})</span></td>`).join('')}<td class="muted">${i < T ? [fin.history[i]?.cut.length ? `${fin.history[i]!.cut.length} cut` : '', fin.history[i]?.burned.length ? `${fin.history[i]!.burned.length} burned` : ''].filter(Boolean).join(', ') : ''}</td></tr>`).join('');
  return `<section class="rcard chart"><h3>Turn by turn</h3>
    <div class="lgrow2">${legend}</div>
    <div class="chartbox"><svg viewBox="0 0 ${W} ${H}" class="scorechart" role="img" aria-label="Score after each turn: ${lines.map((l) => `${l.name} ${l.curve.at(-1)}`).join(', ')}">${g}</svg><div class="tip" style="display:none"></div></div>
    ${insight ? `<p class="insight">${insight}</p>` : ''}
    <details><summary>Show as a table</summary><table class="ctab"><tr><th>Turn</th>${lines.map((l) => `<th>${l.name}</th>`).join('')}<th>Your losses</th></tr>${rows}</table></details>
    ${!c ? '<div class="muted small">Caesar\'s turn-by-turn record is not available for this day.</div>' : ''}
  </section>`;
}
function wireChart() {
  const svgEl = root.querySelector<SVGSVGElement>('.scorechart'), tip = root.querySelector<HTMLElement>('.chartbox .tip');
  const hover = svgEl?.querySelector<SVGRectElement>('.hover'), cross = svgEl?.querySelector<SVGLineElement>('.cross');
  if (!svgEl || !tip || !hover || !cross) return;
  const T = sc.rules.turns, W = 480, L = 34, R = 96;
  const show = (clientX: number) => {
    const box = svgEl.getBoundingClientRect(), x = ((clientX - box.left) / box.width) * W;
    const i = Math.max(1, Math.min(T + 1, Math.round(((x - L) * (T + 1)) / (W - L - R))));
    const cx = L + (i * (W - L - R)) / (T + 1);
    cross.setAttribute('x1', String(cx)); cross.setAttribute('x2', String(cx)); cross.style.display = '';
    tip.innerHTML = `<b>${i <= T ? `Turn ${i}` : 'End of the game'}</b>` + chartLines.map((l) => {
      const v = l.curve[i - 1]!, d = v - (i > 1 ? l.curve[i - 2]! : 0);
      return `<div><i style="background:${l.col}"></i>${l.name} <b>${v}</b> <span class="muted">${d >= 0 ? '+' : ''}${d}</span></div>`;
    }).join('');
    tip.style.display = '';
    const left = (cx / W) * box.width;
    tip.style.left = `${Math.min(box.width - 150, Math.max(0, left + 10))}px`;
  };
  hover.addEventListener('pointermove', (e) => show(e.clientX));
  hover.addEventListener('pointerdown', (e) => show(e.clientX));
  hover.addEventListener('pointerleave', () => { tip.style.display = 'none'; cross.style.display = 'none'; });
}

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
// ---- past campaigns: the last 7 days, and your record against Caesar and rivals
// ---- moderators: the Senate archives (stats.ts), a screen of its own over the results page
let statsOpen = false, statsData: ModStats | null = null, statsErr = '', bugsData: BugReport[] | null = null;
async function openStats() {
  statsOpen = true; statsErr = ''; render();
  const top = $('app').scrollTop;
  const [st, bugs] = await Promise.allSettled([social!.modStats!(), social!.bugs ? social!.bugs() : Promise.resolve(null)]);
  if (st.status === 'fulfilled') statsData = st.value; else statsErr = (st.reason as Error)?.message || 'unknown error';
  bugsData = bugs.status === 'fulfilled' ? bugs.value : null;
  if (statsOpen) { render(); $('app').scrollTop = top; }
}
function renderStats() {
  const keep = root.querySelector<HTMLElement>('.results.stats')?.scrollTop ?? 0;
  const today = day?.today ?? dateLabel;
  $('app').innerHTML = statsScreen(statsData, statsErr, today, bugsData);
  const page = root.querySelector<HTMLElement>('.results.stats');
  if (page && keep) page.scrollTop = keep;
  wireStats(root, statsData, today, {
    onBack: () => { statsOpen = false; render(); },
    onReload: () => { statsData = null; void openStats(); },
    rerender: () => render(),
    copy: copyText,
    bugs: bugsData,
    setBug: async (id, status) => {
      const r = await social?.bugStatus?.(id, status).catch(() => null);
      if (r && bugsData) bugsData = bugsData.map((b) => (b.id === id ? r : b));
      if (r && day) day = { ...day, bugsNew: Math.max(0, (day.bugsNew ?? 0) + (status === 'done' ? -1 : 1)) };
    },
  });
}
let history: HistoryDay[] | null = null;
let historyState: 'idle' | 'loading' | 'done' | 'error' = 'idle';
async function loadHistory() {
  if (!social || historyState !== 'idle') return;
  historyState = 'loading';
  try { history = await social.history(); historyState = 'done'; } catch { historyState = 'error'; }
  if (view === 'results') render();
}
function recordChart(days: HistoryDay[]): string {
  const asc = days.slice().reverse().filter((d) => d.par);
  if (asc.length < 2) return '';
  const pct = (v: number, d: HistoryDay) => Math.round((100 * v) / d.par!);
  const me = asc.map((d) => (d.me ? pct(d.me.total, d) : null));
  const played = new Set(asc.flatMap((d) => d.rivals.map((r) => r.username)));
  const picked = chartSlots().map((x, k) => (x?.on && played.has(x.name) ? { n: x.name, k } : null)).filter((x): x is { n: string; k: number } => !!x);
  const lines = [{ name: 'You', col: SERIES_COL[0]!, v: me, you: true },
    ...picked.map(({ n, k }) => ({ name: esc(n), col: slotCol(k), v: asc.map((d) => { const r = d.rivals.find((x) => x.username === n); return r ? pct(r.score, d) : null; }), you: false }))];
  const W = 420, H = 190, L = 36, R = 52, Tp = 10, B = 26;
  const all = lines.flatMap((l) => l.v.filter((x): x is number => x !== null));
  const top100 = Math.max(110, Math.ceil(Math.max(...all, 100) / 10) * 10);
  const X = (i: number) => L + (i * (W - L - R)) / Math.max(1, asc.length - 1), Y = (v: number) => Tp + (H - Tp - B) * (1 - v / top100);
  let g = '';
  for (const v of [0, 50, 100].filter((x) => x <= top100)) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L - 6}" y="${Y(v) + 4}" class="ytick">${v}%</text>`;
  g += `<line x1="${L}" x2="${W - R}" y1="${Y(100)}" y2="${Y(100)}" class="caesar"/><text x="${W - R + 6}" y="${Y(100) + 4}" class="endlab">Caesar</text>`;
  asc.forEach((d, i) => { g += `<text x="${X(i)}" y="${H - B + 16}" class="xtick">${d.date.slice(8)}/${d.date.slice(5, 7)}</text>`; });
  for (const ln of [...lines].reverse()) {
    let path = '', pen = false;
    ln.v.forEach((v, i) => { if (v === null) { pen = false; return; } path += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)} `; pen = true; });
    g += `<path d="${path}" class="ln${ln.you ? ' you' : ''}" style="stroke:${ln.col}"/>`;
    ln.v.forEach((v, i) => { if (v !== null) g += `<circle cx="${X(i)}" cy="${Y(v)}" r="${ln.you ? 4 : 3}" style="fill:${ln.col}" class="dot"><title>${ln.name}: ${v}% of Caesar on ${asc[i]!.date}</title></circle>`; });
  }
  const legend = `<span class="lg"><i style="background:${SERIES_COL[0]}"></i>You</span>` + rivalLegend('record', played) + '<span class="lg"><i class="cz"></i>Caesar = 100%</span>';
  return `<div class="lgrow2">${legend}</div><svg viewBox="0 0 ${W} ${H}" class="scorechart" role="img" aria-label="Score as a percentage of Caesar's, day by day">${g}</svg>`;
}
function pastSection(): string {
  if (!social) return '';
  if ((historyState === 'loading' || historyState === 'idle') && !history) return '<section class="rcard past"><h3>Past campaigns</h3><div class="muted small">Unrolling the archives…</div></section>';
  if (historyState === 'error' || !history) return '';
  const days = history.filter((d) => d.date !== dateLabel || d.me);
  if (!days.length) return '';
  const rows = days.map((d) => {
    const here = d.date === dateLabel;
    const mine = d.me ? `<b>${d.me.total}</b>${d.me.late ? ' ⏱' : ''}${d.par ? ` <span class="muted">${Math.round((100 * d.me.total) / d.par)}%</span>` : ''}` : '<span class="muted">not played</span>';
    const rank = d.me?.rank ? `#${d.me.rank}/${d.players}` : d.players ? `<span class="muted">${d.players} played</span>` : '';
    const btn = here ? '<span class="muted small">this post</span>' : d.postId ? `<button data-open="${d.postId}">${d.me ? 'Open' : 'Play'}</button>` : '';
    return `<tr${here ? ' class="mine"' : ''}><td>${shortDate(d.date)}</td><td>${mine}</td><td>${rank}</td><td class="muted">${d.par ?? '–'}</td><td>${btn}</td></tr>`;
  }).join('');
  const policy = day?.policy === 'practice' ? 'Past days are practice only on this subreddit.'
    : day?.policy === 'ontime' ? 'Past days are scored but stay off their leaderboard.' : 'Past days are scored with a ⏱ mark. Late plays never extend streaks.';
  return `<section class="rcard past"><h3>Past campaigns</h3>
    <table class="lb past"><tr><th>Day</th><th>You</th><th>Rank</th><th>Caesar</th><th></th></tr>${rows}</table>
    <div class="muted small">${policy}</div>
    ${recordChart(history) ? `<h3 class="sub">Your record</h3>${recordChart(history)}` : ''}
  </section>`;
}

/** Results page: score, rank, leaderboard, tomorrow's vote with explanations, sharing, debug. */
function renderResults() {
  // re-rendering replaces the page: keep the reader where they were (vote, follow, share…)
  const keep = root.querySelector<HTMLElement>('.results')?.scrollTop ?? 0;
  const fin = official ?? s;
  const stored = staleResult && day?.me ? day.me : null;
  const b = stored ? (() => {
    const penalty = (stored.lost ?? 0) * sc.rules.lostLegionPenalty, glory = stored.glory ?? stored.total;
    return { glory, penalty, decree: stored.total - glory + penalty, total: stored.total, decreeMet: stored.decreeMet ?? false };
  })() : score(sc, fin);
  const p = day?.par ?? par;
  const pct = p ? Math.round((100 * b.total) / p) : null;
  const beat = p !== null && b.total >= p;
  const practiceLine = practice && isOver(sc, s)
    ? `<div class="pracline">Practice run: <b>${score(sc, s).total}</b> (not ranked)${practiceNote?.pb && practiceNote.prev !== null ? ' · <span class="pb">New personal best!</span>' : ''}</div>` : '';
  const lb = day?.leaderboard;
  const dayWord = demo ? 'on the Demo' : day?.late ? `on ${prettyDate(dateLabel)}` : 'today';
  const rank = lb?.me ? `#${lb.me.rank} of ${lb.players} ${dayWord}${lb.me.late ? ' · played late ⏱' : ''}`
    : day?.me && day.offBoard ? `Played late: would place #${day.offBoard} of ${lb!.players + 1} (not on the board)`
      : day?.me ? '' : social ? 'Not on the board yet' : 'Played offline: not saved. Open the game from today\'s post to be ranked.';
  const streak = !demo && day?.streak && day.streak.streak > 1 ? ` · <span class="streak${day.streak.last === dateLabel ? ' grew' : ''}"><i class="flame">🔥</i> <b>${day.streak.streak}</b>-day streak</span>` : '';
  const rivalSet = new Set((day?.rivals ?? []).map((r) => r.username.toLowerCase()));
  const rows = (lb?.board ?? []).slice(0, 10).map((r) => {
    const me = r.username === day!.username, rival = rivalSet.has(r.username.toLowerCase());
    const btn = me || !day?.username ? '' : `<button class="follow ${rival ? 'on' : ''}" data-follow="${esc(r.username)}" data-on="${rival ? '0' : '1'}" ${busy ? 'disabled' : ''}>${rival ? '✓ rival' : '+ rival'}</button>`;
    return `<tr class="${me ? 'mine' : rival ? 'rival' : ''}"><td>${r.rank}</td><td>${avatar(r.username)}${esc(r.username)} ${btn}</td><td>${r.score}${r.late ? ' <span title="Played after the day" class="latemark">⏱</span>' : ''}</td></tr>`;
  }).join('');
  const myRowBelow = lb?.me && lb.me.rank > 10 ? `<div class="lbme">…<span>#${lb.me.rank}</span> ${day?.username ? `${avatar(day.username)}${esc(day.username)}` : "you"} <b>${day?.me?.total ?? ""}</b></div>` : '';
  $('app').innerHTML = `
  <div class="results">
    <div class="rtop"><b>All Roads Lead to Rome</b> <span class="muted">· ${niceDate()}</span>
      <span class="icons">${SKIRMISHES.length && skUnlocked() ? '<button id="skquick" class="skq" title="Skirmish: a new map against Caesar">⚔️ Skirmish</button>' : ''}<button id="snd" title="${sound ? 'Sound effects on: tap to mute' : 'Sound effects off'}">${sound ? '🔊' : '🔇'}</button><button id="mus" class="${music ? '' : 'off'}" title="${music ? 'Music on: tap to stop' : 'Music off'}">🎵</button><button id="rules" title="How to play">?</button></span></div>
    <section class="hero${practice && isOver(sc, s) ? ' prac' : ''}">
      ${practice && isOver(sc, s) ? '<div class="htag">Practice · not scored</div>' : demo ? '<div class="htag">Demo · replay at will</div>' : ''}
      <h2>${beat ? 'You out-marched Caesar!' : 'The Senate has counted your glory'}</h2>
      ${beat ? `<div class="wreath">${laurelSvg()}<div class="big">${b.total}</div></div>` : `<div class="big">${b.total}</div>`}
      <div class="vs">${p !== null ? (beat ? `Caesar scored ${p}: you beat him by ${b.total - p}` : `${p - b.total} short of Caesar's ${p} <span class="pct">(${pct}%)</span>`) : "Caesar didn't march this day"}</div>
      <div class="rank">${rank}${streak}</div>${practiceLine}${demoLine()}
      ${stored ? '<div class="stalenote">This day\'s campaign was changed by a game update after you played it. Your score stands as it was recorded, but your moves can no longer be shown on the map, and Caesar\'s score may have changed.</div>' : ''}
    </section>
    <section class="quick">
      <button id="shareimg">🖼 Share as image</button>
      ${social && day?.me ? '<button id="qchal">⚔️ Challenge a friend</button>' : ''}
      ${staleResult ? '' : '<button id="tomap2">Your map</button>'}
    </section>
    ${voteSection()}
    ${rows ? `<section class="rcard"><h3>${demo ? 'The Demo board <span class="muted">· best run of each general</span>' : `${day?.late ? 'That day\'s' : "Today's"} generals`}</h3><table class="lb">${rows}</table>${myRowBelow}</section>` : ''}
    ${stored ? (stored.curve ? chartSection(fin, stored.curve) : '') : chartSection(fin)}
    ${attemptsSection()}
    <section class="rcard">
      <table class="brk"><tr><td>Glory from your towns</td><td>${b.glory}</td></tr>
      <tr><td>Decree: ${sc.decree.title}</td><td>${b.decree ? '+' + b.decree : 'missed'}</td></tr>
      <tr><td>Legions lost</td><td>${b.penalty ? '−' + b.penalty : '0'}</td></tr>
      <tr class="tot"><td>Score</td><td>${b.total}</td></tr></table>
    </section>
    ${rivalsSection()}
    ${achievementsSection()}
    ${pastSection()}
    ${shareSection()}
    <section class="ractions">
      ${day?.me ? `<button id="join" ${busy || joined ? 'disabled' : ''}>${joined ? 'Joined ✓' : 'Join the legion'}</button>` : ''}
      ${staleResult ? "" : `<button id="tomap">Back to your map</button>`}
      ${demo ? `<button id="practice" class="primary">⚔️ March again (scored)</button>${day?.todayPost ? `<button data-open="${esc(day.todayPost)}">🏛 Today's real campaign</button>` : ''}<button id="tutreplay">Replay the tutorial</button>` : '<button id="practice">Practice again (unscored)</button>'}
      ${skirmishButton()}
    </section>
    ${socialMsg ? `<div class="muted small center">${esc(socialMsg)}${submitFailed ? ' <button id="resubmit" class="link">Retry</button>' : ''}</div>` : ''}
    ${day?.isMod ? `<section class="rcard debug"><h3>Moderator tools</h3>
      ${social?.modStats ? `<button id="modstats" class="primary">📊 Senate archives: players, days${social.bugs ? ' and 🐞 bug reports' : ''}${day.bugsNew ? ` <span class="bugnew">${day.bugsNew} new</span>` : ''}</button>` : ''}
      <button data-reset="me" ${busy ? 'disabled' : ''}>${confirmReset === 'me' ? 'Tap again to wipe your game' : 'Reset my game today'}</button>
      <button data-reset="day" ${busy ? 'disabled' : ''}>${confirmReset === 'day' ? "Tap again to wipe everyone's" : "Reset today's whole board"}</button>
      <div class="muted small">Reset mine also clears your streak record and your tutorial status. Visible to subreddit moderators only.</div>
      ${social?.journeyStatus ? `<div class="muted small">Devvit Journeys, last receipt: <code>${esc(social.journeyStatus())}</code></div>` : ''}
      ${day.tutorialStats ? `<div class="muted small">Tutorial: ${day.tutorialStats.start ?? 0} started, ${day.tutorialStats.done ?? 0} finished, ${day.tutorialStats.skip ?? 0} skipped${(() => { const sk = Object.entries(day.tutorialStats!).filter(([k]) => k.startsWith('skip@')).sort((a, b) => b[1] - a[1])[0]; return sk ? ` (most often at "${sk[0].slice(5)}")` : ''; })()}.</div>` : ''}</section>` : ''}
    ${social?.bug ? '<div class="center"><button id="bugopen" class="bugbtn">🐞 Report a bug</button></div>' : ''}
    <div class="ver center">${versionLabel()}</div>
  </div>
  ${showRules ? rulesSheet() : ''}${challengeSheet()}${imgSheet()}${bugSheetHtml()}`;
  wireImgSheet();
  const page = root.querySelector<HTMLElement>('.results');
  if (page && keep) page.scrollTop = keep;
  wireChart(); wireRivalPicker();
  root.querySelector('#modstats')?.addEventListener('click', () => openStats());
  if (resultsFx && !staleResult) { resultsFx = false; fxResults(root, (i) => play('tick', i), () => sfxLater('win', 900)); fxStreak(root, 1300); }
  root.querySelectorAll<HTMLImageElement>('.av img').forEach((im) => { im.onerror = () => im.remove(); });
  void loadHistory();
  root.querySelector('#tutreplay')?.addEventListener('click', () => startTutorial());
  root.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((bt) => (bt.onclick = () => social?.openPost(bt.dataset.open!)));
  $('snd').onclick = () => { sound = !sound; setSound(sound); if (sound) play('turn'); render(); };
  $('mus').onclick = () => { music = !music; setMusic(music); render(); };
  $('rules').onclick = () => { showRules = !showRules; render(); };
  root.querySelector('#rulesx')?.addEventListener('click', () => { showRules = false; render(); });
  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => (b.onclick = () => { rulesTab = b.dataset.tab as typeof rulesTab; render(); }));
  root.querySelectorAll('#tomap, #tomap2').forEach((x) => x.addEventListener('click', () => { view = 'map'; render(); }));
  root.querySelector('#qchal')?.addEventListener('click', () => void doChallenge());
  root.querySelector('#shareimg')?.addEventListener('click', () => void shareResultImage());
  root.querySelector('#resubmit')?.addEventListener('click', () => { retried = true; void finish(); });
  root.querySelector('#skquick')?.addEventListener('click', () => startSkirmish(challengedBy?.sk));
  root.querySelector('#practice')?.addEventListener('click', () => startPractice());
  root.querySelector('#skirmish')?.addEventListener('click', () => startSkirmish(challengedBy?.sk));
  root.querySelector<HTMLDetailsElement>('#achdet')?.addEventListener('toggle', (ev) => { achOpen = (ev.target as HTMLDetailsElement).open; });
  // tap a won medal (strip or grid): open the list on it and show how it was won
  root.querySelectorAll<HTMLElement>('[data-ach]').forEach((x) => (x.onclick = () => {
    const id = x.dataset.ach as AchId;
    achWhy = achWhy === id && x.classList.contains('ach') ? null : id; achOpen = true; render();
    root.querySelector(`.ach[data-ach="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }));
  root.querySelectorAll<HTMLButtonElement>('[data-vote]').forEach((bt) => (bt.onclick = () => void doVote(bt.dataset.vote as Faction)));
  root.querySelectorAll<HTMLButtonElement>('[data-reset]').forEach((bt) => (bt.onclick = () => void doReset(bt.dataset.reset as 'me' | 'day')));
  root.querySelector<HTMLButtonElement>('#share')?.addEventListener('click', () => void doShare());
  root.querySelector<HTMLButtonElement>('#join')?.addEventListener('click', () => void doJoin());
  root.querySelector<HTMLButtonElement>('#challenge')?.addEventListener('click', () => void doChallenge());
  wireChallenge();
  root.querySelectorAll<HTMLButtonElement>('[data-compare]').forEach((bt) => (bt.onclick = () => void startCompare(bt.dataset.compare!)));
  root.querySelectorAll<HTMLButtonElement>('[data-follow]').forEach((bt) =>
    (bt.onclick = () => void doFollow(bt.dataset.follow!, bt.dataset.on === '1')));
  root.querySelectorAll<HTMLInputElement>('[data-mention]').forEach((cb) => (cb.onchange = () => {
    if (cb.checked && mentionSel.size >= MAX_MENTIONS) { cb.checked = false; return; }
    if (cb.checked) mentionSel.add(cb.dataset.mention!); else mentionSel.delete(cb.dataset.mention!);
    render();
  }));
  const inp = root.querySelector<HTMLInputElement>('#rivalname');
  if (inp) {
    inp.oninput = () => { rivalInput = inp.value; };
    inp.onkeydown = (e) => { if (e.key === 'Enter') void doFollow(inp.value, true); };
  }
  root.querySelector<HTMLButtonElement>('#addrival')?.addEventListener('click', () => void doFollow(rivalInput, true));
}

const MAX_MENTIONS = 3;

/** States after each turn (index 0 = the start) from an action log. */
function statesByTurn(actions: readonly Action[]): State[] {
  let st = initialState(sc);
  const out = [st];
  for (const a of actions) { if (checkAction(sc, st, a)) break; st = apply(sc, st, a); if (a.type === 'end') out.push(st); }
  return out;
}

async function startCompare(name: string) {
  track('compare');
  if (!social?.rivalPlan || busy) return;
  const mine = log.length ? log : day?.me?.actions ?? [];
  busy = true; render();
  try {
    const { actions: theirs, fresh } = await social.rivalPlan(name);
    if (!theirs) { socialMsg = `u/${name} has not marched today yet.`; return; }
    for (const id of fresh) grantLocal(id, `Watched ${name}'s campaign turn by turn.`);
    compare = { name, mine: statesByTurn(mine), theirs: statesByTurn(theirs), k: 1 };
    view = 'map'; cam.z = 1; cam.cx = NaN;
  } catch (e) { socialMsg = `Could not load u/${name}'s campaign: ${e instanceof Error ? e.message : e}`; } finally { busy = false; render(); }
}

/** The rival's network over yours: roads only they built (dashed), roads you share (a stripe), their forts and legions. */
function rivalLayer(P: Pt[]): string {
  const r = cmpRival!, rs = supplied(sc, r), ms = supplied(sc, s);
  let g = '';
  for (const rd of sc.roads) {
    if (!r.built[rd.id]) continue;
    const A = P[rd.a]!, B = P[rd.b]!;
    g += `<path d="M${n1(A.x)},${n1(A.y)} L${n1(B.x)},${n1(B.y)}" class="rivroad ${s.built[rd.id] ? 'both' : 'only'}"/>`;
  }
  for (const t of sc.towns) {
    const p = P[t.id]!;
    if (t.id !== sc.castra && r.garrison[t.id]) g += `<ellipse cx="${n1(p.x)}" cy="${n1(p.y + 6)}" rx="46" ry="30" class="rivfort"/>`;
    if (t.id !== sc.castra && rs[t.id] && !ms[t.id]) g += `<circle cx="${n1(p.x)}" cy="${n1(p.y - 4)}" r="9" class="rivheld"/>`;
  }
  r.legions.forEach((t, i) => { const p = P[t]!; g += `<g class="rivleg" transform="translate(${n1(p.x - 34 - i * 10)},${n1(p.y - 6)})"><line y1="10" y2="-22"/><path d="M0,-21 h-13 v10 l6.5,-2.5 l6.5,2.5 z"/></g>`; });
  return `<g class="rival">${g}</g>`;
}

/** Turn-by-turn comparison with a rival: the map at the chosen turn, both networks, both numbers. */
function renderCompare() {
  const c = compare!, T = sc.rules.turns, keep = s;
  const k = Math.max(0, Math.min(c.k, T));
  s = c.mine[Math.min(k, c.mine.length - 1)]!;
  cmpRival = c.theirs[Math.min(k, c.theirs.length - 1)]!;
  const prevWrap = root.querySelector<HTMLElement>('.mapwrap');
  if (prevWrap) mapArea = { w: prevWrap.clientWidth, h: prevWrap.clientHeight };
  boardRotated = chooseOrientation();
  const stat = (st: State) => ({
    glory: st.glory, denarii: st.denarii, towns: suppliedTowns(sc, st).length, roads: st.built.filter(Boolean).length,
    forts: st.garrison.filter(Boolean).length, legions: st.legions.length, cut: st.history.reduce((n, h) => n + h.cut.length, 0),
    total: k === T ? score(sc, st).total : null,
  });
  const a = stat(s), b = stat(cmpRival);
  const row = (label: string, x: number | null, y: number | null) => (x === null || y === null ? '' : `<tr><td>${label}</td><td class="${x > y ? 'lead' : ''}">${x}</td><td class="${y > x ? 'lead' : ''}">${y}</td></tr>`);
  const when = k === 0 ? 'Before the first turn' : k === T ? 'End of the game' : `After turn ${k}`;
  $('app').innerHTML = `
  <div class="layout">
    <section class="mapcol"><div class="mapwrap"><div class="bgslot"></div>${svg()}</div></section>
    <aside class="side"><header><div class="title"><span class="ttl"><b>You vs u/${esc(c.name)}</b> <span class="muted">· ${niceDate()}</span></span></div></header>
    <div class="sidebody cmp">
      <div class="cmpturn"><button id="cmpprev" ${k === 0 ? 'disabled' : ''} aria-label="Previous turn">◀</button><b>${when}</b><button id="cmpnext" ${k === T ? 'disabled' : ''} aria-label="Next turn">▶</button></div>
      <input type="range" id="cmprange" min="0" max="${T}" value="${k}" aria-label="Turn">
      <table class="cmptbl"><tr><th></th><th>You</th><th>u/${esc(c.name)}</th></tr>
        ${row('Score', a.total, b.total)}${row('Glory', a.glory, b.glory)}${row('Denarii', a.denarii, b.denarii)}${row('Towns linked', a.towns, b.towns)}${row('Roads', a.roads, b.roads)}${row('Garrisons', a.forts, b.forts)}${row('Legions', a.legions, b.legions)}${row('Roads lost', a.cut, b.cut)}
      </table>
      <div class="cmpkey small"><div><span class="k only"></span> a road only they built</div><div><span class="k both"></span> a road you both built</div><div><span class="k fort"></span> their garrison · <span class="k held"></span> a town they hold and you don't · <span class="k leg"></span> their legion</div></div>
      <p class="muted small">Your own roads, legions and events are drawn as in your game at that turn.</p>
      <button id="cmpback" class="primary">Back to results</button>
    </div></aside>
  </div>`;
  s = keep; cmpRival = null;
  attachBoard();
  wireZoom(root.querySelector<HTMLElement>('.mapwrap')!);
  const go = (n: number) => { c.k = Math.max(0, Math.min(T, n)); render(); };
  root.querySelector('#cmpprev')?.addEventListener('click', () => go(c.k - 1));
  root.querySelector('#cmpnext')?.addEventListener('click', () => go(c.k + 1));
  root.querySelector<HTMLInputElement>('#cmprange')?.addEventListener('input', (e) => go(Number((e.target as HTMLInputElement).value)));
  root.querySelector('#cmpback')?.addEventListener('click', () => { compare = null; view = 'results'; render(); });
}

/** Your rivals' standing today, plus adding/removing rivals. */
function rivalsSection(): string {
  if (!social || !day?.username) return '';
  const rivals = day.rivals ?? [];
  const mine = official ? score(sc, official).total : day.me?.total ?? null;
  const all = [...rivals.filter((r) => r.score !== null).map((r) => r.score!), ...(mine !== null ? [mine] : [])].sort((a, b) => b - a);
  const place = mine !== null && rivals.some((r) => r.score !== null) ? `You place #${all.indexOf(mine) + 1} of ${all.length} among your rivals.` : '';
  const list = rivals.map((r) => `<tr><td>${avatar(r.username)}${esc(r.username)}${r.streak > 1 ? ` <span class="muted">🔥${r.streak}</span>` : ''}</td>
      <td>${r.score === null ? (r.best != null ? `<span class="muted">practice only · best ${r.best}</span>` : '<span class="muted">has not marched yet</span>') : `<b>${r.score}</b>${r.rank ? ` <span class="muted">#${r.rank}</span>` : ''}`}${r.score !== null && r.best != null && r.best > r.score ? `<div class="muted small" title="Best of ${r.tries ?? 1} tries, practice included">best ${r.best} · ${r.tries ?? 1} tries</div>` : ''}</td>
      <td>${r.score !== null && (official || day?.me) && !staleResult && social?.rivalPlan ? `<button class="cmpbtn" data-compare="${esc(r.username)}" ${busy ? 'disabled' : ''} title="Replay both campaigns turn by turn on the map">Compare</button>` : ''}<button class="follow on" data-follow="${esc(r.username)}" data-on="0" title="Stop following" ${busy ? 'disabled' : ''}>×</button></td></tr>`).join('');
  return `<section class="rcard rivals"><h3>Your rivals</h3>
    ${rivals.length ? `<div class="muted small">${place}</div><table class="lb">${list}</table>` : '<div class="muted small">Follow other generals from the leaderboard, or by name, to compare scores every day.</div>'}
    <div class="addrow"><input id="rivalname" placeholder="u/username" value="${esc(rivalInput)}" maxlength="23" autocomplete="off"><button id="addrival" ${busy ? 'disabled' : ''}>Follow</button></div>
  </section>`;
}

/** A player's snoovatar (from Reddit), or their initial on a coloured disc when they have none. */
function avatar(name: string): string {
  const url = day?.avatars?.[name];
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return `<span class="av" style="--avh:${hue}">${url ? `<img src="${attr(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<b>${esc(name[0]?.toUpperCase() ?? '?')}</b></span>`;
}

/** The Skirmish entry on the results page: locked until today's campaign is played. */
function skirmishButton(): string {
  if (!SKIRMISHES.length) return '';
  if (!skUnlocked()) return `<button id="skirmish" disabled title="Finish today's campaign to unlock Skirmish">🔒 Skirmish: play today's campaign first</button>`;
  const c = challengedBy?.sk;
  return `<button id="skirmish" class="primary">${c ? `⚔️ Take u/${esc(challengedBy!.from)}'s challenge: Skirmish #${c} (beat ${challengedBy!.score})` : '⚔️ Skirmish: a new map vs Caesar'}</button>`;
}

/** Achievements: completion, the medals earned (with their date) and every one still to win. */
function achievementsSection(): string {
  const av = day?.achievements;
  if (!av) return '';
  const got = new Map(av.earned.map((e) => [e.id, e]));
  const pct = Math.round((100 * got.size) / ACHIEVEMENTS.length);
  const rare = (id: AchId) => { const n = av.holders[id] ?? 0; return n && av.players > 1 ? `${Math.max(1, Math.round((100 * n) / av.players))}% of generals` : ''; };
  const card = (id: AchId) => {
    const a = ACH_BY_ID[id], e = got.get(id), r = rare(id);
    if (!e && a.hidden) return `<div class="ach locked secret" title="${attr(HIDDEN_HOW)}"><span class="medal ${a.tier} locked" aria-hidden="true"><span>?</span></span>
      <div><b>???</b><small>${HIDDEN_HOW}</small>${r ? `<small class="rare">${r}</small>` : ''}</div></div>`;
    if (!e) return `<div class="ach locked" title="${attr(`${a.name} (${TIER_NAME[a.tier]}): ${a.how}`)}">${medal(id, true)}
      <div><b>${a.name}</b><small>${a.how}</small>${r ? `<small class="rare">${r}</small>` : ''}</div></div>`;
    // won: the rule, then how you won it (stored with the award; older honours show the rule and the date)
    return `<button type="button" class="ach won${achWhy === id ? ' open' : ''}" data-ach="${id}" aria-expanded="${achWhy === id}">${medal(id)}
      <div><b>${a.name}</b><small>Won ${prettyDate(e.date)} · <u>how?</u></small>${r ? `<small class="rare">${r}</small>` : ''}
      ${achWhy === id ? `<small class="why"><b>The rule:</b> ${esc(a.how)}<br><b>Your win:</b> ${esc(e.why ?? `You met it on ${prettyDate(e.date)} (won before reasons were recorded).`)}</small>` : ''}</div></button>`;
  };
  const groups = [...new Set(ACHIEVEMENTS.map((a) => a.group))];
  const strip = av.earned.length ? av.earned.map((e) => `<button type="button" class="medalbtn" data-ach="${e.id}" title="${attr(`${ACH_BY_ID[e.id].name}: ${e.why ?? ACH_BY_ID[e.id].how}`)}">${medal(e.id)}</button>`).join('') : '<span class="muted small">None yet: finish a campaign to earn your first.</span>';
  return `<section class="rcard achs"><h3>Achievements <span class="muted">${got.size}/${ACHIEVEMENTS.length}</span></h3>
    <div class="achbar"><i style="width:${pct}%"></i><span>${pct}%</span></div>
    <div class="achstrip">${strip}</div>
    <details${achOpen ? ' open' : ''} id="achdet"><summary>All ${ACHIEVEMENTS.length} achievements</summary>
      ${groups.map((g) => `<h4>${g}</h4><div class="achgrid">${ACHIEVEMENTS.filter((a) => a.group === g).map((a) => card(a.id)).join('')}</div>`).join('')}
    </details>
  </section>`;
}
let achOpen = false;
let achWhy: AchId | null = null; // the won achievement whose story is open

/** Every attempt of the day: the official (ranked) run first, then practice runs, with the personal best. */
function attemptsSection(): string {
  const pr = day?.practice;
  if (demo) return demoAttempts();
  const off = day?.me?.total ?? (official ? score(sc, official).total : null);
  if (!pr?.count && !practiceNote) return '';
  const runs = [...(off !== null ? [{ total: off, ranked: true }] : []), ...(pr?.runs ?? []).map((r) => ({ total: r.total, ranked: false }))];
  // offline, or the save failed: still show the run just played
  if (practiceNote && !(pr?.runs.length)) runs.push({ total: practiceNote.total, ranked: false });
  const best = Math.max(...runs.map((r) => r.total)), top = Math.max(1, best, day?.par ?? par ?? 0);
  const p = day?.par ?? par;
  const bars = runs.map((r, i) => `<div class="att${r.ranked ? ' ranked' : ''}${r.total === best ? ' best' : ''}" title="${r.ranked ? 'Official run (ranked)' : `Practice ${i + (off !== null ? 0 : 1)}`}: ${r.total}">
      <i style="height:${Math.max(4, Math.round((60 * Math.max(0, r.total)) / top))}px"></i><span>${r.total}</span></div>`).join('');
  const parLine = p ? `<div class="attpar" style="bottom:${Math.round((60 * p) / top) + 16}px"><span>Caesar ${p}</span></div>` : '';
  const hidden = (pr?.count ?? 0) - (pr?.runs.length ?? 0);
  const gain = off !== null && best > off ? ` (+${best - off} over your ranked run)` : '';
  return `<section class="rcard attempts"><h3>Your attempts</h3>
    <div class="attsum"><span>Ranked: <b>${off ?? '–'}</b></span><span>Personal best: <b>${best}</b>${gain}</span><span>${(pr?.count ?? (practiceNote ? 1 : 0)) + (off !== null ? 1 : 0)} tries</span></div>
    <div class="attbars">${parLine}${bars}</div>
    <div class="muted small">${hidden > 0 ? `Your first ${hidden} practice runs are counted but not drawn. ` : ''}Only your first finished run is ranked; practice runs are kept for you and your rivals to see.</div>
  </section>`;
}

/** The Demo's attempts: every run is scored; the best is the one on the board. */
function demoAttempts(): string {
  const runs = day?.practice?.runs ?? [], p = day?.par ?? par;
  if (!runs.length) return '';
  const best = Math.max(...runs.map((r) => r.total)), top = Math.max(1, best, p ?? 0), last = runs.length - 1;
  const bars = runs.map((r, i) => `<div class="att${r.total === best ? ' best' : ''}${i === last ? ' ranked' : ''}" title="Run ${i + 1}: ${r.total}">
      <i style="height:${Math.max(4, Math.round((60 * Math.max(0, r.total)) / top))}px"></i><span>${r.total}</span></div>`).join('');
  const parLine = p ? `<div class="attpar" style="bottom:${Math.round((60 * p) / top) + 16}px"><span>Caesar ${p}</span></div>` : '';
  const hidden = (day?.practice?.count ?? 0) - runs.length;
  return `<section class="rcard attempts"><h3>Your marches</h3>
    <div class="attsum"><span>This run: <b>${runs[last]!.total}</b></span><span>Best: <b>${best}</b></span><span>${pl(day?.practice?.count ?? runs.length, 'try', 'tries')}</span></div>
    <div class="attbars">${parLine}${bars}</div>
    <div class="muted small">${hidden > 0 ? `Your first ${hidden} runs are counted but not drawn. ` : ''}Every Demo run is scored; your best is the one on the board.</div>
  </section>`;
}
/** Under the Demo's score: personal best and what the Demo is (and is not). */
function demoLine(): string {
  if (!demo || !day?.me) return '';
  const best = myBest(), pb = practiceNote?.pb && practiceNote.prev !== null;
  return `<div class="pracline">${pb ? `<span class="pb">New personal best!</span> <s class="oldbest">${practiceNote!.prev}</s> → ` : 'Your best: '}<b class="newbest">${best ?? day.me.total}</b>
    · <span class="muted">the Demo never touches your streak or the daily board</span></div>`;
}

/** Share comment (optionally mentioning up to 3 rivals who have not played) and challenge link. */
function shareSection(): string {
  if (!social || !day?.me) return '';
  const idle = (day.rivals ?? []).filter((r) => r.score === null);
  const picks = !shared && idle.length ? `<div class="mentions"><div class="muted small">Challenge rivals who haven't marched yet (up to ${MAX_MENTIONS}); Reddit will notify them:</div>
    ${idle.map((r) => `<label><input type="checkbox" data-mention="${esc(r.username)}" ${mentionSel.has(r.username) ? 'checked' : ''}> u/${esc(r.username)}</label>`).join('')}</div>` : '';
  return `<section class="rcard share"><h3>Spread the word</h3>${picks}
    <div class="sharebtns">
      <button id="share" ${busy || shared ? 'disabled' : ''}>${shared ? 'Shared ✓' : mentionSel.size ? `Share & challenge ${mentionSel.size}` : 'Share result in comments'}</button>
      <button id="challenge">⚔️ Challenge a friend</button>
    </div>
    <div class="muted small">One result comment per day. The link opens today's map and tells your friend the score to beat.</div>
  </section>`;
}

/** Tomorrow's decree for each faction: the vote decides which one becomes law. */
const FACTION: Record<Faction, { name: string; motto: string }> = {
  populares: { name: 'Populares', motto: 'glory and ambition' },
  optimates: { name: 'Optimates', motto: 'order and caution' },
  augures: { name: 'Augures', motto: 'the will of the gods' },
};
const tomorrow = (f: Faction) => dailyScenario(addDays(dateLabel, 1), f).scenario.decree;

const esc = (x: string) => x.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function voteSection(): string {
  if (!social || !day?.me) return '';
  if (day.late) return `<section class="rcard vote2"><h3>The Senate has adjourned</h3><p class="muted">Voting for ${prettyDate(dateLabel)} closed at midnight, when the next day's decree was set.</p></section>`;
  const on = ballotFor(addDays(dateLabel, 1));
  if (demo) return voteBody(on, `<h3>The Senate's ballot <span class="closes">· Demo</span></h3>
    <p class="muted">On the daily post, tonight's vote decides which faction rules tomorrow: its decree changes the rules and the bonus for everyone. Here you can try it: the Demo's tally counts only here.</p>`);
  return voteBody(on, `<h3>Tomorrow's Senate <span class="closes">· voting closes in ${(() => { const m = Math.max(1, Math.round((Date.parse(`${addDays(dateLabel, 1)}T00:00:00Z`) - Date.now()) / 60000)); return m < 60 ? pl(m, 'minute') : pl(Math.round(m / 60), 'hour'); })()}</span></h3>
    <p class="muted">Tonight's vote decides which faction rules tomorrow. Its decree changes the rules and the bonus for everyone's campaign.</p>`);
}
function voteBody(on: Faction[], head: string): string {
  if (!day) return '';
  const total = on.reduce((n, f) => n + (day!.votes[f] ?? 0), 0);
  const pctv = (f: Faction) => (total ? Math.round((100 * (day!.votes[f] ?? 0)) / total) : 0);
  const card = (f: Faction) => {
    const mine = day!.myVote === f;
    const bar = day!.myVote ? `<div class="vbar ${f}"><span style="width:${pctv(f)}%"></span><b>${pctv(f)}%</b> of votes${mine ? ' · your choice' : ''}</div>`
      : `<button data-vote="${f}" class="votebtn ${f}" ${busy ? 'disabled' : ''}>${f === 'augures' ? 'Consult the Books' : `Back the ${FACTION[f].name}`}</button>`;
    if (f === 'augures') return `<div class="dcard augures sealed ${mine ? 'mine' : ''}">
      <div class="dfac">${FACTION[f].name} <span class="muted">· ${FACTION[f].motto}</span></div>
      <div class="dtitle">📜 Consult the Sibylline Books</div>
      <div class="drule">A sealed scroll. The Augurs' decree is revealed only if they win, when tomorrow begins.</div>
      <div class="deffect">Each of their decrees overturns a rule of the game. A gamble for the whole subreddit.</div>
      ${bar}</div>`;
    const d = tomorrow(f), spec = decreeSpec(d.kind);
    return `<div class="dcard ${f} ${mine ? 'mine' : ''}">
      <div class="dfac">${FACTION[f].name} <span class="muted">· ${FACTION[f].motto}</span></div>
      <div class="dtitle">${d.title}</div>
      <div class="drule">${decreeRule(d)}</div>
      <div class="deffect">${spec.effect}</div>
      ${bar}
    </div>`;
  };
  return `<section class="rcard vote2">
    ${head}
    ${on.includes('augures') ? '<p class="augurnote">🦅 The Augurs have taken the auspices: tonight they are on the ballot.</p>' : ''}
    <div class="dcards${on.length > 2 ? ' three' : ''}">${on.map(card).join('')}</div>
  </section>`;
}

/** "?" → The screen: every part of the interface, drawn with the game's own pieces. */
function screenSheet(): string {
  const item = (pic: string, name: string, what: string) => `<div class="uirow"><div class="uipic">${pic}</div><div><b>${name}</b>: ${what}</div></div>`;
  const chipX = (icon: string, col: string, badge = '', cls = 'threat') => `<span class="chip ${cls}" style="--tc:${col}">${icon}<i>▲</i>${badge}</span>`;
  const g = TRIBE_ART[0]!;
  return `<div class="legend uisheet">
  <p class="small">From top to bottom on a phone; on a wide screen the panel sits to the right of the map, with the same pieces.</p>
  <h4>The map</h4>
  ${item('🗺️', 'Board', 'pinch or scroll to zoom, drag to move; ⤢ shows the whole map again. Tap a dashed track to build it, a town to see it, a legion\'s standard to march it.')}
  ${item(`<span class="lensdemo"><span class="on">Roads</span><span>Military</span></span>`, 'Roads / Military', 'two ways to look at the board. Military paints shielded roads gold and doomed roads red; it switches on by itself when trouble is coming.')}
  ${item('<span class="tstars-demo">★★★<span class="cdemo">D</span></span>', 'Under a town', 'its stars (glory a turn) and coins (denarii a turn), then the icons of events that will strike it. Tap any of them for an explanation.')}
  ${item('<span class="badge-demo">⚓</span>', 'Beside a name', 'an anchor for a port, a watchtower for a frontier town.')}
  <h4>The panel</h4>
  ${item('<span class="status-demo"><b>Turn 3:</b> +14 glory · +4 denarii</span>', 'Status line', 'what the last turn did (roads cut, towns cut off), or what to do next while a legion is marching.')}
  ${item(`<span class="strip-demo"><span class="cell past">1–2</span><span class="cell cur"><span class="tn">Turn 3</span>${chipX('🔥', g, '<b class="bad">2</b>')}</span><span class="cell fog">5–10</span></span>`, 'Forecast strip', 'this turn and the next, one icon per event, ringed in its tribe\'s colour. A red number: roads it would cut now; a green ✓: you are safe. A dashed ring: an effect already in force. Tap an icon for its text and to light up the tribe\'s lands.')}
  ${item('<span class="offer-demo">⚖️ <b>Publicani</b> <span class="gacc">Accept</span> <span class="gdec">Decline</span></span>', 'Gambit offer', 'a deal with a catch, shown only while it is open. Tap its name for the terms.')}
  <h4>The bottom bar</h4>
  ${item(`<span class="mstat">${COIN} <b>9</b><small>+2</small></span>`, 'Treasury', 'denarii now, and what the end of the turn brings in.')}
  ${item('<span class="mstat">★ <b>14</b><small>+6</small></span>', 'Glory', 'your glory so far, and what this turn will add.')}
  ${item('<span class="mstat">⚑ <b>1</b><i class="idl">1 idle</i></span>', 'Legions', 'how many you have; red when one sits idle at the castra while a revolt is coming.')}
  ${item(`<span class="mdec ${sc.decree.faction} on">📜 Decree <b>+3</b></span>`, 'Decree', 'the Senate\'s law of the day and what it is worth to you right now. Tap it to read it again.')}
  ${item('<span class="icodemo">🔊 🎵 ?</span>', 'Sound, music, help', 'sound effects (on), music (off by default), and this help. On phones, a fourth button turns the game sideways.')}
  ${item('<span class="btndemo">Recruit legion · Undo · End turn</span>', 'Buttons', 'recruit a legion (price in green if you can afford it), undo your last move, and end the turn. End turn shows what the turn will pay, and asks twice if the coming events would cut roads.')}
  </div>`;
}

let rulesTab: 'rules' | 'events' | 'map' | 'ui' = 'rules';
/** Illustrated legend for the "?" sheet, drawn with the same art as the board. */
function legendSheet(): string {
  const ic = (vb: string, inner: string, w = 64, h = 44) => `<svg viewBox="${vb}" width="${w}" height="${h}" aria-hidden="true">${inner}</svg>`;
  const tile = (fill: string, props: string) => ic('-30 -20 60 40', `<path d="M-26,-14 L22,-18 L28,8 L-4,18 L-28,10 Z" fill="${fill}" stroke="#1d1409" stroke-width="2.4" stroke-linejoin="round"/>${props}`);
  const tree = (x: number, y: number) => `<g transform="translate(${x},${y}) scale(.8)"><circle r="6.2" fill="#5f9a3c" stroke="#1d1409" stroke-width="1.3"/></g>`;
  const hill = (x: number, y: number) => `<path d="M${x - 10},${y + 4} Q${x - 3},${y - 9} ${x + 10},${y + 4} Z" fill="#c49352" stroke="#1d1409" stroke-width="1.2"/>`;
  const peakS = (x: number, y: number) => `<path d="M${x - 12},${y + 8} L${x},${y - 12} L${x + 12},${y + 8} Z" fill="#9b958a" stroke="#1d1409" stroke-width="1.3"/><path d="M${x - 4},${y - 5} L${x},${y - 12} L${x + 4},${y - 5} Z" fill="#fbfaf5"/>`;
  const road = (cls: string) => `<g class="road ${cls}"><path d="M-28,0 H28" class="${cls === 'built' ? 'pave0' : 'track0'}"/>${cls === 'built' ? '<path d="M-28,0 H28" class="pave1"/><path d="M-28,0 H28" class="pave2"/>' : '<path d="M-28,0 H28" class="track1"/>'}</g>`;
  const row = (icon: string, title: string, text: string) => `<div class="lgrow"><div class="lgic">${icon}</div><div><b>${title}</b> ${text}</div></div>`;
  const R = sc.rules, EGY = boardTheme() === 'egypt';
  return `<div class="legend">
  <h4>The land</h4>
  ${EGY ? row(tile('#cdbb72', palm(10, 6, 0.6) + '<path d="M-24,-4 L24,-8 M-22,6 L26,2" stroke="#5a9fc0" stroke-width="1.4"/>'), 'Plains', 'cheap ground: roads cost 1.') : row(tile('#b6c45a', tree(10, 2)), 'Plains', 'cheap ground: roads cost 1.')}
  ${EGY ? row(tile('#e9d6a2', ripple(-8, 4, 0.8) + ripple(10, 8, 0.7) + dune(8, -2, 0.6)), 'Light forest', 'roads cost 2.') : row(tile('#8fb04c', tree(-8, -2) + tree(6, 4) + tree(16, -4)), 'Light forest', 'roads cost 2.')}
  ${EGY ? row(tile('#d1a15c', mesa(-6, 2, 0.6) + mesa(12, -2, 0.5)), 'Hills', 'roads cost 3.') : row(tile('#c9a25e', hill(-6, 2) + hill(12, -2)), 'Hills', 'roads cost 3.')}
  <p class="muted small">A road costs the <b>harder</b> of the two tiles it crosses, plus a little more the farther it reaches from the castra. The number on the milestone is the price.</p>
  ${row(tile('#245a78', '<path d="M-14,0 q4,-6 8,0 M4,6 q4,-6 8,0" stroke="#cfe7ee" stroke-width="1.6" fill="none"/>') + (EGY ? tile('#f2c65a', bigDune(-6, 4, 0.55) + bigDune(10, -2, 0.5)) : tile('#8f897d', peakS(-6, 2) + peakS(10, 0))), 'Wild land', 'sea and mountains at the edges, lakes and primeval forests inland: no towns, no roads.')}
  ${row(ic('-30 -20 60 40', '<path d="M-26,-10 Q-14,-18 -4,-4 T22,10" stroke="#1d1409" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M-26,-10 Q-14,-18 -4,-4 T22,10" stroke="#5fb0cf" stroke-width="5.5" fill="none" stroke-linecap="round"/>'), 'River', 'between two towns that have no road between them.')}
  ${row(ic('-30 -22 60 44', `<path d="M-26,-16 L26,-16 L26,16 L-26,16 Z" fill="#d9c48c" stroke="#1d1409" stroke-width="2"/><path d="M-26,-16 L26,-16" stroke="#e0b42a" stroke-width="6"/>`), 'Tribe', 'a Gallic people. Its lands have a thick border in its colour, stamped with its symbol (▲ ● ■ ◆); its name carries the same colour and symbol everywhere in the game. Tap an event icon in the forecast, or a tribe\'s name (in a town\'s panel or a message), to light up its lands.')}
  <h4>Towns</h4>
  ${row(ic('-36 -26 72 46', settlement(1, false, '#a24fd6')) + ic('-36 -28 72 48', settlement(3, false, '#a24fd6')), 'Gallic', 'not yet yours.')}
  ${row(ic('-36 -26 72 46', settlement(1, true, '#2f86e0')) + ic('-42 -30 84 52', settlement(4, true, '#2f86e0')), 'Roman', 'linked to the castra: it pays glory (★) every turn.')}
  <p class="muted small">Bigger settlements are worth more: hamlet ★, village ★★, oppidum or temple town ★★★, walled city ★★★★. A pale ★ means an event will add a star.</p>
  ${row(ic('-14 -12 28 24', '<circle cx="0" cy="0" r="9" fill="#f2c230" stroke="#1d1409" stroke-width="2"/><text y="4" font-size="11" font-weight="bold" text-anchor="middle" fill="#8a5a0c" font-family="Georgia,serif">D</text>'), 'Coins', 'beside the stars: the denarii the town pays each turn once linked (towns of 3★ and more pay ★ − 2). A pale coin will come from a coming event.')}
  ${row(ic('-12 -12 24 24', MINI.anchor!(0, 0)), 'Port', 'a town on the sea, with its jetty: pirates strike ports, and some decrees reward them.')}
  ${row(ic('-12 -12 24 24', MINI.tower!(0, 0)), 'Frontier', 'a town by the mountains at the edge of the map, with its watchtower: Germanic warbands strike there.')}
  <p class="muted small">Tap (or hover) any small symbol on the map, under or beside a town, to see what it means.</p>
  ${row(ic('-30 -24 60 46', castraIcon()), 'Castra', 'your camp, where every road starts.')}
  ${row(ic('-36 -30 72 52', settlement(2, true, '#f0b81c') + flame(-8, -2, 0.9) + flame(9, 2, 0.8) + '<g class="siegebadge" transform="translate(20,-16)"><circle r="10"/><text y="4.4">2</text></g>'), 'Besieged', `cut off from the castra: it burns when the red number runs out (${R.siegeTurns} turns). Reconnect it in time.`)}
  ${row(ic('-30 -24 60 46', settlement(2, true, '#f0b81c') + '<g class="warnbadge" transform="translate(18,-14)"><circle r="10"/><text y="4.6">!</text></g>'), 'At risk', 'the forecast will cut this town off.')}
  <h4>Roads and armies</h4>
  ${row(ic('-30 -14 60 28', road('open') + '<g class="mile" transform="translate(0,0)"><path d="M-8,10 L-8,-4 Q-8,-11 0,-11 Q8,-11 8,-4 L8,10 Z"/><text y="4.5">3</text></g>'), 'Track', 'a road you can build; tap it. Hover (or press and hold) to see which towns it links and what it pays. A red price means you cannot afford it yet.')}
  ${row(ic('-30 -14 60 28', road('built')), 'Paved road', 'built and holding.')}
  ${row(ic('-30 -14 60 28', '<path d="M-28,0 H28" stroke="#3b2a1a" stroke-opacity=".55" stroke-width="9" stroke-dasharray="14 9"/><rect x="-18" y="-4" width="5" height="4" class="block" transform="rotate(30 -16 -2)"/><rect x="10" y="2" width="5" height="4" class="block"/><g class="ruinbadge"><rect x="-17" y="-10" width="34" height="20" rx="10"/><path d="M-10,-5 l5,5 m0,-5 l-5,5"/><text x="5" y="4.5">2</text></g>'), 'Destroyed', `rubble: it can be rebuilt when the number reaches 0 (${R.rubbleTurns} turns).`)}
  ${row(ic('-30 -14 60 28', '<path d="M-28,0 H28" stroke="#ffd23a" stroke-opacity=".85" stroke-width="20"/>' + road('built')), 'Gold glow', '(military lens) shielded by a legion or garrison: revolts and raids cannot cut it.')}
  ${row(ic('-30 -14 60 28', '<path d="M-28,0 H28" stroke="#ff2a1a" stroke-opacity=".6" stroke-width="20"/>' + road('built')), 'Red glow', 'the forecast will cut this road.')}
  ${row(ic('-20 -40 40 52', '<line x1="0" y1="8" x2="0" y2="-28" stroke="#1d1409" stroke-width="2.4"/><circle cy="-30" r="3.4" fill="#e0b42a" stroke="#1d1409"/><path d="M0,-24 h15 v12 l-7.5,-3 l-7.5,3 z" fill="#1f5fa8" stroke="#1d1409"/>', 40, 44), 'Legion', `its standard. Shields every road touching its town; marches up to ${R.legionRange} roads once per turn.`)}
  ${row(ic('-36 -26 72 50', '<ellipse cx="0" cy="6" rx="32" ry="21" fill="none" stroke="#5a3a1a" stroke-width="5" stroke-dasharray="3 1.6"/>' + settlement(2, true, '#2f86e0')), 'Garrison', 'palisade: shields its town and every neighbour, for good.')}
  <h4>Events on the map</h4>
  ${row(ic('-30 -20 60 40', `<path d="M-26,-14 L22,-18 L28,8 L-4,18 L-28,10 Z" fill="#8fb04c" stroke="#e0301e" stroke-width="4" stroke-dasharray="8 5"/>${pitchfork(-10, 0, -15)}${flame(10, 2, 1)}`), 'Revolt', 'red rim on the tribe\'s tiles; flames where a road will burn.')}
  ${row(ic('-20 -20 40 40', swords(0, 0, 1)), 'Raiders', 'crossed swords next to the one road they will cut.')}
  ${row(ic('-30 -20 60 40', `<path d="M-26,-14 L22,-18 L28,8 L-4,18 L-28,10 Z" fill="${boardTheme() === 'egypt' ? '#e9d6a2' : '#8fb04c'}" stroke="#1d1409" stroke-width="2.4"/><path d="M-26,-14 L22,-18 L28,8 L-4,18 L-28,10 Z" fill="url(#lgRain)"/>${cloud(0, -2)}`), 'Rains', 'roads touching the tribe cost more; their milestones turn blue.')}
  ${row(ic('-20 -20 40 40', sheaf(0, 0, 1.5)), 'Harvest', 'the tribe\'s tiles turn to wheat; its linked towns pay double.')}
  ${row(ic('-20 -16 40 32', coins(0, 0, 1.2)), 'Tribute', 'linked towns of the tribe pay triple denarii.')}
  ${row(ic('-22 -20 44 36', silverPeak(0, 0)), 'Silver vein', 'the town gains a star for the rest of the day.')}
  ${row(ic('-20 -20 40 40', dagger(0, 0, 1)), 'Bandits', 'a dagger next to the cheapest road they will cut.')}
  ${row(ic('-20 -20 40 40', pirateShip(0, 0, 1.5)), 'Pirates', 'black sails on the tribe\'s ports (towns on the sea): their unshielded roads will be cut.')}
  ${row(ic('-20 -20 40 40', warband(0, 0, 1.5)), 'Germanic incursion', 'shields and spears on the tribe\'s frontier towns (by the mountains at the edge of the map).')}
  ${row(ic('-20 -20 40 40', sickle(0, 0, 1.5)), 'Druid uprising', 'golden sickles on the tribe\'s tiles: a revolt that garrisons do not stop, only legions.')}
  ${row(ic('-20 -18 40 34', bowl(0, 0, 1.5)), 'Famine', 'empty bowls: the tribe\'s linked towns pay no denarii that turn.')}
  ${row(ic('-20 -20 40 40', snowflake(0, 0, 1.6)), 'Early snows', 'snowflakes: forest and hill roads there cost +2 for a while.')}
  ${row(ic('-20 -20 40 40', amphora(0, 0, 1.5)), 'Grain shortage', 'empty amphorae: legions and garrisons cost +2 for a while.')}
  ${row(ic('-20 -20 40 40', purse(0, 0, 1.5)), 'Merchant caravan', 'purses: +4 denarii if one of the tribe\'s towns is linked.')}
  ${row(ic('-20 -20 40 40', olive(0, 0, 1.6)), 'Alliance', 'olive branches and a green tint: roads there cost 1 less for a while.')}
  ${row(ic('-20 -20 40 40', stakes(0, 0, 1.6)), 'Veterans settle', 'stakes and a dashed ring: the town gets a free garrison if it is linked.')}
  ${row(ic('-34 -14 68 28', `<g class="evrow"><rect x="-31" y="-11" width="62" height="22" rx="11" class="pill"/><circle cx="-11" cy="0" r="10" class="evnow"/>${MINI.revolt!(-11, 0)}<circle cx="11" cy="0" r="10" class="evnext"/>${MINI.harvest!(11, 0)}</g>`), 'Under a town', 'what the coming events do there. Solid red circle: this turn; dashed: next turn.')}
  <svg width="0" height="0" style="position:absolute"><defs><pattern id="lgRain" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(25)"><line x1="0" y1="0" x2="0" y2="5" stroke="${boardTheme() === 'egypt' ? '#a8762e' : '#2f6f9f'}" stroke-width="1.4"/></pattern></defs></svg>
  </div>`;
}
/** What building a road would do, in one line: towns it links, glory and denarii per turn, its price. */
function roadPreview(rid: number): string {
  const r = sc.roads[rid]!, A = sc.towns[r.a]!.name, Bn = sc.towns[r.b]!.name;
  const head = `<b>${A} – ${Bn}</b>`;
  if (s.built[rid]) {
    const prot = protectedTowns(sc, s), sh = prot[r.a] || prot[r.b];
    return `${head}<br>Built${sh ? ' · shielded from revolts' : ' · not shielded: a revolt or raid can cut it'}`;
  }
  if (s.rubble[rid]) return `${head}<br>Rubble: can be rebuilt in ${s.rubble[rid]} turn${s.rubble[rid]! > 1 ? 's' : ''}`;
  const cost = roadCost(sc, s, rid), a: Action = { type: 'road', road: rid };
  const rich = cloneState(s); rich.denarii = 9999;
  const why = checkAction(sc, rich, a);
  if (why) return `${head}<br><span class="muted">${why}</span><br>${costTag(cost)}`;
  const before = supplied(sc, s), after = supplied(sc, apply(sc, rich, a));
  const gained = sc.towns.filter((t) => after[t.id] && !before[t.id]);
  const glory = gained.reduce((n, t) => n + townValue(s, t), 0), den = gained.reduce((n, t) => n + townIncome(sc, townValue(s, t)), 0);
  const what = gained.length ? `Links ${gained.map((t) => `${t.name} ${'★'.repeat(townValue(s, t))}`).join(', ')}: <b>+${glory} glory</b>${den ? ` · <b>+${den} denarii</b>` : ''} per turn`
    : 'A second route: no new town, but your network survives if another road is cut';
  return `${head}<br>${what}<br>${costTag(cost)}`;
}
function wireMapExtras() {
  root.querySelector('#tutstart')?.addEventListener('click', () => startTutorial());
  root.querySelector('#tutno')?.addEventListener('click', () => endTutorial('skip'));
  root.querySelector('#tutskip')?.addEventListener('click', () => endTutorial('skip'));
  root.querySelector('#tutnext')?.addEventListener('click', () => { if (tut) { tut.step++; render(); } });
  root.querySelector('#tutreplay')?.addEventListener('click', () => startTutorial());
  const el = tutTarget()?.el;
  if (el) root.querySelector(el)?.classList.add('tutpulse');
  // keep the coach bubble away from what it points at: top half target -> bubble at the bottom, and vice versa
  const dock = root.querySelector<HTMLElement>('.dock.bottom'), mw = root.querySelector<HTMLElement>('.mapwrap');
  const mark = root.querySelector<Element>('#map .tutglow, #map .tutring');
  if (dock && mw && mark) {
    const m = mark.getBoundingClientRect(), w = mw.getBoundingClientRect();
    dock.classList.toggle('totop', m.top + m.height / 2 > w.top + w.height * 0.5);
  }
  // road preview: hover with a mouse, press and hold on touch
  const wrap = root.querySelector<HTMLElement>('.mapwrap'), tip = root.querySelector<HTMLElement>('.rprev');
  if (!wrap || !tip) return;
  const show = (rid: number, x: number, y: number) => {
    tip.innerHTML = roadPreview(rid); tip.style.display = '';
    const r = wrap.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.max(4, Math.min(r.width - w - 4, x - r.left - w / 2))}px`;
    tip.style.top = `${Math.max(4, y - r.top - h - 18)}px`;
  };
  const hide = () => { tip.style.display = 'none'; };
  let hold: ReturnType<typeof setTimeout> | undefined;
  root.querySelectorAll<SVGGElement>('#map g.road').forEach((g) => {
    const rid = Number(g.dataset.road);
    // a click hides the preview until the mouse moves on (it described the road before the click)
    g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !pressedAt) show(rid, e.clientX, e.clientY); });
    g.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; if (pressedAt && Math.hypot(e.clientX - pressedAt.x, e.clientY - pressedAt.y) < 8) return; pressedAt = null; show(rid, e.clientX, e.clientY); });
    g.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    g.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') { pressedAt = { x: e.clientX, y: e.clientY }; hide(); return; }
      const x = e.clientX, y = e.clientY;
      hold = setTimeout(() => { show(rid, x, y); suppressClick = true; buzz(8); }, 420);
    });
    const cancel = () => { if (hold) clearTimeout(hold); hold = undefined; };
    g.addEventListener('pointerup', () => { cancel(); if (suppressClick) setTimeout(() => { suppressClick = false; hide(); }, 1800); });
    g.addEventListener('pointercancel', cancel);
    g.addEventListener('pointerleave', cancel);
  });
}

function coachBubble(): string {
  const st = TUT_STEPS[tut!.step]!;
  return `<div class="coach"><div class="cstep">Training · ${tut!.step + 1}/${TUT_STEPS.length}</div><div class="ctext">${colorTribes(st.text).replace('{where}', `<span class="where">${boardRotated ? 'on the left' : 'at the bottom'}</span>`).replace('{par}', par !== null ? `, where Caesar scored <b>${par}</b>` : '')}</div>
    <div class="cbtns">${st.next ? `<button id="tutnext" class="primary">${st.next}</button>` : ''}<button id="tutskip" class="link">Skip tutorial</button></div></div>`;
}
function tutPromptSheet(): string {
  return `<div class="sheet tutsheet"><div class="sheetbox tutbox"><div class="dk">All Roads Lead to Rome</div><h2>First time in Gaul?</h2>
    <p>A two-minute guided campaign: build roads, read the forecast, move a legion and weather a revolt.</p>
    <button id="tutstart" class="primary">Start the tutorial</button><button id="tutno" class="link">Skip, I know the roads</button></div></div>`;
}
function decreeSheet(): string {
  if (sc.decree.kind === 'none') return '';
  const d = sc.decree, spec = decreeSpec(d.kind), ds = decreeStatus(sc, s), started = log.length > 0;
  const fac = `${FACTION[d.faction].name} · ${FACTION[d.faction].motto}${d.faction === 'augures' ? ' · the Sibylline Books were opened' : ''}`;
  return `<div class="sheet decreesheet"><div class="sheetbox decreebox ${d.faction}">
    <div class="dk">Decree of the Senate · ${sk ? `Skirmish #${sk.entry.id}` : niceDate()}</div>
    <div class="dfac">${fac}</div>
    <h2>📜 ${d.title}</h2>
    <p class="drule">${decreeRule(d)}</p>
    <p class="deffect">${spec.effect}</p>
    ${started ? `<div class="dprog">So far: ${ds.progress}${ds.bonus ? ` · <b>+${ds.bonus}★</b> at the end of the game` : ''}</div>` : '<div class="dprog">“Every turn, adding up” bonuses are paid at the end of each turn and add up; “at the end of the game” bonuses are paid once, after turn 10. Tap the decree banner any time to read it again.</div>'}
    <button id="decreego" class="primary">${started ? 'Back to the campaign' : 'March on Gaul'}</button>
  </div></div>`;
}
/** Where the castra sits on screen, in words ("on the left", "at the bottom"…), measured, not assumed. */
function castraWhere(): string {
  const t = document.querySelector('#map g.town[data-town="0"]')?.getBoundingClientRect(), m = document.querySelector('#map')?.getBoundingClientRect();
  if (!t || !m || !m.width) return boardRotated ? 'on the left' : 'at the bottom';
  const dx = (t.x + t.width / 2 - m.x) / m.width - 0.5, dy = (t.y + t.height / 2 - m.y) / m.height - 0.5;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'on the left' : 'on the right') : dy < 0 ? 'at the top' : 'at the bottom';
}
/** A gambit offer in the forecast: the deal, then Accept / Decline (or its status). */
function gambitLine(e: GameEvent, when: string, offers: number[]): string {
  // only open offers get a row (accepted, declined and closed ones live in the strip as icons)
  const i = sc.events.indexOf(e), spec = evSpec(e.kind), tribe = sc.tribes[e.tribe]!;
  if ((s.accepted ?? []).includes(i) || declined.has(i) || !offers.includes(i) || isOver(sc, s) || tut) return '';
  const text = spec ? spec.text({ who: tribe.name, town: e.town !== undefined ? sc.towns[e.town]!.name : '', when }).replace(/<[^>]+>/g, '') : e.kind;
  return `<div class="offer"><button type="button" class="otitle" data-tip="${attr(`${spec?.title ?? 'Gambit'}: ${text}`)}">${evEmoji(e.kind) ?? '⚖️'} <b>${spec?.title ?? e.kind}</b> ${tribeTag(tribe.id)} <span class="oi">ⓘ</span></button><button class="gacc" data-accept="${i}">Accept</button><button class="gdec" data-decline="${i}">Decline</button></div>`;
}

/** The compact layout's one-line bar above the buttons: treasury, glory, legions, decree, sound, help. */
/** The glory counter: glory so far while playing; once the game is over, the final score (decree bonus and lost legions included). */
const gloryShown = () => (isOver(sc, s) ? score(sc, s).total : s.glory);
/** Lost legions are taken off at the end of the game: show it beside the glory so the final score is no surprise. */
const lostCost = () => (!isOver(sc, s) && s.lost ? ` <small class="bad">−${s.lost * sc.rules.lostLegionPenalty}</small>` : '');
function gloryTip(y: ReturnType<typeof yieldPerTurn>): string {
  if (isOver(sc, s)) {
    const b = score(sc, s);
    return `Final score ${b.total}: ${b.glory} glory from your towns${b.decree ? ` + ${b.decree} from the decree` : ''}${b.penalty ? ` − ${b.penalty} for lost legions` : ''}.`;
  }
  const lost = s.lost ? ` Lost legions cost ${s.lost * sc.rules.lostLegionPenalty} at the end of the game.` : '';
  return `Glory: ${s.glory}, +${y.glory + y.bonusGlory} at the end of this turn (after this turn's revolts).${lost}`;
}

function miniBar(y: ReturnType<typeof yieldPerTurn>, ds: ReturnType<typeof decreeStatus>, idle: number, threat: boolean): string {
  const gain = (n: number) => (n ? `<small>${signed(n)}</small>` : '');
  const dec = ds.bonus ? `+${ds.bonus}` : s.dGlory ? `+${s.dGlory}` : '';
  const decTip = `${sc.decree.title}: ${decreeRule(sc.decree)} (${ds.progress}). Tap to read the decree.`;
  return `<div class="mini">
    <span class="mstat money" data-tip="${attr(`Treasury: ${s.denarii} denarii, ${signed(netIncome(y))} at the end of this turn${y.purseDebt ? ` (${y.purseDebt} of it repays the loan)` : ''}.`)}"><i class="mico coin">${COIN}</i><b data-ctr="denarii">${s.denarii}</b>${gain(netIncome(y))}</span>
    <span class="mstat money" data-tip="${attr(gloryTip(y))}"><i class="mico star">★</i><b data-ctr="glory">${gloryShown()}</b>${isOver(sc, s) ? '' : gain(y.glory + y.bonusGlory)}${lostCost()}</span>
    <span class="mstat${idle && threat ? ' warn' : ''}" data-tip="${attr(`${s.legions.length} legion${s.legions.length === 1 ? '' : 's'}${idle ? `, ${idle} idle at the castra${threat ? ' while a revolt looms' : ''}` : ''}.`)}">⚑ <b>${s.legions.length}</b>${idle ? `<i class="idl">${idle} idle</i>` : ''}</span>
    ${tut && tutStepId() !== 'decree' && !tutDecreeSeen ? '' : `<button id="decree" class="mdec ${sc.decree.faction}${dec ? ' on' : ''}" title="${attr(decTip)}">📜 <span class="mlabel">Decree</span>${dec ? ` <b>${dec}</b>` : ''}</button>`}
    <span class="micons">${!isTouch() ? '' : `<button id="turn" title="${sideways ? 'Back to portrait' : 'Landscape view: turn your phone sideways'}">${sideways ? PHONE_UPRIGHT : PHONE_SIDEWAYS}</button>`}<button id="snd" title="${sound ? 'Sound effects on: tap to mute' : 'Sound effects off'}">${sound ? '🔊' : '🔇'}</button><button id="mus" class="${music ? '' : 'off'}" title="${music ? 'Music on: tap to stop' : 'Music off'}">🎵</button>${sk ? '<button id="skleave" title="Leave this skirmish">🏳</button>' : ''}<button id="rules" title="How to play">?</button></span>
  </div>`;
}

/** Light up one tribe's lands for a moment (from a tribe tag, or an event icon in the forecast). */
function highlightTribe(k: number) {
  hlTribe = k;
  if (hlTimer) clearTimeout(hlTimer);
  hlTimer = setTimeout(() => { hlTribe = null; if (view === 'map') render(); }, 2600);
  render();
}

/** Escape text for an HTML attribute. */
const attr = (x: string) => x.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// ---- explanations for small symbols: tap (or hover with a mouse) shows a bubble; it lives outside
// the re-rendered root so hovering never forces a render.
let tipEl: HTMLDivElement | null = null, tipTimer: ReturnType<typeof setTimeout> | undefined;
function showTip(text: string, x: number, y: number, sticky: boolean) {
  if (!text) return;
  tipEl ??= Object.assign(document.createElement('div'), { className: 'tipbub' });
  if (!tipEl.isConnected) document.body.appendChild(tipEl);
  tipEl.innerHTML = colorTribes(escHtml(text));
  tipEl.style.display = 'block';
  const w = Math.min(280, window.innerWidth - 16), left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2));
  tipEl.style.width = `${w}px`; tipEl.style.left = `${left}px`;
  const h = tipEl.offsetHeight, top = y - h - 14 < 8 ? y + 18 : y - h - 14;
  tipEl.style.top = `${top}px`;
  if (tipTimer) clearTimeout(tipTimer);
  if (sticky) tipTimer = setTimeout(hideTip, 4500);
}
function hideTip() { if (tipEl) tipEl.style.display = 'none'; }

/** Event icon kind → the event it stands for (most are the same). */
const ICON_EVENT: Record<string, string> = { toll: 'rains', boom: 'silver', raid: 'raid', gambit: 'gambit' };
/** The explanation shown when a player taps or hovers a small icon under a town. */
function iconTip(kind: string, now: boolean): string {
  const when = now ? 'at the end of this turn' : 'at the end of next turn';
  if (kind === 'gambit') return `A gambit concerns this town's tribe ${when}: an offer with a catch. Accept or decline it in the forecast.`;
  const spec = evSpec(ICON_EVENT[kind] ?? kind);
  if (!spec) return '';
  const tone = spec.tone === 'threat' ? 'Hostile' : spec.tone === 'hardship' ? 'Hardship' : spec.tone === 'boon' ? 'Boon' : 'Gambit';
  const timing = kind === 'toll' || kind === 'snows' || kind === 'alliance' ? (now ? 'in force now' : 'from next turn') : when;
  return `${spec.title} (${tone}, ${timing}): ${spec.effectText}`;
}

/** Icon kinds by tone (t = hostile, h = hardship, b = boon): colours the circle under a town. */
const ICON_TONE: Record<string, 't' | 'h' | 'b' | 'g'> = {
  publicani: 'g', oppidum: 'g', frumentatio: 'g', argentarii: 'g', gambit: 'g',
  revolt: 't', raid: 't', bandits: 't', druids: 't', pirates: 't', germani: 't', idus: 't', toll: 'h', famine: 'h', snows: 'h', levy: 'h',
  harvest: 'b', tribute: 'b', boom: 'b', caravan: 'b', alliance: 'b', veterans: 'b',
};
/** Forecast emoji per event kind (falls back to the tone's). */
const EV_EMOJI: Record<string, string> = {
  revolt: '🔥', raid: '⚔️', bandits: '🗡️', druids: '🌙', pirates: '🏴', germani: '🪓', idus: '🗡️', rains: '🌧️', famine: '🥣', snows: '❄️', levy: '🏺',
  publicani: '⚖️', oppidum: '🏰', frumentatio: '🍞', argentarii: '🏦', muster: '⚑',
  harvest: '🌾', tribute: COIN, silver: '⛰️', caravan: '💰', alliance: '🫒', veterans: '🛡️',
};
/** Aegyptus: the same events drawn the Egyptian way (the word pass renames them, skin.ts). */
const EV_EMOJI_EGYPT: Record<string, string> = { rains: '🌪️', snows: '💨', druids: '☥', germani: '🛡️', silver: '⛰️', caravan: '🐪', harvest: '🌾', famine: '🥣' };
const evEmoji = (k: string): string | undefined => (boardTheme() === 'egypt' ? EV_EMOJI_EGYPT[k] : undefined) ?? EV_EMOJI[k];
/** Every event in the game, by kind, with how a day's events are drawn. */
function eventsSheet(): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dateLabel) ? dateLabel : undefined, B = budgetAsOf(day), R = sc.rules, EVENTS = eventsAsOf(day);
  const mini = (e: (typeof EVENTS)[number]) => {
    const key = miniKey(e.kind, e.effect as never);
    return `<svg viewBox="-12 -12 24 24" width="30" height="30" aria-hidden="true">${MINI[key]?.(0, 0) ?? ''}</svg>`;
  };
  const often = (e: (typeof EVENTS)[number]) => {
    const same = EVENTS.filter((x) => x.tone === e.tone), share = e.gen.weight / same.reduce((n, x) => n + x.gen.weight, 0);
    return share >= 0.5 ? 'common' : share >= 0.3 ? 'frequent' : 'occasional';
  };
  const group = (tone: 'threat' | 'hardship' | 'boon' | 'gambit', title: string, blurb: string, n: [number, number]) => `
    <h4 class="tone-${tone[0]}">${title} <span class="muted small">${n[0] === n[1] ? n[0] : `${n[0]}–${n[1]}`} a day</span></h4><p class="muted small">${blurb}</p>
    ${EVENTS.filter((e) => e.tone === tone && (e.gen.weight > 0 || sc.events.some((x) => x.kind === e.kind))).map((e) => `<div class="lgrow"><div class="lgic">${mini(e)}</div><div><b>${e.title}</b> <span class="muted small">· ${e.gen.rare ? 'rare (one a day at most)' : often(e)}, turns ${e.gen.minTurn}–${e.gen.maxTurn}${e.gen.maxPerDay > 1 ? `, up to ${e.gen.maxPerDay}×` : ''}</span><br>${e.effectText}</div></div>`).join('')}`;
  return `<div class="legend events">
    <p class="small">Each day's events are drawn at random, then fixed: everyone playing that day faces the same ones, on the same turns. Each strikes one tribe. You see them ${R.eventLookahead} turns ahead in the forecast, and on the map.</p>
    ${group('threat', 'Hostile', 'They cut roads touching the tribe unless a legion or garrison shields them. Cut roads lie in rubble for ' + R.rubbleTurns + ' turns.', B.threat)}
    ${group('hardship', 'Hardships', 'They make roads, troops or the tribe\'s pay costlier for a while.', B.hardship)}
    ${B.gambit ? group('gambit', 'Gambits', 'Offers with a catch. Nothing happens unless you press Accept while the offer is in the forecast; accepting is final, and then each part happens on its turn. Caesar never takes a gambit: used well, they are your edge over him.', B.gambit) : ''}
    ${group('boon', 'Boons', 'They help: extra pay, cheaper roads or free defences, mostly for towns you have linked to the castra.', B.boon)}
  </div>`;
}
function rulesSheet(): string {
  const R = sc.rules;
  const tabs = `<div class="tabs"><button data-tab="rules" class="${rulesTab === 'rules' ? 'on' : ''}">How to play</button><button data-tab="events" class="${rulesTab === 'events' ? 'on' : ''}">Events</button><button data-tab="map" class="${rulesTab === 'map' ? 'on' : ''}">Reading the map</button><button data-tab="ui" class="${rulesTab === 'ui' ? 'on' : ''}">The screen</button></div>`;
  const rules = `<ul>
    <li><b>Roads</b> (tracks with a milestone showing the cost) link towns to the castra. Linked towns turn Roman and pay their ★ in glory every turn; 3★+ towns also pay denarii.</li>
    <li><b>Events</b> are scattered over each day's ${R.turns} turns, different every day, and each one strikes a tribe. They come in three kinds:
      <b class="bad">hostile</b> events cut your unshielded roads, <b class="tone-h">hardships</b> make things costlier for a while, and <b class="tone-b">boons</b> help. Some days also bring a <b class="tone-g">gambit</b>: an offer with a catch that you may accept or let pass.
      The forecast shows what happens this turn and next; <b>Events</b> (tab above) lists every event and what it does.</li>
    <li><b>Legions</b> (standards) shield every road touching their town. Each marches up to ${R.legionRange} roads once per turn: tap its standard, then a ringed town (or tap a town for its orders). A cut-off legion can't move.</li>
    <li><b>Garrisons</b> (palisade) shield their town and all its neighbours, for good.</li>
    <li>A cut-off town burns its roads after ${R.siegeTurns} turns; legions inside are lost (−${R.lostLegionPenalty}).</li>
    <li><b>The Senate's decree</b> changes the day's rules or pays a bonus (📜 banner). After playing, vote for tomorrow's: the <b>Populares</b> (glory and ambition) or the <b>Optimates</b> (order and caution). Some nights the <b>Augures</b> join the ballot with a sealed decree that overturns a rule of the game.</li>
    <li><b>Score</b> = glory + Senate decree bonus − lost legions. Beat Caesar's score.</li></ul>
    <button id="tutreplay">Replay the tutorial</button>`;
  return `<div class="sheet"><div class="sheetbox"><button id="rulesx" class="x">×</button>${tabs}${rulesTab === 'rules' ? rules : rulesTab === 'events' ? eventsSheet() : rulesTab === 'ui' ? screenSheet() : legendSheet()}<div class="sheetfoot"><button id="mus2" class="link">${music ? 'Music: on · turn off' : 'Music: off · turn on'}</button>${social?.bug ? ' · <button id="bugopen" class="link">🐞 Report a bug</button>' : ''}</div><div class="ver">${versionLabel()}</div></div></div>`;
}
function pickLegion(i: number) {
  if (tut && !['standard', 'march'].includes(TUT_STEPS[tut.step]!.id)) { say('Follow the highlighted step, or skip the tutorial.', 2500); render(); return; }
  if (moving === i) { moving = null; render(); return; }
  const sup = supplied(sc, s);
  const why = s.moved[i] ? 'already marched this turn' : !sup[s.legions[i]!] ? 'is cut off and cannot march'
    : legionReach(sup)[i]!.size === 0 ? `has no town within ${sc.rules.legionRange} roads` : '';
  if (why) { moving = null; msg = `Legio ${ROMAN[i] ?? i + 1} ${why}.`; play('error'); render(); return; }
  moving = i; sel = null; msg = ''; render();
}

function render() {
  checkAchievements();
  tutCheck();
  if (tut && tut.step >= TUT_STEPS.length) { endTutorial('done'); return; }
  if (statsOpen) { renderStats(); return; }
  if (view === 'results') { if (sk) renderSkirmish(); else renderResults(); return; }
  if (compare) { renderCompare(); return; }
  const over = isOver(sc, s);
  const y = yieldPerTurn(sc, s);
  const idle = s.legions.filter((p, i) => p === sc.castra && !s.moved[i]).length;
  const threat = visibleEvents(sc, s.turn, s).some(isThreat);
  lens = moving !== null ? 'military' : lensOverride ?? autoLens();
  const ds = decreeStatus(sc, s);
  const prevWrap = root.querySelector<HTMLElement>('.mapwrap');
  if (prevWrap) mapArea = { w: prevWrap.clientWidth, h: prevWrap.clientHeight };
  boardRotated = chooseOrientation();
  // phones and narrow posts: no header; everything it held sits in one bar above the buttons
  const compact = !nativeWide() && !sideways;
  $('app').innerHTML = `
  <div class="layout${compact ? ' compact' : ''}">
    <section class="mapcol"><div class="mapwrap${cam.z > 1.02 ? ' zoomed' : ''}"><div class="bgslot"></div>${svg()}${over ? '<div class="dusk" aria-hidden="true"></div>' : ''}
    <div class="lens"><button data-lens="map" class="${lens === 'map' ? 'on' : ''}">Roads</button><button data-lens="military" class="${lens === 'military' ? 'on' : ''}">Military</button></div>
    <div class="rprev" style="display:none"></div>
<button id="zoomreset" class="${cam.z > 1.02 ? 'show' : ''}" title="Show the whole map" aria-label="Show the whole map">⤢</button></div>
    ${tut ? `<div class="dock bottom">${coachBubble()}${msg ? `<div class="msg"><span>${msg}</span><button id="msgx" aria-label="Close">×</button></div>` : ''}</div>` : ''}
    </section>
    <aside class="side">
    ${compact ? '' : `<header><div class="title"><span class="ttl"><b>All Roads Lead to Rome</b> <span class="muted">· ${sk ? `Skirmish #${sk.entry.id}` : niceDate()} · ${sc.decree.faction}</span>${sk ? ' <span class="practice">skirmish</span>' : practice ? ' <span class="practice">practice</span>' : ''}</span>
      <span class="icons">${nativeWide() || !isTouch() ? '' : `<button id="turn" title="${sideways ? 'Back to portrait' : 'Landscape view: turn your phone sideways'}" aria-pressed="${sideways}">${sideways ? PHONE_UPRIGHT : PHONE_SIDEWAYS}</button>`}<button id="snd" title="${sound ? 'Sound effects on: tap to mute' : 'Sound effects off'}">${sound ? '🔊' : '🔇'}</button><button id="mus" class="${music ? '' : 'off'}" title="${music ? 'Music on: tap to stop' : 'Music off'}">🎵</button>${sk ? '<button id="skleave" title="Leave this skirmish">🏳</button>' : ''}<button id="rules" title="How to play">?</button></span></div>
      <div class="stats">Turn <b>${Math.min(s.turn, sc.rules.turns)}/${sc.rules.turns}</b> · <span class="money"><i class="mico coin">${COIN}</i><b data-ctr="denarii">${s.denarii}</b></span> denarii <span class="muted">(+${y.income}${y.bonusIncome + y.purseGain ? `<b class="harvest">+${y.bonusIncome + y.purseGain}</b>` : ''}${y.purseDebt ? `<b class="bad" title="loan instalment">−${y.purseDebt}</b>` : ''}<span class="unit">/turn</span>)</span> · <span class="money" data-tip="${attr(gloryTip(y))}"><i class="mico star">★</i><b data-ctr="glory">${gloryShown()}</b></span> ${over ? 'final score' : `glory${lostCost()} <span class="muted">(+${y.glory}${y.bonusGlory ? `<b class="harvest">+${y.bonusGlory}</b>` : ''}<span class="unit">/turn</span>)</span>`}
        <span class="leg-inline${idle && threat && !over ? ' idlewarn' : ''}" title="${idle ? `${pl(idle, 'legion')} idle at the castra` : 'Legions'}">· ⚑ ${s.legions.length}${idle && !over ? `<span class="idletag">· ${idle} idle</span>` : ''}</span></div>
      <div class="stats legline${idle && !over ? ' idle' : ''}"><span class="legcount">⚑ ${pl(s.legions.length, 'legion')}${idle ? ' · ' : ''}</span>${idle && !over ? `<span class="${threat ? 'nudge' : 'muted'}">${idle} idle at the castra${threat ? ' while a revolt looms' : ''}</span>` : ''}</div>
      ${tut && tutStepId() !== 'decree' && !tutDecreeSeen ? '' : `<button class="decree ${sc.decree.faction}" id="decree" title="Read the Senate's decree"><b>📜 ${sc.decree.title}</b> <span class="dnow ${ds.bonus || s.dGlory ? 'on' : ''}">${ds.bonus ? `+${ds.bonus} now` : s.dGlory ? `+${s.dGlory} so far` : 'not yet'}</span>
        <span class="dtext">${decreeRule(sc.decree)} <span class="muted">(${ds.progress})</span></span><span class="dread">Read ›</span></button>`}</header>`}
      <div class="sidebody">${over ? `<div class="overnote">The campaign is over${sk ? ' (skirmish)' : practice ? ' (practice run)' : ''}. Take a last look at your roads.</div><button id="verdict" class="verdict">${sk ? 'Skirmish over · see results' : practice ? 'Practice over · see results' : busy ? 'The Senate deliberates…' : "🏛️ Hear the Senate's verdict"}</button>` : `${statusLine()}${townPanel()}<div class="forecast">${forecast()}</div>`}</div>
      ${compact ? miniBar(y, ds, idle, threat) : ''}
      ${over ? '' : `<div class="bar"><button id="recruit">Recruit legion ${costTag(recruitCost(sc, s))}</button>
        <button id="undo" ${undoStack.length && !tut ? '' : 'disabled'} title="${tut ? 'Undo is off during training' : 'Take back your last move. Undo works within a turn: End turn is final.'}">Undo</button>
        <button id="end" class="primary endbtn${confirmEnd ? ' warn' : ''}">${confirmEnd ? `<span>⚠ ${pl(forecastPreview(sc, s)?.cut.length ?? 0, 'road')} will be cut</span><small>tap again to end the turn</small>` : (s.turn === sc.rules.turns ? `<span>End the day</span><small>final score: about ${s.glory + y.glory + y.bonusGlory} glory${decreeStatus(sc, s).bonus ? ` + ${decreeStatus(sc, s).bonus} decree` : ''}</small>` : `<span>End turn</span><small>+${y.glory + y.bonusGlory} glory · ${signed(netIncome(y))} denarii</small>`)}</button></div>`}
    </aside>
  </div>
    ${showRules ? rulesSheet() : ''}${decreeModal ? decreeSheet() : ''}${tutPrompt ? tutPromptSheet() : ''}${bugSheetHtml()}`;
  attachBoard();
  wireMapExtras();
  root.querySelectorAll('.coach .where').forEach((el) => (el.textContent = castraWhere()));
  root.querySelectorAll<HTMLElement>('.tribe[data-tribe]').forEach((el) => {
    el.addEventListener('pointerdown', (e) => e.stopPropagation()); // not a map drag
    el.onclick = (e) => { e.stopPropagation(); highlightTribe(Number(el.dataset.tribe)); };
  });
  wireZoom(root.querySelector<HTMLElement>('.mapwrap')!);
  root.querySelector('#zoomreset')?.addEventListener('click', () => { cam.z = 1; cam.cx = NaN; render(); });
  $('map').addEventListener('mouseover', (ev) => {
    const t = (ev.target as Element).closest<SVGElement>('.tipme');
    if (t) { const r = t.getBoundingClientRect(); showTip(t.dataset.tip ?? '', r.x + r.width / 2, r.y, false); }
  });
  $('map').addEventListener('mouseout', (ev) => { if ((ev.target as Element).closest('.tipme')) hideTip(); });
  $('map').addEventListener('click', (ev) => {
    const tip = (ev.target as Element).closest<SVGElement>('.tipme');
    if (tip && !suppressClick) { const r = tip.getBoundingClientRect(); showTip(tip.dataset.tip ?? '', r.x + r.width / 2, r.y, true); return; }
    hideTip();
    if (suppressClick || over) return;
    const leg = (ev.target as Element).closest('[data-leg]');
    if (leg) { pickLegion(Number(leg.getAttribute('data-leg'))); return; }
    const g = (ev.target as Element).closest('[data-road],[data-town]');
    if (moving !== null) {
      // movement mode: only a ringed town is a valid target; anything else cancels safely
      const t = g?.hasAttribute('data-town') ? Number(g.getAttribute('data-town')) : -1;
      const i = moving; moving = null;
      if (legionReach(supplied(sc, s))[i]!.has(t)) act({ type: 'camp', legion: i, town: t }); else render();
      return;
    }
    if (!g) return;
    if (g.hasAttribute('data-road')) act({ type: 'road', road: Number(g.getAttribute('data-road')) });
    else { const t = Number(g.getAttribute('data-town')); sel = sel === t ? null : t; msg = ''; render(); }
  });
  root.querySelectorAll<HTMLButtonElement>('[data-lens]').forEach((b) =>
    (b.onclick = () => { const v = b.dataset.lens as typeof lens; lensOverride = v === autoLens() ? null : v; render(); }));
  root.querySelector<HTMLButtonElement>('#turn')?.addEventListener('click', () => setSideways(!sideways));
  $('app').classList.toggle('sideways', sideways && !nativeWide());
  root.querySelector('#decree')?.addEventListener('click', () => { decreeModal = true; track('decree_read'); render(); });
  if (decreeModal && decreeIntro) { decreeIntro = false; fxDecreeOpen(root, FACTION_COL[sc.decree.faction] ?? '#8b1a1a'); sfxLater('crack', 400); }
  root.querySelector('#decreego')?.addEventListener('click', () => {
    try { localStorage.setItem(decreeSeenKey(storeKey()), '1'); } catch { /* storage unavailable */ }
    play(log.length ? 'stow' : 'call'); // marching out for the first time: the buccina sounds
    // the card shrinks into the Decree button (0.3 s; a tap ends it), then the board is live
    void fxDecreeStow(root).then(() => { if (!decreeModal) return; decreeModal = false; render(); fxDecreeLanded(root); setTimeout(pinchHint, 450); });
  });
  $('snd').onclick = () => { sound = !sound; setSound(sound); if (sound) play('turn'); render(); };
  $('mus').onclick = () => { music = !music; setMusic(music); render(); };
  $('rules').onclick = () => { showRules = !showRules; render(); };
  root.querySelector('#rulesx')?.addEventListener('click', () => { showRules = false; render(); });
  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => (b.onclick = () => { rulesTab = b.dataset.tab as typeof rulesTab; render(); }));
  root.querySelector('#msgx')?.addEventListener('click', () => { say('', 0); render(); });
  root.querySelector('#verdict')?.addEventListener('click', () => { view = 'results'; resultsFx = true; render(); });
  root.querySelector('#skleave')?.addEventListener('click', () => leaveSkirmish());
  root.querySelectorAll<HTMLButtonElement>('[data-vote]').forEach((b) => (b.onclick = () => void doVote(b.dataset.vote as Faction)));
  root.querySelector<HTMLButtonElement>('#share')?.addEventListener('click', () => void doShare());
  root.querySelector<HTMLButtonElement>('#join')?.addEventListener('click', () => void doJoin());
  if (!over) {
    $('recruit').onclick = () => act({ type: 'recruit' });
    // forecast icons and offer titles explain themselves (tap, or hover with a mouse)
    const side = root.querySelector<HTMLElement>('.sidebody');
    const mini = root.querySelector<HTMLElement>('.mini');
    // never let the bar spill off a narrow screen: drop the idle note, then the 'Decree' word, then tighten
    if (mini) for (const k of ['tight1', 'tight2', 'tight3']) { if (mini.scrollWidth <= mini.clientWidth + 1) break; mini.classList.add(k); }
    mini?.addEventListener('click', (ev) => { const t = (ev.target as Element).closest<HTMLElement>('.mstat[data-tip]'); if (t) { const r = t.getBoundingClientRect(); showTip(t.dataset.tip ?? '', r.x + r.width / 2, r.y, true); } });
    mini?.addEventListener('mouseover', (ev) => { const t = (ev.target as Element).closest<HTMLElement>('.mstat[data-tip]'); if (t) { const r = t.getBoundingClientRect(); showTip(t.dataset.tip ?? '', r.x + r.width / 2, r.y, false); } });
    mini?.addEventListener('mouseout', (ev) => { if ((ev.target as Element).closest('.mstat')) hideTip(); });
    side?.addEventListener('mouseover', (ev) => { const t = (ev.target as Element).closest<HTMLElement>('[data-tip]'); if (t) { const r = t.getBoundingClientRect(); showTip(t.dataset.tip ?? '', r.x + r.width / 2, r.y, false); } });
    side?.addEventListener('mouseout', (ev) => { if ((ev.target as Element).closest('[data-tip]')) hideTip(); });
    side?.addEventListener('click', (ev) => {
      const t = (ev.target as Element).closest<HTMLElement>('[data-tip]');
      if (!t) return;
      const r = t.getBoundingClientRect();
      showTip(t.dataset.tip ?? '', r.x + r.width / 2, r.y, true);
      if (t.dataset.hl !== undefined) highlightTribe(Number(t.dataset.hl)); // and light up the tribe's lands
    });
    // accepting stamps a seal on the offer (and the money-lenders' coins fly into the treasury); declining burns it
    root.querySelectorAll<HTMLElement>('[data-accept]').forEach((b) => (b.onclick = () => {
      const row = b.closest<HTMLElement>('.offer'), event = Number(b.dataset.accept), rect = row?.getBoundingClientRect(), d0 = s.denarii;
      play('seal');
      void (row ? fxSeal(row) : Promise.resolve()).then(() => {
        act({ type: 'accept', event });
        if (rect && s.denarii > d0) fxCoins(root, rect, s.denarii - d0, d0, (i) => play('coin', i));
      });
    }));
    root.querySelectorAll<HTMLElement>('[data-decline]').forEach((b) => (b.onclick = () => {
      const row = b.closest<HTMLElement>('.offer'), event = Number(b.dataset.decline);
      play('scroll');
      void (row ? fxBurn(row) : Promise.resolve()).then(() => { declined.add(event); render(); });
    }));
    root.querySelectorAll<HTMLElement>('[data-undecline]').forEach((b) => (b.onclick = () => { declined.delete(Number(b.dataset.undecline)); render(); }));
    $('undo').onclick = undo;
    $('end').onclick = () => act({ type: 'end' });
    root.querySelectorAll<HTMLButtonElement>('[data-camp]').forEach((b) => {
      b.onclick = () => act({ type: 'camp', legion: Number(b.dataset.camp), town: sel! });
      const hl = (on: boolean) => root.querySelectorAll(`.standard[data-leg="${b.dataset.camp}"]`).forEach((g) => g.classList.toggle('hl', on));
      b.onmouseenter = () => hl(true); b.onmouseleave = () => hl(false);
      b.onfocus = () => hl(true); b.onblur = () => hl(false);
    });
    const g = root.querySelector<HTMLButtonElement>('[data-garrison]');
    if (g) g.onclick = () => act({ type: 'garrison', town: sel! });
  }
}

