// Grid sweep over rule variants; reports balance metrics per variant (no solver, fast).
import { DEFAULT_GEN, DEFAULT_RULES, Rng, generate, suppliedTowns } from '../../src/shared/engine';
import { BOTS, finalScore, playGame, randomGame } from './bots';
const variants: any[] = JSON.parse(process.argv[2]!);
const DAYS = 40;
const rows: any[] = [];
for (const v of variants) {
  const gen = { ...DEFAULT_GEN, ...v, rules: { ...DEFAULT_RULES, ...(v.rules ?? {}) } };
  const m: any = { variant: JSON.stringify(v).slice(0, 70) };
  let reachWins = 0;
  for (let d = 0; d < DAYS; d++) {
    const date = new Date(Date.parse('2026-12-01') + d * 864e5).toISOString().slice(0, 10);
    const sc = generate(date, gen);
    const res: Record<string, number> = {};
    for (const [n, p] of Object.entries(BOTS)) {
      const s = playGame(sc, p);
      res[n] = finalScore(sc, s);
      m[n] = (m[n] ?? 0) + res[n] / DAYS;
      if (n === 'forecast') { m.fcGarr = (m.fcGarr ?? 0) + s.garrisons / DAYS; m.fcLeg = (m.fcLeg ?? 0) + s.legions.length / DAYS; m.fcLeft = (m.fcLeft ?? 0) + s.denarii / DAYS; m.fcHeld = (m.fcHeld ?? 0) + suppliedTowns(sc, s).length / DAYS; m.fcCut = (m.fcCut ?? 0) + s.history.reduce((x, h) => x + h.cut.length, 0) / DAYS; m.fcHop = (m.fcHop ?? 0) + Math.max(0, ...suppliedTowns(sc, s).map((t) => sc.towns[t]!.hop)) / DAYS; }
      if (n === 'reach') { m.reachBurn = (m.reachBurn ?? 0) + s.burned / DAYS; m.reachHeld = (m.reachHeld ?? 0) + suppliedTowns(sc, s).length / DAYS; }
    }
    m.random = (m.random ?? 0) + finalScore(sc, randomGame(sc, new Rng(date))) / DAYS;
    if (res.reach! > res.safe!) reachWins++;
  }
  for (const k of Object.keys(m)) if (typeof m[k] === 'number') m[k] = +m[k].toFixed(1);
  m.reachWin = `${reachWins}/${DAYS}`;
  rows.push(m);
}
console.table(rows);
