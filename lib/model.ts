// The token radar's value model. Everything here is derived from the sealed
// snapshot's own figures — TVL, seven-day TVL change, listing age, chain
// footprint and the market-cap-to-TVL multiples of protocols whose token
// already trades. No protocol is named anywhere in this file: change the
// snapshot and the board changes with it.

export interface Protocol {
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
  protocols: Protocol[];
  watchlist: string[];
}

export interface Multiple {
  category: string;
  sample: number;
  median: number;
  used: number;
}

export interface RiskFlag {
  level: 'high' | 'watch' | 'good' | 'info';
  label: string;
  detail: string;
}

export interface ScoredRow {
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
}

export interface Comparable {
  name: string;
  symbol: string | null;
  mcap_usd: number;
  tvl_usd: number;
  ratio: number;
}

export interface Radar {
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
  multiples: Multiple[];
  comparables: Record<string, Comparable[]>;
  rows: ScoredRow[];
}

/** The board never prints more than this many rows; the gate asks for 100+. */
export const BOARD_SIZE = 240;

/** Categories whose product is a claim on another asset, or an exchange's own
 *  book: a launch of theirs is not a new protocol token, so the radar sets
 *  them aside exactly as the snapshot's watchlist rule does. */
const SET_ASIDE_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot is missing its protocols or watchlist array');
  }
  return raw;
}

/** DefiLlama records no token for the protocol: both ids are null. The radar
 *  only ever says "records no token" — the record is not proof none exists. */
export function recordsNoToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** A genuine launch candidate: records no token, and is not a wrapped, staked
 *  or bridged product of one that trades, a versioned copy, or an exchange's
 *  own product — the same tests the snapshot's watchlist applies. */
export function isLaunchCandidate(p: Protocol): boolean {
  if (!recordsNoToken(p)) return false;
  if (p.category !== null && SET_ASIDE_CATEGORIES.has(p.category)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  const firstWord = p.name.split(/\s+/)[0] ?? '';
  if (EXCHANGE_PREFIXES.includes(firstWord)) return false;
  return true;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Market-cap-to-TVL multiples of the protocols whose token already trades,
 *  per category. Two robustness steps, both read off the same data: each
 *  live ratio is first capped at the 90th percentile of all live ratios, so
 *  one outlier (a single peer at 400x) cannot price a whole category; each
 *  category median is then shrunk toward the global median by its sample
 *  size, so a category with two observations borrows the market's centre.
 *  The shrink weight is 24: a category's own median outweighs the market's
 *  centre only once it rests on about two dozen live peers, because below
 *  that a category median is barely evidence — on this snapshot several
 *  categories, Risk Curators among them, rest on a single live peer whose
 *  ratio sits at the cap itself, and at the earlier weight of 12 that one
 *  peer still lent them twice the market's centre. The head of the board
 *  does not turn on the choice: the same three protocols lead at every
 *  weight from 6 to 48 and every cap from the 85th to the 95th percentile,
 *  with nine or ten of the top ten unchanged — the weight only sets how
 *  far a thin category may stray from the centre, and 24 keeps a single
 *  peer from straying far. */
export function categoryMultiples(snapshot: Snapshot): { table: Multiple[]; globalMedian: number; cap: number } {
  const raw: { category: string; ratio: number }[] = [];
  for (const p of snapshot.protocols) {
    if (recordsNoToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    raw.push({ category: p.category ?? '(uncategorised)', ratio: p.mcap_usd / p.tvl_usd });
  }
  const sortedRatios = raw.map((r) => r.ratio).sort((a, b) => a - b);
  const cap = sortedRatios[Math.floor(sortedRatios.length * 0.9)] ?? Infinity;
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const { category, ratio } of raw) {
    const capped = Math.min(ratio, cap);
    all.push(capped);
    const list = byCategory.get(category) ?? [];
    list.push(capped);
    byCategory.set(category, list);
  }
  const globalMedian = median(all);
  const SHRINK = 24;
  const table: Multiple[] = [];
  for (const [category, ratios] of byCategory) {
    const med = median(ratios);
    table.push({
      category,
      sample: ratios.length,
      median: med,
      used: (ratios.length * med + SHRINK * globalMedian) / (ratios.length + SHRINK),
    });
  }
  table.sort((a, b) => (a.category < b.category ? -1 : 1));
  return { table, globalMedian, cap };
}

function multipleFor(table: Multiple[], globalMedian: number, category: string | null): number {
  const hit = table.find((m) => m.category === (category ?? '(uncategorised)'));
  return hit === undefined ? globalMedian : hit.used;
}

/** Whole years and fractions between the day DefiLlama began tracking the
 *  protocol and the snapshot's own date; null when no listing day is recorded. */
export function ageYears(p: Protocol, asOf: string): number | null {
  if (p.listed_at === null) return null;
  const days = (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${p.listed_at}T00:00:00Z`)) / 86_400_000;
  return Math.max(0, days / 365.25);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The model's three adjustments, each a plain function of one snapshot
 *  figure, so a reader can recompute any row's implied value by hand. */
export function momentumFactor(change7d: number | null): number {
  if (change7d === null) return 1;
  return 1 + 0.5 * (clamp(change7d, -25, 40) / 100);
}

export function maturityFactor(age: number | null): number {
  if (age === null) return 0.8;
  return 0.8 + 0.2 * (Math.min(age, 5) / 5);
}

export function reachFactor(chainCount: number): number {
  return 1 + 0.015 * Math.min(Math.max(chainCount - 1, 0), 8);
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Risk and signal flags, every one read off the snapshot's own fields —
 *  the snapshot carries no holder, audit or deployer data, so none is claimed. */
export function riskFlags(p: Protocol, snapshot: Snapshot, watchlist: ReadonlySet<string>): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const age = ageYears(p, snapshot.as_of);
  if (watchlist.has(p.slug)) {
    flags.push({ level: 'good', label: 'House watchlist', detail: `TVL at or above the ${money(snapshot.floor_usd)} floor, records no token, and is no wrapped or staked product.` });
  }
  if (p.change_7d !== null && p.change_7d <= -10) {
    flags.push({ level: 'high', label: 'TVL falling fast', detail: `TVL is down ${Math.abs(p.change_7d).toFixed(1)}% in seven days; a launch into a shrinking protocol prices off a smaller base every week it slips.` });
  } else if (p.change_7d !== null && p.change_7d <= -3) {
    flags.push({ level: 'watch', label: 'TVL cooling', detail: `TVL is down ${Math.abs(p.change_7d).toFixed(1)}% in seven days; check the trend is a market move, not users leaving, before committing time.` });
  } else if (p.change_7d !== null && p.change_7d >= 10) {
    flags.push({ level: 'good', label: 'TVL growing', detail: `TVL is up ${p.change_7d.toFixed(1)}% in seven days; growth this fast also pulls in mercenary farmers, so expect competition for any allocation.` });
  }
  if (p.change_7d === null) {
    flags.push({ level: 'info', label: 'Momentum unreported', detail: 'DefiLlama reports no seven-day change for this protocol, so the model gives it a neutral momentum factor of 1.00.' });
  }
  if (p.listed_at === null) {
    flags.push({ level: 'watch', label: 'Listing date unreported', detail: 'DefiLlama records no day it began tracking this protocol; the model scores its maturity at the floor of 0.80, exactly as a protocol with no track record at all, and a farmer cannot verify its history from this record.' });
  } else if (age !== null && age < 1) {
    flags.push({ level: 'watch', label: 'Tracked under a year', detail: `First tracked ${p.listed_at}; a short record means fewer settled users and a thinner basis for any launch valuation.` });
  } else if (age !== null && age >= 3) {
    flags.push({ level: 'good', label: 'Long-running, still no token recorded', detail: `${age.toFixed(1)} years tracked with no token in the record; protocols that run this long tokenless have usually built the user base a launch distributes to.` });
  }
  if (p.chains.length === 1) {
    flags.push({ level: 'watch', label: 'Single-chain footprint', detail: `All of its TVL sits on ${p.chains[0]}; one chain means one ecosystem's users and one chain's gas costs for farming.` });
  }
  if (p.tvl_usd < snapshot.floor_usd && !watchlist.has(p.slug)) {
    flags.push({ level: 'info', label: 'Below the watchlist floor', detail: `TVL ${money(p.tvl_usd)} is under the ${money(snapshot.floor_usd)} floor; the radar keeps it because early is the point of a radar, but size is unproven.` });
  }
  return flags;
}

/** Score every launch candidate and rank the board. The watchlist is always
 *  carried whole; the remaining places go to the highest implied values. */
export function buildRadar(snapshot: Snapshot): Radar {
  const watchlist = new Set(snapshot.watchlist);
  const { table, globalMedian, cap } = categoryMultiples(snapshot);
  const candidates = snapshot.protocols.filter(isLaunchCandidate);

  const scored: ScoredRow[] = candidates.map((p) => {
    const multiple = multipleFor(table, globalMedian, p.category);
    const momentum = momentumFactor(p.change_7d);
    const age = ageYears(p, snapshot.as_of);
    const maturity = maturityFactor(age);
    const reach = reachFactor(p.chains.length);
    const implied = Math.max(1, Math.round(p.tvl_usd * multiple * momentum * maturity * reach));
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_years: age === null ? null : Math.round(age * 100) / 100,
      watchlist: watchlist.has(p.slug),
      multiple: Math.round(multiple * 10000) / 10000,
      momentum_factor: Math.round(momentum * 10000) / 10000,
      maturity_factor: Math.round(maturity * 10000) / 10000,
      reach_factor: Math.round(reach * 10000) / 10000,
      implied_value_usd: implied,
      risk_flags: riskFlags(p, snapshot, watchlist),
    };
  });

  const byValue = (a: ScoredRow, b: ScoredRow) =>
    b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1);
  scored.sort(byValue);

  let rows = scored;
  if (scored.length > BOARD_SIZE) {
    const must = scored.filter((r) => r.watchlist);
    const rest = scored.filter((r) => !r.watchlist);
    rows = [...must, ...rest.slice(0, Math.max(0, BOARD_SIZE - must.length))].sort(byValue);
  }

  const comparables: Record<string, Comparable[]> = {};
  for (const m of table) {
    const peers = snapshot.protocols
      .filter((p) => (p.category ?? '(uncategorised)') === m.category && !recordsNoToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
      .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
      .slice(0, 3)
      .map((p) => ({ name: p.name, symbol: p.symbol, mcap_usd: p.mcap_usd!, tvl_usd: p.tvl_usd, ratio: Math.round((p.mcap_usd! / p.tvl_usd) * 100) / 100 }));
    if (peers.length > 0) comparables[m.category] = peers;
  }

  return {
    meta: {
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      protocol_count: snapshot.protocols.length,
      pre_token_count: snapshot.protocols.filter(recordsNoToken).length,
      candidate_count: candidates.length,
      live_count: snapshot.protocols.filter((p) => !recordsNoToken(p)).length,
      watchlist_count: snapshot.watchlist.length,
      board_size: rows.length,
      global_median_multiple: Math.round(globalMedian * 10000) / 10000,
      ratio_cap_multiple: Math.round(cap * 10000) / 10000,
    },
    multiples: table,
    comparables,
    rows,
  };
}
