# All Roads Lead to Rome

*A daily strategy puzzle about Roman logistics, played on Reddit.*

Every day, everyone gets the same province of Gaul. You have ten turns to build a road network from your castra, hold it against revolting tribes, and earn more glory than Caesar. The day's law is set by yesterday's Senate vote. There's one ranked attempt per player per day, a shared leaderboard, and a new map at 00:05 UTC.

Built with [Devvit Web](https://developers.reddit.com/) for Reddit's *Game of the Day* hackathon (11 Nov – 8 Dec 2026).

---

## Why this game

Most daily games (Wordle and its descendants) are solitary deduction puzzles with a binary outcome. *All Roads* tries a different point in the design space:

- **The score is continuous, with a public benchmark.** Each day ships with *Caesar's score*: the best plan found offline by a beam-search solver. It's a strong target, not a proven optimum, so it can be beaten.
- **Uncertainty is shared but known in advance.** Revolts, raids, rains and booms are fixed per day and shown two turns ahead. The puzzle is planning under a visible threat schedule, not guessing.
- **The community changes the rules.** After playing, players vote for tomorrow's Senate faction. The winning faction's *decree* changes how scoring or costs work the next day, so the community picks which variant of the puzzle everyone plays.

---

## How to play

### The board

The map holds the **castra** (your base, in the south) and 16 **towns**. Each town is worth 1–4 ★ and belongs to one of three Gallic **tribes**. Roads can only be built along the drawn routes. A road costs the harder of its two tiles' terrain (plains 1, forest 2, hills 3), plus a surcharge that grows with its distance from the castra.

You start with **8 denarii** and **1 legion**.

### A turn

Take any of these actions, as often as you can afford them:

| Action | Cost | Effect |
|---|---|---|
| **Build a road** | terrain + distance | Must touch your network. A town linked to the castra is *supplied*. |
| **Recruit a legion** | 4, then +2 each | Appears at the castra. |
| **Garrison a town** | 5, then +3 each | Permanent protection for that town and its neighbours. |
| **March a legion** | free | Up to 2 roads, once per turn, along your roads. |

Then **end the turn**. In order:

1. **Events strike.** Revolts and raids cut *unshielded* roads of a tribe. Rains make roads dearer. Harvests and trade raise yields.
2. **Sieges.** A town cut off from the castra burns after two turns, along with any legion inside.
3. **Glory and income.** Every supplied town gives its ★ as glory. Income is 2 denarii, plus tribute from towns worth 3★ or more.

A road is **shielded** if one of its ends is the castra, a town with a legion, a garrisoned town, or a neighbour of a garrisoned town.

### Score

```
score = glory over 10 turns  −  5 per legion lost  +  decree bonus at dusk
```

### Decrees and the vote

When you finish, you vote for tomorrow's faction:

- **Populares** favour glory and ambition: triumphs, roads, ports, legions on campaign.
- **Optimates** favour order and caution: peace, treasury, garrisons, short supply lines.
- **Augures** appear on the ballot on roughly one day in six. Their decree stays sealed until they win, and it bends the rules: inverted terrain, a longer forecast, fiercer events.

Each faction has about ten decrees. Every one was benchmarked to change the optimal plan, without making the day trivial or impossible. A tie goes to the day's default faction.

### Events and gambits

There are 21 event types, introduced over the season. Besides threats (revolts, bandits, pirates on the coast, Germanic incursions on the frontier) and boons (harvests, caravans, alliances), some events are **gambits**: an offer you can accept or decline. An example is the money-lenders' loan, which pays now and costs you later.

### After your run

- **Rivals.** Follow other players to compare scores every day, and replay a rival's campaign turn by turn against yours. Caesar's plan is never shown, because it would be the day's answer.
- **Practice and personal best.** Replay the day as often as you like. Practice never changes your rank, but every attempt is kept, and your personal best is shown to you and your rivals.
- **Skirmish.** After today's campaign, fight extra maps from a pool of pre-validated battlefields, each with Caesar's score: 300 in Gaul and 300 in Egypt (Aegyptus: Egyptian names, events and art on the same rules). Unranked; challenge a friend on the same map number.
- **The Demo.** A moderator menu item (*Post the Demo*) creates one *All Roads Lead to Rome · Demo* post: a frozen, published map (16 November 2026, Caesar 303) played as often as you like. Every run is scored, your best goes on the Demo's own board, and it never touches streaks or the daily board. First-timers start in the guided tutorial (skippable); after each run come the score chart, every run against Caesar's line, honours, the Senate's ballot (tallied on the Demo only), rivals, sharing and Skirmish.
- **Achievements.** Thirty-eight honours in copper, silver and gold (four of them secret, tied to days of the Roman calendar), from *Hastatus* (first campaign) to *Centurio* (100), *Pontifex Maximus* (7-day streak) and *Crossing the Rubicon* (beat Caesar). Each keeps the date it was won, with your completion percentage and how rare each one is.
- **Reddit-native.** Devvit Journeys (a journey per campaign, progress per turn, the result at dusk), snoovatars on the leaderboard and rivals, the app's daily *Senate's verdict* comment (podium, Caesar, the vote) and a decree comment on each new post, user flair with rank, streak and honours, and a game badge pointing to today's campaign.
- **Streaks, flair, and a share comment** (as you, never as the app). The app sends no DMs.

---

## How it works

### One day, end to end

```
UTC date ─► season.json ─► seed ─┐
                                 ├─► generate(seed, faction, asOf) ─► Scenario (map, events, decree, rules)
yesterday's vote ─► faction ─────┘
```

- **Deterministic engine** (`src/shared/engine`). The same code runs on the client to play and on the server to validate. A seeded PRNG uses separate streams for map, events, faction and decree. Changing one content type therefore never shifts another.
- **Server-side replay as anti-cheat.** The client submits only the list of actions. The server replays them on the day's scenario and computes the score itself. Practice runs go through the same check.
- **Published days are frozen.** Content carries `since`/`retired` dates and generation takes an `asOf` date. Each played day is pinned by a golden fingerprint (`src/shared/golden.json`), and a test fails if any code change would alter a day that already went out.
- **Pre-validated season.** `season.json` lists a seed per date, and Caesar's score and curve per faction. Seeds that the fairness checks reject are re-rolled offline.

### Balancing pipeline (`scripts/sim`)

| Tool | Purpose |
|---|---|
| `solver.ts` | Beam search over turn plans. Its result is Caesar's score. Branches on gambit accept/decline. |
| `bots.ts`, `calibrate.ts` | Greedy and random bots against the solver: skill gap and luck share. |
| `decrees.ts` | Each decree must shift a strategy metric by at least 20%, keep par within ×0.75–1.6, leave bots at least 8 points below par, and avoid trivial or overweighted bonuses. |
| `events.ts` | Each event must change the solver's plan, beat a symmetric replay baseline, and gambits must be accepted 15–85% of the time. |
| `season.ts` | Generates the calendar, append-only (`--only` re-rolls given days). |
| `golden.ts` | Freezes fingerprints of every day up to today. |

---

## Repository layout

```
src/shared/engine/   rules, map/event/decree generation, PRNG, graph algorithms (+ tests)
src/shared/          daily calendar, season.json, golden fingerprints
src/server/          Hono + tRPC backend: daily post, submissions, votes, leaderboards, rivals, practice
src/client/          splash (feed view) and game (expanded view); game UI in src/client/arlr
scripts/sim/         solver, bots, benchmarks, season generator
scripts/docs/        printable rulebook generator (HTML → A4 PDF, not tracked in git)
scripts/brand/       subreddit icon / banner generator
```

## Commands

```bash
npm install
npm run dev              # playtest on your test subreddit
npm test                 # types, lint, unit tests, build
npm run deploy           # golden check + tests + upload a private version
npm run sim:season -- 2026-11-13 60 > src/shared/season.json
npm run sim:decrees      # decree benchmark
npm run sim:events       # event benchmark
npm run docs:rulebook    # rebuild the printable rulebook
```

Requires Node ≥ 24. Tests use an in-memory Redis through `@devvit/test`.

## Licence

See [LICENSE](LICENSE). The EB Garamond and Cinzel fonts are under the SIL Open Font License.
