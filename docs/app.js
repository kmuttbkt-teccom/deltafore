'use strict';
// The page asks /api/state again and again (fast while a command runs) and redraws what changed.

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LABEL = {
  found: 'พบจากหน้าเว็บ', new: 'รอแลก', early: 'ยังไม่ถึงเวลา', retry: 'รอลองใหม่',
  ok: 'แลกสำเร็จ', used: 'เคยแลกแล้ว', gone: 'ถูกแลกครบแล้ว', expired: 'หมดอายุ', invalid: 'โค้ดไม่ถูกต้อง', failed: 'ไม่สำเร็จ', skip: 'ข้าม'
};
const GROUPS = [
  ['all', 'ทั้งหมด', () => true],
  ['wait', 'รอแลก', e => ['new', 'early', 'retry'].includes(e.status)],
  ['skins', 'สกินปืน & ตัวละคร', e => /สกิน|ปืน|ตัวละคร|干员|Avatar|Camo|Skin|Operator/i.test((e.note || '') + ' ' + (e.seen || []).join(' ')) || ['surprise', 'SJZ2026', 'bilibili666', 'DX202402', 'DF0922', 'DFHAWK', 'DELTAFORCE2026'].includes(e.code)],
  ['cn', 'โค้ดจีน (CN)', e => /จีน|CN|口令|Bilibili|TapTap|好游/i.test((e.source || '') + ' ' + (e.seen || []).join(' ') + ' ' + (e.note || ''))],
  ['found', 'รออนุมัติ', e => e.status === 'found'],
  ['ok', 'สำเร็จ', e => e.status === 'ok'],
  ['done', 'จบแล้ว', e => ['used', 'gone', 'expired', 'invalid', 'failed', 'skip'].includes(e.status)]
];
const TH = 'th-TH-u-ca-gregory';

let S = null, filter = 'all', drawn = {}, timer = null, offline = false, picked = null;
// The game on show: every question to the server names it.
let game = 'deltaforce';
try { game = localStorage.getItem('df-game') || game; } catch (e) { /* no storage: the first game */ }

let isStaticMode = location.hostname.endsWith('github.io') || location.protocol === 'file:';

// A device's own list against the newer list of the site (the site is filled again from time to
// time): codes this device has never seen come in, and a result the site knows — the computer's —
// takes the place of "still waiting" here. A result filed on this device stays as it is.
const FINAL = ['ok', 'used', 'expired', 'invalid', 'gone'];
function mergeSiteList(local, site) {
  let n = 0;
  local.codes = local.codes || {};
  for (const k in (site && site.codes) || {}) {
    const mine = local.codes[k], theirs = site.codes[k];
    if (!mine) { local.codes[k] = theirs; n++; }
    else if (!FINAL.includes(mine.status) && FINAL.includes(theirs.status)) { local.codes[k] = Object.assign({}, mine, theirs); n++; }
  }
  return n;
}
const siteListRead = {};                 // per game: the site's list was read once since this page opened

async function getStaticDb(g) {
  const key = 'df_db_' + g;
  let local = null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) local = JSON.parse(raw);
  } catch (e) {}
  if (local && siteListRead[g]) return local;
  const file = g === 'rov' ? 'data/codes-rov.json' : 'data/codes.json';
  let initial = { codes: {} };
  try {
    let res = await fetch(file);
    if (!res.ok) res = await fetch(g === 'rov' ? 'codes-rov.json' : 'codes.json');
    if (res.ok) initial = await res.json();
  } catch (e) {
    try {
      const res2 = await fetch(g === 'rov' ? 'codes-rov.json' : 'codes.json');
      if (res2.ok) initial = await res2.json();
    } catch (e2) {}
  }
  siteListRead[g] = true;
  if (local) { if (mergeSiteList(local, initial)) saveStaticDb(local, g); return local; }
  try { localStorage.setItem(key, JSON.stringify(initial)); } catch (e) {}
  return initial;
}

function saveStaticDb(db, g) {
  try { localStorage.setItem('df_db_' + g, JSON.stringify(db)); } catch (e) {}
}

async function getStaticState(g) {
  const db = await getStaticDb(g);
  let events = [];
  try {
    const evRes = await fetch('events.json');
    if (evRes.ok) events = (await evRes.json()).filter(ev => (ev.game || 'deltaforce') === g);
  } catch (e) {}

  const codesList = Object.values(db.codes || {}).sort((a, b) => (b.triedAt || b.addedAt) < (a.triedAt || a.addedAt) ? -1 : 1);
  const queue = codesList.filter(e => ['new', 'early', 'retry'].includes(e.status)).map(e => e.code);

  const games = [
    { id: 'deltaforce', name: 'Delta Force', redeem: 'web' },
    { id: 'rov', name: 'RoV', redeem: 'ingame' }
  ];
  const name = g === 'rov' ? 'RoV' : 'Delta Force';
  const redeem = g === 'rov' ? 'ingame' : 'web';
  const how = g === 'rov' ? 'เปิดเกม RoV → หน้ากิจกรรม/ประกาศ → ช่อง "กรอกโค้ด" (CDKey) → วางโค้ด → ยืนยัน · ของเข้ากล่องจดหมายในเกม' : '';

  return {
    demo: false, now: Date.now(), mode: 'manual', static: true,
    game: g, games, name, redeem, how,
    queue,
    lan: { on: false, urls: [] },
    codes: codesList,
    invalidToday: codesList.filter(e => e.status === 'invalid' && e.triedAt && new Date(e.triedAt).toDateString() === new Date().toDateString()).length,
    job: { id: 0, cmd: '', label: '', running: false, lines: [], code: null },
    login: { state: 'unknown', user: '', at: null },
    auto: { on: false, everyMin: 120, nextAt: null },
    cfg: {
      portal: 'https://redeem.df.garena.sg/th/cdkgarena.html',
      delay: [8, 15],
      watchEveryMin: 120,
      sources: []
    },
    events
  };
}

async function staticMark(code, to, g) {
  const db = await getStaticDb(g);
  if (!db.codes) db.codes = {};
  if (code === '*') {
    for (const k in db.codes) {
      if (to === 'approve' && db.codes[k].status === 'found') db.codes[k].status = 'new';
      else if (to === 'again') { db.codes[k].status = 'new'; db.codes[k].tries = 0; }
    }
  } else if (db.codes[code]) {
    const e = db.codes[code];
    if (to === 'approve') e.status = 'new';
    else if (to === 'again') { e.status = 'new'; e.tries = 0; }
    else if (to === 'skip') e.status = 'skip';
    else {
      e.status = to;
      e.triedAt = new Date().toISOString();
      e.tries = (e.tries || 0) + 1;
    }
  }
  saveStaticDb(db, g);
  return { n: 1 };
}

async function staticAdd(text, g) {
  const db = await getStaticDb(g);
  if (!db.codes) db.codes = {};
  const CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{3,39}$/;
  const out = [];
  const list = String(text || '').split(/[\s,;]+/).filter(Boolean).slice(0, 50);
  for (const raw of list) {
    const code = raw.trim().toUpperCase();
    if (!CODE.test(code)) {
      out.push({ code: raw, result: 'invalid' });
    } else if (db.codes[code]) {
      if (db.codes[code].status === 'found') {
        db.codes[code].status = 'new';
        out.push({ code, result: 'approved' });
      } else {
        out.push({ code, result: 'exists', status: db.codes[code].status });
      }
    } else {
      db.codes[code] = { code, status: 'new', source: 'manual', addedAt: new Date().toISOString(), tries: 0, seen: ['manual'] };
      out.push({ code, result: 'added' });
    }
  }
  saveStaticDb(db, g);
  return { out, started: false };
}

async function staticApi(path, body, g) {
  g = g || game || 'deltaforce';
  const clean = path.split('?')[0];
  if (clean === '/api/state') return getStaticState(g);
  if (clean === '/api/mark') return staticMark(body.code, body.to, g);
  if (clean === '/api/add') return staticAdd(body.text, g);
  if (clean === '/api/job') return { started: false };
  if (clean === '/api/auto') return { on: false, everyMin: 120 };
  throw new Error('Not found: ' + clean);
}

async function api(path, body, g) {
  if (isStaticMode) return staticApi(path, body, g);
  try {
    const fullPath = path + (path.includes('?') ? '&' : '?') + 'game=' + encodeURIComponent(g || game);
    const r = await fetch(fullPath, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    if (!r.ok) {
      if (r.status === 404 && path.startsWith('/api/')) {
        isStaticMode = true;
        return staticApi(path, body, g);
      }
      throw new Error((await r.json().catch(() => ({}))).error || 'HTTP ' + r.status);
    }
    return r.json();
  } catch (e) {
    if (path.startsWith('/api/')) {
      isStaticMode = true;
      return staticApi(path, body, g);
    }
    throw e;
  }
}

// redraw a piece only when what it shows has changed (a redraw would take a selection or a scroll away)
function once(key, value, fn) {
  const v = JSON.stringify(value);
  if (drawn[key] === v) return;
  drawn[key] = v; fn();
}

const time = iso => iso ? new Date(iso).toLocaleString(TH, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const dayStart = d => new Date(d + 'T00:00:00');
const dayEnd = d => new Date(d + 'T23:59:59');

function range(a, b) {
  const A = dayStart(a), B = dayStart(b);
  const m = d => d.toLocaleDateString(TH, { month: 'short' });
  if (a === b) return A.getDate() + ' ' + m(A) + ' ' + A.getFullYear();
  if (A.getMonth() === B.getMonth()) return A.getDate() + '–' + B.getDate() + ' ' + m(B) + ' ' + B.getFullYear();
  return A.getDate() + ' ' + m(A) + ' – ' + B.getDate() + ' ' + m(B) + ' ' + B.getFullYear();
}
const days = ms => Math.max(0, Math.ceil(ms / 86400000));

function phase(ev, now) {
  if (now > dayEnd(ev.end)) return { k: 'past', text: 'จบแล้ว' };
  if (now >= dayStart(ev.start)) { const d = days(dayEnd(ev.end) - now); return { k: 'live', text: d <= 1 ? 'กำลังแข่ง · วันสุดท้าย' : 'กำลังแข่ง · เหลือ ' + d + ' วัน' }; }
  const d = days(dayStart(ev.start) - now);
  return { k: 'soon', text: d <= 1 ? 'เริ่มพรุ่งนี้' : 'อีก ' + d + ' วัน' };
}

// ── header ────────────────────────────────────────────────
function drawChips() {
  const c = S.codes, n = k => c.filter(e => GROUPS.find(g => g[0] === k)[2](e)).length;
  const now = new Date(S.now);
  const next = S.events.map(ev => ({ ev, p: phase(ev, now) })).filter(x => x.p.k !== 'past')
    .sort((a, b) => (a.p.k === 'live' ? 0 : 1) - (b.p.k === 'live' ? 0 : 1) || (a.ev.end < b.ev.end ? -1 : 1))[0];
  const login = S.mode === 'manual' ? ['gold', 'โหมด', 'แลกเอง'] : S.login.state === 'yes' ? ['ok', 'เข้าสู่ระบบแล้ว', S.login.user || '✓'] : S.login.state === 'no' ? ['bad', 'ยังไม่ได้เข้าสู่ระบบ', '✗'] : ['', 'การเข้าสู่ระบบ', 'ยังไม่ได้เช็ก'];
  once('chips', [S.mode, login, n('wait'), n('found'), n('ok'), next && next.ev.name, next && next.p.text], () => {
    $('#chips').innerHTML =
      `<span class="chip ${login[0]}">${login[1]} <b>${esc(login[2])}</b></span>` +
      `<span class="chip gold">รอแลก <b>${n('wait')}</b></span>` +
      (n('found') ? `<span class="chip">รออนุมัติ <b>${n('found')}</b></span>` : '') +
      `<span class="chip ok">สำเร็จ <b>${n('ok')}</b></span>` +
      (next ? `<span class="chip">${esc(next.ev.name)} <b>${esc(next.p.text)}</b></span>` : '');
    $('#login-line').textContent = S.mode === 'manual' ? 'หาโค้ดจากหน้าเว็บทั่วโลก แล้วอนุมัติเข้าคิวแลกเอง' : S.login.state === 'yes' ? 'เข้าสู่ระบบอยู่' + (S.login.user ? ': ' + S.login.user : '') + ' · เช็กล่าสุด ' + time(S.login.at)
      : S.login.state === 'no' ? 'ยังไม่ได้เข้าสู่ระบบ — กด "เข้าสู่ระบบ Garena" แล้วทำในหน้าต่างที่เปิดขึ้น' : 'ยังไม่ได้เช็กการเข้าสู่ระบบ';
  });
  $('#demo-bar').hidden = !S.demo;
  once('games', [S.games, S.game, S.redeem, S.how], () => {
    $('#games').innerHTML = S.games.length > 1 ? S.games.map(g => `<button class="gbtn ${g.id === S.game ? 'on' : ''}" data-game="${esc(g.id)}">${esc(g.name)}</button>`).join('') : '';
    $('#sub').textContent = 'ศูนย์บัญชาการ · ' + S.name;
    document.title = 'DELTAFORE — ' + S.name;
    document.body.dataset.redeem = S.redeem;
    $$('[data-only]').forEach(el => { el.hidden = el.dataset.only !== S.game; });
    $('#mq-ingame').textContent = S.how ? 'โค้ดของ ' + S.name + ' กรอกในเกม: ' + S.how : 'โค้ดของ ' + S.name + ' กรอกในตัวเกม';
  });
}

function switchGame(id) {
  if (id === game) return;
  game = id;
  try { localStorage.setItem('df-game', id); } catch (e) { /* not kept */ }
  drawn = {}; picked = null; filter = 'all'; guideLoaded = false;
  $('#guide').textContent = 'กำลังโหลดคู่มือ…'; $('#toc').innerHTML = '';
  refresh().then(() => { if ($('#page-guide').classList.contains('on')) loadGuide(); });
}

// ── the command log ───────────────────────────────────────
function drawJob() {
  const j = S.job;
  $$('[data-job], #btn-add-run').forEach(b => { b.disabled = j.running; });
  $('.console-panel').classList.toggle('busy', j.running);
  once('job', [j.id, j.running, j.code, j.lines.length], () => {
    if (!j.id) return;
    const end = j.running ? 'กำลังทำงาน' : j.code === 0 ? 'เสร็จ' : j.code === 2 ? 'หยุด: ต้องเข้าสู่ระบบก่อน' : 'จบด้วยข้อผิดพลาด';
    $('#job-title').textContent = j.label + ' — ' + end;
    const cls = l => /^\s*(✓|✅|📬|\+)/u.test(l) ? 'l-ok' : /^\s*(✗|❌|⛔)/u.test(l) ? 'l-bad' : /^\s*(⏸|⏳|🔐|⚠|🔁|⌛|🚫)/u.test(l) ? 'l-warn' : /^\s*(…|=)/u.test(l) ? 'l-dim' : '';
    const box = $('#console');
    box.innerHTML = j.lines.map(l => `<span class="${cls(l)}">${esc(l)}</span>`).join('\n') || (j.running ? 'เริ่มทำงาน…' : '');
    box.scrollTop = box.scrollHeight;
  });
}

// ── redeeming by hand: the next code of the queue, or the one picked in the list ─────────
function current() {
  if (picked && S.queue.includes(picked)) return picked;
  picked = null;
  return S.queue[0] || null;
}
function drawManual() {
  if (S.mode !== 'manual') return;
  const code = current();
  once('manual', [code, S.queue.length, S.cfg.portal], () => {
    $('#mq').hidden = !code; $('#mq-empty').hidden = !!code;
    $('#mq-count').textContent = S.queue.length ? 'เหลือ ' + S.queue.length + ' โค้ดในคิว' : 'คิวว่าง';
    if (!code) return;
    const e = S.codes.find(x => x.code === code) || {};
    $('#mq-code').textContent = code;
    $('#mq-open').href = S.cfg.portal || '#';
    $('#mq-copy').textContent = 'คัดลอกโค้ด';
    const seen = e.seen && e.seen.length ? e.seen : [e.source === 'manual' ? 'เพิ่มเอง' : e.source];
    const global = S.game === 'deltaforce' && !seen.some(s => /^garena/i.test(s)) && e.source !== 'manual';
    $('#mq-meta').textContent = 'ที่มา: ' + seen.join(' · ') + (global ? ' — พบเฉพาะในหน้าของเซิร์ฟ Global: หน้า Garena มักตอบว่าโค้ดไม่ถูกต้อง' : '');
  });
}

async function copyCode() {
  const code = current(); if (!code) return;
  await copyText(code);
  $('#mq-copy').textContent = 'คัดลอกแล้ว ✓';
  setTimeout(() => { $('#mq-copy').textContent = 'คัดลอกโค้ด'; }, 1600);
}

// ── the fill helper ───────────────────────────────────────
// The redemption page is opened from here with the queue in its address (#df=…); the bookmark
// puts fill-helper.js into it, and the helper works through the queue by itself, in that tab:
// it fills a code, the player confirms, it reads the answer, pauses, fills the next. This page
// only watches: results arrive at once by postMessage while this window is alive (a computer),
// and all together with the helper's link back (#res=…) when it is not (a phone, a tablet).
//   here:   off → opened (waiting for the bookmark)
//   helper: none · login · filled · wait · pause · ask · done
const H = { win: null, state: 'off', code: null, text: '', seen: 0, done: 0, total: 0, sec: 0, note: '' };
const FILED = ['ok', 'used', 'expired', 'invalid', 'gone', 'early'];
const portalOrigin = () => { try { return new URL(S.cfg.portal).origin; } catch (e) { return ''; } };
const b64 = {
  enc: o => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: s => JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/')))
};

function openPortal() {
  const q = S.queue.slice();
  if (picked && q.includes(picked)) { q.splice(q.indexOf(picked), 1); q.unshift(picked); }
  if (!q.length) { H.note = 'คิวว่าง — อนุมัติโค้ดจากรายการด้านล่างก่อน'; return drawHelper(); }
  const auto = $('#hp-auto') ? ($('#hp-auto').checked ? 1 : 0) : 1;
  const job = { q, d: Number($('#hp-delay').value) || 10, b: location.origin + '/', g: game, a: auto };
  H.game = game;
  H.auto = !!auto;
  H.win = window.open(S.cfg.portal + '#df=' + b64.enc(job), 'df-redeem');
  if (!H.win) { H.note = 'เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาตป๊อปอัปของหน้านี้ แล้วกดอีกครั้ง'; return drawHelper(); }
  Object.assign(H, { state: 'opened', seen: 0, note: '', code: null, text: '' });
  drawHelper();
}

window.addEventListener('message', async ev => {
  if (!S || !H.win || ev.source !== H.win || ev.origin !== portalOrigin() || !ev.data || ev.data.df !== 1) return;
  const m = ev.data;
  H.seen = Date.now();
  if (m.type === 'state') Object.assign(H, { state: String(m.state), code: m.code || null, text: String(m.text || ''), done: Number(m.done) || 0, total: Number(m.total) || 0, sec: Number(m.sec) || 0, auto: !!m.auto, paused: !!m.paused });
  else if (m.type === 'result' && FILED.includes(m.status)) {
    await api('/api/mark', { code: String(m.code), to: m.status }, H.game).catch(e => say(e.message, 'bad'));
    await refresh();
  }
  drawHelper();
});

setInterval(() => {
  if (!H.win) return;
  if (H.win.closed) { H.win = null; H.state = 'off'; return drawHelper(); }
  // silence: the page was reloaded or left, the helper went with it — the bookmark again
  if (H.state !== 'opened' && Date.now() - H.seen > 7000) H.state = 'opened';
  drawHelper();
}, 2000);

// Results that came back with the helper's link (#res=…): filed here, once (a code already filed is left alone).
async function takeResults() {
  const m = /^#res=([A-Za-z0-9_-]*)$/.exec(location.hash);
  if (!m) return false;
  history.replaceState(null, '', location.pathname);
  let list = [], n = 0, g = '';
  try { const data = b64.dec(m[1]); list = Array.isArray(data) ? data : data.r; g = /^[a-z0-9]{2,20}$/.test(data.g || '') ? data.g : ''; } catch (e) { list = []; }
  if (g && g !== game) { game = g; try { localStorage.setItem('df-game', g); } catch (e) { /* not kept */ } }
  for (const pair of Array.isArray(list) ? list.slice(0, 300) : []) {
    if (!Array.isArray(pair) || !FILED.includes(pair[1])) continue;
    const r = await api('/api/mark', { code: String(pair[0]), to: pair[1] }).catch(() => null);
    if (r && r.n) n++;
  }
  H.note = 'รับผลจากหน้าแลกโค้ด ' + (Array.isArray(list) ? list.length : 0) + ' รายการ' + (n ? ' — จดใหม่ ' + n : ' — จดไว้ครบแล้ว');
  return true;
}

function drawHelper() {
  if (!S || S.mode !== 'manual' || S.redeem !== 'web') return;
  const st = H.state;
  const BADGE = ({ off: ['s-skip', 'ยังไม่เริ่ม'], opened: ['s-found', 'รอกดบุ๊กมาร์ก'], none: ['s-invalid', 'หน้านั้นไม่มีคิว'], login: ['s-expired', 'รอเข้าสู่ระบบ'],
    filled: ['s-new', 'รอคุณกดยืนยัน'], wait: ['s-new', 'รอคำตอบ'], pause: ['s-ok', 'พักระหว่างโค้ด'], ask: ['s-invalid', 'ต้องให้คุณดู'], done: ['s-ok', 'หมดคิวแล้ว'] })[st] || ['s-skip', st];
  const now = st === 'off' ? 0 : ['opened', 'login', 'none'].includes(st) ? 3 : 4;
  once('helper', [st, H.code, H.text, H.sec, H.done, H.total, H.note], () => {
    $('#hp-state').className = 'badge ' + BADGE[0]; $('#hp-state').textContent = BADGE[1];
    $('#hp-steps').classList.toggle('idle', st === 'off');
    $$('#hp-steps li').forEach(li => {
      const n = Number(li.dataset.step);
      li.classList.toggle('done', now > 0 && n < now);
      li.classList.toggle('now', n === now);
    });
    $('#hp-s2').textContent = H.note || 'คิวทั้งหมดถูกส่งไปกับหน้านั้น · ยังไม่ได้เข้าสู่ระบบ Garena ก็เข้าด้วยตัวคุณเองในหน้านั้น';
    $('#hp-s3').textContent = st === 'login' ? 'เข้าสู่ระบบ Garena ในหน้าแลกโค้ดด้วยตัวคุณเอง แล้วกดบุ๊กมาร์กอีกครั้ง'
      : st === 'none' ? 'หน้านั้นไม่ได้รับคิว — กด "เปิดหน้าแลกโค้ด" อีกครั้ง' : 'แถบสีทองขึ้นบนหน้าแลกโค้ด = ตัวช่วยทำงานแล้ว';
    const at = H.total ? ' (' + H.done + '/' + H.total + ')' : '';
    $('#hp-live').textContent =
      H.paused ? '⏸ พักชั่วคราวในหน้าแลกโค้ด'
      : st === 'filled' ? 'ใส่โค้ด ' + H.code + ' ให้แล้ว' + at + ' — ' + (H.auto ? 'กำลังกดยืนยันอัตโนมัติ…' : 'กด "ยืนยัน · ไปแลก" ในหน้าแลกโค้ด')
      : st === 'wait' ? 'ส่ง ' + H.code + ' แล้ว รอคำตอบ…'
      : st === 'pause' ? 'หน้าแลกโค้ดตอบว่า: "' + H.text + '" — จดแล้ว' + at + ' · โค้ดถัดไปในอีก ' + H.sec + ' วินาที'
      : st === 'ask' ? 'หน้าแลกโค้ดตอบว่า: "' + H.text + '" — เลือก "ใส่โค้ดนี้อีกครั้ง" หรือ "ข้าม" ในหน้าแลกโค้ด'
      : st === 'done' ? 'หมดคิวแล้ว' + at + ' — อนุมัติโค้ดเพิ่มแล้วกด "เปิดหน้าแลกโค้ด" อีกครั้งได้'
      : 'ตัวช่วยใส่โค้ด กดยืนยัน อ่านคำตอบ จดผล พัก แล้วใส่โค้ดถัดไป วนอัตโนมัติจนหมดคิว';
  });
}

// The bookmark: the helper's source (comment lines and indents taken out) with this page's addresses in it.
let bookmark = '';
fetch('fill-helper.js').then(r => r.text()).then(src => {
  const port = location.port ? ':' + location.port : '';
  const origins = [...new Set([location.origin, 'http://localhost' + port, 'http://127.0.0.1' + port])];
  const lean = src.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//')).join('\n');
  bookmark = 'javascript:' + encodeURIComponent('(' + lean + ')(' + JSON.stringify(origins) + ');void 0');
  $('#hp-bm').href = bookmark;
}).catch(() => { $('#hp-bm').textContent = 'โหลดตัวช่วยกรอกไม่ได้'; });

// Copying without the clipboard API (a page on http://192.168… is not given it): a field, selected.
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => copyOld(text));
  return Promise.resolve(copyOld(text));
}
function copyOld(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

function drawLan() {
  once('lan', S.lan, () => {
    const box = $('#lan-box');
    if (!S.lan.on) { box.innerHTML = 'ตอนนี้เปิดได้จากเครื่องนี้เท่านั้น — จะใช้บนมือถือ/แท็บเล็ต ให้ปิดเซิร์ฟเวอร์แล้วเปิดใหม่ด้วย <code>npm run web:lan</code>'; return; }
    box.innerHTML = S.lan.urls.length
      ? 'เปิดลิงก์นี้บนมือถือ/แท็บเล็ต (ต่อ Wi-Fi เดียวกับคอมเครื่องนี้):' + S.lan.urls.map(u => `<div class="lan-url"><code>${esc(u)}</code><button class="btn mini" data-copy="${esc(u)}">คัดลอก</button></div>`).join('')
      : 'เปิดให้เครื่องอื่นเข้าแล้ว แต่คอมเครื่องนี้ยังไม่ได้ต่อเครือข่าย';
  });
}

function formatNote(n) {
  if (!n) return '';
  return esc(n)
    .replace(/\[สกินปืน\]/g, '<span class="tag m">สกินปืน</span> ')
    .replace(/\[ตัวละคร\]/g, '<span class="tag" style="color:#6fd08c;border-color:#2f6a43">ตัวละคร</span> ')
    .replace(/\[จีน CN\]/g, '<span class="tag" style="color:#e9b949;border-color:#8a6a23">จีน CN</span> ')
    .replace(/\[Garena\]/g, '<span class="tag" style="color:#6fb8e0;border-color:#2d5a73">Garena</span> ')
    .replace(/\[Global\]/g, '<span class="tag" style="color:#c594f7;border-color:#5c3580">Global</span> ')
    .replace(/\[เสบียงแรร์\]/g, '<span class="tag" style="color:#ef6b5e;border-color:#7a3a33">เสบียงแรร์</span> ')
    .replace(/\[เสบียง\]/g, '<span class="tag" style="color:#b9d3a4;border-color:#3c5030">เสบียง</span> ')
    .replace(/\[อาวุธ\]/g, '<span class="tag" style="color:#f0a04b;border-color:#7a5424">อาวุธ</span> ');
}

// ── the list ──────────────────────────────────────────────
function drawCodes() {
  const c = S.codes;
  once('codes', [c, filter, S.job.running, S.mode], () => {
    $('#filters').innerHTML = GROUPS.map(g => `<button class="fchip ${filter === g[0] ? 'on' : ''}" data-f="${g[0]}">${g[1]}<b>${c.filter(g[2]).length}</b></button>`).join('') +
      (c.some(e => e.status === 'found') ? '<button class="btn mini" data-mark="approve" data-code="*">อนุมัติทั้งหมดที่พบ</button>' : '');
    const rows = c.filter(GROUPS.find(g => g[0] === filter)[2]);
    $('#code-rows').innerHTML = rows.map(e => {
      const b = (to, text) => `<button class="btn mini ${to === 'approve' ? 'gold' : 'ghost'}" data-mark="${to}" data-code="${esc(e.code)}">${text}</button>`;
      const act = e.status === 'found' ? b('approve', 'อนุมัติ') + ' ' + b('skip', 'ข้าม')
        : ['new', 'early', 'retry'].includes(e.status) ? (S.mode === 'manual' ? `<button class="btn mini" data-pick="${esc(e.code)}">แลกตัวนี้</button> ` : '') + b('skip', 'ข้าม')
        : ['failed', 'skip'].includes(e.status) || (S.mode === 'manual' && ['ok', 'used', 'expired', 'invalid', 'gone'].includes(e.status)) ? b('again', 'เข้าคิวใหม่') : '';
      return `<tr><td class="code">${esc(e.code)}</td><td><span class="badge s-${e.status}">${LABEL[e.status] || e.status}</span></td>` +
        `<td class="note">${formatNote(e.note)}</td><td class="when">${time(e.triedAt || e.addedAt)}</td><td class="src" title="${esc((e.seen || []).join('\n'))}">${esc(e.source === 'manual' ? 'เพิ่มเอง' : e.source)}${e.seen && e.seen.length > 1 ? ` <b class="more">+${e.seen.length - 1} แหล่ง</b>` : ''}</td><td class="act">${act}</td></tr>`;
    }).join('');
    $('#code-empty').hidden = rows.length > 0;
    $('#code-empty').textContent = c.length ? 'ไม่มีโค้ดในกลุ่มนี้' : 'ยังไม่มีโค้ดในรายการ — วางโค้ดในช่องด้านบน';
    $('#count-line').textContent = c.length + ' โค้ด · โค้ดผิดวันนี้ ' + S.invalidToday + '/' + S.cfg.maxInvalidPerDay;
  });
  once('cfg', [S.cfg, S.invalidToday, S.game], () => {
    const k = S.cfg;
    $('#cfg').innerHTML = [
      ['แลกโค้ดที่', S.redeem === 'web' && k.portal ? `<a href="${esc(k.portal)}" target="_blank" rel="noopener">${esc(new URL(k.portal).host)}</a>` : 'ในตัวเกม'],
      ...k.sources.map(s => ['เฝ้า: ' + esc(s.name), s.enabled ? (s.auto ? 'เปิด · แลกเอง' : 'เปิด · ต้องอนุมัติ') : 'ปิด'])
    ].map(r => `<div><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
  });
  once('auto', S.auto, () => {
    $('#auto-on').checked = S.auto.on;
    if (S.auto.on) $('#auto-every').value = String(S.auto.everyMin);
    $('#auto-next').textContent = S.auto.on && S.auto.nextAt ? '· รอบถัดไป ' + new Date(S.auto.nextAt).toLocaleTimeString(TH, { hour: '2-digit', minute: '2-digit' }) : '';
  });
}

// ── tournaments ───────────────────────────────────────────
function drawEvents() {
  const now = new Date(S.now);
  once('events', [S.events, now.toDateString()], () => {
    const card = (ev, p) => `<div class="ev ${p.k}">
      <span class="when">${range(ev.start, ev.end)}</span>
      <h3>${ev.unsure ? '⚠ ' : ''}${esc(ev.name)}</h3>
      <span class="count">${esc(p.text)}</span>
      <div class="tags">${[ev.mode && ['m', ev.mode], ev.platform && ['m', ev.platform], ev.region && ['', ev.region], ev.teams && ['', ev.teams], ev.prize && ['', ev.prize]].filter(Boolean).map(t => `<span class="tag ${t[0]}">${esc(t[1])}</span>`).join('')}</div>
      ${ev.where ? `<p>${esc(ev.where)}</p>` : ''}
      ${ev.result ? `<p class="res">🏆 ${esc(ev.result)}</p>` : ''}
      ${ev.note ? `<p>${esc(ev.note)}</p>` : ''}
      ${(ev.watch || []).length ? `<div class="links">${ev.watch.map(w => `<a href="${esc(w.url)}" target="_blank" rel="noopener">▶ ${esc(w.label)}</a>`).join('')}</div>` : ''}
    </div>`;
    const all = S.events.map(ev => ({ ev, p: phase(ev, now) }));
    const live = all.filter(x => x.p.k !== 'past').sort((a, b) => (a.p.k === 'live' ? 0 : 1) - (b.p.k === 'live' ? 0 : 1) || (a.ev.end < b.ev.end ? -1 : 1));
    const past = all.filter(x => x.p.k === 'past').sort((a, b) => a.ev.end < b.ev.end ? 1 : -1);
    $('#ev-live').innerHTML = live.map(x => card(x.ev, x.p)).join('') || '<p class="empty">ยังไม่มีรายการที่ประกาศ</p>';
    $('#ev-past').innerHTML = past.map(x => card(x.ev, x.p)).join('');
    $('#ev-asof').textContent = 'วันนี้ ' + now.toLocaleDateString(TH, { day: 'numeric', month: 'long', year: 'numeric' });
  });
}

// ── the guide (PRO-GUIDE.md) ──────────────────────────────
function md(src) {
  const inline = t => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => /^https?:/.test(url) ? `<a href="${url}" target="_blank" rel="noopener">${label}</a>` : label)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const L = src.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0, h = 0;
  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }
    if (/^```/.test(l)) { const buf = []; i++; while (i < L.length && !/^```/.test(L[i])) buf.push(L[i++]); i++; out.push('<pre class="console">' + esc(buf.join('\n')) + '</pre>'); continue; }
    if (/^---+\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    const hd = /^(#{1,4})\s+(.*)$/.exec(l);
    if (hd) { const n = hd[1].length; out.push(`<h${n}${n === 2 ? ` id="g-${++h}"` : ''}>${inline(hd[2])}</h${n}>`); i++; continue; }
    if (/^>/.test(l)) { const buf = []; while (i < L.length && /^>/.test(L[i])) buf.push(L[i++].replace(/^>\s?/, '')); out.push('<blockquote><p>' + inline(buf.join(' ')) + '</p></blockquote>'); continue; }
    // a picture on a line of its own: ![caption](https://…) — shown from where it is, never copied here.
    // ![caption](https://… "9.8 MB") is a heavy one: a button, and the picture only when it is asked for.
    const pic = /^!\[([^\]]*)\]\((https:\/\/[^)\s]+)(?:\s+"([^"]*)")?\)\s*$/.exec(l);
    if (pic) {
      out.push('<figure class="shot">' + (pic[3]
        ? `<button class="btn shot-tap" data-shot="${esc(pic[2])}">🖼 แตะเพื่อดูภาพ <small>${esc(pic[3])}</small></button>`
        : `<img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${esc(pic[2])}" alt="">`) + `<figcaption>${esc(pic[1])}</figcaption></figure>`);
      i++; continue;
    }
    if (/^\|/.test(l) && /^\|?\s*:?-{2,}/.test(L[i + 1] || '')) {
      const head = cells(l); i += 2; const rows = [];
      while (i < L.length && /^\|/.test(L[i])) rows.push(cells(L[i++]));
      out.push('<div class="tw"><table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
    const li = /^\s*([*-]|\d+\.)\s+(.*)$/.exec(l);
    if (li) {
      const tag = /\d/.test(li[1]) ? 'ol' : 'ul', items = [];
      while (i < L.length) {
        const m = /^\s*([*-]|\d+\.)\s+(.*)$/.exec(L[i]);
        if (m) { items.push(m[2]); i++; }
        else if (L[i].trim() && /^\s{2,}/.test(L[i]) && items.length) { items[items.length - 1] += ' ' + L[i].trim(); i++; }
        else break;
      }
      out.push(`<${tag}>` + items.map(t => `<li>${inline(t)}</li>`).join('') + `</${tag}>`);
      continue;
    }
    const buf = [];
    while (i < L.length && L[i].trim() && !/^(#{1,4}\s|>|\||```|---+\s*$|!\[[^\]]*\]\(https:|\s*([*-]|\d+\.)\s)/.test(L[i])) buf.push(L[i++]);
    out.push('<p>' + inline(buf.join(' ')) + '</p>');
  }
  return out.join('\n');
}

let guideLoaded = false;
async function loadGuide() {
  if (guideLoaded) return;
  guideLoaded = true;
  try {
    let text = '';
    const guideUrl = isStaticMode ? (game === 'deltaforce' ? 'PRO-GUIDE.md' : game.toUpperCase() + '-GUIDE.md') : ('/api/guide?game=' + encodeURIComponent(game));
    const r = await fetch(guideUrl);
    if (r.ok) text = await r.text();
    else {
      const alt = game === 'deltaforce' ? 'PRO-GUIDE.md' : game.toUpperCase() + '-GUIDE.md';
      text = await (await fetch(alt)).text();
    }
    // the file's own list of contents is replaced by the one at the side
    $('#guide').innerHTML = md(text.replace(/## สารบัญ[\s\S]*?\n---\n/, ''));
    $('#toc').innerHTML = $$('#guide h2').map(h => `<a href="#${h.id}">${esc(h.textContent)}</a>`).join('');
  } catch (e) { guideLoaded = false; $('#guide').textContent = 'โหลดคู่มือไม่ได้: ' + e.message; }
}

// ── tabs ──────────────────────────────────────────────────
function show(tab) {
  if (!$('#page-' + tab)) tab = 'codes';
  $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $$('.page').forEach(p => p.classList.toggle('on', p.id === 'page-' + tab));
  const strip = $('.tabs'), on = $('.tab.on');             // on a phone the row of tabs is wider than the screen
  if (strip && on) strip.scrollLeft += on.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - on.offsetWidth) / 2;
  if (tab === 'guide') loadGuide();
}

// ── the loop ──────────────────────────────────────────────
async function refresh() {
  clearTimeout(timer);
  try {
    try { S = await api('/api/state'); }
    catch (e) { if (game === 'deltaforce') throw e; game = 'deltaforce'; S = await api('/api/state'); }   // a game that is no longer in config.json
    if (offline) { offline = false; drawn = {}; $('#job-title').textContent = 'ยังไม่ได้สั่งงาน'; }   // the server is back (it may be a new one)
    document.body.dataset.mode = S.mode;
    drawChips(); drawManual(); drawHelper(); drawLan(); drawJob(); drawCodes(); drawEvents();
  } catch (e) {
    offline = true;
    $('#job-title').textContent = 'ต่อกับเซิร์ฟเวอร์ไม่ได้ — เปิดด้วย `npm run web` อยู่หรือเปล่า';
  }
  timer = setTimeout(refresh, S && S.job.running ? 1000 : 5000);
}

function say(text, kind) { const el = $('#add-msg'); el.textContent = text; el.className = 'hint ' + (kind || ''); }

async function addCodes(run) {
  const text = $('#code-input').value.trim();
  if (!text) { say('วางโค้ดก่อน', 'bad'); $('#code-input').focus(); return; }
  try {
    const r = await api('/api/add', { text, run });
    const n = k => r.out.filter(o => o.result === k).length;
    const parts = [];
    if (n('added') + n('approved')) parts.push('เพิ่ม ' + (n('added') + n('approved')) + ' โค้ด');
    if (n('exists')) parts.push('มีอยู่แล้ว ' + n('exists'));
    if (n('invalid')) parts.push('รูปแบบไม่ใช่โค้ด ' + n('invalid') + ' (' + r.out.filter(o => o.result === 'invalid').map(o => o.code).join(', ') + ')');
    if (run && !r.started && n('added') + n('approved')) parts.push('มีงานอื่นทำอยู่ — เข้าคิวไว้แล้ว');
    say(parts.join(' · '), n('invalid') ? 'bad' : 'ok');
    if (!n('invalid')) $('#code-input').value = '';
    filter = 'all';
  } catch (e) { say(e.message, 'bad'); }
  refresh();
}

document.addEventListener('click', async ev => {
  const t = ev.target.closest('button'); if (!t) return;
  if (t.dataset.tab) { location.hash = t.dataset.tab; return; }
  if (t.dataset.game) return switchGame(t.dataset.game);
  if (t.dataset.shot) {                           // a heavy picture of a page, asked for
    const img = document.createElement('img');
    img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.alt = ''; img.src = t.dataset.shot;
    return t.replaceWith(img);
  }
  if (t.dataset.f) { filter = t.dataset.f; drawCodes(); return; }
  if (t.id === 'mq-copy') return copyCode();
  if (t.id === 'hp-open') return openPortal();
  if (t.id === 'hp-copybm') {
    const ok = bookmark && await copyText(bookmark);
    t.textContent = ok ? 'คัดลอกแล้ว ✓' : 'คัดลอกเองจากช่องด้านล่าง ↓';
    setTimeout(() => { t.textContent = 'คัดลอกโค้ดบุ๊กมาร์ก'; }, 3500);
    if (!ok && bookmark) {                         // the browser would not copy for us: the code itself, to copy by hand
      const box = $('#hp-bmtext');
      $('.mobile-how').open = true;
      box.hidden = false; box.value = bookmark;
      box.focus(); box.select(); box.setSelectionRange(0, bookmark.length);
      box.scrollIntoView({ block: 'center' });
    }
    return;
  }
  if (t.dataset.copy) { const ok = await copyText(t.dataset.copy); t.textContent = ok ? 'คัดลอกแล้ว ✓' : 'คัดลอกไม่ได้'; setTimeout(() => { t.textContent = 'คัดลอก'; }, 2000); return; }
  if (t.dataset.pick) { picked = t.dataset.pick; drawManual(); $('.panel.manual').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (t.dataset.res) {                          // what the redemption page answered for the code on show
    const code = current(); if (!code) return;
    await api('/api/mark', { code, to: t.dataset.res }).catch(e => say(e.message, 'bad'));
    picked = null;
    return refresh();
  }
  if (t.dataset.job) { await api('/api/job', { cmd: t.dataset.job }).catch(e => say(e.message, 'bad')); return refresh(); }
  if (t.dataset.mark) { await api('/api/mark', { code: t.dataset.code, to: t.dataset.mark }).catch(e => say(e.message, 'bad')); return refresh(); }
  if (t.id === 'btn-add') return addCodes(false);
  if (t.id === 'btn-add-run') return addCodes(true);
});
$('#hp-bm').addEventListener('click', ev => { ev.preventDefault(); $('#hp-bm').textContent = 'ลากไปวางบนแถบบุ๊กมาร์ก (อย่าคลิก)'; setTimeout(() => { $('#hp-bm').textContent = 'DF ช่วยกรอก'; }, 2500); });
const setAuto = () => api('/api/auto', { on: $('#auto-on').checked, everyMin: Number($('#auto-every').value) }).then(refresh, e => say(e.message, 'bad'));
$('#auto-on').addEventListener('change', setAuto);
if ($('#hp-auto')) {
  try { if (localStorage.getItem('df-auto') === '0') $('#hp-auto').checked = false; } catch (e) {}
  $('#hp-auto').addEventListener('change', () => { try { localStorage.setItem('df-auto', $('#hp-auto').checked ? '1' : '0'); } catch (e) {} });
}
$('#code-input').addEventListener('keydown', ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) addCodes(true); });
window.addEventListener('hashchange', async () => { if (await takeResults()) { await refresh(); return show('codes'); } show(location.hash.slice(1)); });
$$('#toc').forEach(toc => toc.addEventListener('click', ev => {
  const a = ev.target.closest('a'); if (!a) return;
  ev.preventDefault();                       // the hash belongs to the tabs
  const h = document.getElementById(a.getAttribute('href').slice(1)); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));

if (/[?&]k=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);
takeResults().then(() => { show(location.hash.slice(1) || 'codes'); refresh(); });
