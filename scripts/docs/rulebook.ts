// The rulebook: a printable A4 booklet (docs/rulebook.html → docs/rulebook.pdf).
// Rules, numbers, events and decrees are read from the engine, so the booklet cannot drift from the
// game. Pictures are screenshots of the real game (scripts/docs/rulebook-shots.cjs) and the game's
// own vector art. Fixed A4 pages: `rulebook-pdf.cjs` fails if any page overflows.
//   npm run docs:rulebook
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { DECREES, DEFAULT_RULES, budgetAsOf, eventsAsOf } from '../../src/shared/engine';
import type { DecreeSpec, EventSpec, Faction } from '../../src/shared/engine';
import { AUGUR_ODDS } from '../../src/shared/daily';
import { rulebookStamp } from '../../src/shared/rulebook-stamp';
import {
  castraIcon, coins, flame, MINI, miniKey, pitchfork, settlement, silverPeak, swords, TRIBE_ART,
} from '../../src/client/arlr/board-art';

const R = DEFAULT_RULES, B = budgetAsOf(), EV = eventsAsOf();
const img = (name: string) => {
  const f = `docs/img/rulebook/${name}.png`;
  return existsSync(f) ? `data:image/png;base64,${readFileSync(f).toString('base64')}` : '';
};
const font = (f: string) => `data:font/woff2;base64,${readFileSync(f).toString('base64')}`;
const svg = (vb: string, inner: string, w = 44, h = 44) => `<svg viewBox="${vb}" width="${w}" height="${h}" aria-hidden="true">${inner}</svg>`;
const range = (r?: [number, number]) => (r ? (r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`) : '0');
const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];

const FACTION: Record<Faction, { name: string; motto: string; col: string; blurb: string }> = {
  populares: { name: 'Populares', motto: 'glory and ambition', col: '#8b1a1a', blurb: 'The party of the people. Their decrees reward reach, speed, the coast and the hills, and legions that march.' },
  optimates: { name: 'Optimates', motto: 'order and caution', col: '#1f4f8a', blurb: 'The party of the old families. Their decrees reward forts, coverage, patience and thrift.' },
  augures: { name: 'Augures', motto: 'the will of the gods', col: '#2e6b34', blurb: 'The priests who read the birds. On rare nights they join the ballot with a sealed decree that overturns a rule of the game.' },
};
const TONE: Record<string, { name: string; col: string; bg: string }> = {
  threat: { name: 'Hostile', col: '#9c2414', bg: '#f6dcd4' },
  hardship: { name: 'Hardship', col: '#2f6f9f', bg: '#dbe8f3' },
  boon: { name: 'Boon', col: '#2e6b34', bg: '#e1efd5' },
  gambit: { name: 'Gambit', col: '#a8650a', bg: '#fbe9c4' },
};

// ---------------------------------------------------------------- pieces
const page = (n: number, body: string, cls = '') => `<section class="page ${cls}"><div class="inner">${body}</div>${cls.includes('cover') ? '' : `<div class="folio">— ${roman[n - 1] ?? n} —</div>`}</section>`;
const h1 = (t: string, kicker = '') => `<header class="chap">${kicker ? `<div class="kicker">${kicker}</div>` : ''}<h1>${t}</h1><div class="rule"></div></header>`;
const fig = (name: string, cap: string, cls = '') => (img(name) ? `<figure class="${cls}"><img src="${img(name)}" alt=""><figcaption>${cap}</figcaption></figure>` : '');
const box = (title: string, body: string, cls = '') => `<aside class="box ${cls}"><div class="boxt">${title}</div>${body}</aside>`;

const eventIcon = (e: EventSpec) => svg('-13 -13 26 26', `<circle r="12" fill="${TONE[e.tone]!.bg}" stroke="${TONE[e.tone]!.col}" stroke-width="1.6"/>${MINI[miniKey(e.kind, e.effect as never)]?.(0, 0) ?? ''}`, 34, 34);
const eventCard = (e: EventSpec) => {
  const t = TONE[e.tone]!;
  const when = `turns ${e.gen.minTurn}–${e.gen.maxTurn}${e.gen.maxPerDay > 1 ? ` · up to ${e.gen.maxPerDay} a day` : ''}${e.gen.rare ? ' · rare' : ''}${e.gen.weight === 0 ? ' · only with its decree' : ''}`;
  return `<div class="card ev" style="--c:${t.col};--bg:${t.bg}"><div class="ci">${eventIcon(e)}</div><div><div class="ct">${e.title} <span class="tag">${t.name}</span></div><div class="cw">${when}</div><p>${e.effectText}</p></div></div>`;
};
const decreeCard = (d: DecreeSpec) => {
  const f = FACTION[d.faction];
  const p = typeof d.vars.param === 'number' ? d.vars.param : d.vars.param === 'maxHop' ? 6 : 5;
  return `<div class="card dc" style="--c:${f.col}"><div class="ct">${d.title}</div><p class="rule-t">${d.text(p)}</p><p class="eff">${d.effect}</p></div>`;
};

// small vector illustrations from the game's art
const town = (v: number, roman: boolean, col: string) => svg('-40 -32 80 58', settlement(v, roman, col), 64, 46);
const ICONS = {
  castra: svg('-30 -26 60 50', castraIcon(), 58, 48),
  standard: svg('-20 -40 40 52', '<line x1="0" y1="8" x2="0" y2="-28" stroke="#1d1409" stroke-width="2.4"/><circle cy="-30" r="3.4" fill="#e0b42a" stroke="#1d1409"/><path d="M0,-24 h15 v12 l-7.5,-3 l-7.5,3 z" fill="#b3261e" stroke="#1d1409" stroke-width="1.4"/><text x="7.5" y="-14" font-size="8" text-anchor="middle" fill="#fff" font-weight="bold">I</text>', 34, 44),
  garrison: svg('-36 -26 72 50', '<ellipse cx="0" cy="6" rx="32" ry="21" fill="none" stroke="#5a3a1a" stroke-width="5" stroke-dasharray="3 1.6"/>' + settlement(2, true, '#2f86e0'), 62, 44),
  road: svg('-34 -14 68 28', '<path d="M-30,0 H30" stroke="#1d1409" stroke-width="8"/><path d="M-30,0 H30" stroke="#d8c08a" stroke-width="5"/><path d="M-30,0 H30" stroke="#8a6a3a" stroke-width="1.2" stroke-dasharray="4 3"/>', 64, 26),
  track: svg('-34 -16 68 32', '<path d="M-30,0 H30" stroke="#5a4426" stroke-width="2.4" stroke-dasharray="7 5"/><g transform="translate(0,0)"><path d="M-8,10 L-8,-4 Q-8,-11 0,-11 Q8,-11 8,-4 L8,10 Z" fill="#efe3c4" stroke="#1d1409" stroke-width="1.4"/><text y="4.5" font-size="10" text-anchor="middle" font-weight="bold" fill="#3b2a1a">3</text></g>', 64, 30),
  revolt: svg('-24 -20 48 40', `${pitchfork(-8, 0, -15)}${flame(8, 2, 1.1)}`, 48, 40),
  raid: svg('-18 -18 36 36', swords(0, 0, 1), 40, 40),
  harvest: svg('-18 -18 36 36', coins(0, 0, 1.1), 40, 40),
  silver: svg('-22 -20 44 36', silverPeak(0, 0), 48, 40),
};

// ---------------------------------------------------------------- pages
const pages: string[] = [];
let n = 0;
const add = (body: string, cls = '') => pages.push(page(++n, body, cls));

// I. cover
add(`<div class="cover-top"><div class="kicker">A daily campaign for the subreddit</div><h1 class="title">All Roads<br>Lead to Rome</h1><div class="sub">The Book of the Campaign · rules, events and decrees</div></div>
${img('cover') ? `<div class="cover-map"><img src="${img('cover')}" alt=""></div>` : ''}
<div class="cover-foot">One map a day, the same for everyone. Ten turns to pacify Gaul. Beat Caesar.</div>`, 'cover');

// II. at a glance
add(`${h1('The Campaign at a Glance', 'Liber I')}
<p class="lead">Every day the subreddit receives the same map of Gaul. You are a Roman legate. From your camp, the <b>castra</b>, you build roads that bring the towns of the tribes into the Roman peace. Each town you link pays <b>glory</b> every turn. The tribes do not always agree: revolts and raiders cut your roads, and only your legions and forts shield them.</p>
<div class="cols2">
<div>
<h2>The goal</h2>
<p>After ${R.turns} turns, at dusk, your <b>score</b> is your glory, plus the Senate's decree bonus, minus ${R.lostLegionPenalty} for every legion lost. Each day has a target: <b>Caesar's score</b>, the best play our solver found on that map. Everyone plays the same map, the same events and the same decree, so the leaderboard is fair.</p>
<h2>A day</h2>
<ol class="steps">
<li><b>Read the decree.</b> The Senate's law changes the day's rules or pays a bonus.</li>
<li><b>Play ten turns.</b> Build, march, fortify, then end the turn. The forecast shows what the tribes will do.</li>
<li><b>Dusk.</b> Compare your score with Caesar's and your rivals', turn by turn.</li>
<li><b>Vote.</b> Choose the faction whose decree rules tomorrow.</li>
</ol>
</div>
<div>
<h2>What you see</h2>
<table class="legend">
<tr><td>${ICONS.castra}</td><td><b>Castra</b>: your camp. Every road starts here, and it is always safe.</td></tr>
<tr><td>${town(2, false, TRIBE_ART[2]!)}</td><td><b>Gallic town</b>: not yet yours. Its ★ are its worth: glory per turn once linked.</td></tr>
<tr><td>${town(3, true, TRIBE_ART[1]!)}</td><td><b>Roman town</b>: linked to the castra by your roads, so it pays.</td></tr>
<tr><td>${svg('-30 -10 60 20', '<text x="-4" y="5" font-size="13" text-anchor="end" fill="#f2c230" stroke="#1d1409" stroke-width="3" paint-order="stroke">★★★</text><circle cx="8" cy="0" r="6" fill="#f2c230" stroke="#1d1409" stroke-width="1.4"/><text x="8" y="2.6" font-size="7.5" font-weight="bold" text-anchor="middle" fill="#8a5a0c">D</text>', 64, 22)}</td><td><b>★ and coins</b> under a town: the glory and the denarii it pays each turn once linked. A pale ★ or coin is coming from an event.</td></tr>
<tr><td>${svg('-22 -11 44 22', `<g transform="translate(-11,0)">${MINI.anchor!(0, 0)}</g><g transform="translate(11,0)">${MINI.tower!(0, 0)}</g>`, 48, 24)}</td><td><b>Port</b> (anchor, with a jetty on its shore) and <b>frontier</b> town (watchtower, by the mountains at the map's edge).</td></tr>
<tr><td>${ICONS.track}</td><td><b>Track</b>: a road you may build. The milestone shows its price.</td></tr>
<tr><td>${ICONS.road}</td><td><b>Paved road</b>: built and holding.</td></tr>
<tr><td>${ICONS.standard}</td><td><b>Legion</b>: a standard. It shields every road touching its town and can march.</td></tr>
<tr><td>${ICONS.garrison}</td><td><b>Garrison</b>: a palisade. It shields its town and every neighbour, for good.</td></tr>
</table>
</div>
</div>`);

// III. the board
add(`${h1('The Board', 'Liber I')}
<div class="cols2">
<div>
<h2>Tiles and terrain</h2>
<p>Each town owns a tile of land: <b>plain</b>, <b>forest</b> or <b>hills</b>. A road crosses the border between two tiles and costs the harder of the two, plus the effort of reaching far from the castra:</p>
<table class="tbl"><tr><th>Terrain</th><th>Base cost</th></tr><tr><td>Plain</td><td>1</td></tr><tr><td>Forest</td><td>2</td></tr><tr><td>Hills</td><td>3</td></tr></table>
<p class="small">plus ⌊0.7 × distance⌋ for roads far from the castra. The milestone on each track always shows the full price, in red if you cannot afford it and green if you can.</p>
<h2>Towns and their worth</h2>
<p>A town is worth 1 to 4 ★, more the farther it lies from the castra. Once linked, it pays <b>★ glory every turn</b>, and towns of 3★ and more also pay <b>denarii</b> (★ − 2 a turn), shown as gold coins beside its stars. The castra brings in ${R.baseIncome} denarii a turn; you start with ${R.startDenarii}.</p>
<p class="small">Every small symbol on the map (stars, coins, anchors, towers, the event icons under a town) explains itself: tap it, or hover it with a mouse.</p>
<h2>Tribes</h2>
<p>The land is shared by three tribes, each with its colour and symbol on the border of its lands. Every event strikes one tribe. Tap an event's icon in the forecast, or a tribe's name in a town's panel, to light up its lands.</p>
<h2>Ports and the frontier</h2>
<p>Towns whose tile meets the <b>sea</b> are <b>ports</b>; towns beside the <b>mountains at the edge of the map</b> are the <b>frontier</b>. Pirates raid ports, Germanic warbands cross the frontier, and several decrees reward one or the other.</p>
</div>
<div>${fig('tut-start', 'The training map: the castra at the bottom, four Gallic towns of two tribes (gold and blue), tracks with their milestones.', 'tall')}</div>
</div>`);

// IV. your turn
add(`${h1('Your Turn', 'Liber II')}
<p class="lead">On your turn, do as many of these as you can afford, in any order, then press <b>End turn</b>.</p>
<div class="actions">
<div class="act"><div class="an">I</div><div><b>Build a road</b> from any town already linked to the castra. Pay its milestone price. The far town is now Roman and pays at the end of every turn.</div></div>
<div class="act"><div class="an">II</div><div><b>March a legion</b> up to ${R.legionRange} roads along your network, once per turn. Tap its standard, then a ringed town. A legion cut off from the castra cannot march.</div></div>
<div class="act"><div class="an">III</div><div><b>Recruit a legion</b> at the castra: ${R.recruitCost} denarii, then ${R.recruitCostStep} more for each one after. You start with ${R.legions}.</div></div>
<div class="act"><div class="an">IV</div><div><b>Build a garrison</b> in a linked town: ${R.garrisonCost} denarii, then ${R.garrisonCostStep} more each. It never moves and never leaves.</div></div>
<div class="act"><div class="an">V</div><div><b>End the turn.</b> The events of the turn strike, besieged towns burn, then every linked town pays its glory and denarii.</div></div>
</div>
<div class="cols2 figs">${fig('tut-start', 'Before: the castra and its tracks.')}${fig('tut-roads', 'After two roads: Aquae and Lutetia are Roman and pay every turn.')}</div>
${box('Undo and preview', '<p>Every action can be undone until you end the turn. Hover a track (or press and hold on a phone) to see what it would bring: towns linked, glory and denarii per turn. The <b>End turn</b> button shows what the turn will pay, and warns you if the coming events will cut roads.</p>')}`);

// V. threats & shields
add(`${h1('Threats and Shields', 'Liber II')}
<div class="cols2">
<div>
<h2>Shields</h2>
<p>A road is <b>shielded</b> if either of its towns holds a <b>legion</b>, is a <b>garrisoned</b> town or a neighbour of one, or is the castra. The <b>Military</b> view paints shielded roads gold and doomed roads red.</p>
<h2>Cut roads</h2>
<p>A hostile event cuts the unshielded roads it strikes. A cut road lies in <b>rubble</b> for ${R.rubbleTurns} turns before you may rebuild it.</p>
</div>
<div>
<h2>Sieges</h2>
<p>A town still holding roads or a legion but no longer linked to the castra is <b>besieged</b>. Relink it within ${R.siegeTurns} turns, or it <b>burns</b>: its roads are lost, and every legion inside is lost too (−${R.lostLegionPenalty} each at dusk). A garrisoned town never burns.</p>
${box('Plan two turns ahead', '<p>Legions march only two roads a turn, and the forecast shows two turns ahead. The good legate moves his legion <i>before</i> the revolt, not after.</p>')}
</div>
</div>
<div class="cols3 figs">${fig('tut-threat', '1. A revolt is coming: the red roads would be cut, and Lutetia (⚠) cut off.')}${fig('tut-shield', '2. A legion marches to Lutetia: its roads glow gold, shielded.')}${fig('tut-revolt', '3. After the revolt: only the exposed road to Bibracte lies in rubble.')}</div>
<div class="cardshot">${fig('tut-card', 'After each turn, a line above the forecast sums up what happened.')}</div>`);

// VI. forecast & events
add(`${h1('The Forecast and Events', 'Liber III')}
<p class="lead">Every day has its own events, drawn once and the same for every player. Each strikes one tribe at the end of a given turn, and the forecast shows them <b>${R.eventLookahead} turns ahead</b>: what happens at the end of this turn and the next, and what it would do to your roads as they stand.</p>
<div class="kinds">
<div class="kind" style="--c:${TONE.threat!.col};--bg:${TONE.threat!.bg}"><b>Hostile</b> · ${range(B.threat)} a day<p>Cut unshielded roads: revolts, raiders, bandits, pirates, Germanic warbands, druids.</p></div>
<div class="kind" style="--c:${TONE.hardship!.col};--bg:${TONE.hardship!.bg}"><b>Hardships</b> · ${range(B.hardship)} a day<p>Make roads, troops or pay costlier for a while: rains, snows, famine, grain shortage.</p></div>
<div class="kind" style="--c:${TONE.boon!.col};--bg:${TONE.boon!.bg}"><b>Boons</b> · ${range(B.boon)} a day<p>Help, mostly for towns you have linked: harvests, tribute, silver, caravans, alliances, veterans.</p></div>
<div class="kind" style="--c:${TONE.gambit!.col};--bg:${TONE.gambit!.bg}"><b>Gambits</b> · ${range(B.gambit)} a day<p>Offers with a catch. Nothing happens unless you accept.</p></div>
</div>
<p>The forecast is a strip of the day's turns. Turns played and turns not yet foreseen are folded into small cells (1–2, 5–10); <b>this turn</b> and the <b>next</b> hold one icon per event, ringed in its tribe's colour and marked with the tribe's symbol. A hostile icon carries a green ✓ if your roads are safe as they stand, or a red number: how many roads it would cut. Effects already in force (rains, snows, an alliance) sit on the current turn with a dashed ring. <b>Tap an icon</b> (or hover it) for the full text. An open gambit adds one row with <b>Accept</b> and <b>Decline</b>.</p>
${fig('tut-forecast', 'The forecast strip: this turn and the next, one icon per event.', 'wide')}
<div class="cols2">
<div>
<h2>Gambits</h2>
<p>A gambit is a deal: tax farmers, money-lenders, a grain dole, an oppidum. It appears in the forecast with <b>Accept</b> and <b>Decline</b>. Accept while it is in the forecast and each part of the deal happens on its turn; accepting is final. Let it pass and nothing happens. Caesar weighs every offer, and takes each of them on some maps but not on others.</p>
<p class="small">Rare events (the druids, the veterans) come at most once a day. The full list is in the Almanac, and in the game under ? → Events.</p>
</div>
<div>${fig('gambit', 'A gambit in the forecast.')}</div>
</div>`);

// VII. the senate
const pop = DECREES.filter((d) => d.faction === 'populares').length, opt = DECREES.filter((d) => d.faction === 'optimates').length, aug = DECREES.filter((d) => d.faction === 'augures').length;
add(`${h1('The Senate', 'Liber IV')}
<p class="lead">Each day is ruled by one decree of the Senate. A decree changes the day's rules (cheaper forts, dearer roads, legions that cannot shield…) or pays a bonus for a way of playing. Read it before your first move: it often changes the best plan entirely.</p>
<div class="cols2">
<div>
<h2>The vote</h2>
<p>When you finish your campaign, you vote for tomorrow. Each faction's decree for tomorrow is already drawn; the ballot shows both, and the faction with the most votes at midnight (UTC) rules the next day. A tie, or no votes, leaves it to fate.</p>
<div class="facs">${(['populares', 'optimates', 'augures'] as Faction[]).map((f) => `<div class="fac" style="--c:${FACTION[f].col}"><b>${FACTION[f].name}</b> <span>· ${FACTION[f].motto} · ${f === 'populares' ? pop : f === 'optimates' ? opt : aug} decrees</span><p>${FACTION[f].blurb}</p></div>`).join('')}</div>
${box('The Sibylline Books', `<p>On about one night in ${Math.round(1 / AUGUR_ODDS)}, the Augurs take the auspices and join the ballot with a <b>sealed scroll</b>. Their decree is revealed only if they win. A gamble for the whole subreddit.</p>`, 'green')}
</div>
<div>${fig('decree-sheet', 'The decree is shown before your first move; the 📜 banner (a 📜 seal with its bonus, on phones) keeps it at hand all day.')}
<h2>Four kinds of decree</h2>
<ul class="tight">
<li><b>Dusk bonus</b>: glory at dusk for what you have built (hubs, forts, legions home…).</li>
<li><b>Every turn</b>: glory each turn for holding something (ports, hills…), so <i>when</i> you take it matters.</li>
<li><b>New rules</b>: costs, shields or limits change for the day.</li>
<li><b>Events</b>: the Augurs can change the day's events themselves.</li>
</ul></div>
</div>`);

// VIII. scoring
add(`${h1('Dusk: the Score', 'Liber V')}
<div class="formula"><span>Score</span> = <span>glory</span> + <span>decree bonus</span> − <span>${R.lostLegionPenalty} × legions lost</span></div>
<div class="cols2">
<div>
<h2>Caesar</h2>
<p>Caesar's score is the best result our solver found for that day, under the day's decree, playing the same events with the same 2-turn forecast you had. It is a strong target, not a perfect one: a sharp legate can beat it. The results page draws your score turn by turn against Caesar's and your rivals'.</p>
<h2>Leaderboard, rivals and streaks</h2>
<p>Each day has its leaderboard. Follow rivals to see their curves next to yours, and press <b>Compare</b> to replay both campaigns turn by turn on the map: their roads, forts and legions drawn over yours. Only once you have finished, and only for generals you follow; Caesar's own plan is never shown, so the answer cannot be copied. Playing on consecutive days builds a streak. Older posts can still be played; depending on the subreddit's setting, those scores are flagged as late or kept off the board.</p>
${box('A worked dusk', `<p>Over ten turns your towns paid <b>212 glory</b>. The decree, <i>Fortified hubs</i>, pays +3 for each of your 4 hubs: <b>+12</b>. One legion was lost in a burning town: <b>−${R.lostLegionPenalty}</b>. Score: 212 + 12 − ${R.lostLegionPenalty} = <b>${212 + 12 - R.lostLegionPenalty}</b>. Caesar scored 230: so close.</p>`)}
</div>
<div>
<h2>Advice from the old legates</h2>
<ul class="tips">
<li><b>Read the decree first.</b> Half of them change what a good plan looks like.</li>
<li><b>Money first, glory later.</b> Early denarii build the roads that pay every turn after.</li>
<li><b>Look two turns ahead.</b> A legion two roads away is a legion too late.</li>
<li><b>A garrison is a wall, a legion is a shield.</b> Forts cover clusters for good; legions follow the danger.</li>
<li><b>Mind the long roads.</b> A single road to a far city is one cut away from a siege.</li>
<li><b>Gambits are not free.</b> Take a deal when it fits your plan, not because it is offered.</li>
<li><b>Ports and frontier towns are targets.</b> Pirates and warbands strike only there: shield them when the sails or spears appear.</li>
<li><b>Practise.</b> After your campaign you can replay the day as often as you like. Practice never changes your rank, but every attempt is kept: you see your <b>personal best</b> of the day, and so do your rivals.</li>
</ul>
${box('Training', '<p>New legates are offered a one-minute guided campaign on a small map. It can be replayed at any time from ? → Replay the tutorial.</p>')}
</div>
</div>`);

// Almanac: events and decrees
const chunk = <T,>(xs: T[], k: number) => Array.from({ length: Math.ceil(xs.length / k) }, (_, i) => xs.slice(i * k, i * k + k));
const evOrder = (['threat', 'hardship', 'boon', 'gambit'] as const).flatMap((t) => EV.filter((e) => e.tone === t));
chunk(evOrder, Math.ceil(evOrder.length / 2)).forEach((part, i) => add(`${h1(i === 0 ? 'Almanac of Events' : 'Almanac of Events, continued', 'Almanac')}
${i === 0 ? '<p class="small">Every event that can strike, with the turns it can fall on. A day draws a few of each kind; the forecast shows them two turns ahead.</p>' : ''}
<div class="cards">${part.map(eventCard).join('')}</div>`));
for (const f of ['populares', 'optimates', 'augures'] as Faction[]) {
  const list = DECREES.filter((d) => d.faction === f);
  chunk(list, 10).forEach((part, i) => add(`${h1(`Decrees of the ${FACTION[f].name}${i ? ', continued' : ''}`, 'Almanac')}
${i === 0 ? `<p class="small" style="color:${FACTION[f].col}"><b>${FACTION[f].motto[0]!.toUpperCase() + FACTION[f].motto.slice(1)}.</b> ${FACTION[f].blurb}</p>` : ''}
<div class="cards">${part.map(decreeCard).join('')}</div>`));
}

// back: quick reference
add(`${h1('Quick Reference', 'Tabula')}
<div class="cols2">
<div>
<table class="tbl ref">
<tr><th colspan="2">A day</th></tr>
<tr><td>Turns</td><td>${R.turns}</td></tr>
<tr><td>Start</td><td>${R.startDenarii} denarii, ${R.legions} legion at the castra</td></tr>
<tr><td>Income</td><td>${R.baseIncome} a turn from the castra, + (★ − 2) from each linked town of 3★+</td></tr>
<tr><td>Glory</td><td>★ a turn from each linked town</td></tr>
<tr><th colspan="2">Costs</th></tr>
<tr><td>Road</td><td>terrain (plain 1, forest 2, hills 3) + depth</td></tr>
<tr><td>Legion</td><td>${R.recruitCost}, then +${R.recruitCostStep} each</td></tr>
<tr><td>Garrison</td><td>${R.garrisonCost}, then +${R.garrisonCostStep} each</td></tr>
<tr><th colspan="2">War</th></tr>
<tr><td>Legion march</td><td>up to ${R.legionRange} roads, once a turn</td></tr>
<tr><td>Shield</td><td>legion: roads touching its town · garrison: its town and neighbours</td></tr>
<tr><td>Rubble</td><td>${R.rubbleTurns} turns before a cut road can be rebuilt</td></tr>
<tr><td>Siege</td><td>${R.siegeTurns} turns to relink, or the town burns</td></tr>
<tr><td>Lost legion</td><td>−${R.lostLegionPenalty} at dusk</td></tr>
<tr><td>Forecast</td><td>${R.eventLookahead} turns ahead</td></tr>
</table>
</div>
<div>
<table class="tbl ref">
<tr><th colspan="2">Events per day</th></tr>
<tr><td>Hostile</td><td>${range(B.threat)}</td></tr>
<tr><td>Hardships</td><td>${range(B.hardship)}</td></tr>
<tr><td>Boons</td><td>${range(B.boon)}</td></tr>
<tr><td>Gambits</td><td>${range(B.gambit)}</td></tr>
<tr><td>Rare</td><td>at most one a day</td></tr>
<tr><th colspan="2">The Senate</th></tr>
<tr><td>Factions</td><td>Populares (${pop}), Optimates (${opt}), Augures (${aug}, sealed, about 1 night in ${Math.round(1 / AUGUR_ODDS)})</td></tr>
<tr><td>Vote</td><td>after your campaign; closes at midnight UTC</td></tr>
<tr><th colspan="2">Score</th></tr>
<tr><td colspan="2">glory + decree bonus − ${R.lostLegionPenalty} × legions lost. Beat Caesar.</td></tr>
</table>
<div class="icons-row">${ICONS.revolt}${ICONS.raid}${ICONS.harvest}${ICONS.silver}</div>
<p class="small center">Rules, events and decrees in this book are generated from the game itself (${new Date().toISOString().slice(0, 10)}).</p>
</div>
</div>`, 'back');

// ---------------------------------------------------------------- document
const css = `
@font-face{font-family:Garamond;src:url(${font('docs/fonts/eb-garamond-latin-400-normal.woff2')});font-weight:400}
@font-face{font-family:Garamond;src:url(${font('docs/fonts/eb-garamond-latin-400-italic.woff2')});font-weight:400;font-style:italic}
@font-face{font-family:Garamond;src:url(${font('docs/fonts/eb-garamond-latin-600-normal.woff2')});font-weight:600}
@font-face{font-family:Garamond;src:url(${font('docs/fonts/eb-garamond-latin-700-normal.woff2')});font-weight:700}
@font-face{font-family:Cinzel;src:url(${font('src/client/arlr/cinzel-latin-800-normal.woff2')});font-weight:800}
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#6b5a3e}
body{font-family:Garamond,Georgia,serif;color:#2a1e10;font-size:10.6pt;line-height:1.38;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;height:297mm;position:relative;overflow:hidden;margin:0 auto 8mm;page-break-after:always;break-after:page;
  background:radial-gradient(ellipse at 50% 40%,#f7eed6 0%,#efe2bf 62%,#e2cf9f 100%)}
.page::before{content:"";position:absolute;inset:7mm;border:1.2pt solid #8a6a2c;outline:0.5pt solid #8a6a2c;outline-offset:-2.2mm;pointer-events:none}
@media print{html,body{background:none}.page{margin:0}}
.inner{position:absolute;inset:14mm 15mm 16mm}
.folio{position:absolute;bottom:9.5mm;left:0;right:0;text-align:center;font-family:Cinzel,serif;font-size:8pt;color:#8a6a2c;letter-spacing:.2em}
.chap{text-align:center;margin-bottom:5mm}
.kicker{font-family:Cinzel,serif;font-size:8pt;letter-spacing:.35em;color:#8a6a2c;text-transform:uppercase}
h1{font-family:Cinzel,serif;font-weight:800;font-size:22pt;margin:1mm 0 0;color:#5a1a10;letter-spacing:.04em}
.rule{height:6px;margin:2.5mm auto 0;width:52%;background:linear-gradient(90deg,transparent,#8a6a2c 20%,#8a6a2c 80%,transparent);mask:linear-gradient(#000 0 0);border-radius:3px;opacity:.75}
h2{font-family:Cinzel,serif;font-weight:800;font-size:11pt;color:#7a2a14;letter-spacing:.06em;margin:4mm 0 1.2mm;border-bottom:.6pt solid #c9a96a;padding-bottom:.6mm}
p{margin:0 0 2mm} .small{font-size:9pt;color:#5a4a32} .center{text-align:center}
.lead{font-size:11.6pt;font-style:italic;text-align:center;margin:0 6mm 4mm}
.cols2{display:grid;grid-template-columns:1fr 1fr;gap:7mm}
.cols3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4mm}
.cardshot figure{width:96%;margin:1mm auto 0}
.figs{margin-top:3mm}
figure{margin:0 0 3mm;text-align:center}
figure img{width:100%;border:1pt solid #6b4a1e;border-radius:2mm;box-shadow:0 1mm 2.5mm rgba(60,40,10,.3);display:block}
figure.tall img{max-height:205mm;object-fit:cover}
figure.wide img{width:auto;max-width:100%;margin:0 auto}
figcaption{font-size:8.6pt;font-style:italic;color:#5a4a32;margin-top:1.2mm}
.box{background:#f8efd7;border:1pt solid #b08a44;border-left:4pt solid #8a6a2c;border-radius:1.5mm;padding:2.4mm 3mm;margin:3mm 0}
.box.green{border-left-color:#2e6b34;background:#eef5e2}
.boxt{font-family:Cinzel,serif;font-weight:800;font-size:9pt;letter-spacing:.08em;color:#6a4a14;margin-bottom:1mm}
.box p{margin:0}
.steps{margin:0;padding-left:5mm} .steps li{margin-bottom:1.4mm}
.legend{border-collapse:collapse;width:100%} .legend td{padding:.8mm 1.5mm;vertical-align:middle;border-bottom:.4pt dotted #c9a96a;font-size:9.8pt} .legend td:first-child{width:20mm;text-align:center}
.tbl{border-collapse:collapse;width:100%;margin:1mm 0 2mm;font-size:9.8pt} .tbl th{font-family:Cinzel,serif;font-size:8.4pt;letter-spacing:.06em;text-align:left;color:#6a4a14;border-bottom:1pt solid #8a6a2c;padding:1.4mm 1.5mm .6mm}
.tbl td{padding:.9mm 1.5mm;border-bottom:.4pt dotted #c9a96a;vertical-align:top} .ref td:first-child{width:28mm;font-weight:600}
.actions{display:grid;gap:2.2mm;margin:2mm 0 3mm}
.act{display:grid;grid-template-columns:12mm 1fr;align-items:start;background:#f8efd7;border:.6pt solid #c9a96a;border-radius:1.5mm;padding:2mm}
.an{font-family:Cinzel,serif;font-weight:800;font-size:14pt;color:#8a1f12;text-align:center;line-height:1}
.kinds{display:grid;grid-template-columns:repeat(4,1fr);gap:2.5mm;margin:1mm 0 4mm}
.kind{background:var(--bg);border-top:3pt solid var(--c);border-radius:1.5mm;padding:2mm;font-size:9.4pt} .kind b{font-family:Cinzel,serif;color:var(--c)} .kind p{margin:1mm 0 0}
.facs{display:grid;gap:2mm;margin:1mm 0}
.fac{border-left:4pt solid var(--c);padding:1mm 2.5mm;background:#f8efd7} .fac b{font-family:Cinzel,serif;color:var(--c)} .fac span{font-size:9pt;color:#5a4a32;font-style:italic} .fac p{margin:.6mm 0 0;font-size:9.6pt}
.tight{margin:0;padding-left:5mm} .tight li{margin-bottom:1mm}
.formula{text-align:center;font-family:Cinzel,serif;font-weight:800;font-size:14pt;color:#5a1a10;margin:2mm 0 5mm;padding:3mm;border:1pt solid #8a6a2c;border-radius:2mm;background:#f8efd7}
.formula span{display:inline-block;padding:0 1.5mm}
.tips{margin:0;padding-left:5mm} .tips li{margin-bottom:1.6mm}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:3mm}
.card{background:#fbf4e1;border:.8pt solid #b89a5c;border-radius:2mm;padding:2.2mm 2.6mm;break-inside:avoid;box-shadow:0 .5mm 1.2mm rgba(60,40,10,.15)}
.card p{margin:.8mm 0 0;font-size:9.3pt;line-height:1.3}
.card.ev{display:grid;grid-template-columns:11mm 1fr;gap:2mm;border-top:2.4pt solid var(--c)}
.card .ct{font-family:Cinzel,serif;font-weight:800;font-size:10pt;color:#3a2410;letter-spacing:.02em}
.card .tag{font-family:Garamond,serif;font-weight:600;font-size:7.6pt;color:var(--c);background:var(--bg);padding:.2mm 1.4mm;border-radius:1mm;text-transform:uppercase;letter-spacing:.06em;vertical-align:1px}
.card .cw{font-size:8.2pt;font-style:italic;color:#6a5a40}
.card.dc{border-top:3pt solid var(--c)} .card.dc .ct{color:var(--c)}
.card .rule-t{font-weight:600} .card .eff{font-style:italic;color:#4a3a22}
.icons-row{display:flex;justify-content:center;gap:6mm;margin:6mm 0 2mm}
/* cover */
.cover .inner{inset:12mm 13mm}
.cover-top{text-align:center;margin-top:6mm}
.title{font-size:38pt;line-height:1.05;color:#6a1a10;margin:3mm 0;text-shadow:0 .4mm 0 #e2cf9f}
.sub{font-style:italic;font-size:13pt;color:#5a4a32}
.cover-map{margin:8mm auto 0;width:100%;border:1.6pt solid #5a3a14;border-radius:2.5mm;overflow:hidden;box-shadow:0 1.5mm 4mm rgba(60,40,10,.4)}
.cover-map img{width:100%;display:block}
.cover-foot{position:absolute;bottom:6mm;left:0;right:0;text-align:center;font-family:Cinzel,serif;font-weight:800;font-size:10pt;letter-spacing:.08em;color:#6a4a14}
`;
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>All Roads Lead to Rome · The Book of the Campaign</title><style>${css}</style></head><body>${pages.join('\n')}</body></html>`;
writeFileSync('docs/rulebook.html', html);
writeFileSync('docs/rulebook.stamp.json', JSON.stringify({ stamp: rulebookStamp(), note: 'Written by npm run docs:rulebook; checked by src/server/rulebook.test.ts.' }, null, 1) + '\n');
console.log(`docs/rulebook.html: ${pages.length} pages`);
