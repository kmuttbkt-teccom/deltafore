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
    // the maps and pictures that tabs 04–06 show from other sites are not fetched by a test run
    await room.send('Network.enable');
    await room.send('Network.setBlockedURLs', { urls: ['*deltaforcetools.gg*', '*deltaforcedb.com*', '*garenanow.com*', '*wikimedia.org*'] });
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

    // ── tab 04: weapon builds ──
    const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
    const added = await post('/api/builds/add', { text: 'CI-19 Assault Rifle-Warfare-6HLOANO09MFFCME3G7LT2\nAS Val Assault Rifle-Operations-6K5TDKO073PJM0S450OEV\nnonsense line' });
    check('builds: two lines taken, the third named as not a build', added.added === 2 && added.bad.length === 1, added);
    await room.eval(`location.hash = 'builds'; 1`);
    const cards = await room.until(`document.querySelectorAll('#bd-list .bd').length === 2 && [...document.querySelectorAll('#bd-list .bd h3')].map(h => h.textContent).join('|')`, 6000);
    check('the tab lists them', !!cards && /CI-19 Assault Rifle/.test(cards) && /AS Val Assault Rifle/.test(cards), cards);
    await room.eval(`document.querySelector('[data-bm="Operations"]').click(); 1`);
    check('the mode filter narrows the list', await room.eval(`document.querySelectorAll('#bd-list .bd').length`) === 1);
    await room.eval(`document.querySelector('[data-bstar]').click(); 1`);
    await sleep(500);
    const afterStar = (await (await fetch(BASE + '/api/builds')).json()).builds;
    check('a star is kept by the server and comes first', afterStar[0].fav === true && afterStar[0].name === 'AS Val Assault Rifle', afterStar.map(x => [x.name, x.fav]));
    await room.eval(`document.querySelector('[data-bm="all"]').click(); document.querySelector('#bd-q').value = 'ci-19'; document.querySelector('#bd-q').dispatchEvent(new Event('input')); 1`);
    check('the search finds a weapon by name', await room.eval(`[...document.querySelectorAll('#bd-list .bd h3')].map(h => h.textContent).join()`) === 'CI-19 Assault Rifle');
    await room.eval(`location.hash = 'codes'; 1`);

    // ── tab 05: the maps ──
    await room.eval(`location.hash = 'maps'; 1`);
    const picks = await room.until(`document.querySelectorAll('#map-pick .mapbtn').length >= 6 && !!document.querySelector('#map-body .tiles') && [...document.querySelectorAll('#map-pick .mapbtn b')].map(b => b.textContent).join('|')`, 6000);
    check('tab 05 lists every map', /Zero Dam\|Layali Grove\|Space City\|Brakkesh\|Tide Prison\|AZ3/.test(picks || ''), picks);
    const fr = await room.eval(`(() => { const f = document.querySelector('.map-frame'); return f && { src: f.src, box: f.getAttribute('sandbox'), ref: f.getAttribute('referrerpolicy') }; })()`);
    check('the map is another site\'s own page, in a frame that cannot move this tab', !!fr && fr.src === 'https://deltaforcetools.gg/map/zero-dam' && /allow-scripts/.test(fr.box) && !/allow-top-navigation/.test(fr.box) && fr.ref === 'no-referrer', fr);
    check('with what was counted on it, its key rooms and its own notes', await room.eval(`document.querySelectorAll('#map-body .bar').length >= 5 && document.querySelectorAll('#map-body .pill.key').length === 15 && /D1/.test(document.querySelector('.map-notes').textContent)`));
    await room.eval(`document.querySelector('[data-map="tide-prison"]').click(); 1`);
    check('a map nobody has charted says so, and keeps its notes', await room.eval(`!document.querySelector('.map-frame') && !!document.querySelector('.map-none') && !!document.querySelector('.map-notes')`));
    await room.eval(`document.querySelector('[data-map="zero-dam"]').click(); 1`);

    // ── tab 06: events and tips ──
    await room.eval(`location.hash = 'info'; 1`);
    const info = await room.until(`document.querySelectorAll('#info-doc h2').length > 3 && document.querySelectorAll('#info-toc a').length === document.querySelectorAll('#info-doc h2').length && document.querySelector('#info-doc h1').textContent`, 6000);
    check('tab 06 draws the events page with its list of contents', /กิจกรรม/.test(info || ''), info);
    check('its headings do not take the ids of the guide tab', await room.eval(`document.querySelector('#info-doc h2').id === 'i-1' && document.querySelectorAll('[id="g-1"]').length <= 1`));
    check('a closing date says how many days are left', await room.eval(`document.querySelectorAll('#info-doc td:first-child .left').length`) >= 5);
    const pics = await room.eval(`(() => { const im = [...document.querySelectorAll('#info-doc .shot img')]; return { n: im.length, own: im.every(i => i.src.startsWith('https://undawnth.cdn.garenanow.com/') && i.getAttribute('loading') === 'lazy'), heavy: document.querySelectorAll('#info-doc .shot-tap').length, raw: /!\\[|\\{\\{/.test(document.querySelector('#info-doc').textContent), cd: !!document.querySelector('#info-doc .countdown') }; })()`);
    check('its pictures are shown from the publisher\'s own site, the heavy ones only when asked for; the countdown is drawn', pics.n >= 5 && pics.own && pics.heavy >= 5 && !pics.raw && pics.cd, pics);
    await room.eval(`document.querySelector('#info-doc .shot-tap').click(); 1`);
    check('a heavy picture comes when its button is pressed', await room.eval(`document.querySelectorAll('#info-doc .shot-tap').length`) === pics.heavy - 1 && await room.eval(`document.querySelectorAll('#info-doc .shot img').length`) === pics.n + 1);
    await room.eval(`document.querySelector('[data-doc="tips"]').click(); 1`);
    const tips = await room.until(`document.querySelectorAll('#info-doc .matrix .mx-c').length === 49 && document.querySelector('#info-doc h1').textContent`, 6000);
    check('the tips page draws the bullet against the vest: through above its level, part at it, nothing below',
      /ทริก/.test(tips || '') && await room.eval(`(() => { const c = [...document.querySelectorAll('#info-doc .matrix .mx-c')], at = (a, v) => c[7 * a + v].className; return /pen/.test(at(2, 1)) && /part/.test(at(2, 2)) && /stop/.test(at(2, 3)) && document.querySelectorAll('#info-doc .grades span').length === 6; })()`), tips);
    check('the files of these tabs are served, no other file of the project is', (await fetch(BASE + '/maps.json')).status === 200 && (await fetch(BASE + '/DF-TIPS.md')).status === 200 &&
      (await fetch(BASE + '/PRO-GUIDE.md')).status === 404 && (await fetch(BASE + '/DF-..%2Fconfig.md')).status === 404 && (await fetch(BASE + '/config.json')).status === 404 && (await fetch(BASE + '/weapons.json')).status === 404);
    await room.eval(`location.hash = 'codes'; 1`);

    // ── tab 07: the player's own ──
    await room.eval(`localStorage.removeItem('df-mine'); location.hash = 'my'; 1`);
    const my = await room.until(`document.querySelectorAll('#my-body .tick').length > 4 && document.querySelectorAll('#my-chips .chip').length >= 1 && document.querySelector('#my-chips .chip').textContent`, 6000);
    check('tab 07 draws the checklist, and the header says how much of today is done', /^วันนี้ 0\//.test(my || ''), my);
    await room.eval(`document.querySelector('[data-tick="d-login"]').click(); document.querySelector('[data-tick="w-expert"]').click(); 1`);
    check('a tick is kept in this browser and counted', await room.eval(`document.querySelector('[data-tick="d-login"]').classList.contains('on') && /^วันนี้ 1\\//.test(document.querySelector('#my-chips .chip').textContent) && Object.keys(JSON.parse(localStorage.getItem('df-mine')).check.done).length === 2`));
    await room.eval(`(() => { const m = JSON.parse(localStorage.getItem('df-mine')); m.check.done = { 'd-login': 'd2020-1-1', 'w-expert': 'w2020-1-6', 'my-keep': 'x' }; m.check.own = [{ id: 'my-keep', text: 'once, by the player', kind: 'once', mine: true }]; localStorage.setItem('df-mine', JSON.stringify(m)); location.hash = 'codes'; location.hash = 'my'; return 1; })()`);
    await sleep(300);
    check('a new day and a new week bring their ticks back; a thing done once stays done', await room.eval(`!document.querySelector('[data-tick="d-login"]').classList.contains('on') && !document.querySelector('[data-tick="w-expert"]').classList.contains('on') && document.querySelector('[data-tick="my-keep"]').classList.contains('on')`));
    await room.eval(`document.querySelector('[data-my="fish"]').click(); 1`);
    await room.eval(`(() => { document.querySelector('[data-fish="Mullet"]').click(); const lv = document.querySelector('#my-fish-level'); lv.value = '14'; lv.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    check('the fishing handbook: 27 species, a catch is counted, the next test names what to hand in', await room.eval(`document.querySelectorAll('.fishb').length === 27 && /1\\/27/.test(document.querySelector('#my-body h2 span').textContent) && /เลเวล 20/.test(document.querySelector('.gate b').textContent) && [...document.querySelectorAll('.fishb.need b')].map(b => b.textContent).join() === 'Mullet,Zander'`));

    await room.eval(`(() => { location.hash = 'builds'; const q = document.querySelector('#bd-q'); q.value = ''; q.dispatchEvent(new Event('input')); return 1; })()`);
    await room.until(`document.querySelectorAll('#bd-list .bd [data-bwork]').length >= 4`, 6000);
    await room.eval(`document.querySelector('#bd-list .bd [data-bwork][data-to="no"]').click(); 1`);
    check('a build that did not import is marked, counted and put last', await room.eval(`(() => { const c = [...document.querySelectorAll('#bd-list .bd')]; return c.length >= 2 && c[c.length - 1].classList.contains('w-no') && !c[0].classList.contains('w-no') && !!document.querySelector('[data-bm="fails"]') && Object.values(JSON.parse(localStorage.getItem('df-mine')).works).join() === 'no'; })()`));

    await room.eval(`location.hash = 'maps'; 1`);
    await room.until(`!!document.querySelector('#map-note')`, 6000);
    await room.eval(`(() => { const ta = document.querySelector('#map-note'); ta.value = 'ออกทางเหนือ'; ta.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    await room.until(`(() => { try { const m = JSON.parse(localStorage.getItem('df-mine')); return m && m.notes && m.notes['zero-dam'] === 'ออกทางเหนือ'; } catch (e) { return false; } })()`, 6000);
    check('a note on a map is kept for that map; the door codes are a link, with its warning', await room.eval(`JSON.parse(localStorage.getItem('df-mine')).notes['zero-dam'] === 'ออกทางเหนือ' && !!document.querySelector('#map-body a[href*="door-codes"]') && /ยังไม่ได้ตรวจ/.test(document.querySelector('#map-body').textContent)`));

    // ── carrying it to another device ──
    const before = await (await fetch(BASE + '/api/state')).json();
    const waiting = before.queue[0], mineDone = before.codes.find(e => ['ok', 'used', 'expired', 'invalid', 'gone'].includes(e.status));
    await room.eval(`(() => { location.hash = 'my'; document.querySelector('[data-my="move"]').click(); document.querySelector('#mv-pack').click(); return 1; })()`);
    const packed = JSON.parse(await room.until(`document.querySelector('#mv-out') && document.querySelector('#mv-out').value.length > 20 && document.querySelector('#mv-out').value`, 6000) || '{}');
    check('one file carries the results, the fish, the notes and the marks — and no key of this machine', packed.app === 'deltafore' && packed.mine.fish.got.Mullet === true && packed.mine.notes['zero-dam'] === 'ออกทางเหนือ' && packed.codes.deltaforce[mineDone.code] === mineDone.status && !/web-key|dfk/.test(JSON.stringify(packed)), Object.keys(packed));
    const other = { app: 'deltafore', v: 1, at: new Date().toISOString(),
      codes: { deltaforce: { [waiting]: 'used', PHONEONLY77: 'expired', 'bad code!': 'ok', [mineDone.code]: mineDone.status === 'gone' ? 'ok' : 'gone' } },
      builds: { '6HLOANO09MFFCME3G7LT2': { fav: true } },
      mine: { fish: { got: { Zander: true }, level: 22 }, notes: { 'zero-dam': 'ระวังสไนเปอร์บนเขื่อน', az3: 'พกยาแก้รังสี' }, works: { X1: 'ok', X2: 'maybe' }, check: { done: {}, own: [{ id: 'my-1', text: 'ฟาร์มคีย์การ์ด', kind: 'daily' }] } } };
    await room.eval(`(() => { localStorage.setItem('df-mine', JSON.stringify({ fish: { got: { Mullet: true }, level: 14 }, notes: { 'zero-dam': 'ออกทางเหนือ' } })); document.querySelector('#mv-in').value = ${JSON.stringify(JSON.stringify(other))}; document.querySelector('#mv-read').click(); return 1; })()`);
    const seen = await room.until(`!document.querySelector('#mv-apply').hidden && document.querySelector('#mv-in-msg').textContent`, 6000);
    check('a file is looked at first: what it would change here is said', !!waiting && /บันทึกผลโค้ดใหม่ 2 ตัว/.test(seen || '') && /เพิ่มดาว\/ซ่อน 1/.test(seen || ''), seen);
    await room.eval(`document.querySelector('#mv-apply').click(); 1`);
    await room.until(`/นำเข้าแล้ว/.test(document.querySelector('#mv-in-msg').textContent)`, 8000);
    const after = await (await fetch(BASE + '/api/state')).json();
    const st = c => (after.codes.find(e => e.code === c) || {}).status;
    check('results come in only where this device had none; a result of its own stays; what is no code is left out', st(waiting) === 'used' && st('PHONEONLY77') === 'expired' && st(mineDone.code) === mineDone.status && !after.codes.some(e => /bad code/i.test(e.code)), [st(waiting), st('PHONEONLY77'), st(mineDone.code)]);
    const mineNow = JSON.parse(await room.eval(`localStorage.getItem('df-mine')`));
    check('fish of both devices are kept, the higher level wins, notes sit one under the other, a mark that is no mark is dropped',
      mineNow.fish.got.Mullet && mineNow.fish.got.Zander && mineNow.fish.level === 22 && /ออกทางเหนือ[\s\S]*ระวังสไนเปอร์/.test(mineNow.notes['zero-dam']) && mineNow.notes.az3 === 'พกยาแก้รังสี' && mineNow.works.X1 === 'ok' && !('X2' in mineNow.works) && mineNow.check.own.length === 1, mineNow);
    const starred = (await (await fetch(BASE + '/api/builds')).json()).builds.find(b => b.code === '6HLOANO09MFFCME3G7LT2');
    check('a star from the other device is added', !!starred && starred.fav === true, starred);
    await room.eval(`(() => { document.querySelector('#mv-in').value = 'hello'; document.querySelector('#mv-read').click(); return 1; })()`);
    await sleep(300);
    check('a text that is no such file is refused, nothing is offered', await room.eval(`document.querySelector('#mv-apply').hidden && /ไม่ใช่ไฟล์ย้ายข้อมูล/.test(document.querySelector('#mv-in-msg').textContent)`));

    // the public copy of the page (no server): its own list against the site's newer one
    const merged = await room.eval(`(() => { const local = { codes: { A: { code: 'A', status: 'new' }, B: { code: 'B', status: 'ok', triedAt: 'here' }, C: { code: 'C', status: 'found' } } }; const n = mergeSiteList(local, { codes: { A: { code: 'A', status: 'used' }, B: { code: 'B', status: 'expired' }, C: { code: 'C', status: 'new' }, D: { code: 'D', status: 'new' } } }); return { n, s: Object.values(local.codes).map(e => e.code + ':' + e.status).join() }; })()`);
    check('the site\'s newer list: a new code comes in, a result it knows replaces "waiting", a result of this device stays', merged.n === 2 && merged.s === 'A:used,B:ok,C:found,D:new', merged);
    check('the lists of tab 07 are served', (await fetch(BASE + '/checklist.json')).status === 200 && (await fetch(BASE + '/fish.json')).status === 200);
    await room.eval(`localStorage.removeItem('df-mine'); location.hash = 'codes'; 1`);

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
