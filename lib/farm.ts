// Farm plans. One plan per board row, assembled from the protocol's own
// snapshot record — its name, category and the chains its TVL actually sits
// on — with the cost and the time each step takes stated in the step itself.
// No plan promises a token or an allocation: every plan ends with the check
// that keeps a farmer honest about that.

import type { ScoredRow } from './model.ts';

type Group = 'trade' | 'lend' | 'cdp' | 'manage' | 'vault' | 'wrap' | 'rwa' | 'predict' | 'chain' | 'stake' | 'spend' | 'bridge' | 'cover' | 'use';

function groupOf(category: string | null): Group {
  switch (category) {
    case 'Dexs':
    case 'Derivatives':
    case 'OTC Marketplace':
    case 'Interest Rate Derivatives':
      return 'trade';
    case 'Lending':
    case 'Uncollateralized Lending':
      return 'lend';
    case 'CDP':
      return 'cdp';
    case 'CDP Manager':
      return 'manage';
    case 'Yield':
    case 'Yield Aggregator':
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
    case 'Basis Trading':
    case 'Liquidity Manager':
    case 'Leveraged Farming':
    case 'Farm':
    case 'Indexes':
    case 'Anchor BTC':
    case 'Decentralized BTC':
    case 'Collateral Markets':
    case 'CeDeFi':
      return 'vault';
    case 'Stablecoin Wrapper':
      return 'wrap';
    case 'RWA':
      return 'rwa';
    case 'Prediction Market':
      return 'predict';
    case 'Chain':
      return 'chain';
    case 'Restaking':
    case 'Staking Pool':
      return 'stake';
    case 'Payments':
    case 'Crypto Card Issuer':
      return 'spend';
    case 'Cross Chain Bridge':
      return 'bridge';
    case 'Insurance':
      return 'cover';
    default:
      return 'use';
  }
}

/** Chains where an ordinary transaction costs cents, not dollars — the
 *  plan's second chain is picked from the protocol's own list by this cost,
 *  never by list order alone. */
const CHEAP_CHAINS = ['Base', 'Arbitrum', 'Optimism', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Blast', 'Mode', 'Solana', 'Binance', 'Polygon'];

/** A plain-language gas budget for the chain, from the chain's name alone. */
function gasNote(chain: string): string {
  if (chain === 'Ethereum') return 'mainnet gas runs $8–$40 per transaction in normal conditions, so batch actions and avoid peak hours';
  if (chain === 'Solana') return 'fees are a fraction of a cent per transaction, so the real cost is the capital you park, not gas';
  if (chain === 'Binance') return 'BNB Chain fees are usually a few cents per transaction, so frequency is cheap and consistency matters more than size';
  if (CHEAP_CHAINS.includes(chain)) {
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
  cdp: (name, chain) =>
    `Deposit collateral you already hold (ETH or a major token — the stablecoin is what comes out, not what goes in) into ${name} on ${chain} and mint its stablecoin against it, keeping the position conservative: mint at most a third of what the collateral would allow, in the capital band above. A minted position only evidences anything while it stays open and healthy, so plan to hold it at least eight weeks and check its health weekly. Mint and repay gas is the main cost.`,
  manage: (name, chain) =>
    `Open a collateralised position through ${name} on ${chain}: deposit collateral in the capital band above on one of the markets it manages and draw a small loan against it — at most a third of what the collateral would allow — then let its own tools watch the position. Position management is the product, so the record that counts is a position opened, adjusted and kept healthy for at least eight weeks, not a deposit parked and forgotten. Position gas is the main cost.`,
  wrap: (name, chain) =>
    `Swap a stablecoin you already hold into ${name}'s wrapped version on ${chain} — the capital band above — and simply hold the wrapped balance: the wrapper is the product, and what it earns accrues to whoever holds it, so plan to hold at least one full quarter. Check what the wrapped token redeems for, and where, before you swap; the entry and exit spreads, not gas, are the main cost.`,
  vault: (name, chain) =>
    `Deposit into one of ${name}'s vaults or curated positions on ${chain} with the capital band above and hold the position: vault shares only evidence anything over time, so plan for at least eight weeks in, and rebalance between its vaults at most once a month. Entry and exit gas is the main cost.`,
  rwa: (name, chain) =>
    `Complete ${name}'s onboarding on ${chain} (account, and any identity check it asks for — about 20–40 minutes) and make a first purchase or deposit in the capital band above. Real-world-asset platforms reward accounts that hold through a full yield cycle, so plan to hold at least one quarter.`,
  predict: (name, chain) =>
    `Trade outcome shares on ${name} through its own interface on ${chain}: take small positions ($25–$100) in markets you actually have a view on, two or three a week, and hold some of them to resolution rather than flipping every one. The cost is the spread plus the gas above; a month of small, genuine positions runs about $20–$80 of spread.`,
  chain: (name, chain) =>
    `Be a real user of ${name} itself: bridge a small amount in (the capital band above) and use the chain the way its own users do — ordinary transfers plus two or three of its apps each week, a swap, a deposit, a mint, whatever its ecosystem offers. A chain rewards the wallets that were simply there early; budget the gas above for each active week.`,
  stake: (name, chain) =>
    `Stake the underlying asset through ${name} on ${chain} with the capital band above and hold the stake: a staking position only evidences anything over time, so plan for at least eight weeks in, and claim or compound rewards at most once a month. The real cost is the lockup — commit only money you can leave untouched for the whole plan.`,
  spend: (name, chain) =>
    `Use ${name} for payments you would make anyway, through a wallet or app that runs on it: ordinary purchases and transfers adding up to the capital band above across the month, a few a week, in normal amounts. Payment rails count real-world usage and retention, not deposits parked for a week, so the cost is little more than the fees you would have paid elsewhere.`,
  bridge: (name, chain) =>
    `Bridge real funds through ${name}: move the capital band above from ${chain} to one of the other chains it serves, then use the funds there for a week before bridging anything back. Two or three crossings a month, in ordinary amounts, each paying the gas above plus any bridge fee (usually 0.05–0.3% of the amount — check it before you confirm).`,
  cover: (name, chain) =>
    `Buy real cover through ${name} on ${chain}: insure a position you actually hold elsewhere — the capital band above is the cover amount, not a deposit — for one quarter, and renew it once if the position is still open. The premium, typically 2–5% of the cover per year, is the plan's main cost, and holding cover to expiry is the behaviour an insurer can verify.`,
  use: (name, chain) =>
    `Use ${name}'s core product on ${chain} the way a normal user would — start from the main action its own interface offers first, a deposit, a trade or a mint — two or three times a week for the first month, in the capital band above where the product takes funds. Genuine, varied use is the whole strategy; the cost is gas plus any capital the product holds.`,
};

const SECOND_ACTION: Record<Group, (name: string) => string> = {
  trade: (name) =>
    `From week three, add one limit order where its interface offers one, one larger trade or one liquidity position on ${name} each week alongside the swaps, so the account shows more than one kind of activity. Keep every transaction: if a snapshot is ever taken, a varied six-to-ten-week record is what it will see.`,
  lend: (name) =>
    `From week three, open a small borrow against your supply on ${name} (under 40% of what you supplied) and repay it within a fortnight, once or twice over the plan. Borrow-and-repay history is the behaviour a lending protocol can least fake, and the interest on a small, short borrow costs a few dollars.`,
  cdp: (name) =>
    `From week three, work the position both ways on ${name}: mint a little more against the same collateral one week and repay a little another, two or three adjustments over the plan, so the record shows a borrower managing a position rather than a single mint. Keep the position's health boringly comfortable throughout — a liquidation would be the loudest line in its history.`,
  manage: (name) =>
    `From week three, adjust the position once through ${name} — add a little collateral, repay a little of the loan, or switch on a protection feature if it offers one — and repeat monthly. A managed position that is actually managed is the behaviour this product exists for, and the adjustments are the history its own records keep.`,
  wrap: (name) =>
    `From the second month, split the holding on ${name}: keep most of it wrapped and move a smaller part back into the underlying stablecoin for a few weeks, then wrap it again. One clean round trip proves the exit works before it matters — the redemption path is the whole risk in a wrapper, and having tested it is worth more than a second position.`,
  vault: (name) =>
    `From week three, split a second, smaller deposit across another of ${name}'s vaults or its position on a second chain if it has one, so the account is not riding on a single strategy. Two positions held eight weeks read as a user; one deposit made yesterday reads as a farmer.`,
  rwa: (name) =>
    `From the second month, add a second, smaller position on ${name} or move the first into its longer-term option if it offers one, and keep every statement it issues. Platforms like this keep their own ledger of who held what, and for how long — that ledger is the farm.`,
  predict: (name) =>
    `From week three, work the other side of the book on ${name}: take the less popular side of one market a week, or post liquidity in the same small sizes. A record that only ever bought the favourite reads as noise; positions held to resolution are the history a prediction market can verify.`,
  chain: (name) =>
    `From week three, give the account a second habit on ${name}: one small recurring action on a fixed weekday — a weekly swap or deposit — kept up for the rest of the plan. Chains count active days and weeks, not volume spikes, so a modest rhythm held for eight to ten weeks outweighs one large weekend.`,
  stake: (name) =>
    `From week three, add a second, smaller stake on ${name} — a different vault, validator or chain if it offers one — and restake one round of rewards instead of selling them. Two stakes held through a full rewards cycle read as a participant; one deposit made yesterday reads as a farmer.`,
  spend: (name) =>
    `From week three, make ${name} your default for one recurring payment — a subscription, a top-up, a regular transfer — and keep it there for the rest of the plan. A payment rail's own records prize the account still transacting in month three over one that arrived for a single week.`,
  bridge: (name) =>
    `From week three, vary the routes on ${name}: a second source or destination chain, and one crossing in the opposite direction, so the record shows a user moving money where they need it rather than a loop farmed for count. Keep every crossing's hash in the log the last step asks for.`,
  cover: (name) =>
    `From the second month, add one smaller cover on ${name} for a second position, or stake a small amount into its underwriting pool if it runs one, and keep it for a full quarter. Two policies held to term read as a customer; a single day-one policy reads as a farmer.`,
  use: (name) =>
    `From week three, use one more of ${name}'s features than its main action — its second product, its governance page, its referral or its testnet if it runs one — so the account's history spans the product rather than repeating a single click. An extra ten minutes a week covers it.`,
};

/** One sentence of step three that belongs to this protocol alone, picked
 *  from its own record — its chain spread, its age, or its seven-day move —
 *  so two plans in the same category group still part ways where their
 *  records do. */
function signalSentence(row: ScoredRow): string {
  if (row.chains.length >= 4) {
    return `Its TVL is spread across ${row.chains.length} chains; this plan runs on the main one and the cheapest other, and leaves the rest until a position justifies the extra wallets.`;
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

/** The plan's second chain: the cheapest of the protocol's other chains to
 *  run, by the gas table above — never simply the second name on the list,
 *  which can be the chain the record happens to name after the main one
 *  (an expensive mainnet, or one whose name reads as an exchange). Falls
 *  back to the second listed chain when none of the others is cheap. */
function secondChain(row: ScoredRow, primary: string): { chain: string; cheap: boolean } | null {
  const others = row.chains.filter((c) => c !== primary);
  if (others.length === 0) return null;
  const cheap = others.find((c) => CHEAP_CHAINS.includes(c));
  return cheap !== undefined ? { chain: cheap, cheap: true } : { chain: others[0]!, cheap: false };
}

/** How a chain is named in a plan's prose. DefiLlama records BNB Chain as
 *  "Binance", which in a sentence reads as the exchange; the plan spells
 *  the chain out, and every other name is used as recorded. */
const displayChain = (chain: string): string => (chain === 'Binance' ? 'Binance (BNB Chain)' : chain);

export function farmStepsFor(row: ScoredRow, board: { rank: number; size: number }): string[] {
  const group = groupOf(row.category);
  const primary = row.chains[0] ?? 'its main chain';
  const second = secondChain(row, primary);
  const band = capitalBand(row.tvl_usd);
  const steps: string[] = [
    `Set up one wallet you will use only for ${row.name} and fund it on ${displayChain(primary)}: you need ${band} of working capital plus gas money — on ${displayChain(primary)}, ${gasNote(primary)}. Setup takes about 20 minutes; use the protocol's official site or app, reached from its DefiLlama page, never a link from a comment or DM.`,
    CORE_ACTION[group](row.name, displayChain(primary)),
    `${SECOND_ACTION[group](row.name)} ${signalSentence(row)}`,
    second !== null
      ? `In parallel, make ${row.name} a two-chain farm: repeat the core action in miniature on ${displayChain(second.chain)}${second.cheap ? ' — the cheapest of its other chains to run' : ''} (a ${band.split('–')[0]}-scale position or a few trades a month), because its TVL already spans ${row.chains.length} chains and a launch, if one comes, usually rewards the chain you were active on. Budget one extra hour a month for this.`
      : `Keep the cadence for eight to ten weeks: the core action weekly, a note of every transaction hash and date in a simple log as you go (ten minutes a week). If ${row.name} ever announces anything, that log is your proof of when you started — keep it from week one, not from the announcement.`,
    `Review monthly against the record: ${row.name} currently shows ${money(row.tvl_usd)} of TVL${row.change_7d === null ? '' : ` and a ${row.change_7d >= 0 ? '+' : ''}${row.change_7d.toFixed(1)}% seven-day move`}, and this board ranks it #${board.rank} of ${board.size} by an implied value of ${money(row.implied_value_usd)} — the model's claim from the figures above, not a promise. Nothing here promises a token — DefiLlama records none for it today, and the honest cost of this plan if none ever comes is the gas above plus your hours, so size it to what you can afford to spend learning the product.`,
  ];
  return steps;
}
