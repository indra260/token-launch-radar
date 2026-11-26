// Capture the entry's three screenshots from the built dashboard in out/.
// The headless shell's one-shot --screenshot mode hangs on this machine, so
// the shell is driven over the DevTools protocol instead: launch with a
// debugging port, open each view, wait until the board has actually
// rendered, then capture. The three views the judge asks for — the board,
// one protocol's detail view, a filtered view — are pinned through the
// page's own address-bar parameters. Viewport 1440x900: long side at the
// gate's 1440 cap, short side above its 800 floor. Heavy PNGs are
// re-encoded as JPEG (the gate takes either) to keep the dossier lean.
//
// The detail view's panel scrolls on its own, and a protocol's farm plan
// sits below the fold of a 900px capture: unscrolled, the detail shot
// would show the model table (already visible in the board shot) and none
// of the plan the judge grades. So the detail shot is taken in a taller
// frame (1440x1080 — the gate caps the long side at 1440 and floors the
// short side at 800, so it complies), the page is scrolled until the
// sticky panel pins to the top of the viewport (its own box starts some
// 245px down the page, and that part of it can never be captured), and
// the panel itself is scrolled to its end: the frame then holds the model
// table's tail, the risk flags and the whole farm plan.

import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const page = `file://${join(root, 'out', 'dashboard', 'index.html')}`;
const PORT = 9337;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findShell() {
  const base = join(homedir(), '.cache', 'ms-playwright');
  for (const dir of readdirSync(base)) {
    if (!dir.startsWith('chromium_headless_shell')) continue;
    const bin = join(base, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
    if (existsSync(bin)) return bin;
  }
  throw new Error('no chromium headless shell in the playwright cache');
}

const SHOTS = [
  ['1-board', '', null, null],
  ['2-detail', '?detail=gauntlet', { width: 1440, height: 1080 }, `(() => {
    const d = document.getElementById('detail');
    window.scrollTo(0, d.getBoundingClientRect().top + window.scrollY);
    d.scrollTop = d.scrollHeight;
    return d.scrollTop;
  })()`],
  ['3-filtered', '?flags=watchlist', null, null],
];

async function getJson(path, method = 'GET') {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, { method });
  return res.json();
}

const shell = spawn(findShell(), [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--force-device-scale-factor=1', `--remote-debugging-port=${PORT}`,
  '--window-size=1440,900', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
shell.stderr.on('data', () => {});
shell.stdout.on('data', () => {});

try {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try { await getJson('/json/version'); break; } catch {
      if (Date.now() > deadline) throw new Error('devtools port never opened');
      await sleep(300);
    }
  }

  for (const [name, query, metrics, prep] of SHOTS) {
    const target = await getJson(`/json/new?${encodeURIComponent('about:blank')}`, 'PUT');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
      }
    };
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    await send('Page.enable');
    await send('Runtime.enable');
    if (metrics !== null) {
      await send('Emulation.setDeviceMetricsOverride', { ...metrics, deviceScaleFactor: 1, mobile: false });
    }
    await send('Page.navigate', { url: page + query });
    const shotDeadline = Date.now() + 45_000;
    for (;;) {
      const r = await send('Runtime.evaluate', {
        expression: "document.readyState === 'complete' && typeof window.RADAR === 'object' && document.querySelectorAll('#bodyRows tr').length > 0",
        returnByValue: true,
      }).catch(() => null);
      if (r?.result?.value) break;
      if (Date.now() > shotDeadline) throw new Error(`${name}: board never rendered`);
      await sleep(400);
    }
    await sleep(400);
    if (prep !== null) {
      await send('Runtime.evaluate', { expression: prep, returnByValue: true });
      await sleep(300);
    }
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const png = join(root, 'screenshots', `${name}.png`);
    writeFileSync(png, Buffer.from(shot.data, 'base64'));
    const bytes = statSync(png).size;
    console.log(`${name}.png ${bytes} bytes`);
    if (bytes > 350 * 1024) {
      const jpg = join(root, 'screenshots', `${name}.jpg`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-q:v', '4', jpg]);
      unlinkSync(png);
      console.log(`${name}: re-encoded as JPEG, ${statSync(jpg).size} bytes`);
    }
    ws.close();
    await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`).catch(() => {});
  }
} finally {
  shell.kill('SIGKILL');
}
