#!/usr/bin/env node
'use strict';
// node web/server.js [--port 4310] [--demo] [--lan]
// The control room: one page for the code list, the redeem commands, the tournament
// calendar and the guide. It listens on this machine only (127.0.0.1) and does its work by
// starting the same commands as the terminal (`node redeem …`), one at a time.
// --lan: also answers the phones and tablets of this network — only with the key that is in the
// link shown on the page ("ใช้บนมือถือ"); without --lan nothing outside this machine can connect.
// --demo: a stand-in redemption page and a sample list in a temporary folder — nothing
// goes to Garena and the real data/ folder is not touched.

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(__dirname, 'public');
const argv = process.argv.slice(2);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const PORT = Number(opt('--port')) || 4310;
const DEMO = argv.includes('--demo');
const LAN = argv.includes('--lan');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

async function demoSetup() {
  const mock = await require('../test/mock-portal').start(0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deltafore-demo-'));
  const base = 'http://127.0.0.1:' + mock.port;
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    portal: base + '/th/cdkgarena.html', headless: true, delayBetweenCodesSec: [1, 2],
    sources: [{ name: 'หน้ารวมโค้ด (จำลอง)', url: base + '/codes.html' }]
  }));
  process.env.DF_DATA_DIR = dir;
  process.env.DF_CONFIG = path.join(dir, 'config.json');
  const store = require('../redeem/store');
  const db = store.load();
  for (const c of ['GOOD1', 'USED1', 'OLD1', 'BAD1', 'SOON1', 'FULL1']) store.add(db, c, { source: 'ตัวอย่าง' });
  store.save(db);
}

function main() {
  const store = require('../redeem/store');

  // In 'manual' mode nothing here opens a browser on Garena's pages: the page lists and keeps the
  // codes, the player redeems in their own browser and reports what the page answered.
  // Every request names its game (?game=…); Delta Force when it names none.
  const manual = g => store.config(g).mode !== 'auto';
  const allowed = (cmd, g) => cmd === 'scan' || !manual(g);
  const gameOf = url => { const g = url.searchParams.get('game') || store.FIRST; store.config(g); return g; };   // throws on a game that is not in config.json

  // ---- one command at a time -------------------------------------------------------
  const JOBS = { run: 'แลกโค้ดที่รอ', scan: 'ตรวจหน้าเว็บรวมโค้ด', login: 'เข้าสู่ระบบ Garena', status: 'เช็กการเข้าสู่ระบบ', logout: 'ออกจากระบบ' };
  let job = { id: 0, cmd: '', label: '', running: false, lines: [], code: null };
  const login = { state: 'unknown', user: '', at: null };

  function settle(j) {
    const user = j.lines.map(l => /(?:เข้าสู่ระบบอยู่|เข้าสู่ระบบแล้ว|บัญชี): (.+?)(?: —|$)/.exec(l)).filter(Boolean).pop();
    let state = null;
    if (j.cmd === 'status' || j.cmd === 'login') state = j.code === 0 ? 'yes' : j.code === 2 ? 'no' : null;
    else if (j.cmd === 'run') state = j.code === 2 ? 'no' : user ? 'yes' : null;
    else if (j.cmd === 'logout' && j.code === 0) state = 'no';
    if (!state) return;
    login.state = state; login.at = Date.now();
    login.user = state === 'yes' && user ? user[1] : state === 'yes' ? login.user : '';
  }

  function runJob(cmd, g) {
    g = g || store.FIRST;
    if (job.running || !JOBS[cmd] || !allowed(cmd, g)) return null;
    const mine = job = { id: job.id + 1, cmd, game: g, label: JOBS[cmd] + ' · ' + store.config(g).name, running: true, lines: [], code: null, startedAt: Date.now() };
    return new Promise(resolve => {
      const child = spawn(process.execPath, [path.join(ROOT, 'redeem'), cmd], { cwd: ROOT, env: Object.assign({}, process.env, { DF_GAME: g }), windowsHide: true });
      let buf = '';
      const take = d => {
        buf += d.toString('utf8');
        const parts = buf.split(/\r?\n/); buf = parts.pop();
        for (const l of parts) {
          if (!l.trim()) continue;
          mine.lines.push(l); if (mine.lines.length > 300) mine.lines.shift();
          const who = /^\s*บัญชี: (.+)$/.exec(l);          // a run that got this far is signed in
          if (who) { login.state = 'yes'; login.user = who[1].trim(); login.at = Date.now(); }
        }
      };
      child.stdout.on('data', take); child.stderr.on('data', take);
      child.on('error', e => { mine.lines.push('✗ ' + e.message); });
      child.on('close', code => {
        if (buf.trim()) mine.lines.push(buf);
        mine.running = false; mine.code = code; mine.endedAt = Date.now();
        settle(mine); resolve(mine);
      });
    });
  }

  // ---- the watch: scan, then redeem, every N minutes while this server is up ----------
  const auto = { on: false, everyMin: 120, nextAt: null, timer: null };
  function schedule() {
    clearTimeout(auto.timer); auto.timer = null; auto.nextAt = null;
    if (!auto.on) return;
    auto.nextAt = Date.now() + auto.everyMin * 60000;
    auto.timer = setTimeout(tick, auto.everyMin * 60000);
  }
  async function round() {                                  // every game's pages, one game after the other
    for (const g of store.config().games) await runJob('scan', g.id);
    if (!manual(store.FIRST)) await runJob('run', store.FIRST);
  }
  async function tick() {
    if (!job.running) await round();
    schedule();
  }

  // ---- answers ---------------------------------------------------------------------
  function state(g) {
    const cfg = store.config(g);
    const db = store.load(g);
    let events = [];
    try { events = JSON.parse(fs.readFileSync(path.join(ROOT, 'events.json'), 'utf8')).filter(ev => (ev.game || store.FIRST) === g); } catch (e) { /* the calendar is optional */ }
    return {
      demo: DEMO, now: Date.now(), mode: manual(g) ? 'manual' : 'auto',
      game: g, games: cfg.games, name: cfg.name, redeem: cfg.redeem, how: cfg.how,
      queue: store.pending(db, Infinity).map(e => e.code),
      lan: { on: LAN, urls: LAN ? lanHosts().map(h => 'http://' + h + '/?k=' + KEY) : [] },
      codes: Object.values(db.codes).sort((a, b) => (b.triedAt || b.addedAt) < (a.triedAt || a.addedAt) ? -1 : 1),
      invalidToday: store.invalidToday(db),
      job: { id: job.id, cmd: job.cmd, label: job.label, running: job.running, lines: job.lines, code: job.code },
      login, auto: { on: auto.on, everyMin: auto.everyMin, nextAt: auto.nextAt },
      cfg: {
        portal: cfg.portal, maxInvalidPerDay: cfg.maxInvalidPerDay, maxCodesPerRun: cfg.maxCodesPerRun,
        delay: cfg.delayBetweenCodesSec, watchEveryMin: cfg.watchEveryMin, headless: cfg.headless,
        sources: (cfg.sources || []).map(s => ({ name: s.name, url: s.url, auto: s.auto === true, enabled: s.enabled !== false }))
      },
      events
    };
  }

  function add(text, g) {
    const db = store.load(g);
    const out = [];
    for (const raw of String(text || '').split(/[\s,;]+/).filter(Boolean).slice(0, 50)) {
      const r = store.add(db, raw);
      if (r.error) out.push({ code: raw, result: 'invalid' });
      else if (r.fresh) out.push({ code: r.entry.code, result: 'added' });
      else if (r.entry.status === 'found') { r.entry.status = 'new'; out.push({ code: r.entry.code, result: 'approved' }); }
      else out.push({ code: r.entry.code, result: 'exists', status: r.entry.status });
    }
    store.save(db, g);
    return out;
  }

  const MARK = {
    approve: [['found'], 'new'],
    skip: [['found', 'new', 'early', 'retry'], 'skip'],
    again: [['failed', 'skip', 'ok', 'used', 'expired', 'invalid', 'gone'], 'new']    // back into the queue: also undoes a result filed by mistake
  };
  function mark(code, to, g) {
    const db = store.load(g);
    if (store.RESULTS.includes(to)) {             // what the player saw on the redemption page
      const e = store.record(db, code, to);
      if (!e) return 0;
      store.save(db, g); store.log(e.code + ' ' + e.status + ' (บันทึกผลเอง)', g);
      return 1;
    }
    const rule = MARK[to]; if (!rule) return 0;
    const list = code === '*' ? Object.values(db.codes).filter(e => rule[0].includes(e.status)) : [store.find(db, code)].filter(Boolean);
    let n = 0;
    for (const e of list) if (rule[0].includes(e.status)) { e.status = rule[1]; if (to === 'again') { e.tries = 0; e.note = ''; } n++; }
    store.save(db, g);
    return n;
  }

  // Who may ask.
  //  · This machine's own page, by this machine's own names — a page of another site open in the
  //    same browser must not (the Origin check), nor a foreign name pointed at us (the Host check).
  //  · With --lan, a device of this network that shows the key: once in the link (?k=…), then as a cookie.
  const HOSTS = ['127.0.0.1:' + PORT, 'localhost:' + PORT];
  const lanHosts = () => Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address + ':' + PORT);
  const KEY = (() => {
    if (!LAN) return '';
    const f = path.join(store.DATA, 'web-key');
    try { const k = fs.readFileSync(f, 'utf8').trim(); if (/^[A-Z2-9]{10}$/.test(k)) return k; } catch (e) { /* first time */ }
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';                      // no 0/O, 1/I: it may be typed on a phone
    const k = Array.from({ length: 10 }, () => abc[crypto.randomInt(abc.length)]).join('');
    fs.mkdirSync(store.DATA, { recursive: true }); fs.writeFileSync(f, k);
    return k;
  })();
  const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const local = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  function mine(req, url, res) {
    const host = req.headers.host || '', origin = req.headers.origin;
    if (local(req)) return HOSTS.includes(host) && (!origin || HOSTS.some(h => origin === 'http://' + h));
    if (!LAN || !lanHosts().includes(host) || (origin && origin !== 'http://' + host)) return false;
    const cookie = /(?:^|;\s*)dfk=([A-Z2-9]{10})(?:;|$)/.exec(req.headers.cookie || '');
    if (cookie && same(cookie[1], KEY)) return true;
    const k = url.searchParams.get('k') || '';
    if (!same(k, KEY)) return false;
    res.setHeader('set-cookie', 'dfk=' + KEY + '; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax');
    return true;
  }
  const DENIED = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DELTAFORE</title>' +
    '<body style="font:16px/1.6 Tahoma,sans-serif;background:#0a0d0b;color:#e6ead8;padding:32px"><h1 style="color:#e9b949">DELTAFORE</h1>' +
    '<p>ต้องเปิดด้วยลิงก์ที่มีรหัส — ดูลิงก์ได้ที่ศูนย์โค้ดบนคอมพิวเตอร์ หัวข้อ "ใช้บนมือถือ / ไอแพด / แท็บเล็ต"</p>';

  const body = req => new Promise((resolve, reject) => {
    let s = '';
    req.on('data', d => { s += d; if (s.length > 65536) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
  });

  const server = http.createServer(async (req, res) => {
    const send = (code, type, data) => { res.writeHead(code, { 'content-type': type + '; charset=utf-8', 'cache-control': 'no-store' }); res.end(data); };
    const json = (code, obj) => send(code, 'application/json', JSON.stringify(obj));
    try {
      const url = new URL(req.url, 'http://x');
      if (!mine(req, url, res)) return req.method === 'GET' && !url.pathname.startsWith('/api/') ? send(403, 'text/html', DENIED) : json(403, { error: 'forbidden' });
      const g = url.pathname.startsWith('/api/') ? gameOf(url) : store.FIRST;
      if (req.method === 'GET') {
        if (url.pathname === '/api/state') return json(200, state(g));
        if (url.pathname === '/api/guide') {                // PRO-GUIDE.md for the first game, <ID>-GUIDE.md for the others
          const f = path.join(ROOT, g === store.FIRST ? 'PRO-GUIDE.md' : g.toUpperCase() + '-GUIDE.md');
          return send(200, 'text/plain', fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '# ' + store.config(g).name + '\n\nยังไม่มีคู่มือของเกมนี้');
        }
        const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname).replace(/^([\\/])+/, ''));
        if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(404, 'text/plain', 'not found');
        return send(200, TYPES[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
      }
      if (req.method === 'POST') {
        if (!/^application\/json/.test(req.headers['content-type'] || '')) return json(415, { error: 'json only' });
        const b = await body(req);
        if (url.pathname === '/api/add') {
          const out = add(b.text, g);
          const started = b.run && allowed('run', g) && out.some(o => o.result === 'added' || o.result === 'approved') ? !!runJob('run', g) : false;
          return json(200, { out, started });
        }
        if (url.pathname === '/api/mark') return json(200, { n: mark(String(b.code || ''), b.to, g) });
        if (url.pathname === '/api/job') {
          if (!JOBS[b.cmd]) return json(400, { error: 'unknown command' });
          if (!allowed(b.cmd, g)) return json(400, { error: 'โหมดแลกเอง: คำสั่งนี้ปิดไว้ (Garena ปฏิเสธเบราว์เซอร์ที่เครื่องมือควบคุม)' });
          return json(200, { started: !!runJob(b.cmd, g) });
        }
        if (url.pathname === '/api/auto') {
          auto.on = !!b.on;
          auto.everyMin = Math.max(30, Math.min(1440, Number(b.everyMin) || store.config().watchEveryMin || 120));
          schedule();
          if (auto.on && !job.running) round();
          return json(200, { on: auto.on, everyMin: auto.everyMin });
        }
      }
      json(404, { error: 'not found' });
    } catch (e) {
      json(500, { error: e.message });
    }
  });

  server.listen(PORT, LAN ? '0.0.0.0' : '127.0.0.1', () => {
    console.log('deltafore' + (DEMO ? ' (โหมดสาธิต)' : '') + ': http://localhost:' + PORT);
    if (LAN) for (const h of lanHosts()) console.log('  มือถือ/แท็บเล็ต (Wi-Fi เดียวกัน): http://' + h + '/?k=' + KEY);
  });
}

(DEMO ? demoSetup() : Promise.resolve()).then(main, e => { console.error(e); process.exit(1); });
