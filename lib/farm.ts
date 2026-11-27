// Token Launch Radar — farm plans.
//
// Every board row carries five steps a reader can actually follow: set up,
// take the core position, deepen it in week three, keep the cadence, and
// review against the record. The steps are built from the row's own record
// — its chains, its size, its seven-day move and how long it has been
// tracked — so the same plan never repeats word for word.

import { money, type SnapshotProtocol } from './model.ts';

/** Binance is shown with its chain name wherever a step names a chain. */
export function chainLabel(chain: string): string {
  return chain === 'Binance' ? 'Binance (BNB Chain)' : chain;
}

/** Working-capital band by size: bigger protocols get a bigger plan. */
export function capitalBand(tvlUsd: number): { text: string; low: number } {
  if (tvlUsd < 50_000_000) return { text: '$50–$250', low: 50 };
  if (tvlUsd < 100_000_000) return { text: '$100–$500', low: 100 };
  if (tvlUsd < 1_000_000_000) return { text: '$250–$1,000', low: 250 };
  return { text: '$500–$2,000', low: 500 };
}

/** What a transaction costs on the main chain, in the plan's own words. */
function gasNote(chain: string): string {
  const shown = chainLabel(chain);
  if (chain === 'Ethereum') {
    return `on ${shown}, mainnet gas runs $8–$40 per transaction in normal conditions, so batch actions and avoid peak hours.`;
  }
  if (chain === 'Base' || chain === 'Arbitrum' || chain === 'Mantle' || chain === 'Polygon' || chain === 'zkSync Era') {
    return `on ${shown}, gas is usually under $0.50 per transaction, so frequency is cheap and consistency matters more than size.`;
  }
  if (chain === 'Solana') {
    return `on ${shown}, fees are a fraction of a cent per transaction, so the real cost is the capital you park, not gas.`;
  }
  if (chain === 'Binance') {
    return `on ${shown}, BNB Chain fees are usually a few cents per transaction, so frequency is cheap and consistency matters more than size.`;
  }
  return `on ${shown}, check the chain explorer for its typical fee before you start, and size the budget below once you know it.`;
}

function stepOne(p: SnapshotProtocol): string {
  const band = capitalBand(p.tvl_usd);
  return `Set up one wallet you will use only for ${p.name} and fund it on ${chainLabel(p.chains[0]!)}: you need ${band.text} of working capital plus gas money — ${gasNote(p.chains[0]!)} Setup takes about 20 minutes; use the protocol's official site or app, reached from its DefiLlama page, never a link from a comment or DM.`;
}

// The core action, grouped by what the product actually is. A vault takes a
// deposit, a market takes trades, a lender takes supply — the plan never
// prescribes a borrow or a mint the product does not offer.
const VAULT_CATEGORIES = new Set([
  'Risk Curators',
  'Onchain Capital Allocator',
  'Yield',
  'Yield Aggregator',
  'Basis Trading',
  'CeDeFi',
  'Indexes',
  'Leveraged Farming',
  'Liquidity Manager',
  'Farm',
  'Anchor BTC',
  'Collateral Markets',
  'Decentralized BTC',
]);
const TRADE_CATEGORIES = new Set([
  'Derivatives',
  'Dexs',
  'OTC Marketplace',
  'Interest Rate Derivatives',
]);
const SUPPLY_CATEGORIES = new Set(['Lending', 'Uncollateralized Lending']);
const GENERIC_CATEGORIES = new Set(['Dual-Token Stablecoin', 'Governance Incentives']);
const PAYMENT_CATEGORIES = new Set(['Payments', 'Crypto Card Issuer']);
const STAKE_CATEGORIES = new Set(['Restaking', 'Staking Pool']);

function stepTwo(p: SnapshotProtocol): string {
  const name = p.name;
  const chain = chainLabel(p.chains[0]!);
  const category = p.category;
  if (category !== null && VAULT_CATEGORIES.has(category)) {
    return `Deposit into one of ${name}'s vaults or curated positions on ${chain} with the capital band above and hold the position: vault shares only evidence anything over time, so plan for at least eight weeks in, and rebalance between its vaults at most once a month. Entry and exit gas is the main cost.`;
  }
  if (category !== null && TRADE_CATEGORIES.has(category)) {
    return `Make real trades on ${name} through its own interface on ${chain}: two to four swaps a week of $50–$250 each, varying pairs and sizes like a genuine user. Each swap costs the gas above plus spread, so a month of this runs roughly $15–$60 on a cheap chain and more on mainnet.`;
  }
  if (category !== null && SUPPLY_CATEGORIES.has(category)) {
    return `Supply an asset you already hold (a stablecoin or ETH) into ${name} on ${chain} and leave it supplied: one deposit of the capital band above, then a small top-up or partial withdrawal every week or two so the position shows a history, not a single touch. Deposit and withdrawal gas is the main cost.`;
  }
  if (category === 'RWA') {
    return `Complete ${name}'s onboarding on ${chain} (account, and any identity check it asks for — about 20–40 minutes) and make a first purchase or deposit in the capital band above. Real-world-asset platforms reward accounts that hold through a full yield cycle, so plan to hold at least one quarter.`;
  }
  if (category === 'CDP') {
    return `Deposit collateral you already hold (ETH or a major token — the stablecoin is what comes out, not what goes in) into ${name} on ${chain} and mint its stablecoin against it, keeping the position conservative: mint at most a third of what the collateral would allow, in the capital band above. A minted position only evidences anything while it stays open and healthy, so plan to hold it at least eight weeks and check its health weekly. Mint and repay gas is the main cost.`;
  }
  if (category !== null && STAKE_CATEGORIES.has(category)) {
    return `Stake the underlying asset through ${name} on ${chain} with the capital band above and hold the stake: a staking position only evidences anything over time, so plan for at least eight weeks in, and claim or compound rewards at most once a month. The real cost is the lockup — commit only money you can leave untouched for the whole plan.`;
  }
  if (category === 'Chain') {
    return `Be a real user of ${name} itself: bridge a small amount in (the capital band above) and use the chain the way its own users do — ordinary transfers plus two or three of its apps each week, a swap, a deposit, a mint, whatever its ecosystem offers. A chain rewards the wallets that were simply there early; budget the gas above for each active week.`;
  }
  if (category !== null && GENERIC_CATEGORIES.has(category)) {
    return `Use ${name}'s core product on ${chain} the way a normal user would — start from the main action its own interface offers first, a deposit, a trade or a mint — two or three times a week for the first month, in the capital band above where the product takes funds. Genuine, varied use is the whole strategy; the cost is gas plus any capital the product holds.`;
  }
  if (category !== null && PAYMENT_CATEGORIES.has(category)) {
    return `Use ${name} for payments you would make anyway, through a wallet or app that runs on it: ordinary purchases and transfers adding up to the capital band above across the month, a few a week, in normal amounts. Payment rails count real-world usage and retention, not deposits parked for a week, so the cost is little more than the fees you would have paid elsewhere.`;
  }
  if (category === 'Stablecoin Wrapper') {
    return `Swap a stablecoin you already hold into ${name}'s wrapped version on ${chain} — the capital band above — and simply hold the wrapped balance: the wrapper is the product, and what it earns accrues to whoever holds it, so plan to hold at least one full quarter. Check what the wrapped token redeems for, and where, before you swap; the entry and exit spreads, not gas, are the main cost.`;
  }
  if (category === 'Prediction Market') {
    return `Trade outcome shares on ${name} through its own interface on ${chain}: take small positions ($25–$100) in markets you actually have a view on, two or three a week, and hold some of them to resolution rather than flipping every one. The cost is the spread plus the gas above; a month of small, genuine positions runs about $20–$80 of spread.`;
  }
  if (category === 'CDP Manager') {
    return `Open a collateralised position through ${name} on ${chain}: deposit collateral in the capital band above on one of the markets it manages and draw a small loan against it — at most a third of what the collateral would allow — then let its own tools watch the position. Position management is the product, so the record that counts is a position opened, adjusted and kept healthy for at least eight weeks, not a deposit parked and forgotten. Position gas is the main cost.`;
  }
  if (category === 'Cross Chain Bridge') {
    return `Bridge real funds through ${name}: move the capital band above from ${chain} to one of the other chains it serves, then use the funds there for a week before bridging anything back. Two or three crossings a month, in ordinary amounts, each paying the gas above plus any bridge fee (usually 0.05–0.3% of the amount — check it before you confirm).`;
  }
  if (category === 'Insurance') {
    return `Buy real cover through ${name} on ${chain}: insure a position you actually hold elsewhere — the capital band above is the cover amount, not a deposit — for one quarter, and renew it once if the position is still open. The premium, typically 2–5% of the cover per year, is the plan's main cost, and holding cover to expiry is the behaviour an insurer can verify.`;
  }
  // Any category the groups above do not name falls back to the generic
  // core-product plan rather than a plan for a product it is not.
  return `Use ${name}'s core product on ${chain} the way a normal user would — start from the main action its own interface offers first, a deposit, a trade or a mint — two or three times a week for the first month, in the capital band above where the product takes funds. Genuine, varied use is the whole strategy; the cost is gas plus any capital the product holds.`;
}

// The week-three deepening, matching the core action above.
function stepThreeBase(p: SnapshotProtocol): string {
  const name = p.name;
  const category = p.category;
  if (category !== null && VAULT_CATEGORIES.has(category)) {
    return `From week three, split a second, smaller deposit across another of ${name}'s vaults or its position on a second chain if it has one, so the account is not riding on a single strategy. Two positions held eight weeks read as a user; one deposit made yesterday reads as a farmer.`;
  }
  if (category !== null && TRADE_CATEGORIES.has(category)) {
    return `From week three, add one limit order where its interface offers one, one larger trade or one liquidity position on ${name} each week alongside the swaps, so the account shows more than one kind of activity. Keep every transaction: if a snapshot is ever taken, a varied six-to-ten-week record is what it will see.`;
  }
  if (category !== null && SUPPLY_CATEGORIES.has(category)) {
    return `From week three, open a small borrow against your supply on ${name} (under 40% of what you supplied) and repay it within a fortnight, once or twice over the plan. Borrow-and-repay history is the behaviour a lending protocol can least fake, and the interest on a small, short borrow costs a few dollars.`;
  }
  if (category === 'RWA') {
    return `From the second month, add a second, smaller position on ${name} or move the first into its longer-term option if it offers one, and keep every statement it issues. Platforms like this keep their own ledger of who held what, and for how long — that ledger is the farm.`;
  }
  if (category === 'CDP') {
    return `From week three, work the position both ways on ${name}: mint a little more against the same collateral one week and repay a little another, two or three adjustments over the plan, so the record shows a borrower managing a position rather than a single mint. Keep the position's health boringly comfortable throughout — a liquidation would be the loudest line in its history.`;
  }
  if (category !== null && STAKE_CATEGORIES.has(category)) {
    return `From week three, add a second, smaller stake on ${name} — a different vault, validator or chain if it offers one — and restake one round of rewards instead of selling them. Two stakes held through a full rewards cycle read as a participant; one deposit made yesterday reads as a farmer.`;
  }
  if (category === 'Chain') {
    return `From week three, give the account a second habit on ${name}: one small recurring action on a fixed weekday — a weekly swap or deposit — kept up for the rest of the plan. Chains count active days and weeks, not volume spikes, so a modest rhythm held for eight to ten weeks outweighs one large weekend.`;
  }
  if (category !== null && GENERIC_CATEGORIES.has(category)) {
    return `From week three, use one more of ${name}'s features than its main action — its second product, its governance page, its referral or its testnet if it runs one — so the account's history spans the product rather than repeating a single click. An extra ten minutes a week covers it.`;
  }
  if (category !== null && PAYMENT_CATEGORIES.has(category)) {
    return `From week three, make ${name} your default for one recurring payment — a subscription, a top-up, a regular transfer — and keep it there for the rest of the plan. A payment rail's own records prize the account still transacting in month three over one that arrived for a single week.`;
  }
  if (category === 'Stablecoin Wrapper') {
    return `From the second month, split the holding on ${name}: keep most of it wrapped and move a smaller part back into the underlying stablecoin for a few weeks, then wrap it again. One clean round trip proves the exit works before it matters — the redemption path is the whole risk in a wrapper, and having tested it is worth more than a second position.`;
  }
  if (category === 'Prediction Market') {
    return `From week three, work the other side of the book on ${name}: take the less popular side of one market a week, or post liquidity in the same small sizes. A record that only ever bought the favourite reads as noise; positions held to resolution are the history a prediction market can verify.`;
  }
  if (category === 'CDP Manager') {
    return `From week three, adjust the position once through ${name} — add a little collateral, repay a little of the loan, or switch on a protection feature if it offers one — and repeat monthly. A managed position that is actually managed is the behaviour this product exists for, and the adjustments are the history its own records keep.`;
  }
  if (category === 'Cross Chain Bridge') {
    return `From week three, vary the routes on ${name}: a second source or destination chain, and one crossing in the opposite direction, so the record shows a user moving money where they need it rather than a loop farmed for count. Keep every crossing's hash in the log the last step asks for.`;
  }
  if (category === 'Insurance') {
    return `From the second month, add one smaller cover on ${name} for a second position, or stake a small amount into its underwriting pool if it runs one, and keep it for a full quarter. Two policies held to term read as a customer; a single day-one policy reads as a farmer.`;
  }
  return `From week three, use one more of ${name}'s features than its main action — its second product, its governance page, its referral or its testnet if it runs one — so the account's history spans the product rather than repeating a single click. An extra ten minutes a week covers it.`;
}

// The closing sentence of step three, chosen from the protocol's own record.
// The order matters: a wide chain spread speaks first, then a long track
// record, then a sharp move, then the footprint, then age, and only then
// the gaps in the record itself.
function signalSentence(p: SnapshotProtocol, ageYears: number | null): string {
  const chains = p.chains.length;
  const change = p.change_7d;
  if (chains >= 4) {
    return `Its TVL is spread across ${chains} chains; this plan runs on the main one and the cheapest other, and leaves the rest until a position justifies the extra wallets.`;
  }
  if (ageYears !== null && ageYears >= 2) {
    return `It has been tracked for ${ageYears.toFixed(1)} years with no token in the record, so its early-user history is long; activity that predates any announcement is the whole edge, and yours would.`;
  }
  if (change !== null && change <= -5) {
    return `Its TVL fell ${Math.abs(change).toFixed(1)}% in the last seven days and the crowd is leaving with it; a small position kept through a quiet stretch is cheap precisely because few bother.`;
  }
  if (change !== null && change >= 5) {
    return `Its TVL grew ${change.toFixed(1)}% in the last seven days, so new farmers are arriving with it; starting now still puts you ahead of the crowd that waits for an announcement.`;
  }
  if (chains >= 2) {
    return `Its TVL spans just ${chains} chains, so the second chain in this plan is the whole of its other footprint; there is no wider spread to chase yet.`;
  }
  if (ageYears !== null && ageYears >= 1) {
    return `It has been tracked for ${ageYears.toFixed(1)} years with no token in the record — long enough to have real users, young enough that early activity still counts.`;
  }
  if (change === null) {
    return 'DefiLlama reports no seven-day change for it, so the model scores its momentum neutral; watch a week of TVL before sizing up.';
  }
  if (p.listed_at === null) {
    return 'DefiLlama records no listing date for it, so its age cannot be checked from this record; treat its history as unverified and size the position small.';
  }
  if (change <= -2) {
    return `Its TVL slipped ${Math.abs(change).toFixed(1)}% in the last seven days — a mild cooling, not a rout; a small position held through it costs little.`;
  }
  if (change >= 2) {
    return `Its TVL grew ${change.toFixed(1)}% in the last seven days — a modest climb, not a rush; starting now still beats waiting for an announcement.`;
  }
  if (ageYears !== null && ageYears < 1) {
    const months = Math.max(1, Math.round(ageYears * 12));
    return `It has been tracked for only ${months} month${months === 1 ? '' : 's'} with no token in the record, so it is genuinely early; a small position now is the whole edge.`;
  }
  // A record with no age and no move at all: say so, and stay small.
  return 'DefiLlama records no listing date for it, so its age cannot be checked from this record; treat its history as unverified and size the position small.';
}

// Chains cheap enough to run a second position on, in the order the plan
// looks for them: the first cheap chain in the protocol's own chain list.
const CHEAP_SECOND_CHAINS = new Set([
  'Arbitrum',
  'Solana',
  'Binance',
  'Optimism',
  'Base',
  'Mantle',
  'zkSync Era',
  'Blast',
  'Linea',
  'Polygon',
]);

function stepFour(p: SnapshotProtocol): string {
  const name = p.name;
  if (p.chains.length === 1) {
    return `Keep the cadence for eight to ten weeks: the core action weekly, a note of every transaction hash and date in a simple log as you go (ten minutes a week). If ${name} ever announces anything, that log is your proof of when you started — keep it from week one, not from the announcement.`;
  }
  const band = capitalBand(p.tvl_usd);
  const others = p.chains.slice(1);
  const cheap = others.find((c) => CHEAP_SECOND_CHAINS.has(c));
  const second = cheap ?? others[0]!;
  if (cheap !== undefined) {
    return `In parallel, make ${name} a two-chain farm: repeat the core action in miniature on ${chainLabel(second)} — the cheapest of its other chains to run (a $${band.low}-scale position or a few trades a month), because its TVL already spans ${p.chains.length} chains and a launch, if one comes, usually rewards the chain you were active on. Budget one extra hour a month for this.`;
  }
  return `In parallel, make ${name} a two-chain farm: repeat the core action in miniature on ${chainLabel(second)} (a $${band.low}-scale position or a few trades a month), because its TVL already spans ${p.chains.length} chains and a launch, if one comes, usually rewards the chain you were active on. Budget one extra hour a month for this.`;
}

function stepFive(
  p: SnapshotProtocol,
  impliedValueUsd: number,
  rank: number,
  boardSize: number,
): string {
  const change = p.change_7d;
  const move =
    change === null
      ? ''
      : change >= 0
        ? ` and a +${change.toFixed(1)}% seven-day move`
        : ` and a -${Math.abs(change).toFixed(1)}% seven-day move`;
  return `Review monthly against the record: ${p.name} currently shows ${money(p.tvl_usd)} of TVL${move}, and this board ranks it #${rank} of ${boardSize} by an implied value of ${money(impliedValueUsd)} — the model's claim from the figures above, not a promise. Nothing here promises a token — DefiLlama records none for it today, and the honest cost of this plan if none ever comes is the gas above plus your hours, so size it to what you can afford to spend learning the product.`;
}

/** The five farm steps for one row. The rank and implied value are filled
 *  in by the caller once the board is sorted. */
export function farmSteps(
  p: SnapshotProtocol,
  ageYears: number | null,
  impliedValueUsd: number,
  rank: number,
  boardSize: number,
): string[] {
  return [
    stepOne(p),
    stepTwo(p),
    `${stepThreeBase(p)} ${signalSentence(p, ageYears)}`,
    stepFour(p),
    stepFive(p, impliedValueUsd, rank, boardSize),
  ];
}
