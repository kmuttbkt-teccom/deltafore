'use strict';
// The browser: Chrome or Edge already on this machine, started with a profile of its own
// and driven over the DevTools protocol. No package is needed (Node >= 22 has WebSocket).
// Nothing here hides that the browser is driven: no stealth flags, no changed user agent.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PF = process.env['ProgramFiles'] || 'C:\\Program Files';
const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
const LOCAL = process.env.LOCALAPPDATA || '';

const BROWSERS = {
  chrome: [
    path.join(PF, 'Google/Chrome/Application/chrome.exe'),
    path.join(PF86, 'Google/Chrome/Application/chrome.exe'),
    path.join(LOCAL, 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome'
  ],
  edge: [
    path.join(PF86, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(PF, 'Microsoft/Edge/Application/msedge.exe'),
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/microsoft-edge'
  ]
};

function findBrowser(pref) {
  if (pref && pref !== 'auto' && !BROWSERS[pref]) {
    if (fs.existsSync(pref)) return pref;
    throw new Error('ไม่พบเบราว์เซอร์ที่ระบุใน config.json: ' + pref);
  }
  const order = pref && pref !== 'auto' ? [pref] : ['chrome', 'edge'];
  for (const name of order) for (const p of BROWSERS[name]) if (p && fs.existsSync(p)) return p;
  throw new Error('ไม่พบ Chrome หรือ Edge ในเครื่อง — ใส่ที่อยู่ไฟล์ .exe ใน config.json ช่อง "browser"');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function portOf(profileDir) {
  try {
    const port = Number(fs.readFileSync(path.join(profileDir, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
    if (!port) return 0;
    const r = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(1500) });
    return r.ok ? port : 0;
  } catch (e) { return 0; }
}

class Session {
  constructor(ws, proc, port) {
    this.ws = ws; this.proc = proc; this.port = port;
    this.seq = 0; this.waiting = new Map(); this.handlers = new Map();
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id) {
        const w = this.waiting.get(m.id);
        if (!w) return;
        this.waiting.delete(m.id);
        if (m.error) w.reject(new Error(w.method + ': ' + m.error.message)); else w.resolve(m.result);
      } else if (m.method) {
        for (const fn of this.handlers.get(m.method) || []) { try { fn(m.params); } catch (e) { /* one listener must not stop the others */ } }
      }
    });
    ws.addEventListener('close', () => {
      for (const w of this.waiting.values()) w.reject(new Error('เบราว์เซอร์ถูกปิด'));
      this.waiting.clear(); this.closed = true;
    });
  }

  send(method, params) {
    if (this.closed) return Promise.reject(new Error('เบราว์เซอร์ถูกปิด'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(fn);
    return () => { const a = this.handlers.get(event); a.splice(a.indexOf(fn), 1); };
  }

  // The value of an expression in the page (a promise is awaited).
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value;
  }

  // Ask again until the page gives a truthy answer; a page that is loading counts as "not yet".
  async until(expression, ms, every) {
    const end = Date.now() + ms;
    for (;;) {
      let v = null;
      try { v = await this.eval(expression); } catch (e) { if (this.closed) throw e; }
      if (v) return v;
      if (Date.now() >= end) return null;
      await sleep(every || 400);
    }
  }

  async close() {
    if (this.closed) return;
    const gone = new Promise(r => this.proc ? this.proc.once('exit', r) : this.ws.addEventListener('close', r));
    try { await this.send('Browser.close'); } catch (e) { /* already going */ }
    await Promise.race([gone, sleep(6000)]);
    if (this.proc && this.proc.exitCode === null) { try { this.proc.kill(); } catch (e) { /* gone */ } }
    this.closed = true;
  }
}

// Start the browser on this profile — or join the one already open on it (the window of
// `login` left open, for instance: a second start on the same profile would only hand over
// to the first and leave nothing to talk to).
async function open({ browser, profileDir, headless, url }) {
  fs.mkdirSync(profileDir, { recursive: true });
  let proc = null;
  let port = await portOf(profileDir);
  if (!port) {
    try { fs.unlinkSync(path.join(profileDir, 'DevToolsActivePort')); } catch (e) { /* none */ }
    const args = [
      '--user-data-dir=' + profileDir,
      '--remote-debugging-port=0',
      '--no-first-run', '--no-default-browser-check',
      '--window-size=1120,820'
    ];
    if (headless) args.push('--headless=new');
    args.push('about:blank');
    proc = spawn(findBrowser(browser), args, { stdio: 'ignore' });
    const end = Date.now() + 20000;
    while (!(port = await portOf(profileDir))) {
      if (proc.exitCode !== null || Date.now() > end) {
        throw new Error('เปิดเบราว์เซอร์ไม่สำเร็จ — ถ้ามีหน้าต่างของเครื่องมือนี้ค้างอยู่ให้ปิดก่อน แล้วลองใหม่');
      }
      await sleep(250);
    }
  }
  const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  let page = list.find(t => t.type === 'page');
  if (!page) page = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('ต่อกับเบราว์เซอร์ไม่ได้')), { once: true });
  });
  const s = new Session(ws, proc, port);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  await s.send('Network.enable');
  if (url) await s.send('Page.navigate', { url });
  return s;
}

// Another page of the same browser (a window the first page opened), found by a part of its address.
async function attach(port, part) {
  const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const page = list.find(t => t.type === 'page' && t.url.includes(part));
  if (!page) return null;
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('ต่อกับหน้านั้นไม่ได้')), { once: true });
  });
  const s = new Session(ws, null, port);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  return s;
}

module.exports = { open, attach, findBrowser, sleep };
