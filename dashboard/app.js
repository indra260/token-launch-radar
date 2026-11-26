// Token Launch Radar — the board page. Reads window.RADAR (written by the
// entry program beside this page), renders the ranked board, and wires the
// search, the category / chain / flag filters, column sorting and the
// per-protocol detail view. No network, no framework: the file you are
// reading is the whole application.
//
// The view can be pinned from the address bar, which is how the entry's
// screenshots were taken: ?detail=<slug> opens a protocol, ?flags=watchlist
// or ?cat=<category> starts filtered, ?sort=tvl|change|implied|age|chains
// starts sorted.

const R = window.RADAR;
const rows = R.rows;
const bySlug = new Map(rows.map((r) => [r.slug, r]));
const params = new URLSearchParams(location.search);

const state = {
  q: params.get('q') ?? '',
  cat: params.get('cat') ?? '',
  chain: params.get('chain') ?? '',
  flags: params.get('flags') ?? 'all',
  sort: params.get('sort') ?? 'rank',
  dir: 1,
  selected: params.get('detail') ?? rows[0]?.slug ?? null,
};

const $ = (id) => document.getElementById(id);

function fmtMoney(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n}`;
}
const fmtFull = (n) => `$${n.toLocaleString('en-US')}`;
const fmtChange = (c) => (c === null ? '—' : `${c >= 0 ? '+' : ''}${c.toFixed(1)}%`);
const fmtAge = (a) => (a === null ? '—' : `${a.toFixed(1)}y`);

function flagDots(r) {
  const marks = { high: 'dot-high', watch: 'dot-watch', good: 'dot-good', info: 'dot-info' };
  return r.risk_flags.map((f) => `<span class="${marks[f.level]}" title="${f.label}">●</span>`).join('');
}

function hasRisk(r, level) {
  return r.risk_flags.some((f) => (level === 'high' ? f.level === 'high' : f.level === 'high' || f.level === 'watch'));
}

function visible() {
  const q = state.q.trim().toLowerCase();
  let out = rows.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q) && !r.slug.includes(q)) return false;
    if (state.cat && (r.category ?? '') !== state.cat) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (state.flags === 'watchlist' && !r.watchlist) return false;
    if (state.flags === 'risk' && !hasRisk(r)) return false;
    if (state.flags === 'high' && !hasRisk(r, 'high')) return false;
    if (state.flags === 'clean' && hasRisk(r)) return false;
    return true;
  });
  const key = {
    rank: (r) => r.rank,
    name: (r) => r.name.toLowerCase(),
    tvl: (r) => r.tvl_usd,
    change: (r) => r.change_7d ?? -Infinity,
    implied: (r) => r.implied_value_usd,
    age: (r) => r.age_years ?? -1,
    chains: (r) => r.chains.length,
  }[state.sort];
  out = [...out].sort((a, b) => {
    const d = key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : a.rank - b.rank;
    return d * state.dir;
  });
  return out;
}

const COLUMNS = [
  ['rank', '#'],
  ['name', 'Protocol'],
  ['cat', 'Category'],
  ['chains', 'Chains'],
  ['tvl', 'TVL'],
  ['change', '7d %'],
  ['implied', 'Implied value'],
  ['mult', '× TVL'],
  ['age', 'Age'],
  ['flags', 'Flags'],
];
const SORTABLE = new Set(['rank', 'name', 'chains', 'tvl', 'change', 'implied', 'age']);

function renderHead() {
  $('headRow').innerHTML = COLUMNS.map(([key, label]) => {
    const arrow = state.sort === key ? ` <span class="dir">${state.dir === 1 ? '▲' : '▼'}</span>` : '';
    return `<th data-key="${key}"${SORTABLE.has(key) ? '' : ' class="nosort"'}>${label}${arrow}</th>`;
  }).join('');
  for (const th of document.querySelectorAll('.board th')) {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (!SORTABLE.has(key)) return;
      if (state.sort === key) state.dir *= -1;
      else { state.sort = key; state.dir = key === 'name' ? 1 : -1; if (key === 'rank') state.dir = 1; }
      render();
    });
  }
}

function renderBody() {
  const out = visible();
  $('rowCount').textContent = `${out.length} of ${rows.length} protocols shown`;
  $('empty').hidden = out.length > 0;
  $('bodyRows').innerHTML = out.map((r) => `
    <tr data-slug="${r.slug}" class="${r.slug === state.selected ? 'selected' : ''}">
      <td class="rank">${r.rank}</td>
      <td class="name"><span class="pname">${r.name}</span>${r.watchlist ? '<span class="badge">WATCHLIST</span>' : ''}<br><span class="slug">${r.slug}</span></td>
      <td>${r.category ?? '—'}</td>
      <td>${r.chains.length}</td>
      <td>${fmtMoney(r.tvl_usd)}</td>
      <td class="${r.change_7d === null ? 'flat' : r.change_7d >= 0 ? 'pos' : 'neg'}">${fmtChange(r.change_7d)}</td>
      <td><b>${fmtMoney(r.implied_value_usd)}</b></td>
      <td>${(r.implied_value_usd / r.tvl_usd).toFixed(2)}×</td>
      <td>${fmtAge(r.age_years)}</td>
      <td class="dots">${flagDots(r)}</td>
    </tr>`).join('');
  for (const tr of document.querySelectorAll('.board tbody tr')) {
    tr.addEventListener('click', () => { state.selected = tr.dataset.slug; render(); });
  }
}

function renderDetail() {
  const r = bySlug.get(state.selected);
  const el = $('detail');
  if (!r) { el.innerHTML = '<p class="none">Select a protocol on the board to inspect its record, model and farm plan.</p>'; return; }
  const mult = R.multiples.find((m) => m.category === (r.category ?? '(uncategorised)'));
  const base = r.tvl_usd * r.multiple;
  const comps = R.comparables[r.category ?? '(uncategorised)'] ?? [];
  el.innerHTML = `
    <h2>${r.name}${r.watchlist ? '<span class="badge">WATCHLIST</span>' : ''}</h2>
    <div class="dslug">${r.slug} · ${r.category ?? 'no category recorded'} · rank #${r.rank} of ${rows.length}</div>
    <div class="kv">
      <div><div class="k">TVL</div><div class="v">${fmtFull(r.tvl_usd)}</div></div>
      <div><div class="k">Implied value</div><div class="v">${fmtFull(r.implied_value_usd)}</div></div>
      <div><div class="k">7-day TVL change</div><div class="v">${fmtChange(r.change_7d)}</div></div>
      <div><div class="k">Tracked since</div><div class="v">${r.listed_at ?? 'unreported'}${r.age_years !== null ? ` (${fmtAge(r.age_years)})` : ''}</div></div>
      <div><div class="k">Chains</div><div class="v">${r.chains.length}</div></div>
      <div><div class="k">Token in the record</div><div class="v">none recorded</div></div>
    </div>
    <p class="comp" style="margin-top:10px">${r.chains.join(' · ')}</p>
    <h3>How this implied value is derived</h3>
    <table class="model-table">
      <tr><td>TVL</td><td>${fmtFull(r.tvl_usd)}</td></tr>
      <tr><td>× category multiple${mult ? ` (${mult.sample} live peer${mult.sample === 1 ? '' : 's'})` : ' (no live peers in its category — the global median)'} </td><td>× ${r.multiple.toFixed(3)}</td></tr>
      <tr><td>= base value</td><td>${fmtFull(Math.round(base))}</td></tr>
      <tr><td>× momentum (7d change)</td><td>× ${r.momentum_factor.toFixed(3)}</td></tr>
      <tr><td>× maturity (track record)</td><td>× ${r.maturity_factor.toFixed(3)}</td></tr>
      <tr><td>× reach (chain footprint)</td><td>× ${r.reach_factor.toFixed(3)}</td></tr>
      <tr class="total"><td>Implied value</td><td>${fmtFull(r.implied_value_usd)}</td></tr>
    </table>
    <h3>Risk &amp; signal flags</h3>
    ${r.risk_flags.length === 0 ? '<p class="none">No flags: the record shows no sharp move, no missing field and no structural caution.</p>' :
      r.risk_flags.map((f) => `<div class="flag ${f.level}"><div class="fl">${f.label}</div><div class="fd">${f.detail}</div></div>`).join('')}
    ${comps.length ? `<h3>Already trading in ${r.category}</h3>
    <p class="comp">${comps.map((c) => `<b>${c.name}</b>${c.symbol ? ` (${c.symbol})` : ''} — mcap ${fmtMoney(c.mcap_usd)} on TVL ${fmtMoney(c.tvl_usd)}, ${c.ratio.toFixed(2)}×`).join('<br>')}</p>` : ''}
    <h3>Farm plan</h3>
    <ol class="steps">${r.farm_steps.map((s) => `<li>${s}</li>`).join('')}</ol>`;
}

function renderChrome() {
  const m = R.meta;
  $('snapshotMeta').innerHTML = `snapshot <b>${m.as_of}</b> · floor <b>${fmtFull(m.floor_usd)}</b><br>${m.source}`;
  const watch = rows.filter((r) => r.watchlist).length;
  $('stats').innerHTML = [
    ['Protocols tracked', m.protocol_count],
    ['Record no token', m.pre_token_count],
    ['Launch candidates ranked', m.board_size],
    ['Watchlist covered', `<em>${watch}/${m.watchlist_count}</em>`],
    ['Already tokenised, set aside', m.live_count],
  ].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  $('method').innerHTML = `
    <h3>How the radar ranks</h3>
    <p>Implied value = TVL × the protocol's category multiple, adjusted for momentum, maturity and reach. A category's multiple is the median market-cap-to-TVL ratio of protocols in that category whose token already trades (global median ${R.meta.global_median_multiple.toFixed(3)}×), with each live ratio first capped at the 90th percentile of all live ratios so one outlier cannot price a category, then shrunk toward that global median by sample size. Momentum scales the seven-day TVL change, maturity scales the years tracked with no token recorded, and reach scales the chain footprint. Every figure comes from the sealed snapshot; no protocol is named in the model.</p>
    <p>Set aside before ranking: the ${m.live_count} protocols whose token already trades, and pre-token products that are a claim on another asset — wrapped, staked and bridged products, versioned copies and exchanges' own books. "Records no token" is what the data supports: a protocol may still have a token its DefiLlama record does not carry, and no board row promises a launch, an airdrop or an allocation.</p>`;
}

function fillSelect(el, values, allLabel) {
  el.innerHTML = `<option value="">${allLabel}</option>` + values.map((v) => `<option value="${v}">${v}</option>`).join('');
}

function render() { renderHead(); renderBody(); renderDetail(); }

const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
const chainCounts = new Map();
for (const r of rows) for (const c of r.chains) chainCounts.set(c, (chainCounts.get(c) ?? 0) + 1);
const chains = [...chainCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
fillSelect($('cat'), cats, 'All categories');
fillSelect($('chain'), chains, 'All chains');
$('q').value = state.q;
$('cat').value = state.cat;
$('chain').value = state.chain;
$('flags').value = state.flags;
$('q').addEventListener('input', (e) => { state.q = e.target.value; renderBody(); });
$('cat').addEventListener('change', (e) => { state.cat = e.target.value; renderBody(); });
$('chain').addEventListener('change', (e) => { state.chain = e.target.value; renderBody(); });
$('flags').addEventListener('change', (e) => { state.flags = e.target.value; renderBody(); });
renderChrome();
render();
