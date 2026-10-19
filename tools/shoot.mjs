/**
 * Drives a headless Chrome over CDP to screenshot the game's DOM screens.
 * Uses only Node built-ins (global WebSocket), so there is nothing to install.
 *
 *   node tools/shoot.mjs <out.png> <url> [js-expression]
 *   node tools/shoot.mjs --keep-alive            # just print the debug port
 */
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const OUT = process.argv[2];
const URL_ = process.argv[3];
const EXPR = process.argv[4] || 'document.title';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/chrome-cdp-ns',
  '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars',
  '--window-size=1280,800',
  '--force-device-scale-factor=1',
  'about:blank',
], { stdio: 'ignore' });

async function rpc(ws, id, method, params) {
  ws.send(JSON.stringify({ id, method, params }));
  for (let i = 0; i < 400; i++) {
    const msg = JSON.parse(await next(ws));
    if (msg.id === id) {
      if (msg.error) throw new Error(`${method}: ${msg.error.message}`);
      return msg.result;
    }
  }
  throw new Error(`${method}: too many unrelated events`);
}

function next(ws) {
  return new Promise((res, rej) => {
    const h = m => { detach(); res(typeof m.data === 'string' ? m.data : Buffer.from(m.data).toString()); };
    const e = err => { detach(); rej(err instanceof Error ? err : new Error('websocket error')); };
    const detach = () => { ws.removeEventListener('message', h); ws.removeEventListener('error', e); };
    ws.addEventListener('message', h);
    ws.addEventListener('error', e);
  });
}

async function main() {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch { /* chrome still booting */ }
  }
  if (!target) throw new Error('no CDP page target');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 1;
  await rpc(ws, id++, 'Page.enable');
  await rpc(ws, id++, 'Runtime.enable');
  await rpc(ws, id++, 'Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await rpc(ws, id++, 'Page.navigate', { url: URL_ });
  await sleep(2600);   // atlas + fonts + boot animation

  if (EXPR && EXPR !== '-') {
    const r = await rpc(ws, id++, 'Runtime.evaluate', { expression: EXPR, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) console.error('EVAL EXCEPTION:', r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    else console.log('EVAL =>', JSON.stringify(r.result.value));
    await sleep(700);
  }

  const shot = await rpc(ws, id++, 'Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('wrote', OUT);
  ws.close();
}

await main();
chrome.kill();
process.exit(0);
