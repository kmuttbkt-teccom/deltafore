'use strict';
// node test/helper-e2e.js — the fill helper from end to end, in a real browser, against the
// demo (the stand-in redemption page; nothing here goes to Garena): the control room opens the
// page with the queue, the "bookmark" is pressed, the helper works through the queue in that
// tab while the test plays the player (signs in, confirms each code), the results must land in
// the list — live, and again through the link back, as on a phone. Then the --lan door: no key,
// no entry.

const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { open, attach, sleep } = require('../redeem/cdp');

const PORT = 4391;
const BASE = 'http://localhost:' + PORT;
let pass = 0, fail = 0;
const check = (name, ok, extra) => { ok ? pass++ : fail++; console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok || extra === undefined ? '' : '  → ' + JSON.stringify(extra))); };
const get = (url, headers) => new Promise(resolve => {
  const u = new URL(url);
  const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers: headers || {} }, res => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, cookie: (res.headers['set-cookie'] || [''])[0] })); });
  req.on('error', () => resolve({ status: 0, cookie: '' }));
  req.end();
});

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, '../web/server.js'), '--port', String(PORT), '--demo'], { stdio: 'ignore' });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'deltafore-e2e-'));
  let room = null, lan = null;
  try {
    const state = async () => (await fetch(BASE + '/api/state')).json();
    const mark = (code, to) => fetch(BASE + '/api/mark', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, to }) });
    for (let i = 0; i < 40; i++) { try { await state(); break; } catch (e) { await sleep(250); } }
    const first = await state();
    check('demo is in manual mode with six codes waiting', first.mode === 'manual' && first.queue.length === 6, first.queue);
    check('without --lan: not open to other devices, no phone link', first.lan.on === false && first.lan.urls.length === 0, first.lan);

    room = await open({ profileDir: profile, headless: true, url: BASE + '/' });
    await room.until(`!!document.querySelector('#hp-bm') && document.querySelector('#hp-bm').href.startsWith('javascript:') && document.body.dataset.mode === 'manual'`, 15000);
    const ui = () => room.eval(`({ state: document.querySelector('#hp-state').textContent, live: document.querySelector('#hp-live').textContent, s3: document.querySelector('#hp-s3').textContent,
      now: (document.querySelector('#hp-steps li.now') || { dataset: {} }).dataset.step || '' })`);
    const waitUi = async (test, ms) => { const end = Date.now() + ms; let u; do { u = await ui(); if (test(u)) return u; await sleep(300); } while (Date.now() < end); return u; };
    await room.eval(`document.querySelector('#hp-delay').value = '5'; if (document.querySelector('#hp-auto')) document.querySelector('#hp-auto').checked = false; 1`);
    check('the whole page drew (list, calendar) — no part stopped the rest', await room.eval(`document.querySelectorAll('#code-rows tr').length === 6 && document.querySelectorAll('#ev-live .ev, #ev-past .ev').length > 0`));

    // step 2: the page is opened from the control room (a real click, so the browser allows the window)
    await room.send('Runtime.evaluate', { expression: `document.querySelector('#hp-open').click()`, userGesture: true });
    let page = null;
    for (let i = 0; i < 40 && !page; i++) { await sleep(250); page = await attach(room.port, '/th/cdkgarena.html'); }
    check('the redemption page opens in a window of its own, the queue in its address', !!page && /#df=/.test(await page.eval(`location.href`)));
    let u = await waitUi(x => x.now === '3', 4000);
    check('control room: step 3 — waiting for the bookmark', u.now === '3' && /บุ๊กมาร์ก/.test(u.state), u);

    // step 3: the bookmark (its javascript: address is run in the page, as a press on it does)
    const bookmark = decodeURIComponent((await room.eval(`document.querySelector('#hp-bm').href`)).slice('javascript:'.length));
    const pressBookmark = () => page.eval(bookmark + ';1');
    await page.until(`!!document.querySelector('.exc-input')`, 8000);
    await pressBookmark();
    u = await waitUi(x => /เข้าสู่ระบบ/.test(x.state), 5000);
    check('not signed in: the control room says so, no code is put in', /เข้าสู่ระบบ/.test(u.state) && (await page.eval(`document.querySelector('.exc-input').value`)) === '', u);

    // the player signs in (the stand-in sign-in page), comes back, presses the bookmark again
    await page.eval(`document.querySelector('.main-box .btn-signin').click(); 1`);
    await page.until(`location.pathname === '/sso' && !!document.querySelector('#mock-login')`, 8000);
    await page.eval(`document.querySelector('#mock-login').click(); 1`);
    await page.until(`location.pathname.endsWith('/cdkgarena.html') && document.querySelector('.state-after').classList.contains('show')`, 8000);
    u = await waitUi(x => /บุ๊กมาร์ก/.test(x.state), 12000);
    check('the page was left and came back: the bookmark is asked for again', /บุ๊กมาร์ก/.test(u.state), u);
    await pressBookmark();

    // step 4, six times: the code arrives by itself, the player confirms, the answer is filed, a pause, the next
    const want = [['GOOD1', 'ok'], ['USED1', 'used'], ['OLD1', 'expired'], ['BAD1', 'invalid'], ['SOON1', 'early'], ['FULL1', 'gone']];
    let last = 0, gaps = [];
    for (const [code, status] of want) {
      const got = await page.until(`document.querySelector('.exc-input').value === ${JSON.stringify(code)} && document.querySelector('#df-go').style.display !== 'none'`, 12000);
      if (last) gaps.push(Date.now() - last);
      u = await waitUi(x => /รอคุณกดยืนยัน/.test(x.state), 3000);
      check(code + ': put in by itself after the sign-in (the queue was kept), waits for the confirm', !!got && /รอคุณกดยืนยัน/.test(u.state) && u.live.includes(code), { got, u });
      await sleep(1200);                                   // nothing may happen while the player does nothing
      const still = (await state()).codes.find(e => e.code === code).status;
      last = Date.now();
      await page.eval(`document.querySelector('#df-go').click(); 1`);             // the player's confirm
      let filed = null;
      for (let i = 0; i < 20; i++) { await sleep(300); filed = (await state()).codes.find(e => e.code === code).status; if (filed === status) break; }
      check(code + ' → ' + status + ' (unchanged until the confirm)', still === 'new' && filed === status, { still, filed });
    }
    check('about five seconds pass between an answer and the next code', gaps.every(g => g >= 4700 && g < 9500), gaps);
    u = await waitUi(x => /หมดคิว/.test(x.state), 12000);
    let end = await state();
    check('queue done: only the not-yet-open code is left in the list\'s queue', /หมดคิว/.test(u.state) && end.queue.join() === 'SOON1', { u, queue: end.queue });

    // the way back, as on a phone (where this window would be asleep): the results travel in the link
    await mark('FULL1', 'again');
    await mark('OLD1', 'again');
    check('(two results are taken out of the list again, to see them come back)', (await state()).queue.join() === 'OLD1,SOON1,FULL1' || (await state()).queue.length === 3);
    const backHref = await page.eval(`document.querySelector('#df-back').href`);
    check('the bar offers the link back to the control room, results in it', backHref.startsWith(BASE + '/#res='), backHref);
    await page.eval(`document.querySelector('#df-back').click(); 1`);
    let filedBack = null;
    for (let i = 0; i < 30; i++) { await sleep(300); const c = (await state()).codes; filedBack = [c.find(e => e.code === 'FULL1').status, c.find(e => e.code === 'OLD1').status].join(); if (filedBack === 'gone,expired') break; }
    check('opening it files what was missing, and leaves the rest as it was', filedBack === 'gone,expired' && (await state()).codes.find(e => e.code === 'GOOD1').status === 'ok', filedBack);
    const landed = await attach(room.port, 'localhost:' + PORT + '/');
    check('and the address is clean again', !!landed, null);

    await room.eval(`[...document.querySelectorAll('[data-job]')].filter(b => b.getClientRects().length).map(b => b.dataset.job).join()`).then(v => check('no button here drives a browser', v === 'scan', v));

    // ── the door for phones and tablets ──
    const ip = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address)[0];
    if (!ip) console.log('  (this machine has no network address: the --lan checks are skipped)');
    else {
      check('a server started without --lan cannot be reached at the network address', (await get('http://' + ip + ':' + PORT + '/api/state')).status === 0);
      const P2 = PORT + 1;
      lan = spawn(process.execPath, [path.join(__dirname, '../web/server.js'), '--port', String(P2), '--demo', '--lan'], { stdio: 'ignore' });
      let st2 = null;
      for (let i = 0; i < 40 && !st2; i++) { try { st2 = await (await fetch('http://localhost:' + P2 + '/api/state')).json(); } catch (e) { await sleep(250); } }
      const link = st2.lan.urls.find(x => x.includes(ip));
      const key = link ? new URL(link).searchParams.get('k') : '';
      check('with --lan the page shows a link with a ten-character key', st2.lan.on === true && /^[A-Z2-9]{10}$/.test(key), st2.lan);
      const at = 'http://' + ip + ':' + P2;
      check('no key: refused', (await get(at + '/api/state')).status === 403 && (await get(at + '/')).status === 403);
      check('a wrong key: refused', (await get(at + '/?k=AAAAAAAAAA')).status === 403);
      const ok = await get(at + '/?k=' + key);
      check('the key in the link: let in, and a cookie is given', ok.status === 200 && /^dfk=/.test(ok.cookie), ok);
      check('the cookie alone is enough afterwards', (await get(at + '/api/state', { cookie: ok.cookie.split(';')[0] })).status === 200);
      check('a foreign name pointed at the server: refused, key or not', (await get(at + '/?k=' + key, { host: 'evil.example:' + P2 })).status === 403);
      const cross = await new Promise(resolve => {
        const req = http.request({ host: ip, port: P2, path: '/api/add', method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example', cookie: ok.cookie.split(';')[0] } }, res => { res.resume(); resolve(res.statusCode); });
        req.on('error', () => resolve(0)); req.end('{"text":"HACK1234"}');
      });
      check('a page of another site using the cookie: refused', cross === 403, cross);
    }
  } catch (e) {
    fail++; console.log('  FAIL ' + (e.stack || e.message));
  } finally {
    if (room) await room.close().catch(() => {});
    server.kill(); if (lan) lan.kill();
    await sleep(400);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* the browser may still hold a file */ }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
