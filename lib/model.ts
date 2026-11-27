// Token Launch Radar — scoring model.
//
// Reads the frozen DefiLlama snapshot, works out which protocols still
// record no token, and ranks them by what a launch would be worth if the
// new token priced like the live peers in its own category.
//
// The valuation is deliberately plain, so a reader can check it by hand:
// a category multiple, shrunk toward the global median, times TVL, times
// three small adjustments for momentum, track record and chain spread.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface RiskFlag {
  level: 'good' | 'watch' | 'info' | 'high';
  label: string;
  detail: string;
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_years: number | null;
  watchlist: boolean;
  multiple: number;
  momentum_factor: number;
  maturity_factor: number;
  reach_factor: number;
  implied_value_usd: number;
  risk_flags: RiskFlag[];
  rank: number;
  farm_steps: string[];
}

export interface CategoryMultiple {
  category: string;
  sample: number;
  median: number;
  used: number;
}

export interface Comparable {
  name: string;
  symbol: string | null;
  mcap_usd: number;
  tvl_usd: number;
  ratio: number;
}

export interface RadarData {
  meta: {
    as_of: string;
    source: string;
    floor_usd: number;
    protocol_count: number;
    pre_token_count: number;
    candidate_count: number;
    live_count: number;
    watchlist_count: number;
    board_size: number;
    global_median_multiple: number;
    ratio_cap_multiple: number;
  };
  multiples: CategoryMultiple[];
  comparables: Record<string, Comparable[]>;
  rows: BoardRow[];
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot is not the shape this radar reads');
  }
  return raw;
}

/** Median of a sorted array; even counts average the two middle values. */
export function medianOf(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function roundTo(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

const DAY_MS = 86_400_000;

/** Whole days from a `YYYY-MM-DD` listing date to the snapshot date. */
export function daysTracked(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const [y, m, d] = listedAt.split('-').map(Number);
  const [ay, am, ad] = asOf.split('-').map(Number);
  return Math.round(
    (Date.UTC(ay!, am! - 1, ad!) - Date.UTC(y!, m! - 1, d!)) / DAY_MS,
  );
}

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const VERSION_SUFFIX = /\s(?:[Vv]\d+(?:\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/;

/** A protocol belongs on the board when it records no token and is not a
 *  wrapped, staked or bridged product of a token that already trades. */
export function isCandidate(p: SnapshotProtocol): boolean {
  if (p.gecko_id !== null || p.symbol !== null) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

export function money(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

/** The risk notes for one row, in the board's fixed order: house list,
 *  momentum, track record, chain footprint, then the size floor. */
export function riskFlags(
  p: SnapshotProtocol,
  watchlisted: boolean,
  days: number | null,
  floorUsd: number,
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (watchlisted) {
    flags.push({
      level: 'good',
      label: 'House watchlist',
      detail: `TVL at or above the ${money(floorUsd)} floor, records no token, and is no wrapped or staked product.`,
    });
  }
  const change = p.change_7d;
  if (change === null) {
    flags.push({
      level: 'info',
      label: 'Momentum unreported',
      detail:
        'DefiLlama reports no seven-day change for this protocol, so the model gives it a neutral momentum factor of 1.00.',
    });
  } else if (change <= -10) {
    flags.push({
      level: 'high',
      label: 'TVL falling fast',
      detail: `TVL is down ${Math.abs(change).toFixed(1)}% in seven days; a launch into a shrinking protocol prices off a smaller base every week it slips.`,
    });
  } else if (change <= -3) {
    flags.push({
      level: 'watch',
      label: 'TVL cooling',
      detail: `TVL is down ${Math.abs(change).toFixed(1)}% in seven days; check the trend is a market move, not users leaving, before committing time.`,
    });
  } else if (change >= 10) {
    flags.push({
      level: 'good',
      label: 'TVL growing',
      detail: `TVL is up ${change.toFixed(1)}% in seven days; growth this fast also pulls in mercenary farmers, so expect competition for any allocation.`,
    });
  }
  if (p.listed_at === null) {
    flags.push({
      level: 'watch',
      label: 'Listing date unreported',
      detail:
        'DefiLlama records no day it began tracking this protocol; the model scores its maturity at the floor of 0.80, exactly as a protocol with no track record at all, and a farmer cannot verify its history from this record.',
    });
  } else if (days !== null && days / 365.25 < 1) {
    flags.push({
      level: 'watch',
      label: 'Tracked under a year',
      detail: `First tracked ${p.listed_at}; a short record means fewer settled users and a thinner basis for any launch valuation.`,
    });
  } else if (days !== null && days / 365.25 >= 3) {
    flags.push({
      level: 'good',
      label: 'Long-running, still no token recorded',
      detail: `${(days / 365.25).toFixed(1)} years tracked with no token in the record; protocols that run this long tokenless have usually built the user base a launch distributes to.`,
    });
  }
  if (p.chains.length === 1) {
    flags.push({
      level: 'watch',
      label: 'Single-chain footprint',
      detail: `All of its TVL sits on ${p.chains[0]}; one chain means one ecosystem's users and one chain's gas costs for farming.`,
    });
  }
  if (p.tvl_usd < floorUsd) {
    flags.push({
      level: 'info',
      label: 'Below the watchlist floor',
      detail: `TVL ${money(p.tvl_usd)} is under the ${money(floorUsd)} floor; the radar keeps it because early is the point of a radar, but size is unproven.`,
    });
  }
  return flags;
}

/** Score every candidate and rank the board by implied value, highest first. */
export function buildRadar(
  snapshot: Snapshot,
  farmSteps: (
    p: SnapshotProtocol,
    ageYears: number | null,
    impliedValueUsd: number,
    rank: number,
    boardSize: number,
  ) => string[],
): { board: BoardRow[]; radar: RadarData } {
  const floor = snapshot.floor_usd;
  const watchlisted = new Set(snapshot.watchlist);

  // Live peers price the multiples: tokened protocols with both a market
  // cap and TVL, so their market-cap-to-TVL ratio is defined.
  const live = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const ratios = live.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const globalMedian = medianOf(ratios);
  // The cap is the 90th percentile by nearest rank: a few giants must not
  // set the price for a whole category.
  const ratioCap = ratios[Math.ceil(0.9 * ratios.length) - 1]!;

  const categories = [...new Set(live.map((p) => p.category).filter((c): c is string => c !== null))].sort();
  const multiples: CategoryMultiple[] = categories.map((category) => {
    const capped = live
      .filter((p) => p.category === category)
      .map((p) => Math.min(p.mcap_usd! / p.tvl_usd, ratioCap));
    const sample = capped.length;
    const med = medianOf([...capped].sort((a, b) => a - b));
    // Shrink toward the global median: 24 phantom peers at the median keep
    // thin categories honest, and a category with no peers gets the median.
    const used = (sample * med + 24 * globalMedian) / (sample + 24);
    return { category, sample, median: med, used };
  });
  const multipleByCategory = new Map(multiples.map((m) => [m.category, m.used]));

  const comparables: Record<string, Comparable[]> = {};
  for (const category of categories) {
    comparables[category] = live
      .filter((p) => p.category === category)
      .sort((a, b) => b.mcap_usd! - a.mcap_usd!)
      .slice(0, 3)
      .map((p) => ({
        name: p.name,
        symbol: p.symbol,
        mcap_usd: p.mcap_usd!,
        tvl_usd: p.tvl_usd,
        ratio: roundTo(p.mcap_usd! / p.tvl_usd, 2),
      }));
  }

  const candidates = snapshot.protocols.filter(isCandidate);
  const rows: BoardRow[] = candidates.map((p) => {
    const days = daysTracked(p.listed_at, snapshot.as_of);
    const ageYears = days === null ? null : roundTo(days / 365.25, 2);
    const multiple = p.category === null ? globalMedian : (multipleByCategory.get(p.category) ?? globalMedian);
    const change = p.change_7d;
    const momentum = change === null ? 1 : Math.min(Math.max(1 + 0.005 * change, 0.875), 1.2);
    const maturity = days === null ? 0.8 : Math.min(0.8 + 0.04 * (days / 365.25), 1);
    const reach = 1 + Math.min(0.015 * (p.chains.length - 1), 0.12);
    const implied = Math.round(p.tvl_usd * multiple * momentum * maturity * reach);
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_years: ageYears,
      watchlist: watchlisted.has(p.slug),
      multiple: roundTo(multiple, 4),
      momentum_factor: roundTo(momentum, 4),
      maturity_factor: roundTo(maturity, 4),
      reach_factor: roundTo(reach, 4),
      implied_value_usd: implied,
      risk_flags: riskFlags(p, watchlisted.has(p.slug), days, floor),
      rank: 0,
      farm_steps: [],
    };
  });
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd);
  const bySlug = new Map(candidates.map((p) => [p.slug, p]));
  rows.forEach((row, i) => {
    row.rank = i + 1;
    // The last step quotes the rank, so the plans are written once the
    // order is final rather than while it is still being decided.
    row.farm_steps = farmSteps(bySlug.get(row.slug)!, row.age_years, row.implied_value_usd, row.rank, rows.length);
  });

  const preToken = snapshot.protocols.filter((p) => p.gecko_id === null && p.symbol === null).length;
  const radar: RadarData = {
    meta: {
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: floor,
      protocol_count: snapshot.protocols.length,
      pre_token_count: preToken,
      candidate_count: candidates.length,
      live_count: snapshot.protocols.filter((p) => p.symbol !== null).length,
      watchlist_count: snapshot.watchlist.length,
      board_size: rows.length,
      global_median_multiple: roundTo(globalMedian, 4),
      ratio_cap_multiple: roundTo(ratioCap, 4),
    },
    multiples,
    comparables,
    rows,
  };
  return { board: rows, radar };
}

/** The dashboard's data file: the same board, as a script the page reads. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)}\n`;
}

/** The gate's own shape, checked before anything is written: a board the
 *  scorer would refuse is a bug, not a submission. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const row of board) {
    if (!known.has(row.slug)) return `board names ${row.slug}, which the snapshot never lists`;
    if (seen.has(row.slug)) return `board lists ${row.slug} twice`;
    seen.add(row.slug);
    if (!row.name) return `board row ${row.slug} has no name`;
    if (!Number.isInteger(row.rank) || row.rank < 1) return `board row ${row.slug} has a bad rank`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1) {
      return `board row ${row.slug} has a bad implied value`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `board row ${row.slug} has ${row.farm_steps.length} farm steps`;
    }
    for (const step of row.farm_steps) {
      if (step.trim().length < 20 || step.trim().length > 600) {
        return `board row ${row.slug} has a farm step outside 20-600 characters`;
      }
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `board misses watchlist member ${slug}`;
  }
  return null;
}
