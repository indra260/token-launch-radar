[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/indra260/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/indra260/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Launch Radar

An entry for make.fun's **Build the best token launch radar** (token-radar-01).

The radar reads the competition's sealed DefiLlama snapshot (758 protocols,
fetched 2026-11-14) and ranks the protocols that record no token yet by an
**implied value**: what a launch would be worth if the protocol's record
stayed exactly as it is. It does not predict whether or when a token is
issued, and it says "records no token" throughout — the record is not proof
that none exists.

## The model

Every figure comes from the snapshot; no protocol is named in the code.

- **Eligibility.** A protocol is a launch candidate when DefiLlama records no
  token for it and it is not a wrapped, staked or bridged product of a token
  that already trades, a versioned copy, or an exchange's own book — the same
  tests the snapshot's watchlist applies. 198 of the 342 tokenless protocols
  qualify; the 416 already-tokenised protocols are set aside as the
  comparables pool.
- **Implied value** = TVL × category multiple × momentum × maturity × reach.
  A category's multiple is the median market-cap-to-TVL ratio of its live,
  token-bearing peers, with each live ratio capped at the 90th percentile of
  all live ratios (2.98× on this snapshot, so one 400× outlier cannot price
  a category) and the median shrunk toward the global median (0.214×) with
  a weight of 12 — a category's own median outweighs the market's centre
  only once it rests on about a dozen live peers, because below that a
  category median is barely evidence. (On the first pass this entry priced
  three categories — Risk Curators among them — off a single capped-outlier
  peer each; the stronger shrink is the fix.) Momentum scales the seven-day
  TVL change, maturity the years tracked with no token recorded (an
  unreported listing date scores the 0.80 floor, never above a protocol
  with a verifiable short record), reach the chain footprint.
- **Risk flags** are read off the same fields — TVL falling or cooling,
  unreported momentum or listing date, a track record under a year, a
  single-chain footprint, size below the $50M watchlist floor. The snapshot
  carries no holder, audit or deployer data, so none is claimed.
- **Farm plans** are generated per protocol from its category and the chains
  its TVL sits on, with a capital band scaled to its size, a gas budget for
  its main chain, a weekly cadence and a duration. Each plan also carries a
  sentence drawn from the protocol's own record — its chain spread, its age
  or its seven-day move — and closes by citing the row's own rank and
  implied value next to the standing caveat that no token is promised.

The board carries all 40 watchlist protocols plus the next 158 candidates by
implied value: 198 rows, each with five farm steps.

## Run it

Node 22.18+, standard library only:

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to>/snapshot.json
```

Writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and
`dossier.json` (via the vendored `vendor/makefun-board.ts`, byte-unchanged
from the kit) into the output directory. The program refuses to write a
board that breaks the gate's rules, and two runs write identical bytes.

The dashboard is a static page — open `out/dashboard/index.html` with
`out/data.js` beside it. It is sortable and filterable (search, category,
chain, watchlist / risk flags), and every row opens a detail view with the
model breakdown, the risk flags, the live peers in its category and its
farm plan. Views can be pinned from the address bar (`?detail=<slug>`,
`?flags=watchlist`, `?cat=<category>`, `?sort=tvl`), which is how the
screenshots were taken (`tools/capture.mjs`, DevTools protocol).

`tools/check-output.mjs <outDir> <snapshot.json> [outDir2]` replicates the
gate's seven checks plus the two-runs-identical rule, independently of the
program's own validation.

## Layout

- `main.ts` — the entry program: build, self-check, write, copy, dossier.
- `lib/model.ts` — snapshot parsing, eligibility, multiples, the value
  model, risk flags.
- `lib/farm.ts` — the farm-plan generator.
- `dashboard/` — `index.html`, `app.css`, `app.js` (19.9 KB total, so the
  dossier shows the source whole).
- `screenshots/` — the board, a detail view (Gauntlet) and the
  watchlist-filtered view, real renders. The detail view is captured in a
  taller 1440×1080 frame with its panel scrolled to the end, so the farm
  plan the judge grades is actually in the picture; the other two are
  1440×900.
- `vendor/makefun-board.ts` — the kit's dossier library, unchanged.
