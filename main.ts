// Token Launch Radar — entrypoint (Node 22, standard library only).
//
// Run it against the sealed snapshot and it writes a whole entry into the
// output directory: the ranked board, the dashboard's data file, the
// dashboard and screenshots as they stand in this repository, and the
// dossier the judge reads, built with the vendored make.fun library.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
//
// With no flags it reads /input/snapshot.json and writes /output, which is
// how the grader runs it. The dashboard is static and fetches nothing: the
// page reads the data.js this program writes beside it.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { farmSteps } from './lib/farm.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const DOSSIER_TEXT_CAP = 65_536;

function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

/** Read `--name value` or `--name=value` from the arguments, if present. */
function option(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const at = argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < argv.length) return argv[at + 1];
  const joined = argv.find((a) => a.startsWith(`--${name}=`));
  return joined === undefined ? undefined : joined.slice(name.length + 3);
}

const inputGiven = option('input') ?? '/input';
const snapshotFile = inputGiven.endsWith('.json')
  ? inputGiven
  : join(inputGiven, 'snapshot.json');
if (!existsSync(snapshotFile)) {
  fail(
    `no snapshot at ${snapshotFile}: pass --input <snapshot.json|directory> or mount the sealed /input`,
  );
}
const outDir = option('output') ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const snapshot = parseSnapshot(readFileSync(snapshotFile, 'utf8'));
const { board, radar } = buildRadar(snapshot, farmSteps);
const problem = boardIssue(board, snapshot);
if (problem !== null) fail(`the model wrote a board the gate refuses: ${problem}`);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

/** Copy a repository directory's regular files into the output, flat. */
function copyDirectory(from: string, to: string): string[] {
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

const dashboardFiles = copyDirectory(join(repoRoot, 'dashboard'), join(outDir, 'dashboard'));
const shotFiles = copyDirectory(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
if (shotFiles.length < 3) {
  fail(
    `screenshots/ holds ${shotFiles.length} image${shotFiles.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`,
  );
}
const shotName = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
for (const name of shotFiles) {
  if (!shotName.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
}

// The dossier goes last: the scorer rebuilds it from this output and
// compares the bytes, so it must be written from the finished directory.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: DOSSIER_TEXT_CAP,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored\n` +
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (${dashboardFiles.length} files), ${join(outDir, 'screenshots')} (${shotFiles.length} images) and ${join(outDir, 'dossier.json')}\n`,
);
