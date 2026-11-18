// Achievements: 23 badges, from copper to gold. Definitions are shared by the server (which awards
// them) and the client (which draws them). Nothing here takes longer than Centurio (100 campaigns),
// and no streak is longer than 7 days.

export type Tier = 'copper' | 'silver' | 'gold';
export type AchId =
  | 'hastatus' | 'legionarius' | 'optio' | 'centurio'
  | 'flamen' | 'pontifex' | 'pontifexMaximus'
  | 'alea' | 'rubicon' | 'venividivici'
  | 'senatus' | 'consul'
  | 'voxPopuli' | 'sibyl'
  | 'pax' | 'imperium' | 'aerarium' | 'fortuna' | 'testudo'
  | 'tirocinium' | 'socius' | 'acta' | 'exercitatio';

export type AchDef = { id: AchId; name: string; tier: Tier; glyph: string; how: string; group: string };

export const ACHIEVEMENTS: readonly AchDef[] = [
  { id: 'hastatus', name: 'Hastatus', tier: 'copper', glyph: 'I', group: 'Service', how: 'Finish your first campaign.' },
  { id: 'legionarius', name: 'Legionarius', tier: 'silver', glyph: 'X', group: 'Service', how: 'Finish 10 campaigns (practice runs count).' },
  { id: 'optio', name: 'Optio', tier: 'silver', glyph: 'XXX', group: 'Service', how: 'Finish 30 campaigns (practice runs count).' },
  { id: 'centurio', name: 'Centurio', tier: 'gold', glyph: 'C', group: 'Service', how: 'Finish 100 campaigns (practice runs count).' },

  { id: 'flamen', name: 'Flamen', tier: 'copper', glyph: '🔥', group: 'Devotion', how: 'Play 3 days in a row.' },
  { id: 'pontifex', name: 'Pontifex', tier: 'silver', glyph: '🕯️', group: 'Devotion', how: 'Play 5 days in a row.' },
  { id: 'pontifexMaximus', name: 'Pontifex Maximus', tier: 'gold', glyph: '🏛️', group: 'Devotion', how: 'Play 7 days in a row.' },

  { id: 'alea', name: 'Alea iacta est', tier: 'silver', glyph: '🎲', group: 'Glory', how: "Score at least 80% of Caesar's score." },
  { id: 'rubicon', name: 'Crossing the Rubicon', tier: 'gold', glyph: '🌊', group: 'Glory', how: "Equal or beat Caesar's score." },
  { id: 'venividivici', name: 'Veni, vidi, vici', tier: 'gold', glyph: '🏆', group: 'Glory', how: "Equal or beat Caesar's score on 3 different days." },

  { id: 'senatus', name: 'Senatus Consultum', tier: 'copper', glyph: '📜', group: 'The Senate', how: "Fulfil the day's decree." },
  { id: 'consul', name: 'Consul', tier: 'silver', glyph: '🪶', group: 'The Senate', how: 'Fulfil the decree on 5 different days.' },
  { id: 'voxPopuli', name: 'Vox Populi', tier: 'copper', glyph: '🗳️', group: 'The Senate', how: "Vote for tomorrow's faction." },
  { id: 'sibyl', name: 'Sibylline Books', tier: 'silver', glyph: '🔮', group: 'The Senate', how: 'Vote for the Augures when they are on the ballot.' },

  { id: 'pax', name: 'Pax Romana', tier: 'silver', glyph: '🕊️', group: 'Campaign', how: 'Hold 10 towns or more at dusk without ever losing a road.' },
  { id: 'imperium', name: 'Imperium sine fine', tier: 'gold', glyph: '🦅', group: 'Campaign', how: 'Hold every town of the province at dusk.' },
  { id: 'aerarium', name: 'Aerarium', tier: 'copper', glyph: '🪙', group: 'Campaign', how: 'End a campaign with 30 denarii or more in the treasury.' },
  { id: 'testudo', name: 'Testudo', tier: 'silver', glyph: '🛡️', group: 'Campaign', how: 'Have your legions and garrisons turn back 3 road cuts in one campaign.' },
  { id: 'fortuna', name: 'Fortuna audaces iuvat', tier: 'copper', glyph: '⚖️', group: 'Campaign', how: 'Accept a gambit and finish the campaign.' },

  { id: 'tirocinium', name: 'Tirocinium', tier: 'copper', glyph: '🎓', group: 'Forum', how: 'Complete the training campaign.' },
  { id: 'socius', name: 'Socius', tier: 'copper', glyph: '🤝', group: 'Forum', how: 'Follow a rival general.' },
  { id: 'acta', name: 'Acta Diurna', tier: 'copper', glyph: '📣', group: 'Forum', how: 'Share your result in the comments.' },
  { id: 'exercitatio', name: 'Exercitatio', tier: 'silver', glyph: '🏋️', group: 'Forum', how: 'Beat your own best score of a day with a practice run.' },
];

export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a])) as Record<AchId, AchDef>;

/** What a finished run says about achievements (computed by the server from the replayed game). */
export type RunFacts = {
  total: number; par: number | null; decreeMet: boolean; roadsLost: number; towns: number; allTowns: boolean; denarii: number; gambit: boolean;
  /** Road cuts turned back by legions and garrisons (engine `heldAt`, turn by turn). */
  held: number;
  /** For the "why" lines: the decree's title and the gambits accepted. */
  decree?: string; gambits?: string[];
};

/** Achievements a finished run earns on its own (the counters are checked separately). */
export function runAchievements(f: RunFacts): AchId[] {
  const out: AchId[] = ['hastatus'];
  if (f.par && f.par > 0 && f.total >= 0.8 * f.par) out.push('alea');
  if (f.par && f.par > 0 && f.total >= f.par) out.push('rubicon');
  if (f.decreeMet) out.push('senatus');
  if (f.roadsLost === 0 && f.towns >= 10) out.push('pax');
  if (f.allTowns) out.push('imperium');
  if (f.denarii >= 30) out.push('aerarium');
  if (f.gambit) out.push('fortuna');
  if (f.held >= 3) out.push('testudo');
  return out;
}

/** Achievements earned by the player's running totals. */
export type Counters = { runs: number; bestStreak: number; decrees: number; beats?: number };
export function counterAchievements(c: Counters): AchId[] {
  const out: AchId[] = [];
  if (c.runs >= 1) out.push('hastatus');
  if (c.runs >= 10) out.push('legionarius');
  if (c.runs >= 30) out.push('optio');
  if (c.runs >= 100) out.push('centurio');
  if (c.bestStreak >= 3) out.push('flamen');
  if (c.bestStreak >= 5) out.push('pontifex');
  if (c.bestStreak >= 7) out.push('pontifexMaximus');
  if (c.decrees >= 5) out.push('consul');
  if ((c.beats ?? 0) >= 3) out.push('venividivici');
  return out;
}

// ---- why an achievement was won: one sentence stored with it when it is awarded

const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** Where a run took place, for the why lines: "the campaign of 14 November" or "a practice run of 14 November". */
export type RunWhere = { day: string; practice: boolean };
const onDay = (w: RunWhere) => (w.practice ? `in a practice run of ${w.day}` : `in the campaign of ${w.day}`);

/** Why a finished run earned a run-based achievement. */
export function whyRun(id: AchId, f: RunFacts, w: RunWhere): string | undefined {
  switch (id) {
    case 'alea': return `Scored ${f.total}, ${Math.round((100 * f.total) / (f.par || 1))}% of Caesar's ${f.par}, ${onDay(w)}.`;
    case 'rubicon': return `Scored ${f.total} against Caesar's ${f.par} ${onDay(w)}.`;
    case 'senatus': return `Fulfilled the decree${f.decree ? ` ${f.decree}` : ''} ${onDay(w)}.`;
    case 'pax': return `Held ${f.towns} towns at dusk without losing a single road ${onDay(w)}.`;
    case 'imperium': return `Held every town of the province (${f.towns}) at dusk ${onDay(w)}.`;
    case 'aerarium': return `Ended with ${f.denarii} denarii in the treasury ${onDay(w)}.`;
    case 'fortuna': return `Accepted ${f.gambits?.length ? f.gambits.join(' and ') : 'a gambit'} and saw it through ${onDay(w)}.`;
    case 'testudo': return `Your legions and garrisons turned back ${f.held} road cuts ${onDay(w)}.`;
    case 'hastatus': return `Your first finished campaign: ${w.practice ? 'a practice run' : 'the campaign'} of ${w.day}.`;
    default: return undefined;
  }
}

/** Why the running totals earned a counter achievement. */
export function whyCounter(id: AchId, c: Counters, day: string): string | undefined {
  switch (id) {
    case 'hastatus': return `Your first finished campaign, ${day}.`;
    case 'legionarius': case 'optio': case 'centurio': return `Your ${ord(c.runs)} finished campaign (practice runs count), ${day}.`;
    case 'flamen': case 'pontifex': case 'pontifexMaximus': return `Played ${c.bestStreak} days in a row, up to ${day}.`;
    case 'consul': return `Fulfilled the decree on your ${ord(c.decrees)} different day, ${day}.`;
    case 'venividivici': return `Matched or beat Caesar on your ${ord(c.beats ?? 0)} different day, ${day}.`;
    default: return undefined;
  }
}
