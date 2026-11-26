// Token launch radar — the entry program (Node 22, standard library only).
//
// Reads the sealed DefiLlama snapshot (--input <file|dir>, default /input),
// ranks the pre-token launch candidates with the model in lib/model.ts, gives
// each a farm plan from lib/farm.ts, checks the board against the gate's
// rules before writing anything, then writes /output/board.json and
// /output/data.js, copies dashboard/ and screenshots/ beside them, and writes
// /output/dossier.json with the vendored make.fun library, byte for byte as
// the scorer rebuilds it.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRadar, parseSnapshot, type ScoredRow } from './lib/model.ts';
import { farmStepsFor } from './lib/farm.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

interface BoardRow extends ScoredRow {
  rank: number;
  farm_steps: string[];
}

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/** Every rule the gate's board checks state, verified before a byte is
 *  written: a refusal here costs nothing, a refusal at the gate costs the run. */
function boardIssue(rows: BoardRow[], snapshot: ReturnType<typeof parseSnapshot>): string | null {
  if (rows.length < 100 || rows.length > 4000) return `board holds ${rows.length} rows, outside 100 to 4000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  const byRank = [...rows].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < byRank.length; i++) {
    const row = byRank[i]!;
    if (row.rank !== i + 1) return `ranks are not exactly 1 to N: position ${i + 1} carries rank ${row.rank}`;
    if (!known.has(row.slug)) return `row ${row.slug} names no protocol in the snapshot`;
    if (seen.has(row.slug)) return `slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (row.name.trim() === '') return `row ${row.slug} has an empty name`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0 || row.implied_value_usd > 100_000_000_000_000) {
      return `row ${row.slug} has implied_value_usd ${row.implied_value_usd}, outside a positive whole number up to 1e14`;
    }
    if (i > 0 && row.implied_value_usd > byRank[i - 1]!.implied_value_usd) {
      return `implied value rises at rank ${row.rank} (${row.slug})`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `row ${row.slug} holds ${row.farm_steps.length} farm steps, outside 3 to 12`;
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `row ${row.slug} has a farm step of ${len} characters, outside 20 to 600`;
    }
  }
  if (rows.every((r) => r.implied_value_usd === rows[0]!.implied_value_usd)) return 'every implied value is the same: the board ranks nothing';
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist protocol ${slug} is missing from the board`;
  }
  return null;
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const radar = buildRadar(snapshot);
const rows: BoardRow[] = radar.rows.map((row, i) => ({ ...row, rank: i + 1, farm_steps: farmStepsFor(row, { rank: i + 1, size: radar.rows.length }) }));

const issue = boardIssue(rows, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows })}\n`);
writeFileSync(
  join(out, 'data.js'),
  `window.RADAR = ${JSON.stringify({ meta: radar.meta, multiples: radar.multiples, comparables: radar.comparables, rows })}\n`,
);

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3 — the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${rows.length} rows ranked (${radar.meta.candidate_count} launch candidates, ${radar.meta.live_count} already tokenised and set aside)\n` +
    `token radar: wrote board.json, data.js, dashboard/, screenshots/ (${shots.length} images) and dossier.json under ${out}\n`,
);
