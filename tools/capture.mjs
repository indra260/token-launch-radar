// Screenshot capture for the radar dashboard (Node 22, standard library only).
//
// Drives the headless Chromium shell over its DevTools protocol with the
// built-in WebSocket client — no browser automation package needed.
//
//   node tools/capture.mjs --dir <dir holding dashboard/ + data.js>
//                          --out <screenshots dir> [--chrome <binary>]
//
// Takes three shots: the board, Gauntlet's detail view scrolled to the end,
// and the watchlist-filtered board. Viewports are fixed so repeated runs
// render the same pixels.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(here, '..');

function option(name, fallback) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < argv.length) return argv[at + 1];
  const joined = argv.find((a) => a.startsWith(`--${name}=`));
  return joined === undefined ? fallback : joined.slice(name.length + 3);
}

const stageDir = option('dir', join(repoRoot, 'output'));
const outDir = option('out', join(repoRoot, 'screenshots'));
const chrome =
  option('chrome', '') ||
  process.env.CHROME ||
  join(process.env.HOME || '', '.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell');

const SHOTS = [
  { file: '1-board.png', url: 'dashboard/index.html', width: 1440, height: 900 },
  {
    file: '2-detail.png',
    url: 'dashboard/index.html?detail=gauntlet',
    width: 1440,
    height: 1080,
    scrollToEnd: true,
  },
  { file: '3-filtered.png', url: 'dashboard/index.html?flags=watchlist', width: 1440, height: 900, rows: 40 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForPort(port, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      // Not up yet.
    }
    await sleep(200);
  }
  throw new Error(`DevTools on port ${port} never answered`);
}

/** Minimal CDP client over one WebSocket. */
class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  ready() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  waitFor(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        const i = this.events.findIndex((e) => e.method === method);
        if (i >= 0) return resolve(this.events.splice(i, 1)[0]);
        if (Date.now() - started > timeoutMs) return reject(new Error(`timed out waiting for ${method}`));
        setTimeout(tick, 50);
      };
      tick();
    });
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const port = 9333;
  const profile = join(process.env.HOME || '/tmp', '.cache', 'radar-chrome-profile');
  const child = spawn(
    chrome,
    [
      `--remote-debugging-port=${port}`,
      '--headless',
      '--no-sandbox',
      '--no-first-run',
      '--disable-gpu',
      '--hide-scrollbars',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  try {
    const version = await waitForPort(port);
    const browser = new Cdp(version.webSocketDebuggerUrl);
    await browser.ready();
    for (const shot of SHOTS) {
      const { targetId } = await browser.send('Target.createTarget', {
        url: `file://${join(stageDir, shot.url)}`,
      });
      const { sessionId } = await browser.send('Target.attachToTarget', {
        targetId,
        flatten: true,
      });
      await browser.send('Page.enable', {}, sessionId);
      await browser.send(
        'Emulation.setDeviceMetricsOverride',
        { width: shot.width, height: shot.height, deviceScaleFactor: 1, mobile: false },
        sessionId,
      );
      await browser.waitFor('Page.loadEventFired', 20000);
      await sleep(600);
      const check = await browser.send(
        'Runtime.evaluate',
        { expression: `document.querySelectorAll('#rows tr').length`, returnByValue: true },
        sessionId,
      );
      const rowCount = check.result?.value;
      const expectedRows = shot.rows ?? 198;
      if (rowCount !== expectedRows) {
        throw new Error(`${shot.file}: board rendered ${rowCount} rows, expected ${expectedRows}`);
      }
      if (shot.scrollToEnd) {
        await browser.send(
          'Runtime.evaluate',
          { expression: `window.scrollTo(0, document.body.scrollHeight)` },
          sessionId,
        );
        await sleep(400);
      }
      const png = await browser.send(
        'Page.captureScreenshot',
        { format: 'png' },
        sessionId,
      );
      writeFileSync(join(outDir, shot.file), Buffer.from(png.data, 'base64'));
      console.log(`capture: ${shot.file} ${shot.width}x${shot.height}`);
      await browser.send('Target.closeTarget', { targetId });
    }
  } finally {
    child.kill('SIGKILL');
  }
}

main().catch((err) => {
  process.stderr.write(`capture: ${err.message}\n`);
  process.exit(1);
});
