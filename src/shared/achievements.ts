// Achievements: 38 badges, from copper to gold. Definitions are shared by the server (which awards
// them) and the client (which draws them). Nothing here takes longer than Centurio (100 campaigns),
// and no streak is longer than 7 days. `hidden` honours (the Fasti, tied to days of the Roman
// calendar) show as "???" until won.

export type Tier = 'copper' | 'silver' | 'gold';
export type AchId =
  | 'hastatus' | 'legionarius' | 'optio' | 'centurio'
  | 'flamen' | 'pontifex' | 'pontifexMaximus'
  | 'alea' | 'rubicon' | 'venividivici'
  | 'senatus' | 'consul'
  | 'voxPopuli' | 'sibyl'
  | 'pax' | 'imperium' | 'aerarium' | 'fortuna' | 'testudo'
  | 'tirocinium' | 'socius' | 'acta' | 'exercitatio'
  | 'aemulatio' | 'inimicus' | 'clientela' | 'responsum' | 'speculator' | 'princeps'
  | 'peregrinus' | 'adNilum' | 'explorator' | 'utraque' | 'triumphator'
  | 'idus' | 'saturnalia' | 'kalendae' | 'abUrbe';

export type AchDef = { id: AchId; name: string; tier: Tier; glyph: string; how: string; group: string; hidden?: true };

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

  { id: 'pax', name: 'Pax Romana', tier: 'silver', glyph: '🕊️', group: 'Campaign', how: 'Hold 10 towns or more at the end of the game without ever losing a road.' },
  { id: 'imperium', name: 'Imperium sine fine', tier: 'gold', glyph: '🦅', group: 'Campaign', how: 'Hold every town of the province at the end of the game.' },
  { id: 'aerarium', name: 'Aerarium', tier: 'copper', glyph: '🪙', group: 'Campaign', how: 'End a campaign with 30 denarii or more in the treasury.' },
  { id: 'testudo', name: 'Testudo', tier: 'silver', glyph: '🛡️', group: 'Campaign', how: 'Have your legions and garrisons turn back 3 road cuts in one campaign.' },
  { id: 'fortuna', name: 'Fortuna audaces iuvat', tier: 'copper', glyph: '⚖️', group: 'Campaign', how: 'Accept a gambit and finish the campaign.' },

  { id: 'tirocinium', name: 'Tirocinium', tier: 'copper', glyph: '🎓', group: 'Forum', how: 'Complete the training campaign.' },
  { id: 'socius', name: 'Socius', tier: 'copper', glyph: '🤝', group: 'Forum', how: 'Follow a rival general.' },
  { id: 'acta', name: 'Acta Diurna', tier: 'copper', glyph: '📣', group: 'Forum', how: 'Share your result in the comments.' },
  { id: 'exercitatio', name: 'Exercitatio', tier: 'silver', glyph: '🏋️', group: 'Forum', how: 'Beat your own best score of a day with a practice run.' },
  { id: 'speculator', name: 'Speculator', tier: 'copper', glyph: '🔭', group: 'Forum', how: "Watch a rival's campaign turn by turn beside your own." },
  { id: 'aemulatio', name: 'Aemulatio', tier: 'copper', glyph: '⚔️', group: 'Forum', how: 'Outscore a rival you follow on the same daily campaign.' },
  { id: 'responsum', name: 'Responsum', tier: 'copper', glyph: '✉️', group: 'Forum', how: 'A rival you challenged in your result comment marches on that day\'s map.' },
  { id: 'inimicus', name: 'Inimicus', tier: 'silver', glyph: '⚡', group: 'Forum', how: 'Outscore the same rival on 3 different days.' },
  { id: 'clientela', name: 'Clientela', tier: 'silver', glyph: '👥', group: 'Forum', how: 'Be followed as a rival by 3 generals.' },
  { id: 'princeps', name: 'Princeps', tier: 'gold', glyph: '👑', group: 'Forum', how: "Finish in the top 3 of a day's board when the day closes (at least 20 generals on time; ties share the place)." },

  { id: 'peregrinus', name: 'Peregrinus', tier: 'copper', glyph: '🧭', group: 'Skirmish', how: 'Finish a skirmish.' },
  { id: 'adNilum', name: 'Ad Nilum', tier: 'copper', glyph: '🐊', group: 'Skirmish', how: 'Finish a skirmish in Aegyptus.' },
  { id: 'explorator', name: 'Explorator', tier: 'silver', glyph: '🗺️', group: 'Skirmish', how: 'Finish 10 different skirmish maps.' },
  { id: 'utraque', name: 'Utraque provincia', tier: 'silver', glyph: '🌍', group: 'Skirmish', how: "Equal or beat Caesar's score on a skirmish in Gaul and on one in Aegyptus." },
  { id: 'triumphator', name: 'Triumphator', tier: 'gold', glyph: '🏟️', group: 'Skirmish', how: "Equal or beat Caesar's score on 10 different skirmish maps." },

  { id: 'idus', name: 'Idus Martiae', tier: 'silver', glyph: '🗡️', group: 'Fasti', how: 'Finish the campaign of 15 March, the Ides of March.', hidden: true },
  { id: 'saturnalia', name: 'Io Saturnalia', tier: 'copper', glyph: '🎁', group: 'Fasti', how: 'Finish a campaign of the Saturnalia (17 to 23 December).', hidden: true },
  { id: 'kalendae', name: 'Kalendae Ianuariae', tier: 'copper', glyph: '🌿', group: 'Fasti', how: 'Finish the campaign of 1 January, when the consuls take office.', hidden: true },
  { id: 'abUrbe', name: 'Ab urbe condita', tier: 'copper', glyph: '🐺', group: 'Fasti', how: 'Finish the campaign of 21 April, the birthday of Rome.', hidden: true },
];

/** Shown in place of a hidden honour's rule until it is won. */
export const HIDDEN_HOW = 'A secret honour, tied to a day of the Roman calendar.';

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
    case 'pax': return `Held ${f.towns} towns at the end of the game without losing a single road ${onDay(w)}.`;
    case 'imperium': return `Held every town of the province (${f.towns}) at the end of the game ${onDay(w)}.`;
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

// ---- Fasti: honours tied to the date of the daily campaign (its post's date, the same for everyone; late plays of that post count)

/** Fasti honours a finished daily campaign of `date` (YYYY-MM-DD) earns. */
export function fastiFor(date: string): AchId[] {
  const md = /^\d{4}-(\d{2}-\d{2})$/.exec(date)?.[1];
  if (!md) return []; // the Demo and other non-dates
  const out: AchId[] = [];
  if (md === '03-15') out.push('idus');
  if (md >= '12-17' && md <= '12-23') out.push('saturnalia');
  if (md === '01-01') out.push('kalendae');
  if (md === '04-21') out.push('abUrbe');
  return out;
}
export function whyFasti(id: AchId, day: string): string | undefined {
  switch (id) {
    case 'idus': return `Marched on the Ides of March (${day}). Beware.`;
    case 'saturnalia': return `Marched during the Saturnalia (${day}). Io Saturnalia!`;
    case 'kalendae': return `Marched on the Kalends of January (${day}), as the new consuls took office.`;
    case 'abUrbe': return `Marched on the birthday of Rome (${day}).`;
    default: return undefined;
  }
}

// ---- Skirmish: earned from the player's skirmish records (best score per map), so earlier skirmishes count too

/** One skirmish map a player finished: their best, Caesar's score, and whether it is in Aegyptus. */
export type SkFact = { best: number; par: number; egypt: boolean };
export const SK_MAPS = 10, SK_BEATS = 10;
export function skirmishAchievements(maps: SkFact[]): AchId[] {
  const out: AchId[] = [];
  const beat = maps.filter((m) => m.best >= m.par);
  if (maps.length) out.push('peregrinus');
  if (maps.some((m) => m.egypt)) out.push('adNilum');
  if (maps.length >= SK_MAPS) out.push('explorator');
  if (beat.some((m) => m.egypt) && beat.some((m) => !m.egypt)) out.push('utraque');
  if (beat.length >= SK_BEATS) out.push('triumphator');
  return out;
}
export function whySkirmish(id: AchId, maps: SkFact[], day: string): string | undefined {
  const beat = maps.filter((m) => m.best >= m.par).length;
  switch (id) {
    case 'peregrinus': return `Finished your first skirmish (credited ${day}).`;
    case 'adNilum': return `Marched along the Nile in an Aegyptus skirmish (credited ${day}).`;
    case 'explorator': return `Finished ${maps.length} different skirmish maps (credited ${day}).`;
    case 'utraque': return `Matched Caesar in both Gaul and Aegyptus (credited ${day}).`;
    case 'triumphator': return `Matched or beat Caesar on ${beat} different skirmish maps (credited ${day}).`;
    default: return undefined;
  }
}

// ---- Forum: rivalries and the day's podium

export const INIMICUS_DAYS = 3, CLIENTELA_FOLLOWERS = 3, PRINCEPS_MIN = 20;

/**
 * Princeps: the players in the top 3 of a closed day's board, ties sharing the place (every score at
 * least the third best). Late plays (marked on the board) never count, for the place or the minimum.
 * Nobody gets it on a day with fewer than PRINCEPS_MIN generals on time.
 */
export function princepsWinners(board: Array<{ member: string; score: number }>, late: ReadonlySet<string>, min = PRINCEPS_MIN): string[] {
  const onTime = board.filter((r) => !late.has(r.member)).sort((a, b) => b.score - a.score);
  if (onTime.length < min) return [];
  const third = onTime[Math.min(2, onTime.length - 1)]!.score;
  return onTime.filter((r) => r.score >= third).map((r) => r.member);
}
