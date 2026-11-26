// Independent gate check: replicates the scorer's seven rows from the kit's
// RULES.txt against a built /output, plus the two-runs-identical rule.
//   node tools/check-output.mjs <outDir> <snapshot.json> [outDir2]
// Exit 1 with the failing rows printed, 0 when every row passes.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';

const [outDir, snapshotPath, outDir2] = process.argv.slice(2);
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const fails = [];
const ok = (name, cond, detail = '') => { if (!cond) fails.push(`${name}: ${detail}`); else console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`); };
const walk = (dir, base = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  return e.isDirectory() ? walk(p, base) : [p.slice(base.length + 1)];
});

// dashboard_files
const dashDir = join(outDir, 'dashboard');
const dashFiles = walk(dashDir);
let dashBytes = 0;
for (const rel of dashFiles) {
  dashBytes += statSync(join(dashDir, rel)).size;
  ok('dashboard_files name', /^[A-Za-z0-9._-]+$/.test(rel.split('/').pop()) && !rel.split('/').some((s) => s.startsWith('.')), rel);
}
ok('dashboard_files count/bytes', dashFiles.length <= 400 && dashBytes <= 4 * 1024 * 1024, `${dashFiles.length} files, ${dashBytes} bytes`);
ok('dashboard_files shape', dashFiles.includes('index.html') && dashFiles.some((f) => f.endsWith('.css')) && dashFiles.some((f) => f.endsWith('.js')));
const URL_ATTR = /(?:href|src|action|poster)\s*=\s*["']https?:\/\//i;
for (const rel of dashFiles) {
  const text = readFileSync(join(dashDir, rel), 'utf8');
  if (rel.endsWith('.html')) ok('dashboard_files no-url-attr', !URL_ATTR.test(text), rel);
  if (rel.endsWith('.css')) ok('dashboard_files no-url-css', !/https?:\/\//.test(text), rel);
  if (rel.endsWith('.js')) ok('dashboard_files no-url-js-spec', !/(?:import|export[^'"]*from|require\(|import\()\s*['"]https?:\/\//.test(text), rel);
}

// board_file + sorted_by_value + coverage + farm_steps
const boardRaw = readFileSync(join(outDir, 'board.json'));
ok('board_file size', boardRaw.length <= 8 * 1024 * 1024, `${boardRaw.length} bytes`);
const rows = JSON.parse(boardRaw.toString('utf8')).rows;
ok('board_file count', Array.isArray(rows) && rows.length >= 100 && rows.length <= 4000, `${rows?.length} rows`);
const known = new Set(snapshot.protocols.map((p) => p.slug));
const seen = new Set();
let boardOk = true, sortedOk = true, stepsOk = true;
const byRank = [...rows].sort((a, b) => a.rank - b.rank);
byRank.forEach((r, i) => {
  if (r.rank !== i + 1) sortedOk = false;
  if (i > 0 && r.implied_value_usd > byRank[i - 1].implied_value_usd) sortedOk = false;
  if (!known.has(r.slug) || seen.has(r.slug) || !r.name?.trim()) boardOk = false;
  seen.add(r.slug);
  if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) boardOk = false;
  if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) stepsOk = false;
  else for (const s of r.farm_steps) { const n = s.trim().length; if (n < 20 || n > 600) stepsOk = false; }
});
ok('board_file rows', boardOk);
ok('sorted_by_value', sortedOk && !rows.every((r) => r.implied_value_usd === rows[0].implied_value_usd));
ok('coverage', snapshot.watchlist.every((s) => seen.has(s)), `${snapshot.watchlist.filter((s) => seen.has(s)).length}/${snapshot.watchlist.length} watchlist`);
ok('farm_steps', stepsOk);

// screenshots
const shotDir = join(outDir, 'screenshots');
const shots = readdirSync(shotDir).filter((n) => !n.startsWith('.'));
ok('screenshots count', shots.length >= 3 && shots.length <= 4, `${shots.length}`);
for (const name of shots) {
  const buf = readFileSync(join(shotDir, name));
  const isPng = buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  let w = 0, h = 0;
  if (isPng) { w = buf.readUInt32BE(16); h = buf.readUInt32BE(20); }
  if (isJpg) { for (let i = 2; i < buf.length - 9;) { if (buf[i] !== 0xff) { i++; continue; } const m = buf[i + 1]; if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break; } i += 2 + buf.readUInt16BE(i + 2); } }
  ok('screenshots image', (isPng || isJpg) && buf.length <= 512 * 1024 && Math.max(w, h) <= 1440 && Math.min(w, h) >= 800, `${name}: ${w}x${h}, ${buf.length} bytes`);
}

// dossier_matches
const expected = Buffer.from(buildDossier(outDir, { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 }, dashboard: { max_files: 400, max_bytes: 4194304 } }));
const actual = readFileSync(join(outDir, 'dossier.json'));
ok('dossier_matches', expected.equals(actual) && actual.length <= 1.5 * 1024 * 1024, `${actual.length} bytes`);

// determinism across two runs
if (outDir2) {
  for (const f of ['board.json', 'data.js', 'dossier.json']) {
    ok(`determinism ${f}`, readFileSync(join(outDir, f)).equals(readFileSync(join(outDir2, f))));
  }
}

if (fails.length) { console.error(`\nFAILURES:\n${fails.map((f) => ` - ${f}`).join('\n')}`); process.exit(1); }
console.log('\nAll gate rows pass.');
