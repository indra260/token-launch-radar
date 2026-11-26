// Farm plans. One plan per board row, assembled from the protocol's own
// snapshot record — its name, category and the chains its TVL actually sits
// on — with the cost and the time each step takes stated in the step itself.
// No plan promises a token or an allocation: every plan ends with the check
// that keeps a farmer honest about that.

import type { ScoredRow } from './model.ts';

type Group = 'trade' | 'lend' | 'vault' | 'rwa' | 'use';

function groupOf(category: string | null): Group {
  switch (category) {
    case 'Dexs':
    case 'Derivatives':
      return 'trade';
    case 'Lending':
    case 'CDP':
      return 'lend';
    case 'Yield':
    case 'Yield Aggregator':
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
    case 'Basis Trading':
      return 'vault';
    case 'RWA':
      return 'rwa';
    default:
      return 'use';
  }
}

/** A plain-language gas budget for the chain, from the chain's name alone. */
function gasNote(chain: string): string {
  if (chain === 'Ethereum') return 'mainnet gas runs $8–$40 per transaction in normal conditions, so batch actions and avoid peak hours';
  if (chain === 'Solana') return 'fees are a fraction of a cent per transaction, so the real cost is the capital you park, not gas';
  if (['Base', 'Arbitrum', 'Optimism', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Blast', 'Mode'].includes(chain)) {
    return 'gas is usually under $0.50 per transaction, so frequency is cheap and consistency matters more than size';
  }
  return 'check the chain explorer for its typical fee before you start, and size the budget below once you know it';
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** A starting-capital band scaled to the protocol's own size: farming a
 *  $2B protocol with $20 is noise; the band keeps the plan honest. */
function capitalBand(tvl: number): string {
  if (tvl >= 1_000_000_000) return '$500–$2,000';
  if (tvl >= 100_000_000) return '$250–$1,000';
  if (tvl >= 50_000_000) return '$100–$500';
  return '$50–$250';
}

const CORE_ACTION: Record<Group, (name: string, chain: string) => string> = {
  trade: (name, chain) =>
    `Make real trades on ${name} through its own interface on ${chain}: two to four swaps a week of $50–$250 each, varying pairs and sizes like a genuine user. Each swap costs the gas above plus spread, so a month of this runs roughly $15–$60 on a cheap chain and more on mainnet.`,
  lend: (name, chain) =>
    `Supply an asset you already hold (a stablecoin or ETH) into ${name} on ${chain} and leave it supplied: one deposit of the capital band above, then a small top-up or partial withdrawal every week or two so the position shows a history, not a single touch. Deposit and withdrawal gas is the main cost.`,
  vault: (name, chain) =>
    `Deposit into one of ${name}'s vaults or curated positions on ${chain} with the capital band above and hold the position: vault shares only evidence anything over time, so plan for at least eight weeks in, and rebalance between its vaults at most once a month. Entry and exit gas is the main cost.`,
  rwa: (name, chain) =>
    `Complete ${name}'s onboarding on ${chain} (account, and any identity check it asks for — about 20–40 minutes) and make a first purchase or deposit in the capital band above. Real-world-asset platforms reward accounts that hold through a full yield cycle, so plan to hold at least one quarter.`,
  use: (name, chain) =>
    `Use ${name}'s core product on ${chain} the way a normal user would — whatever its main action is — two or three times a week for the first month, in the capital band above where the product takes funds. Genuine, varied use is the whole strategy; the cost is gas plus any capital the product holds.`,
};

const SECOND_ACTION: Record<Group, (name: string) => string> = {
  trade: (name) =>
    `From week three, add one limit order, one larger trade or one liquidity position on ${name} each week alongside the swaps, so the account shows more than one kind of activity. Keep every transaction: if a snapshot is ever taken, a varied six-to-ten-week record is what it will see.`,
  lend: (name) =>
    `From week three, open a small borrow against your supply on ${name} (under 40% of what you supplied) and repay it within a fortnight, once or twice over the plan. Borrow-and-repay history is the behaviour a lending protocol can least fake, and the interest on a small, short borrow costs a few dollars.`,
  vault: (name) =>
    `From week three, split a second, smaller deposit across another of ${name}'s vaults or its position on a second chain if it has one, so the account is not riding on a single strategy. Two positions held eight weeks read as a user; one deposit made yesterday reads as a farmer.`,
  rwa: (name) =>
    `From the second month, add a second, smaller position on ${name} or move the first into its longer-term option if it offers one, and keep every statement it issues. Platforms like this keep their own ledger of who held what, and for how long — that ledger is the farm.`,
  use: (name) =>
    `From week three, use one more of ${name}'s features than its main action — its second product, its governance page, its referral or its testnet if it runs one — so the account's history spans the product rather than repeating a single click. An extra ten minutes a week covers it.`,
};

/** One sentence of step three that belongs to this protocol alone, picked
 *  from its own record — its chain spread, its age, or its seven-day move —
 *  so two plans in the same category group still part ways where their
 *  records do. */
function signalSentence(row: ScoredRow): string {
  if (row.chains.length >= 4) {
    return `Its TVL is spread across ${row.chains.length} chains; pick the two cheapest of them to actually run and leave the rest until a position justifies the extra wallets.`;
  }
  if (row.age_years !== null && row.age_years >= 2) {
    return `It has been tracked for ${row.age_years.toFixed(1)} years with no token in the record, so its early-user history is long; activity that predates any announcement is the whole edge, and yours would.`;
  }
  if (row.change_7d !== null && row.change_7d >= 5) {
    return `Its TVL grew ${row.change_7d.toFixed(1)}% in the last seven days, so new farmers are arriving with it; starting now still puts you ahead of the crowd that waits for an announcement.`;
  }
  if (row.change_7d !== null && row.change_7d <= -5) {
    return `Its TVL fell ${Math.abs(row.change_7d).toFixed(1)}% in the last seven days and the crowd is leaving with it; a small position kept through a quiet stretch is cheap precisely because few bother.`;
  }
  return 'Keep the amounts boringly consistent: a record that looks like a household\u2019s ordinary finances reads better than a campaign run in a single weekend.';
}

export function farmStepsFor(row: ScoredRow, board: { rank: number; size: number }): string[] {
  const group = groupOf(row.category);
  const primary = row.chains[0] ?? 'its main chain';
  const second = row.chains.length > 1 ? row.chains[1]! : null;
  const band = capitalBand(row.tvl_usd);
  const steps: string[] = [
    `Set up one wallet you will use only for ${row.name} and fund it on ${primary}: you need ${band} of working capital plus gas money — on ${primary}, ${gasNote(primary)}. Setup takes about 20 minutes; use the protocol's official site or app, reached from its DefiLlama page, never a link from a comment or DM.`,
    CORE_ACTION[group](row.name, primary),
    `${SECOND_ACTION[group](row.name)} ${signalSentence(row)}`,
    second !== null
      ? `In parallel, make ${row.name} a two-chain farm: repeat the core action in miniature on ${second} (a ${band.split('–')[0]}-scale position or a few trades a month), because its TVL already spans ${row.chains.length} chains and a launch, if one comes, usually rewards the chain you were active on. Budget one extra hour a month for this.`
      : `Keep the cadence for eight to ten weeks: the core action weekly, a note of every transaction hash and date in a simple log as you go (ten minutes a week). If ${row.name} ever announces anything, that log is your proof of when you started — keep it from week one, not from the announcement.`,
    `Review monthly against the record: ${row.name} currently shows ${money(row.tvl_usd)} of TVL${row.change_7d === null ? '' : ` and a ${row.change_7d >= 0 ? '+' : ''}${row.change_7d.toFixed(1)}% seven-day move`}, and this board ranks it #${board.rank} of ${board.size} by an implied value of ${money(row.implied_value_usd)} — the model's claim from the figures above, not a promise. Nothing here promises a token — DefiLlama records none for it today, and the honest cost of this plan if none ever comes is the gas above plus your hours, so size it to what you can afford to spend learning the product.`,
  ];
  return steps;
}
