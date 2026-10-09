'use strict';
// node test/run.js — the whole flow against the stand-in page (test/mock-portal.js), with a
// browser profile and a code list of their own in a temporary folder. Nothing here touches
// Garena or the real data/ folder.

const fs = require('fs');
const os = require('os');
const path = require('path');
const mock = require('./mock-portal');

let pass = 0, fail = 0;
const check = (name, ok, extra) => { ok ? pass++ : fail++; console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok || extra === undefined ? '' : '  → ' + JSON.stringify(extra))); };

(async () => {
  const m = await mock.start(0);
  const base = 'http://127.0.0.1:' + m.port;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deltafore-test-'));
  const cfgFile = path.join(tmp, 'config.json');
  const writeCfg = more => fs.writeFileSync(cfgFile, JSON.stringify(Object.assign({
    mode: 'auto', portal: base + '/th/cdkgarena.html', headless: true, delayBetweenCodesSec: [0.2, 0.3], loginWaitMin: 0.2,
    maxInvalidPerDay: 5, maxTriesPerCode: 2,
    sources: [{ name: 'mock', url: base + '/codes.html' }, { name: 'blocked', url: base + '/blocked.html' }, { name: 'off', url: base + '/codes.html', enabled: false }],
    games: { rov: { name: 'RoV', redeem: 'ingame', words: true, how: 'in the game', sources: [{ name: 'mockrov', url: base + '/codes.html' }] } }
  }, more)));
  writeCfg();
  process.env.DF_DATA_DIR = tmp;
  process.env.DF_CONFIG = cfgFile;

  const store = require('../redeem/store');
  const sources = require('../redeem/sources');
  const cli = require('../redeem');
  const { Portal } = require('../redeem/portal');
  const { open, sleep } = require('../redeem/cdp');
  const quiet = fn => { const log = console.log; console.log = () => {}; return Promise.resolve().then(fn).finally(() => { console.log = log; }); };
  const status = code => (store.find(store.load(), code) || {}).status;

  console.log('codes on a page');
  const got = sources.extract(fs.readFileSync(path.join(__dirname, 'mock-portal.js'), 'utf8').match(/const CODES = `([\s\S]*?)`;/)[1]);
  check('finds the four live ones', ['GARENADF2610A', 'DFTH-8K2Q9', 'HAWKOPS77', 'DELTA4EVER'].every(c => got.includes(c)), got);
  check('leaves out script text, devices, dates, the row marked expired', !got.some(c => /SCRIPT9999|IPHONE17|20261009|ANDROID14|OCTOBER|120FPS|XMAS2025GIFT/.test(c)), got);
  const mixed = sources.extract('<h2>Active codes</h2><ul><li><code>DFWizard309</code> - ticket</li><li><strong>fvzeLrxYajwVviFSTSZ</strong></li><li>PlayStation5 owners</li></ul><h2>Expired codes</h2><ul><li>OLDCODE2025</li></ul><h2>How to redeem</h2><p>Use code: LATER2026A</p>');
  check('mixed-case codes are read, a section headed expired is not, the page after it is', mixed.join() === 'DFWizard309,fvzeLrxYajwVviFSTSZ,LATER2026A', mixed);
  check('a prefix filter keeps only its own', sources.extract('<li>GARENADF2610A</li><li>HAWKOPS77</li>', '^GARENA').join() === 'GARENADF2610A');

  console.log('the list');
  await quiet(() => cli.cmdAdd(['GOOD1', ' USED1 ', 'OLD1', 'BAD1', 'SOON1', 'FULL1', 'NET1', 'good1', 'a b', '!!']));
  check('seven codes, no duplicate in another letter case, junk refused', Object.keys(store.load().codes).length === 7, Object.keys(store.load().codes));

  const order = store.pending({ codes: {
    A: { code: 'A', status: 'new', source: 'Global · x', seen: ['Global · x', 'Global · y'], addedAt: '1', tries: 0 },
    B: { code: 'B', status: 'new', source: 'Garena VN · z', seen: ['Garena VN · z'], addedAt: '2', tries: 0 },
    C: { code: 'C', status: 'new', source: 'manual', addedAt: '3', tries: 0 },
    D: { code: 'D', status: 'found', source: 'manual', addedAt: '0', tries: 0 }
  } }, 9).map(e => e.code).join('');
  check('queue order: typed codes, then Garena pages, then Global pages', order === 'CBA', order);

  console.log('more than one game');
  await quiet(() => cli.main(['--game', 'rov', 'add', 'ROVCODE1']));
  delete process.env.DF_GAME;                               // the command line names the game for one process; this one goes on
  check('a game keeps a list of its own, in a file of its own', !!store.find(store.load('rov'), 'ROVCODE1') && !store.find(store.load(), 'ROVCODE1') && fs.existsSync(path.join(tmp, 'codes-rov.json')));
  let refused = false; try { store.config('nosuch'); } catch (e) { refused = true; }
  check('a game that is not in the config is refused', refused);
  check('a game redeemed in the game itself: never the automatic mode, its own pages', store.config('rov').mode === 'manual' && store.config('rov').redeem === 'ingame' && store.config('rov').sources[0].name === 'mockrov' && store.config().sources[0].name === 'mock');
  check('the list of games names both', store.config().games.map(x => x.id + ':' + x.redeem).join() === 'deltaforce:web,rov:ingame');
  check('codes that are plain capital words: read for a game marked "words" only', sources.extract('<li>SEAMONSTER</li><li>FACEBOOK</li><li>short</li>', null, true).join() === 'SEAMONSTER' && sources.extract('<li>SEAMONSTER</li>').length === 0);

  console.log('not signed in');
  check('status says so', await quiet(() => cli.cmdStatus(store.config())) === 2);
  let r = await quiet(() => cli.cmdRun(store.config(), { unattended: true }));
  check('run stops and sends nothing', r.needLogin === true && m.hits.length === 0, { r, hits: m.hits });
  check('codes still waiting', status('GOOD1') === 'new');

  console.log('signing in (the stand-in page: one button)');
  let s = await open({ profileDir: store.config().profileDir, headless: true });
  let portal = new Portal(s, store.config());
  let st = await portal.open();
  check('page ready, signed out', st.ready && !st.loggedIn, st);
  await portal.clickSignIn();
  await s.until(`location.pathname === '/sso' && !!document.querySelector('#mock-login')`, 8000);
  await s.eval(`document.querySelector('#mock-login').click()`);
  st = await portal.waitLogin(0.3);
  check('back on the page, signed in as Tester01', !!st && st.loggedIn && st.username === 'Tester01', st);
  check('the session cookie got a date', await portal.keepLogin() === 1);
  await s.close();
  check('still signed in after the browser was closed', await quiet(() => cli.cmdStatus(store.config())) === 0);

  console.log('a run');
  r = await quiet(() => cli.cmdRun(store.config(), { unattended: true }));
  check('seven sent, one success', r.sent === 7 && r.ok === 1 && m.hits.length === 7, { r, hits: m.hits });
  const want = { GOOD1: 'ok', USED1: 'used', OLD1: 'expired', BAD1: 'invalid', SOON1: 'early', FULL1: 'gone', NET1: 'retry' };
  for (const c in want) check(c + ' → ' + want[c], status(c) === want[c], status(c));
  check('code typed exactly as given', m.hits.join() === 'GOOD1,USED1,OLD1,BAD1,SOON1,FULL1,NET1', m.hits);
  check('log written', fs.readFileSync(path.join(tmp, 'redeem.log'), 'utf8').includes('GOOD1 ok api=0'));

  m.hits.length = 0;
  r = await quiet(() => cli.cmdRun(store.config(), { unattended: true }));
  check('second run sends only the two that may be tried again', m.hits.join() === 'SOON1,NET1', m.hits);
  check('no answer twice → failed; not open yet → still waiting', status('NET1') === 'failed' && status('SOON1') === 'early', [status('NET1'), status('SOON1')]);

  console.log('the daily limit on wrong codes');
  await quiet(() => cli.cmdMark(['SOON1'], ['early'], 'skip'));
  writeCfg({ maxInvalidPerDay: 3 });
  await quiet(() => cli.cmdAdd(['BADX2', 'BADX3', 'BADX4', 'BADX5']));
  m.hits.length = 0;
  r = await quiet(() => cli.cmdRun(store.config(), { unattended: true }));
  check('stops at the third wrong code of the day', r.capped === true && m.hits.length === 2, { r, hits: m.hits });
  m.hits.length = 0;
  r = await quiet(() => cli.cmdRun(store.config(), { unattended: true }));
  check('and opens no browser for the rest of the day', r.capped === true && m.hits.length === 0, { r, hits: m.hits });
  await quiet(() => cli.cmdMark(['BADX4', 'BADX5'], ['new'], 'skip'));
  writeCfg({ maxInvalidPerDay: 50 });

  console.log('sign-in runs out in the middle');
  await quiet(() => cli.cmdAdd(['KICK1', 'GOOD2']));
  m.hits.length = 0;
  r = await quiet(() => cli.cmdRun(store.config(), { unattended: true }));
  check('run stops, asks for sign-in', r.needLogin === true && m.hits.join() === 'KICK1', { r, hits: m.hits });
  check('neither code is used up', status('KICK1') === 'new' && status('GOOD2') === 'new', [status('KICK1'), status('GOOD2')]);

  console.log('manual mode (the default): no browser, results reported by hand');
  writeCfg({ mode: 'manual' });
  m.hits.length = 0;
  check('commands that drive a browser are refused', await quiet(() => cli.main(['run'])) === 3 && await quiet(() => cli.main(['login'])) === 3 && await quiet(() => cli.main(['status'])) === 3 && m.hits.length === 0, m.hits);
  await quiet(() => cli.main(['now', 'HAND1', 'HAND2']));
  check('"now" only puts codes in the queue', status('HAND1') === 'new' && status('HAND2') === 'new' && m.hits.length === 0);
  check('a result reported by hand is kept', await quiet(() => cli.main(['result', 'HAND1', 'ok'])) === 0 && status('HAND1') === 'ok');
  check('only a known result, only for a code still waiting', await quiet(() => cli.main(['result', 'HAND1', 'expired'])) === 1 && await quiet(() => cli.main(['result', 'HAND2', 'won'])) === 1 && status('HAND1') === 'ok' && status('HAND2') === 'new');
  const noMode = Object.assign({}, JSON.parse(fs.readFileSync(cfgFile, 'utf8'))); delete noMode.mode;
  fs.writeFileSync(cfgFile, JSON.stringify(noMode));
  check('a config without a mode is manual', store.config().mode === 'manual');
  writeCfg();

  console.log('watched pages');
  const fresh = await quiet(() => cli.cmdScan(store.config()));
  check('four found, a refused page does not stop the scan', fresh === 4, fresh);
  check('found codes wait for approval and name their page', status('GARENADF2610A') === 'found' && store.find(store.load(), 'GARENADF2610A').seen.join() === 'mock' && store.pending(store.load(), 3).every(e => e.source === 'manual'));
  check('a second scan adds nothing', await quiet(() => cli.cmdScan(store.config())) === 0);
  await quiet(() => cli.cmdMark(['GARENADF2610A'], ['found'], 'new'));
  check('approve puts one in the queue', status('GARENADF2610A') === 'new' && status('HAWKOPS77') === 'found');

  console.log('the fill helper (web/public/fill-helper.js, inside the stand-in page)');
  s = await open({ profileDir: store.config().profileDir, headless: true });
  portal = new Portal(s, store.config());
  await portal.open();
  await portal.clickSignIn();
  await s.until(`location.pathname === '/sso' && !!document.querySelector('#mock-login')`, 8000);
  await s.eval(`document.querySelector('#mock-login').click()`);
  await portal.waitLogin(0.3);
  const helperSrc = fs.readFileSync(path.join(__dirname, '../web/public/fill-helper.js'), 'utf8').trim();
  const ROOM = 'http://localhost:4310';
  const enc = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const dec = str => JSON.parse(Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  // the bookmark, pressed: the helper is put into the page; what it posts to the window that opened the page is collected
  const bookmark = () => s.eval(`window.__out = window.__out || []; window.opener = window.opener || { closed: false, postMessage: (msg, to) => window.__out.push(Object.assign({ to }, msg)) }; (${helperSrc})([${JSON.stringify(ROOM)}]); 1`);
  const results = () => s.eval(`window.__out.splice(0).filter(x => x.type === 'result')`);
  const bar = () => s.eval(`({ line: document.querySelector('#df-line').textContent, go: document.querySelector('#df-go').style.display !== 'none', again: document.querySelector('#df-again').style.display !== 'none',
    back: document.querySelector('#df-back').style.display !== 'none' ? document.querySelector('#df-back').href : '', value: document.querySelector('.exc-input').value, hash: location.hash })`);
  const filled = (c, ms) => s.until(`document.querySelector('.exc-input').value === ${JSON.stringify(c)} && document.querySelector('#df-go').style.display !== 'none'`, ms || 8000);
  const confirm = async own => { const at = Date.now(); await s.eval(`document.querySelector(${JSON.stringify(own ? '.btn-exchange' : '#df-go')}).click(); 1`); await sleep(800); return at; };   // the player's part

  await bookmark();
  let b = await bar();
  check('no queue in the address: says so, fills nothing', /ยังไม่มีคิว/.test(b.line) && b.value === '' && !b.go, b);

  m.hits.length = 0;
  const QUEUE = ['GOOD2', 'USED1', 'OLD1', 'BAD1', 'SOON1', 'FULL1', 'ODD1', 'NET1'];
  await s.eval(`location.hash = '#df=' + ${JSON.stringify(enc({ q: QUEUE.concat(['not a code', '!!']), d: 3, b: ROOM + '/' }))}; 1`);
  check('a queue arrives: the first code is put in the field', !!(await filled('GOOD2')));
  b = await bar();
  check('the queue is taken out of the address, the confirm button is on show', b.hash === '' && b.go && /ยืนยัน/.test(b.line), b);
  await sleep(1500);
  check('and nothing is sent until the player confirms', m.hits.length === 0 && (await results()).length === 0, m.hits);

  let t0 = await confirm(false);
  r = await results();
  check('confirmed: sent once, the page\'s answer is filed as "ok"', m.hits.join() === 'GOOD2' && r.length === 1 && r[0].code === 'GOOD2' && r[0].status === 'ok' && r[0].to === ROOM, { hits: m.hits, r });
  b = await bar();
  check('then a pause, counted down', /โค้ดถัดไปในอีก \d+ วินาที/.test(b.line) && !b.go, b);

  // the page is reloaded in the middle: the bookmark again, and the queue goes on where it was
  await s.eval(`location.reload(); 1`);
  await sleep(600);
  await s.until(`document.readyState === 'complete' && !!document.querySelector('.exc-input') && !window.__dfHelper`, 8000);
  await bookmark();
  check('after a reload the queue goes on with the next code, not from the start', !!(await filled('USED1')) && m.hits.join() === 'GOOD2', m.hits);

  const expect = { USED1: 'used', OLD1: 'expired', BAD1: 'invalid', SOON1: 'early', FULL1: 'gone' };
  let own = true, gaps = [];
  for (const c in expect) {
    await filled(c, 9000);
    gaps.push(Date.now() - t0);
    t0 = await confirm(own); own = !own;                  // the page's own button and the helper's, in turn
    r = await results();
    check(c + ' → ' + expect[c], r.length === 1 && r[0].code === c && r[0].status === expect[c], r);
  }
  check('about three seconds between an answer and the next code', gaps.slice(1).every(g => g >= 2700 && g < 6500), gaps);

  await filled('ODD1', 9000);
  await confirm(false);
  r = await results(); b = await bar();
  check('an answer it does not know: nothing filed, the player is asked', r.length === 0 && b.again && /ข้อความที่ไม่มีในตาราง/.test(b.line), { r, b });
  await s.eval(`document.querySelector('#df-again').click(); 1`);
  check('"again" puts the same code back', !!(await filled('ODD1', 3000)));
  await s.eval(`window.setSuperTips('หมดเวลาแลก CDKey แล้ว'); 1`);
  await sleep(300);
  check('a message on the page before the confirm is not taken for the answer', (await results()).length === 0 && (await bar()).go);
  await s.eval(`document.querySelector('#df-skip').click(); 1`);
  check('"skip" goes straight to the next code', !!(await filled('NET1', 3000)));
  await confirm(true);
  b = await bar();
  check('a network error is not filed either', (await results()).length === 0 && b.again, b);
  await s.eval(`document.querySelector('#df-skip').click(); 1`);
  await sleep(400);
  b = await bar();
  const sentBack = b.back.startsWith(ROOM + '/#res=') ? dec(b.back.split('#res=')[1]) : null;
  check('queue done: the link back carries the six results', /หมดคิวแล้ว/.test(b.line) && !!sentBack && JSON.stringify(sentBack.r) === JSON.stringify([['GOOD2', 'ok'], ['USED1', 'used'], ['OLD1', 'expired'], ['BAD1', 'invalid'], ['SOON1', 'early'], ['FULL1', 'gone']]), { b, sentBack });
  check('each code was sent once, the two that are not codes never', m.hits.join() === 'GOOD2,USED1,OLD1,BAD1,SOON1,FULL1,ODD1,NET1', m.hits);

  await s.eval(`location.hash = '#df=' + ${JSON.stringify(enc({ q: ['GOOD2'], d: 3, b: 'https://evil.example/' }))}; 1`);
  await filled('GOOD2', 3000);
  check('a queue naming another site as the way back: no link back', (await bar()).back === '');
  await s.eval(`document.querySelector('#btn-logout').click(); location.hash = '#df=' + ${JSON.stringify(enc({ q: ['GOOD1'], d: 3, b: ROOM + '/' }))}; 1`);
  await sleep(500);
  b = await bar();
  check('signed out: asks for the sign-in, shows no confirm button', /เข้าสู่ระบบ/.test(b.line) && !b.go, b);

  // auto-confirm mode: sent automatically without clicking confirm
  await s.eval(`document.querySelector('.main-box .btn-signin') ? document.querySelector('.main-box .btn-signin').click() : 0; 1`);
  await s.until(`location.pathname === '/sso' && !!document.querySelector('#mock-login')`, 8000).catch(() => {});
  if (await s.eval(`!!document.querySelector('#mock-login')`)) {
    await s.eval(`document.querySelector('#mock-login').click()`);
    await s.until(`location.pathname.endsWith('/cdkgarena.html') && document.querySelector('.state-after').classList.contains('show')`, 8000);
    await bookmark();
    m.hits.length = 0;
    await s.eval(`location.hash = '#df=' + ${JSON.stringify(enc({ q: ['GOOD1'], d: 3, b: ROOM + '/', a: 1 }))}; 1`);
    await sleep(2500);
    check('auto-confirm: code sent automatically without manual click', m.hits.includes('GOOD1'), m.hits);
  }
  await s.close();

  m.server.close();
  await sleep(300);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* the browser may still hold a file */ }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
