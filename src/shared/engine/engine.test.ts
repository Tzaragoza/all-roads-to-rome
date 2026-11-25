import { expect, test } from 'vitest';
import {
  adjacency, apply, bridges, EVENTS, generate, hubs, initialState, isOver, legalActions, longestRoad, replay, roadCost, score, supplied,
  townValue, yieldPerTurn, Rng, DECREES, budgetAsOf, recruitCost, garrisonCost, shores, gambitOffers, liveEvents, protectedTowns, checkAction, dealTown, decreeStatus, eventsAsOf, LOAN, heldAt, cutsAt,
} from './index';
import type { Action, Road, Scenario } from './index';

test('generation is deterministic per seed and differs across seeds', () => {
  expect(generate('2026-12-01')).toEqual(generate('2026-12-01'));
  expect(generate('2026-12-01').towns).not.toEqual(generate('2026-12-02').towns);
});

test('candidate road graph is connected and planar-sized', () => {
  for (let d = 1; d <= 30; d++) {
    const sc = generate(`seed-${d}`);
    expect(sc.towns.every((t) => Number.isFinite(t.hop))).toBe(true);
    expect(sc.roads.length <= 3 * sc.towns.length - 6).toBe(true);
    expect(sc.events.filter((e) => e.effect.type === 'cut').every((e) => e.turn >= 2)).toBe(true);
  }
});

test('bridges match brute force (remove edge, test connectivity)', () => {
  for (let d = 1; d <= 25; d++) {
    const sc = generate(`br-${d}`);
    // random subset of roads
    const keep = sc.roads.filter((_, i) => (i * 7 + d) % 3 !== 0);
    const fast = bridges(adjacency(sc.towns.length, keep));
    const comps = (rs: Road[]) => {
      const p = sc.towns.map((_, i) => i);
      const f = (x: number): number => (p[x] === x ? x : (p[x] = f(p[x]!)));
      for (const r of rs) p[f(r.a)] = f(r.b);
      return new Set(sc.towns.map((t) => f(t.id))).size;
    };
    const base = comps(keep);
    for (const r of keep) expect(fast.has(r.id)).toBe(comps(keep.filter((x) => x !== r)) > base);
  }
});

test('illegal actions throw; replay reproduces random legal games exactly', () => {
  const sc = generate('2026-12-05');
  const s0 = initialState(sc);
  const far = sc.roads.find((r) => sc.towns[r.a]!.hop >= 2 && sc.towns[r.b]!.hop >= 2)!;
  expect(() => apply(sc, s0, { type: 'road', road: far.id })).toThrow();
  const rng = new Rng('replay');
  const log: Action[] = [];
  let s = s0;
  while (!isOver(sc, s)) {
    const acts = legalActions(sc, s);
    const a = rng.next() < 0.3 ? acts[acts.length - 1]! : rng.pick(acts);
    log.push(a);
    s = apply(sc, s, a);
  }
  expect(score(sc, replay(sc, log)).total).toBe(score(sc, s).total);
});

function line(): Scenario {
  // castra(0) - 1 - 2 - 3 ; town 1 is tribe 0, towns 2-3 are tribe 1; tribe 0 revolts at end of turn 2
  return {
    version: 2, seed: 'line', width: 100, height: 100, castra: 0,
    rules: { ...generate('x').rules, turns: 6, startDenarii: 10, legions: 1, siegeTurns: 2, rubbleTurns: 2, legionRange: 3, baseIncome: 4, tributeFrom: 3 },
    towns: [
      { id: 0, name: 'Castra', x: 0, y: 0, value: 0, tribe: -1, hop: 0, terrain: 'plain' },
      { id: 1, name: 'A', x: 1, y: 0, value: 1, tribe: 0, hop: 1, terrain: 'plain' },
      { id: 2, name: 'B', x: 2, y: 0, value: 2, tribe: 1, hop: 2, terrain: 'plain' },
      { id: 3, name: 'C', x: 3, y: 0, value: 3, tribe: 1, hop: 3, terrain: 'plain' },
    ],
    roads: [0, 1, 2].map((i) => ({ id: i, a: i, b: i + 1, terrain: 'plain' as const, cost: 1 })),
    tribes: [{ id: 0, name: 'T0' }, { id: 1, name: 'T1' }],
    events: [{ turn: 2, kind: 'revolt', tribe: 0, effect: { type: 'cut', mode: 'all' } }],
    decree: { kind: 'treasury', faction: 'optimates', title: 'T', param: 999, bonus: 0, text: '' },
  };
}

function build(sc: Scenario, campAt: number) {
  let s = initialState(sc);
  for (const r of [0, 1, 2]) s = apply(sc, s, { type: 'road', road: r });
  s = apply(sc, s, { type: 'camp', legion: 0, town: campAt });
  expect(s.history.length).toBe(0);
  return apply(sc, s, { type: 'end' }); // turn 1: no event; glory 1+2+3
}

test('roads pacify: supplied towns pay their value every turn', () => {
  const sc = line();
  const s = build(sc, 3);
  expect(s.glory).toBe(6);
  expect(s.history[0]!.glory).toBe(6);
});

test('revolt cuts unprotected roads; pocket burns after siege; trapped legion is lost; rubble blocks rebuild', () => {
  const sc = line();
  let s = build(sc, 3);
  s = apply(sc, s, { type: 'end' }); // turn 2: tribe 0 revolts, road 1 (A-B) cut
  expect(s.history[1]!.cut).toEqual([1]);
  expect(s.built[0]).toBe(true);
  expect(s.siege[2]).toBe(2);
  expect(s.siege[3]).toBe(2);
  expect(() => apply(sc, s, { type: 'road', road: 1 })).toThrow(/Rebels hold/);
  expect(() => apply(sc, s, { type: 'camp', legion: 0, town: 0 })).toThrow(/cut off/);
  s = apply(sc, s, { type: 'end' });
  expect(s.siege[3]).toBe(1);
  s = apply(sc, s, { type: 'end' });
  expect(s.history[3]!.burned.sort()).toEqual([2, 3]);
  expect(s.lost).toBe(1);
  expect(s.legions.length).toBe(0);
  expect(s.built[2]).toBe(false);
  expect(supplied(sc, s)[3]).toBe(false);
});

test('legions march at most legionRange roads; deep towns pay denarii', () => {
  const sc = line();
  sc.rules = { ...sc.rules, legionRange: 2 };
  let s = initialState(sc);
  for (const r of [0, 1, 2]) s = apply(sc, s, { type: 'road', road: r });
  expect(() => apply(sc, s, { type: 'camp', legion: 0, town: 3 })).toThrow(/at most 2 roads/);
  s = apply(sc, s, { type: 'camp', legion: 0, town: 2 });
  s = apply(sc, s, { type: 'end' });
  expect(s.history[0]!.income).toBe(4 + 1);
});

test('yieldPerTurn splits out the harvest bonus for this turn', () => {
  const sc = line();
  sc.events = [{ turn: 1, kind: 'harvest', tribe: 1, effect: { type: 'yield', glory: 2, income: 2 } }];
  let s = initialState(sc);
  for (const r of [0, 1, 2]) s = apply(sc, s, { type: 'road', road: r });
  const y = yieldPerTurn(sc, s);
  expect([y.glory, y.bonusGlory, y.income, y.bonusIncome]).toEqual([6, 5, 5, 1]);
  s = apply(sc, s, { type: 'end' });
  expect(s.history[0]!.glory).toBe(y.glory + y.bonusGlory);
  expect(s.history[0]!.income).toBe(y.income + y.bonusIncome);
});

test('a camped legion shields every road touching its town', () => {
  const sc = line();
  let s = build(sc, 2);
  s = apply(sc, s, { type: 'end' });
  expect(s.history[1]!.cut).toEqual([]);
});

test('a garrison shields roads touching its town and its neighbours', () => {
  const sc = line();
  let s = initialState(sc);
  for (const r of [0, 1, 2]) s = apply(sc, s, { type: 'road', road: r });
  s = apply(sc, s, { type: 'end' });
  s = apply(sc, s, { type: 'garrison', town: 3 }); // protects 3 and neighbour 2 -> road A-B safe
  s = apply(sc, s, { type: 'end' });
  expect(s.history[1]!.cut).toEqual([]);
});

test('decrees: each faction has its own family, stable per seed, and rule changes apply', () => {
  const kinds = { populares: new Set<string>(), optimates: new Set<string>() };
  for (let d = 1; d <= 200; d++) {
    for (const f of ['populares', 'optimates'] as const) {
      const sc = generate(`dec-${d}`, { faction: f });
      expect(sc.decree.faction).toBe(f);
      kinds[f].add(sc.decree.kind);
      expect(generate(`dec-${d}`, { faction: f }).decree).toEqual(sc.decree);
      if (sc.decree.kind === 'peace') {
        expect(sc.rules.maxLegions).toBe(1);
        expect(() => apply(sc, initialState(sc), { type: 'recruit' })).toThrow(/forbids/);
      }
      if (sc.decree.kind === 'marius') expect(sc.rules.recruitCost).toBe(2);
    }
  }
  for (const f of ['populares', 'optimates', 'augures'] as const) expect([...(kinds as Record<string, Set<string>>)[f] ?? []].length || f === 'augures').toBeTruthy();
  expect([...kinds.populares].sort()).toEqual(DECREES.filter((d) => d.faction === 'populares').map((d) => d.kind).sort());
  expect([...kinds.optimates].sort()).toEqual(DECREES.filter((d) => d.faction === 'optimates').map((d) => d.kind).sort());
  // dated: before 2026-11-15 only the launch decrees can be drawn
  const early = new Set(Array.from({ length: 60 }, (_, d) => generate(`dec-${d}`, { faction: 'populares', asOf: '2026-11-14' }).decree.kind));
  expect([...early].sort()).toEqual(['marius', 'triumph', 'via']);
});

test('longest road and hubs are measured on the supplied network', () => {
  const sc = line();
  let s = initialState(sc);
  for (const r of [0, 1, 2]) s = apply(sc, s, { type: 'road', road: r });
  expect(longestRoad(sc, s)).toBe(3);
  expect(hubs(sc, s, 2).sort()).toEqual([1, 2]);
});

test('procedural events: budgets, windows, caps and spacing hold across many seeds', () => {
  const kinds = new Map<string, number>();
  for (let d = 0; d < 300; d++) {
    const sc = generate(`ev-${d}`);
    const by = (tone: string) => sc.events.filter((e) => EVENTS.find((x) => x.kind === e.kind)!.tone === tone);
    const threats = by('threat');
    expect(threats.length).toBeGreaterThanOrEqual(3);
    expect(threats.length).toBeLessThanOrEqual(5);
    const B = budgetAsOf();
    expect(by('hardship').length).toBeLessThanOrEqual(B.hardship[1]);
    expect(by('boon').length).toBeLessThanOrEqual(B.boon[1]);
    expect(by('gambit').length).toBeLessThanOrEqual(B.gambit?.[1] ?? 0);
    expect(sc.events.filter((e) => EVENTS.find((x) => x.kind === e.kind)!.gen.rare).length).toBeLessThanOrEqual(1); // one rare a day
    expect(new Set(threats.map((e) => e.turn)).size).toBe(threats.length); // distinct turns
    // (a shore threat stays put when no other tribe has ports / a frontier)
    for (let i = 1; i < threats.length; i++) if (!(threats[i]!.effect.type === 'cut' && (threats[i]!.effect as { where?: string }).where)) expect(threats[i]!.tribe).not.toBe(threats[i - 1]!.tribe);
    for (const e of sc.events) {
      const spec = eventsAsOf().find((x) => x.kind === e.kind)!; // latest registry, revisions applied
      expect(e.turn).toBeGreaterThanOrEqual(spec.gen.minTurn);
      expect(e.turn).toBeLessThanOrEqual(spec.gen.maxTurn);
      expect(e.effect).toEqual(spec.effect);
      if (e.effect.type === 'boom' || e.effect.type === 'settle') expect(sc.towns[e.town!]!.tribe).toBe(e.tribe);
      if (e.effect.type === 'cut' && e.effect.where) expect(sc.towns.some((t) => t.tribe === e.tribe && t.id !== 0 && shores(sc)[e.effect.type === 'cut' ? e.effect.where! : 'coast'][t.id])).toBe(true);
      kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
    }
    for (const spec of EVENTS) expect(sc.events.filter((e) => e.kind === spec.kind).length).toBeLessThanOrEqual(spec.gen.maxPerDay);
  }
  for (const spec of EVENTS) if (spec.gen.weight > 0) expect(kinds.get(spec.kind) ?? 0, spec.kind).toBeGreaterThan(0); // every drawable event appears
});

test('effect primitives: raid cuts only the deepest road; toll raises costs for N turns; boom adds value', () => {
  const sc = line();
  sc.events = [
    { turn: 1, kind: 'raid', tribe: 1, effect: { type: 'cut', mode: 'deepest' } },
    { turn: 2, kind: 'rains', tribe: 1, effect: { type: 'toll', surcharge: 1, duration: 2 } },
    { turn: 3, kind: 'silver', tribe: 1, town: 2, effect: { type: 'boom', value: 1 } },
  ];
  let s = initialState(sc);
  for (const r of [0, 1, 2]) s = apply(sc, s, { type: 'road', road: r });
  s = apply(sc, s, { type: 'end' }); // raid: only road 2 (B-C, deepest) is cut
  expect(s.history[0]!.cut).toEqual([2]);
  s = apply(sc, s, { type: 'end' }); // rains on tribe 1: roads touching B or C cost +1 on turns 3-4
  expect(roadCost(sc, s, 1)).toBe(sc.roads[1]!.cost + 1);
  expect(roadCost(sc, s, 0)).toBe(sc.roads[0]!.cost); // road 0 touches only castra and A (tribe 0)
  s = apply(sc, s, { type: 'end' }); // silver at B: value 2 -> 3
  expect(townValue(s, sc.towns[2]!)).toBe(3);
  s = apply(sc, s, { type: 'end' });
  expect(s.turn).toBe(5);
  expect(roadCost(sc, s, 1)).toBe(sc.roads[1]!.cost); // toll expired
});

test('tribute triples denarii but not glory', () => {
  const sc = line();
  sc.events = [{ turn: 1, kind: 'tribute', tribe: 1, effect: { type: 'yield', glory: 1, income: 3 } }];
  let s = initialState(sc);
  for (const r of [0, 1, 2]) s = apply(sc, s, { type: 'road', road: r });
  const y = yieldPerTurn(sc, s);
  expect([y.bonusGlory, y.bonusIncome]).toEqual([0, 2]); // C (3★) pays 1 denarius, tripled -> +2
  s = apply(sc, s, { type: 'end' });
  expect(s.history[0]!.income).toBe(y.income + y.bonusIncome);
});

test('tile terrain: every road costs the harder of its two tiles, plus depth', () => {
  const rank = { plain: 1, forest: 2, hills: 3 } as const;
  for (let d = 0; d < 50; d++) {
    const sc = generate(`tiles-${d}`);
    for (const r of sc.roads) {
      const a = sc.towns[r.a]!, b = sc.towns[r.b]!;
      expect(rank[r.terrain]).toBe(Math.max(rank[a.terrain], rank[b.terrain]));
      expect(r.cost).toBe(rank[r.terrain] + Math.floor(0.7 * Math.max(a.hop, b.hop)));
    }
  }
});

test('content is dated: a day only draws what was live on it', () => {
  const late = EVENTS.filter((e) => e.since).map((e) => e.kind);
  expect(late.length).toBeGreaterThan(0);
  for (let d = 0; d < 60; d++) {
    const early = generate(`dated-${d}`, { asOf: '2026-11-14' });
    expect(early.events.some((e) => late.includes(e.kind))).toBe(false);
    expect(early.events.filter((e) => EVENTS.find((x) => x.kind === e.kind)!.tone === 'hardship').length).toBeLessThanOrEqual(1);
  }
  // the map never depends on content: same towns and roads whatever the date
  expect(generate('dated-0', { asOf: '2026-11-14' }).roads).toEqual(generate('dated-0').roads);
});

test('new event primitives', () => {
  const sc = generate('prim-1');
  const s = initialState(sc);
  // a discount never takes a road below 1 denarius
  s.tolls.push({ tribe: 0, surcharge: -5, until: 99 });
  for (const r of sc.roads) expect(roadCost(sc, s, r.id)).toBeGreaterThanOrEqual(1);
  // a levy raises recruits and garrisons while active
  const before = recruitCost(sc, s), g0 = garrisonCost(sc, s);
  s.levies = [{ surcharge: 2, until: s.turn }];
  expect(recruitCost(sc, s)).toBe(before + 2);
  expect(garrisonCost(sc, s)).toBe(g0 + 2);
});

test('shores: ports and frontier towns exist on most maps, never the castra', () => {
  let ports = 0, front = 0;
  for (let d = 0; d < 20; d++) {
    const sc = generate(`shore-${d}`), sh = shores(sc);
    expect(sh.coast[0]).toBe(false); expect(sh.frontier[0]).toBe(false);
    ports += sh.coast.filter(Boolean).length; front += sh.frontier.filter(Boolean).length;
    expect(shores(sc)).toBe(sh); // cached
  }
  expect(ports / 20).toBeGreaterThan(3); expect(front / 20).toBeGreaterThan(3);
});

test('gambits: nothing happens unless accepted; accepted parts become events', () => {
  let sc: Scenario | undefined, gi = -1;
  for (let d = 0; d < 300 && gi < 0; d++) { sc = generate(`gam-${d}`); gi = sc.events.findIndex((e) => e.kind === 'publicani'); }
  expect(gi).toBeGreaterThanOrEqual(0);
  const g = sc!.events[gi]!;
  let s = initialState(sc!);
  while (s.turn < g.turn - 1) s = apply(sc!, s, { type: 'end' });
  expect(gambitOffers(sc!, s)).toContain(gi);
  expect(liveEvents(sc!, s).filter((e) => e.from === gi)).toHaveLength(0);
  const s2 = apply(sc!, s, { type: 'accept', event: gi });
  expect(checkAction(sc!, s2, { type: 'accept', event: gi })).not.toBeNull(); // only once
  const parts = liveEvents(sc!, s2).filter((e) => e.from === gi);
  expect(parts.map((e) => e.turn)).toEqual([g.turn, g.turn + 1, g.turn + 3]);
  expect(parts[2]!.effect.type).toBe('cut');
  // replay keeps the acceptance
  expect(replay(sc!, [...Array(g.turn - 2).fill({ type: 'end' }), { type: 'accept', event: gi }]).accepted).toEqual([gi]);
});

test('decree hooks: depth cap, garrison deals, ports shield, hub cut, inverted stars', () => {
  const sc = generate('hooks-1', { faction: 'optimates', decreeKind: 'mos' });
  const s = initialState(sc); s.denarii = 99;
  const deep = sc.roads.find((r) => Math.max(sc.towns[r.a]!.hop, sc.towns[r.b]!.hop) > 3)!;
  // an unsupplied road fails first; check the cap message on a road from a supplied town by faking supply via castra roads is complex: check the rule directly
  expect(sc.rules.depthCap).toEqual({ hop: 3, until: 7 });
  expect(deep).toBeTruthy();
  const lim = generate('hooks-1', { faction: 'optimates', decreeKind: 'limes' });
  const fr = shores(lim).frontier.findIndex((x, i) => x && i !== 0);
  expect(dealTown(lim, fr)).toBe(true);
  expect(garrisonCost(lim, initialState(lim), fr)).toBe(2);
  const cl = generate('hooks-1', { faction: 'optimates', decreeKind: 'classis' });
  const st = initialState(cl); const port = shores(cl).coast.findIndex((x, i) => x && i !== 0);
  expect(protectedTowns(cl, st)[port]).toBe(false); // not supplied yet
  const sat = generate('hooks-1', { faction: 'augures', decreeKind: 'saturnalia' });
  expect(sat.rules.invertTerrain).toBe(true);
  const plain = sat.roads.find((r) => r.terrain === 'plain')!, base = generate('hooks-1', { faction: 'populares' });
  expect(roadCost(sat, initialState(sat), plain.id)).toBe(base.roads[plain.id]!.cost + 1); // plain 1 -> 2
  const id = generate('hooks-1', { faction: 'augures', decreeKind: 'idus' });
  expect(id.events.some((e) => e.kind === 'idus' && e.turn === 6)).toBe(true);
  const lib = generate('hooks-1', { faction: 'augures', decreeKind: 'libri' });
  expect(lib.rules.eventLookahead).toBe(10);
  expect(lib.events.length).toBeGreaterThanOrEqual(generate('hooks-1', { faction: 'populares' }).events.length);
  expect(decreeStatus(sat, initialState(sat)).bonus).toBe(0);
  // legions on campaign: legions shield nothing
  const dv = generate('hooks-1', { faction: 'populares', decreeKind: 'devotio' });
  const sd = initialState(dv); sd.legions = [3];
  expect(protectedTowns(dv, sd)[3]).toBe(false);
  // a per-turn decree pays during the day and nothing at dusk
  const mr = generate('hooks-1', { faction: 'populares', decreeKind: 'mare' });
  let sm = initialState(mr);
  for (const a of legalActions(mr, sm).filter((x) => x.type === 'road').slice(0, 1)) sm = apply(mr, sm, a);
  sm = apply(mr, sm, { type: 'end' });
  expect(decreeStatus(mr, sm).bonus).toBe(0);
});

test('per-turn decree glory is reported under the decree, not the towns', async () => {
  const { dailyScenario } = await import('../daily');
  const { scenario: sc } = dailyScenario('2026-11-15', 'populares');
  expect(sc.decree.kind).toBe('legatio');
  // random play until a game earns some embassy glory
  let s = initialState(sc);
  for (let k = 0; k < 50 && !(s.dGlory ?? 0); k++) {
    const rng = new Rng(`emb${k}`);
    s = initialState(sc);
    while (!isOver(sc, s)) { const acts = legalActions(sc, s); s = apply(sc, s, rng.next() < 0.3 ? acts[acts.length - 1]! : rng.pick(acts)); }
  }
  const b = score(sc, s);
  expect(s.dGlory ?? 0).toBeGreaterThan(0);
  expect(b.decree).toBe(s.dGlory);
  expect(b.glory + b.decree - b.penalty).toBe(b.total);
  expect(b.decreeMet).toBe(true);
});

test('money-lenders: from 16 Nov the loan is paid on acceptance; earlier days keep the old loan', () => {
  const now = eventsAsOf('2026-11-16').find((e) => e.kind === 'argentarii')!;
  const old = eventsAsOf('2026-11-15').find((e) => e.kind === 'argentarii')!;
  expect(old.effect.type === 'gambit' && old.effect.parts.some((p) => p.now)).toBe(false);
  expect(now.effect.type === 'gambit' && now.effect.parts[0]!.now).toBe(true);
  // a day with the loan on offer this turn: accept, and the coins are in the treasury at once
  const base = generate('loan-test', { asOf: '2026-11-16' });
  const sc = { ...base, events: [{ turn: 1, kind: 'argentarii', tribe: 0, effect: now.effect }] };
  const s0 = initialState(sc);
  const s1 = apply(sc, s0, { type: 'accept', event: 0 });
  expect(s1.denarii).toBe(s0.denarii + LOAN.now);
  // and nothing more is paid at the end of the turn: only the repayment remains on the calendar
  expect(liveEvents(sc, s1).filter((e) => e.from === 0).map((e) => e.turn)).toEqual(Array.from({ length: LOAN.count }, (_, k) => 2 + k)); // instalments on the turns after the offer
});

test('yieldPerTurn equals the payout every turn, revolts included, and is zero once the game is over', () => {
  // the ★ +N in the bar promised more than the turn paid whenever a revolt stranded towns (it was computed
  // before the cuts), and kept showing +N after the last turn, when nothing more is paid
  let cutTurns = 0;
  for (let d = 0; d < 30; d++) {
    const sc = generate(`pv-${d}`);
    let s = initialState(sc);
    while (!isOver(sc, s)) {
      const road = sc.roads.filter((r) => !checkAction(sc, s, { type: 'road', road: r.id })).sort((a, b) => a.cost - b.cost)[0];
      if (road) s = apply(sc, s, { type: 'road', road: road.id });
      const y = yieldPerTurn(sc, s), n = apply(sc, s, { type: 'end' }), h = n.history[n.history.length - 1]!;
      expect(y.glory + y.bonusGlory).toBe(h.glory);
      expect(y.income + y.bonusIncome + y.purseGain - y.purseDebt).toBe(h.income);
      if (h.cut.length) cutTurns++;
      s = n;
    }
    const z = yieldPerTurn(sc, s);
    expect(z.glory + z.bonusGlory + z.income + z.bonusIncome).toBe(0);
  }
  expect(cutTurns).toBeGreaterThan(0);
});

test('heldAt: roads saved by a legion or garrison, never ones that were cut', () => {
  let saw = 0;
  for (let d = 0; d < 40; d++) {
    const sc = generate(`held-${d}`);
    let s = initialState(sc);
    // a crude player: build the cheapest buildable road each turn and camp the first legion on a supplied town
    for (let turn = 1; turn <= sc.rules.turns; turn++) {
      const road = sc.roads.filter((r) => !checkAction(sc, s, { type: 'road', road: r.id })).sort((a, b) => a.cost - b.cost)[0];
      if (road) s = apply(sc, s, { type: 'road', road: road.id });
      const sup = supplied(sc, s), town = sc.towns.find((t) => sup[t.id] && t.id !== sc.castra && !checkAction(sc, s, { type: 'camp', legion: 0, town: t.id }));
      if (town && s.legions.length) s = apply(sc, s, { type: 'camp', legion: 0, town: town.id });
      const held = heldAt(sc, s, s.turn), cut = new Set(cutsAt(sc, s, s.turn));
      for (const h of held) {
        expect(cut.has(h.road)).toBe(false);
        expect(s.built[h.road]).toBe(true);
        const r = sc.roads[h.road]!;
        expect([r.a, r.b]).toContain(h.by);
        expect(h.by).not.toBe(sc.castra);
        // the shield is drawn where a legion or garrison actually stands, never on an empty town
        expect(s.legions.includes(h.source) || s.garrison[h.source]).toBe(true);
        if (h.source !== h.by) expect(s.garrison[h.source] && sc.roads.some((x) => (x.a === h.source && x.b === h.by) || (x.b === h.source && x.a === h.by))).toBe(true);
        // an end of the road holding a unit is preferred over a merely neighbouring one
        const unit = (t: number) => s.legions.includes(t) || s.garrison[t]!;
        if (unit(r.a) || unit(r.b)) expect(h.source).toBe(h.by);
        saw++;
      }
      s = apply(sc, s, { type: 'end' });
    }
  }
  expect(saw).toBeGreaterThan(0);
});

test('heldAt: bug mwt689bhab (23 Nov, Augures): shields drawn on the garrisons, not on empty yellow towns', () => {
  // The reported game: nothing was cut (correct: garrisons at 2 and 7 shield their neighbours' roads), but the
  // "held" shield used to land on unguarded towns (10 on turn 7; 3 and 6 on turn 5, next to the garrison at 7).
  const sc = generate('2026-11-23', { faction: 'augures', asOf: '2026-11-23' });
  const log: Action[] = [
    { type: 'road', road: 0 }, { type: 'road', road: 26 }, { type: 'road', road: 20 }, { type: 'camp', legion: 0, town: 12 }, { type: 'end' },
    { type: 'road', road: 17 }, { type: 'accept', event: 0 }, { type: 'camp', legion: 0, town: 7 }, { type: 'end' },
    { type: 'road', road: 15 }, { type: 'camp', legion: 0, town: 12 }, { type: 'end' },
    { type: 'road', road: 16 }, { type: 'road', road: 4 }, { type: 'road', road: 8 }, { type: 'end' },
    { type: 'garrison', town: 2 }, { type: 'road', road: 6 }, { type: 'road', road: 11 }, { type: 'end' },
    { type: 'road', road: 5 }, { type: 'road', road: 1 }, { type: 'road', road: 23 }, { type: 'end' },
    { type: 'road', road: 22 }, { type: 'road', road: 19 }, { type: 'road', road: 14 }, { type: 'end' },
    { type: 'recruit' }, { type: 'camp', legion: 1, town: 4 }, { type: 'road', road: 12 }, { type: 'road', road: 10 }, { type: 'road', road: 13 }, { type: 'end' },
    { type: 'end' }, { type: 'end' },
  ];
  let s = initialState(sc);
  const sources = new Map<number, number[]>();
  for (const a of log) {
    if (a.type === 'end') {
      expect(cutsAt(sc, s, s.turn)).toEqual([]);
      const src = [...new Set(heldAt(sc, s, s.turn).map((h) => h.source))].sort((x, y) => x - y);
      if (src.length) sources.set(s.turn, src);
    }
    s = apply(sc, s, a);
  }
  expect(score(sc, s).total).toBe(284);
  expect(sources.get(5)).toEqual([2, 7]); // the yellow revolt broke on the two garrisons
  expect(sources.get(7)).toEqual([2]); // the Germani broke on the garrison at 2, not on town 10
});

test('yieldPerTurn previews loan instalments and caravans exactly as the end of the turn pays them', () => {
  const sc = line();
  sc.events = [
    { turn: 1, kind: 'tribute', tribe: 0, effect: { type: 'purse', denarii: -3, always: true } },
    { turn: 1, kind: 'caravan', tribe: 1, effect: { type: 'purse', denarii: 4 } },
  ];
  let s = initialState(sc);
  for (const r of [0, 1, 2]) s = apply(sc, s, { type: 'road', road: r });
  const y = yieldPerTurn(sc, s);
  expect([y.purseGain, y.purseDebt]).toEqual([4, 3]);
  s = apply(sc, s, { type: 'end' });
  expect(s.history[0]!.income).toBe(y.income + y.bonusIncome + y.purseGain - y.purseDebt);
});

test('decree rules name resources by their icons and say when they pay', () => {
  for (const d of DECREES) {
    const r = d.rule(typeof d.vars.param === 'number' ? d.vars.param : 5);
    expect(r, d.kind).not.toMatch(/\b(glory|denarii|denarius|dusk)\b/i);
    if (/★/.test(r)) expect(r, d.kind).toMatch(/At the end of the game:|Every turn, adding up:/);
  }
});
