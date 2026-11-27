// Token Launch Radar — dashboard.
//
// Renders the board window.RADAR carries (written by main.ts as data.js).
// Every view is addressable, so a screenshot or a shared link can pin it:
//   ?detail=<slug>    one protocol's full record and farm plan
//   ?flags=watchlist  the house watchlist only
//   ?cat=<category>   one category
//   ?sort=tvl|age|change|implied   how the board is ordered
//   ?q=<text>        search names and chains

(function () {
  var data = window.RADAR;
  if (!data || !Array.isArray(data.rows)) {
    document.getElementById('meta').textContent = 'No board data loaded.';
    return;
  }
  var rows = data.rows;
  var meta = data.meta;
  var params = new URLSearchParams(window.location.search);

  var $ = function (id) { return document.getElementById(id); };
  var fmtMoney = function (n) { return '$' + n.toLocaleString('en-US'); };
  var fmtPct = function (v) {
    if (v === null || v === undefined) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  };
  var fmtAge = function (v) { return v === null ? '—' : v.toFixed(2) + 'y'; };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // Meta line and source note.
  var watchlisted = rows.filter(function (r) { return r.watchlist; }).length;
  $('meta').textContent =
    meta.board_size + ' protocols · ' + watchlisted + ' on the house watchlist · ' +
    'floor ' + fmtMoney(meta.floor_usd) + ' · snapshot ' + meta.as_of;
  $('source-line').textContent =
    'Source: ' + meta.source + '. ' +
    'Global median multiple ' + meta.global_median_multiple +
    ', ratio cap ' + meta.ratio_cap_multiple + '.';

  // Category picker, from the board itself.
  var categories = [];
  rows.forEach(function (r) {
    if (r.category && categories.indexOf(r.category) === -1) categories.push(r.category);
  });
  categories.sort();
  var catSelect = $('cat');
  categories.forEach(function (c) {
    var opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    catSelect.appendChild(opt);
  });

  // Read the view from the URL, and keep the controls in sync with it.
  function readState() {
    return {
      q: params.get('q') || '',
      cat: params.get('cat') || '',
      flags: params.get('flags') || '',
      sort: params.get('sort') || 'implied',
      detail: params.get('detail') || '',
    };
  }
  function writeState(state, replace) {
    var next = new URLSearchParams();
    if (state.q) next.set('q', state.q);
    if (state.cat) next.set('cat', state.cat);
    if (state.flags) next.set('flags', state.flags);
    if (state.sort && state.sort !== 'implied') next.set('sort', state.sort);
    if (state.detail) next.set('detail', state.detail);
    var url = window.location.pathname + (next.toString() ? '?' + next.toString() : '');
    if (replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
    params = new URLSearchParams(next.toString());
  }

  function flagLevel(r, level) {
    return r.risk_flags.some(function (f) { return f.level === level; });
  }

  function visibleRows(state) {
    var out = rows.filter(function (r) {
      if (state.cat && r.category !== state.cat) return false;
      if (state.flags === 'watchlist' && !r.watchlist) return false;
      if (state.flags === 'good' && !flagLevel(r, 'good')) return false;
      if (state.flags === 'high' && !flagLevel(r, 'high')) return false;
      if (state.flags === 'watch' && !flagLevel(r, 'watch')) return false;
      if (state.q) {
        var hay = (r.name + ' ' + r.slug + ' ' + r.chains.join(' ')).toLowerCase();
        if (hay.indexOf(state.q.toLowerCase()) === -1) return false;
      }
      return true;
    });
    var key = state.sort;
    out.sort(function (a, b) {
      if (key === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (key === 'age') return (b.age_years || 0) - (a.age_years || 0);
      if (key === 'change') return (b.change_7d || 0) - (a.change_7d || 0);
      return a.rank - b.rank;
    });
    return out;
  }

  function flagChips(r) {
    return r.risk_flags.map(function (f) {
      return '<span class="chip ' + esc(f.level) + '" title="' + esc(f.detail) + '">' + esc(f.label) + '</span>';
    }).join('');
  }

  function shortChains(chains) {
    if (chains.length <= 3) return chains.join(', ');
    return chains.slice(0, 3).join(', ') + ' +' + (chains.length - 3) + ' more';
  }

  function renderTable(state) {
    var list = visibleRows(state);
    var body = $('rows');
    body.innerHTML = list.map(function (r) {
      var changeCls = r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down';
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.detail === r.slug ? ' class="selected"' : '') + '>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' +
        '<span class="sub2">' + esc(r.slug) + (r.watchlist ? ' · watchlist' : '') + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td title="' + esc(r.chains.join(', ')) + '">' + esc(shortChains(r.chains)) + '</td>' +
        '<td class="num">' + fmtMoney(r.tvl_usd) + '</td>' +
        '<td class="num ' + changeCls + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_years) + '</td>' +
        '<td class="num">' + r.multiple.toFixed(4) + '</td>' +
        '<td class="num">' + fmtMoney(r.implied_value_usd) + '</td>' +
        '<td>' + flagChips(r) + '</td></tr>';
    }).join('');
    $('empty').hidden = list.length > 0;
    $('count').textContent = list.length + ' of ' + rows.length + ' protocols';
    body.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var next = readState();
        next.detail = tr.getAttribute('data-slug');
        writeState(next, false);
        renderAll();
        $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function renderDetail(state) {
    var box = $('detail');
    var row = rows.find(function (r) { return r.slug === state.detail; });
    if (!row) { box.hidden = true; box.innerHTML = ''; return; }
    var peers = (data.comparables[row.category] || []);
    var multiple = (data.multiples || []).find(function (m) { return m.category === row.category; });
    var peerRows = peers.map(function (p) {
      return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.symbol || '—') + '</td>' +
        '<td class="num">' + fmtMoney(p.mcap_usd) + '</td><td class="num">' + fmtMoney(p.tvl_usd) + '</td>' +
        '<td class="num">' + p.ratio.toFixed(2) + '×</td></tr>';
    }).join('');
    box.innerHTML =
      '<button class="close" id="close-detail">Close</button>' +
      '<h2>' + esc(row.name) + '</h2>' +
      '<p class="sub">' + esc(row.category || 'Uncategorised') + ' · ' + esc(row.chains.join(', ')) +
      ' · rank #' + row.rank + ' of ' + rows.length + (row.watchlist ? ' · house watchlist' : '') + '</p>' +
      '<div class="facts">' +
      '<div>TVL<b>' + fmtMoney(row.tvl_usd) + '</b></div>' +
      '<div>7-day move<b>' + fmtPct(row.change_7d) + '</b></div>' +
      '<div>Tracked<b>' + fmtAge(row.age_years) + (row.listed_at ? ' · since ' + esc(row.listed_at) : '') + '</b></div>' +
      '<div>Multiple<b>' + row.multiple.toFixed(4) + '×</b></div>' +
      '<div>Momentum<b>' + row.momentum_factor.toFixed(4) + '</b></div>' +
      '<div>Maturity<b>' + row.maturity_factor.toFixed(4) + '</b></div>' +
      '<div>Reach<b>' + row.reach_factor.toFixed(4) + '</b></div>' +
      '<div>Implied value<b>' + fmtMoney(row.implied_value_usd) + '</b></div>' +
      '</div>' +
      (multiple
        ? '<p class="sub">Category multiple: ' + multiple.sample + ' live peer' + (multiple.sample === 1 ? '' : 's') + ', median ' +
          multiple.median.toFixed(4) + '×, shrunk multiple ' + multiple.used.toFixed(4) + '×.</p>'
        : '') +
      '<h3>Risk notes</h3>' +
      row.risk_flags.map(function (f) {
        return '<p class="flag"><span class="chip ' + esc(f.level) + '">' + esc(f.level) + '</span> <b>' +
          esc(f.label) + '.</b> ' + esc(f.detail) + '</p>';
      }).join('') +
      (peerRows
        ? '<h3>Live peers in ' + esc(row.category) + ' (by market cap)</h3>' +
          '<table class="peers"><thead><tr><th>Protocol</th><th>Token</th>' +
          '<th class="num">Market cap</th><th class="num">TVL</th><th class="num">Ratio</th></tr></thead>' +
          '<tbody>' + peerRows + '</tbody></table>'
        : '') +
      '<h3>Farm plan</h3><ol>' +
      row.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ol>';
    box.hidden = false;
    $('close-detail').addEventListener('click', function () {
      var next = readState();
      next.detail = '';
      writeState(next, false);
      renderAll();
    });
  }

  function renderAll() {
    var state = readState();
    $('q').value = state.q;
    catSelect.value = state.cat;
    $('flags').value = state.flags;
    $('sort').value = state.sort;
    renderTable(state);
    renderDetail(state);
  }

  // Controls rewrite the URL, then re-render from it.
  $('q').addEventListener('input', function (e) {
    var next = readState();
    next.q = e.target.value;
    writeState(next, true);
    renderAll();
  });
  catSelect.addEventListener('change', function (e) {
    var next = readState();
    next.cat = e.target.value;
    writeState(next, true);
    renderAll();
  });
  $('flags').addEventListener('change', function (e) {
    var next = readState();
    next.flags = e.target.value;
    writeState(next, true);
    renderAll();
  });
  $('sort').addEventListener('change', function (e) {
    var next = readState();
    next.sort = e.target.value;
    writeState(next, true);
    renderAll();
  });
  window.addEventListener('popstate', renderAll);

  renderAll();
})();
