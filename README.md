[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/competitions/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/indra260/token-launch-radar/rank.svg)](https://make.fun/competitions/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/indra260/token-launch-radar/reward.svg)](https://make.fun/competitions/token-radar-01)

# Token Launch Radar

A ranked board of the protocols that still record no token, priced by what
a launch would be worth — plus a concrete five-step farm plan for each one.

## The idea

Plenty of protocols run for years without a token. When one finally launches,
the token usually prices off the same yardstick the market already applies
to its peers: market cap per dollar of TVL. This radar applies that yardstick
to every tokenless protocol in a frozen DefiLlama snapshot and ranks them by
the implied value of a launch at peer prices.

## How a protocol is priced

1. **Live peers set the price.** For each category, take the tokened
   protocols that have both a market cap and TVL, and look at their
   market-cap-to-TVL ratios. The category multiple is the median of those
   ratios, capped at the 90th percentile so one giant cannot set the price.
2. **Thin categories are shrunk toward the middle.** The multiple used is
   `(n · median + 24 · global median) / (n + 24)` — 24 phantom peers sitting
   at the global median. A category with no live peers at all just gets the
   global median.
3. **Three small adjustments.** The raw value — TVL times the multiple — is
   scaled by momentum (the seven-day TVL move, clamped), maturity (longer
   tracked history scores higher, up to a cap) and reach (more chains, a
   little more). The result is the implied value, and the board is sorted by
   it, highest first.

Every row also carries risk notes drawn from its own record — watchlist
membership, a fast-falling or fast-growing TVL, a short or missing track
record, a single-chain footprint, a TVL under the watchlist floor — and a
farm plan written from the same record: which chain to start on, what the
gas costs there, the core position for that kind of product, a second
position in week three, the cadence to keep, and a monthly review against
the numbers. Nothing here promises a token will ever launch.

## Run it

Requires Node.js 22.18 or later, standard library only.

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

With no flags it reads `/input/snapshot.json` and writes `/output`, which is
how the grader runs it. The run writes:

- `board.json` — the ranked board (198 rows for this snapshot)
- `data.js` — the same board as a script for the dashboard
- `dashboard/` — the static page (no network, no framework)
- `screenshots/` — the board, a detail view, and a filtered view
- `dossier.json` — the judge's summary, built with `vendor/makefun-board.ts`

## Screenshots

The three screenshots are taken from the dashboard with `tools/capture.mjs`,
which drives a headless Chromium over its DevTools protocol:

```sh
node tools/capture.mjs --dir <dir holding dashboard/ and data.js> --out screenshots/
```

## Layout

- `main.ts` — entrypoint: reads the snapshot, writes the whole output
- `lib/model.ts` — the valuation model, eligibility, and risk notes
- `lib/farm.ts` — the five-step farm plans
- `dashboard/` — `index.html`, `app.css`, `app.js`
- `tools/capture.mjs` — the screenshot tool
- `vendor/makefun-board.ts` — the make.fun dossier library, from the kit

## Data

The snapshot is DefiLlama's protocol list as fetched 2026-11-14
(`https://api.llama.fi/protocols`), frozen for the competition: 758
protocols, 342 of them tokenless, 40 on the house watchlist at a $50,000,000
floor. The program reads whatever snapshot it is given; the numbers above
describe this competition's input.

## License

MIT — see [LICENSE](LICENSE).
