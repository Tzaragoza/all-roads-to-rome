// The guided first campaign: a small handcrafted map on the real engine, with a revolt placed so
// every lesson happens on cue. Each step says one thing, highlights one target, allows one kind of
// action, and advances when the player has done it (or taps Next on purely informative steps).
import { DEFAULT_RULES } from '../../shared/engine';
import type { Action, Road, Scenario, State, Terrain, Town } from '../../shared/engine';

const COST: Record<Terrain, number> = { plain: 1, forest: 2, hills: 3 };

function build(): Scenario {
  const T: Array<[string, number, number, number, number, Terrain]> = [
    // name, x, y, value, tribe, terrain
    ['Castra', 50, 92, 0, -1, 'plain'],
    ['Aquae', 32, 72, 1, 0, 'plain'],
    ['Vesontio', 68, 70, 2, 0, 'forest'],
    ['Lutetia', 30, 46, 3, 1, 'plain'],
    ['Bibracte', 60, 42, 3, 1, 'plain'],
    ['Alesia', 46, 16, 4, 1, 'plain'],
    ['Gergovia', 82, 40, 2, 0, 'forest'],
  ];
  const hop = [0, 1, 1, 2, 2, 3, 2];
  const towns: Town[] = T.map(([name, x, y, value, tribe, terrain], id) => ({ id, name, x, y, value, tribe, hop: hop[id]!, terrain }));
  const pairs: Array<[number, number]> = [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4], [4, 5], [3, 5], [2, 6], [4, 6]];
  const roads: Road[] = pairs.map(([a, b], id) => {
    const terrain = COST[towns[a]!.terrain] >= COST[towns[b]!.terrain] ? towns[a]!.terrain : towns[b]!.terrain;
    return { id, a, b, terrain, cost: COST[terrain] + Math.floor(0.7 * Math.max(hop[a]!, hop[b]!)) };
  });
  return {
    version: 2, seed: 'tutorial', width: 100, height: 100, castra: 0,
    rules: { ...DEFAULT_RULES, turns: 6 },
    towns, roads,
    tribes: [{ id: 0, name: 'Aedui' }, { id: 1, name: 'Remi' }],
    events: [{ turn: 3, kind: 'revolt', tribe: 1, effect: { type: 'cut', mode: 'all' } }],
    // a real per-turn decree, so the lesson on decrees shows its glory arriving from turn 1
    decree: { kind: 'legatio', faction: 'populares', title: 'Embassies', text: 'Every tribe must feel Rome: every turn, +3 glory for each linked town in the tribe where you hold the fewest.', param: 0, bonus: 3 },
  };
}
export const TUTORIAL: Scenario = build();
export const roadBetween = (a: number, b: number) => TUTORIAL.roads.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a))!.id;

/** What the step engine can see of the game. */
export type TutView = { s: State; moving: number | null };
export type TutTarget = { road?: number; town?: number; legion?: number; el?: string };
export type TutStep = {
  id: string;
  text: string;
  target?: TutTarget | ((g: TutView) => TutTarget);
  /** Informative step: shows a Next button (label optional). */
  next?: string;
  /** Advances when this becomes true. */
  done?: (g: TutView) => boolean;
  /** Which game actions are allowed on this step (default: none). */
  allow?: (a: Action) => boolean;
};

const R = roadBetween;
const built = (g: TutView, a: number, b: number) => g.s.built[R(a, b)]!;

export const STEPS: TutStep[] = [
  { id: 'welcome', next: 'Show me',
    text: 'Welcome, general! A two-minute practice campaign. The Roman camp {where} is your <b>castra</b>: every road starts there.' },
  { id: 'road1', target: { road: R(0, 1) }, allow: (a) => a.type === 'road' && a.road === R(0, 1), done: (g) => built(g, 0, 1),
    text: 'Tap the dashed road from the castra to <b>Aquae</b> to build it. Its milestone shows the price: 1 <b>denarius</b>, Rome\'s coin.' },
  { id: 'road2', target: { road: R(1, 3) }, allow: (a) => a.type === 'road' && a.road === R(1, 3), done: (g) => built(g, 1, 3),
    text: 'Aquae turned Roman: linked towns pay their ★ in glory every turn. Now build on to <b>Lutetia</b> (★★★): deeper towns are worth more, and 3★ towns also pay denarii (money) every turn.' },
  { id: 'end1', target: { el: '#end' }, allow: (a) => a.type === 'end', done: (g) => g.s.turn >= 2,
    text: 'End the turn to collect your glory (your score) and your denarii: the money you spend on roads, legions and garrisons.' },
  { id: 'income', next: 'Next',
    text: 'Your income: <b>+2 denarii</b> from the castra every turn, and <b>+1 per ★ above 2</b> from each linked town (Lutetia ★★★ pays +1). Glory: each linked town pays its ★ (Aquae 1 + Lutetia 3).' },
  { id: 'decree', target: { el: '#decree' }, next: 'Next',
    text: 'You also got <b>+3 glory</b> from the <b>📜 Decree</b>, the Senate\'s law of the day. Today, <b>Embassies</b>: +3 a turn per linked town in your weakest tribe (1 Aedui, 1 Remi). Tap it any time to reread it.' },
  { id: 'forecast', target: { el: '.forecast' }, next: 'Next',
    text: 'Trouble: the forecast says the <b>Remi</b> revolt at the end of next turn. A revolt cuts every road touching their lands that is not shielded.' },
  { id: 'events', next: 'Next',
    text: 'Events are scattered over each day\'s 10 turns: <b>hostile</b> ones cut roads, <b>hardships</b> make things costlier, <b>boons</b> help. The forecast shows the next 2 turns; <b>?</b> → Events lists them all.' },
  { id: 'standard', target: { legion: 0 }, done: (g) => g.moving === 0,
    text: 'Your legion waits at the castra. Tap its <b>standard</b> (the banner marked I).' },
  { id: 'march', target: { town: 3 }, allow: (a) => a.type === 'camp' && a.town === 3, done: (g) => g.s.legions[0] === 3,
    text: 'Now tap <b>Lutetia</b>. A legion marches up to 2 roads once per turn, and shields every road touching its town.' },
  { id: 'road3', target: (g) => ({ road: built(g, 3, 4) ? R(4, 5) : R(3, 4) }),
    allow: (a) => a.type === 'road' && (a.road === R(3, 4) || a.road === R(4, 5)), done: (g) => built(g, 3, 4) && built(g, 4, 5),
    text: 'Push on: build <b>Lutetia → Bibracte</b>, then <b>Bibracte → Alesia</b> (★★★★).' },
  { id: 'lens', next: 'Next',
    text: 'In this <b>Military</b> view, gold roads are shielded by your legion. Bibracte → Alesia touches no legion: it is exposed, and glows red.' },
  { id: 'end2', target: { el: '#end' }, allow: (a) => a.type === 'end', done: (g) => g.s.turn >= 3,
    text: 'End the turn.' },
  { id: 'end3', target: { el: '#end' }, allow: (a) => a.type === 'end', done: (g) => g.s.turn >= 4,
    text: 'The revolt strikes at the end of <b>this</b> turn. End it and watch.' },
  { id: 'aftermath', next: 'Next',
    text: 'The rebels cut the road to Alesia: the stones lie in rubble for 2 turns, and Alesia slipped back to the Gauls. Your shielded roads held.' },
  { id: 'reroute', target: { road: R(3, 5) }, allow: (a) => a.type === 'road' && a.road === R(3, 5), done: (g) => built(g, 3, 5),
    text: 'Win Alesia back by another route: build <b>Lutetia → Alesia</b>. It touches your legion\'s town, so it is shielded.' },
  { id: 'more', next: 'Next',
    text: 'Two more things. A <b>garrison</b> (tap a town) shields it and all its neighbours for good. A town cut off from the castra while it still has roads is <b>besieged</b>, and burns after 2 turns unless you reconnect it.' },
  { id: 'senate', next: 'Next',
    text: 'Every day has a new map and a new decree, and it changes the best plan: one pays for ports, another taxes long roads. Score = glory + decree − lost legions. Beat <b>Caesar\'s score</b>.' },
  { id: 'vote', next: 'Begin your campaign',
    text: 'After your campaign you <b>vote</b>: <b>Populares</b> or <b>Optimates</b> (sometimes the <b>Augures</b>). Each offers tomorrow\'s decree; the winner\'s becomes everyone\'s law. Next: today\'s real map{par}.' },
];
