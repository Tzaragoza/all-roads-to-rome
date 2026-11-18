// Aegyptus skirmishes: the same generator, the same maps and rules, read through an Egyptian lens.
// Generation is untouched: a map is generated as usual, then its town and tribe names are swapped
// one-for-one (each Gallic name has a fixed Egyptian counterpart of about the same length, so labels
// keep their room), and the game's words (events, terrain, decrees) are re-read with EGYPT_WORDS.
import type { Scenario } from './engine';
import { TOWN_NAMES, TRIBE_NAMES } from './engine/names';

/** Gallic town → Greco-Roman Egyptian town (lengths within ±2 letters). */
export const EGYPT_TOWNS: Record<(typeof TOWN_NAMES)[number], string> = {
  Alesia: 'Memphis', Gergovia: 'Bubastis', Bibracte: 'Pelusium', Lutetia: 'Canopus', Avaricum: 'Busiris', Cenabum: 'Coptos',
  Durocortorum: 'Oxyrhynchus', Samarobriva: 'Antinoopolis', Vesontio: 'Panopolis', Lugdunum: 'Tentyris', Burdigala: 'Naucratis',
  Tolosa: 'Thebae', Uxellodunum: 'Heliopolis', Noviodunum: 'Hermopolis', Agedincum: 'Lycopolis', Autricum: 'Athribis',
  Rotomagus: 'Diospolis', Condate: 'Abydos', Limonum: 'Syene', Gesoriacum: 'Ptolemais', Divodurum: 'Letopolis',
  Andematunnum: 'Antaeopolis', Augustonemetum: 'Crocodilopolis', Mediolanum: 'Cynopolis', Vesunna: 'Mendes', Divona: 'Tanis',
  Segodunum: 'Sebennytos', Anderitum: 'Prosopis', Cularo: 'Philae', Genava: 'Ombos', Matisco: 'Thinis', Cabillonum: 'Leontopolis',
  Decetia: 'Arsinoe', Vellaunodunum: 'Apollinopolis', Bratuspantium: 'Hieraconpolis', Nemetocenna: 'Paraetonium',
  Durocortum: 'Taposiris', Aginnum: 'Karanis', Iculisma: 'Tebtunis', Ratiatum: 'Berenice',
};

/** Gallic tribe → a people of Roman Egypt and its deserts. */
export const EGYPT_TRIBES: Record<(typeof TRIBE_NAMES)[number], string> = {
  Arverni: 'Nobatae', Aedui: 'Arabes', Sequani: 'Thebaei', Helvetii: 'Blemmyes', Carnutes: 'Mareotae', Senones: 'Medjay',
  Remi: 'Bucoli', Veneti: 'Libyes', Nervii: 'Saitae', Bituriges: 'Nasamones', Parisii: 'Megabari', Lingones: 'Memphitae',
  Santones: 'Garamantes', Pictones: 'Marmaridae', Cadurci: 'Psylli', Lemovices: 'Troglodytae', Treveri: 'Gindanes', Menapii: 'Mazices',
};

/** The same map with Egyptian names: geometry, roads, events, rules and seed untouched. */
export function egyptize(sc: Scenario): Scenario {
  const town = (n: string) => (EGYPT_TOWNS as Record<string, string>)[n] ?? n;
  const tribe = (n: string) => (EGYPT_TRIBES as Record<string, string>)[n] ?? n;
  return { ...sc, towns: sc.towns.map((t) => ({ ...t, name: t.name === 'Castra' ? t.name : town(t.name) })), tribes: sc.tribes.map((t) => ({ ...t, name: tribe(t.name) })) };
}

/**
 * The game's words in Egypt, applied to displayed text only (event titles and texts, terrain, decrees).
 * Longest phrases first. Event kinds keep their mechanics: only what they are called changes.
 */
export const EGYPT_WORDS: Array<[RegExp, string]> = [
  // whole phrases before the single words they contain
  [/lakes and primeval forests/g, 'oases and old necropolises'], [/\ba Gallic\b/g, 'an Egyptian'],
  // events
  [/Germanic incursion/g, 'Nubian incursion'], [/Germanic warbands cross into/g, 'Nubian warbands ride into'], [/Germanic warbands/g, 'Nubian warbands'], [/Germani\b/g, 'Nubians'],
  [/Druid uprising/g, 'Priests’ revolt'], [/The druids raise the/g, 'The priests of Amun raise the'], [/druids/g, 'priests'],
  [/Autumn rains in/g, 'A sandstorm sweeps'], [/Autumn rains/g, 'Sandstorm'],
  [/Early snows/g, 'Khamsin winds'], [/Snow in the/g, 'Khamsin winds in the'], [/snowflakes/g, 'gusts of hot wind'], [/\bRains\b/g, 'Sandstorm'],
  [/golden sickles/g, 'golden ankhs'], [/(?<!Nubian )shields and spears/g, 'Nubian shields and spears'],
  [/Famine among the/g, 'A low Nile starves the'], [/\bFamine\b/g, 'Low Nile'],
  [/\b([A-Z][a-z]+) harvest\b/g, 'Nile flood in the $1 fields'], [/\bHarvest\b/g, 'Nile flood'],
  [/chieftains pledge tribute/g, 'nomarchs pledge tribute'], [/Silver vein/g, 'Gold mine'], [/Silver found at/g, 'Gold found at'],
  [/Merchant caravan/g, 'Camel caravan'], [/A merchant caravan/g, 'A camel caravan'],
  [/raise an oppidum at/g, 'raise a temple at'], [/fortified into an oppidum/g, 'crowned with a temple'], [/\bOppidum\b/g, 'Temple works'], [/\boppidum\b/g, 'temple'],
  [/\bRaiders\b/g, 'Bedouin raiders'], [/\bBandits\b/g, 'Brigands'],
  // terrain: forest = flat desert, hills = rocky desert, mountains = deep desert
  [/hills and forests/g, 'rocky and sandy deserts'], [/Forest and hill/g, 'Desert and rocky'], [/forest and hill/g, 'desert and rocky'],
  [/forests and hills/g, 'sandy and rocky deserts'], [/\bforests\b/g, 'deserts'], [/\bForests\b/g, 'Deserts'], [/\bforest\b/g, 'desert'], [/\bForest\b/g, 'Desert'],
  [/\bhills\b/g, 'rocky desert'], [/\bHills\b/g, 'Rocky desert'], [/\bhill\b/g, 'rocky'], [/\bHill\b/g, 'Rocky'],
  [/by the mountains at the edge of the map/g, 'by the deep desert at the edge of the map'], [/\bmountains\b/g, 'deep desert'],
  [/Into the hills/g, 'Into the desert'],
  // the province
  [/\bGallic\b/g, 'Egyptian'], [/\bGaul\b/g, 'Egypt'],
];

/** Re-reads a text for the Aegyptus skin. */
export const egyptText = (s: string) => EGYPT_WORDS.reduce((t, [re, to]) => t.replace(re, to), s);
