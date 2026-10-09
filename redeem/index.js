#!/usr/bin/env node
'use strict';
// node redeem <command>   — see `node redeem help`

const { open, sleep } = require('./cdp');
const { Portal } = require('./portal');
const store = require('./store');
const sources = require('./sources');

const say = s => console.log(s);

const ICON = { found: '🔎', new: '🆕', early: '⏳', retry: '🔁', ok: '✅', used: '☑️', gone: '🚫', expired: '⌛', invalid: '❌', failed: '⚠️', skip: '⏭️' };
const LABEL = {
  found: 'พบจากหน้าเว็บ รออนุมัติ', new: 'รอแลก', early: 'ยังไม่ถึงเวลา', retry: 'รอลองใหม่',
  ok: 'แลกสำเร็จ', used: 'เคยแลกแล้ว', gone: 'ถูกแลกครบแล้ว', expired: 'หมดอายุ', invalid: 'โค้ดไม่ถูกต้อง', failed: 'ไม่สำเร็จ', skip: 'ข้าม'
};

async function withPortal(cfg, fn, opt) {
  const s = await open({ browser: cfg.browser, profileDir: cfg.profileDir, headless: opt && 'headless' in opt ? opt.headless : cfg.headless });
  try { return await fn(new Portal(s, cfg), s); }
  finally { await s.close(); }
}

// Signed in? If not and somebody is at the keyboard, take them to Garena's page and wait.
async function ensureLogin(portal, cfg, canWait) {
  let st = await portal.open();
  if (st.loggedIn) { await portal.keepLogin(); return st; }
  if (!canWait) return null;
  say('🔐 ยังไม่ได้เข้าสู่ระบบ — กำลังพาไปหน้าเข้าสู่ระบบของ Garena');
  say('   เข้าสู่ระบบด้วยตัวคุณเองในหน้าต่างเบราว์เซอร์ที่เปิดขึ้น (เครื่องมือนี้ไม่เห็นและไม่เก็บรหัสผ่าน)');
  await portal.clickSignIn();
  st = await portal.waitLogin(cfg.loginWaitMin, left => say('   …รออยู่ เหลืออีกประมาณ ' + left + ' นาที'));
  if (st && st.blocked) {
    say('⛔ หน้าเข้าสู่ระบบของ Garena ปฏิเสธเบราว์เซอร์นี้ ("Access is temporarily restricted") — ระบบกันบอตของ Garena เห็นว่าเบราว์เซอร์ถูกเครื่องมือควบคุม');
    say('   เครื่องมือนี้จะไม่พยายามเลี่ยง ปิดหน้าต่างแล้วใช้โหมดแลกเอง ("mode": "manual" ใน config.json) และอย่ากดซ้ำ');
    store.log('login ถูก Garena ปฏิเสธ (Access is temporarily restricted)');
    return null;
  }
  if (!st) return null;
  await sleep(800);
  await portal.keepLogin();
  return st;
}

async function cmdLogin(cfg) {
  return withPortal(cfg, async portal => {
    const st = await ensureLogin(portal, cfg, true);
    if (!st) { say('✗ ยังไม่ได้เข้าสู่ระบบภายใน ' + cfg.loginWaitMin + ' นาที — สั่ง `node redeem login` ใหม่เมื่อพร้อม'); return 2; }
    say('✓ เข้าสู่ระบบแล้ว: ' + (st.username || '(ไม่มีชื่อแสดง)') + ' — จำไว้ในโปรไฟล์เบราว์เซอร์ของเครื่องมือนี้ ' + cfg.keepLoginDays + ' วัน');
    return 0;
  }, { headless: false });
}

async function cmdLogout(cfg) {
  return withPortal(cfg, async portal => {
    await portal.open();
    await portal.logout();
    say('✓ ออกจากระบบแล้ว (ลบโฟลเดอร์ data/browser-profile ได้ถ้าต้องการล้างทุกอย่าง)');
    return 0;
  });
}

async function cmdStatus(cfg) {
  const db = store.load();
  const count = {};
  for (const e of Object.values(db.codes)) count[e.status] = (count[e.status] || 0) + 1;
  say('หน้าแลกโค้ด: ' + cfg.portal);
  say('โค้ดในรายการ: ' + (Object.keys(count).map(k => (ICON[k] || '') + ' ' + LABEL[k] + ' ' + count[k]).join(' · ') || 'ยังไม่มี'));
  return withPortal(cfg, async portal => {
    const st = await portal.open();
    say(st.loggedIn ? '✓ เข้าสู่ระบบอยู่: ' + (st.username || '(ไม่มีชื่อแสดง)') : '✗ ยังไม่ได้เข้าสู่ระบบ — สั่ง `node redeem login`');
    if (st.loggedIn) await portal.keepLogin();
    return st.loggedIn ? 0 : 2;
  });
}

function cmdAdd(codes, source) {
  const db = store.load();
  const fresh = [];
  for (const raw of codes) {
    const r = store.add(db, raw, { source });
    if (r.error) say('  ✗ ' + r.error);
    else if (r.fresh) { fresh.push(r.entry.code); say('  + ' + r.entry.code); }
    else if (r.entry.status === 'found') { r.entry.status = 'new'; fresh.push(r.entry.code); say('  + ' + r.entry.code + ' (อนุมัติจากที่พบไว้)'); }
    else say('  = ' + r.entry.code + ' มีอยู่แล้ว (' + LABEL[r.entry.status] + ')');
  }
  store.save(db);
  return fresh;
}

function cmdList() {
  const db = store.load();
  const rows = Object.values(db.codes).sort((a, b) => a.addedAt < b.addedAt ? 1 : -1);
  if (!rows.length) { say('ยังไม่มีโค้ดในรายการ — เพิ่มด้วย `node redeem add <โค้ด>`'); return; }
  for (const e of rows) {
    say([(ICON[e.status] || ' ') + ' ' + e.code.padEnd(24), LABEL[e.status].padEnd(22), (e.triedAt || e.addedAt).slice(0, 16).replace('T', ' '), e.source, e.note || ''].join('  '));
  }
}

function cmdMark(codes, from, to) {
  const db = store.load();
  const all = codes.includes('--all');
  const list = all ? Object.values(db.codes).filter(e => from.includes(e.status)) : codes.map(c => store.find(db, c) || { missing: c });
  let n = 0;
  for (const e of list) {
    if (e.missing) { say('  ✗ ไม่พบ ' + e.missing); continue; }
    if (!from.includes(e.status)) { say('  = ' + e.code + ' อยู่ในสถานะ "' + LABEL[e.status] + '" — ไม่เปลี่ยน'); continue; }
    e.status = to; n++; say('  → ' + e.code + ' : ' + LABEL[to]);
  }
  store.save(db);
  return n;
}

async function cmdScan(cfg) {
  const list = (cfg.sources || []).filter(s => s.enabled !== false);
  if (!list.length) { say('ไม่มีหน้าเว็บให้เฝ้าใน config.json ("sources")'); return 0; }
  say('🔎 ตรวจหน้าเว็บ ' + list.length + ' แห่ง');
  const found = await sources.scan(list, say, cfg.words);
  const db = store.load();
  const news = [];
  for (const f of found) {
    const r = store.add(db, f.code, { source: f.source, status: f.auto ? 'new' : 'found' });
    if (r.error) continue;
    const e = r.entry;
    e.seen = [...new Set([...(e.seen || (e.source === 'manual' ? [] : [e.source])), f.source])];
    if (r.fresh) news.push(e);
  }
  const fresh = news.length, waiting = news.filter(e => e.status === 'found').length;
  for (const e of news.sort((x, y) => y.seen.length - x.seen.length)) {
    say('  ' + (e.status === 'new' ? '🆕' : '🔎') + ' ' + e.code.padEnd(22) + ' ← ' + e.seen.length + ' แหล่ง: ' + e.seen.join(', '));
  }
  store.save(db);
  if (fresh) store.log('scan พบใหม่ ' + fresh + ' รายการ');
  say(fresh ? 'พบใหม่ ' + fresh + ' รายการ' + (waiting ? ' — ' + waiting + ' รายการรออนุมัติ: `node redeem approve <โค้ด>` หรือ `approve --all`' : '') : 'ไม่มีโค้ดใหม่');
  return fresh;
}

// Sends the waiting codes, one at a time, with a pause between them.
async function cmdRun(cfg, opt) {
  const canWait = !(opt && opt.unattended) && !cfg.headless && process.stdin.isTTY;
  let db = store.load();
  const list = store.pending(db, cfg.maxTriesPerCode).slice(0, cfg.maxCodesPerRun);
  if (!list.length) { say('ไม่มีโค้ดรอแลก'); return { sent: 0 }; }
  if (store.invalidToday(db) >= cfg.maxInvalidPerDay) {
    say('⛔ วันนี้มีโค้ดผิด ' + store.invalidToday(db) + ' ครั้งแล้ว (เพดาน ' + cfg.maxInvalidPerDay + ') — หยุดถึงพรุ่งนี้เพื่อไม่ให้บัญชีถูกมองว่าเดาโค้ด');
    return { sent: 0, capped: true };
  }
  say('🎁 มีโค้ดรอแลก ' + list.length + ' รายการ');
  return withPortal(cfg, async portal => {
    const st = await ensureLogin(portal, cfg, canWait);
    if (!st) {
      say('✗ ยังไม่ได้เข้าสู่ระบบ — สั่ง `node redeem login` หนึ่งครั้ง แล้วโค้ดที่ค้างจะถูกแลกในรอบถัดไป');
      store.log('run หยุด: ยังไม่ได้เข้าสู่ระบบ');
      return { sent: 0, needLogin: true };
    }
    say('   บัญชี: ' + (st.username || '(ไม่มีชื่อแสดง)'));
    const out = { sent: 0, ok: 0 };
    for (let i = 0; i < list.length; i++) {
      const res = await portal.redeem(list[i].code);
      if (res.status === 'login' || res.status === 'captcha') {
        say('⏸  ' + list[i].code + ' — ' + res.text + (res.status === 'captcha' ? ' · ทำในหน้าต่างเบราว์เซอร์ด้วยตัวคุณเอง แล้วสั่ง run ใหม่' : ' · สั่ง `node redeem login`'));
        store.log(list[i].code + ' หยุด: ' + res.status);
        out[res.status === 'login' ? 'needLogin' : 'captcha'] = true;
        break;
      }
      db = store.load();                       // the list may have been edited while we waited
      const e = store.find(db, list[i].code);
      if (!e) continue;
      e.triedAt = new Date().toISOString();
      if (res.status !== 'early') e.tries++;
      e.status = res.status === 'retry' && e.tries >= cfg.maxTriesPerCode ? 'failed' : res.status;
      e.note = res.text; e.api = res.api;
      store.save(db);
      store.log(e.code + ' ' + e.status + ' api=' + (res.api === undefined ? '-' : res.api) + ' ' + res.text);
      say('  ' + (ICON[e.status] || '') + ' ' + e.code + ' — ' + res.text);
      out.sent++; if (e.status === 'ok') out.ok++;
      if (store.invalidToday(db) >= cfg.maxInvalidPerDay) {
        say('⛔ ถึงเพดานโค้ดผิดของวันนี้ (' + cfg.maxInvalidPerDay + ') — หยุดก่อน');
        out.capped = true; break;
      }
      if (i < list.length - 1) {
        const [a, b] = cfg.delayBetweenCodesSec;
        await sleep(1000 * (a + Math.random() * Math.max(0, b - a)));
      }
    }
    if (out.ok) say('📬 แลกสำเร็จ ' + out.ok + ' โค้ด — เปิดเกมแล้วรับของที่กล่องจดหมาย (ถ้ายังไม่ขึ้นให้ปิดเกมเปิดใหม่)');
    return out;
  });
}

async function cmdWatch(cfg, every) {
  const min = Math.max(30, Number(every) || cfg.watchEveryMin || 120);
  say('👀 เฝ้าทุก ' + min + ' นาที (กด Ctrl+C เพื่อหยุด)');
  for (;;) {
    say('\n— ' + new Date().toLocaleString('th-TH') + ' —');
    try {
      await cmdScan(cfg);
      if (cfg.mode === 'auto') await cmdRun(cfg, { unattended: !process.stdin.isTTY });
    } catch (e) { say('✗ ' + e.message); store.log('watch error: ' + e.message); }
    await sleep(min * 60000);
  }
}

const HELP = `
ศูนย์โค้ด Garena Delta Force — หาโค้ดจากหน้าเว็บทั่วโลก เก็บคิว จำผล (หน้าแลกทางการ: redeem.df.garena.sg)
ใช้ผ่านหน้าเว็บสะดวกกว่า: npm run web
เกมอื่น: ใส่ --game <ชื่อ> หน้าคำสั่ง เช่น  node redeem --game rov scan  (รายชื่อเกมอยู่ใน config.json ช่อง "games")

  node redeem scan               ตรวจหน้าเว็บที่เฝ้าไว้ หาโค้ดใหม่
  node redeem add <โค้ด...>      เพิ่มโค้ดเข้าคิว
  node redeem approve <โค้ด...|--all>   อนุมัติโค้ดที่ scan พบ ให้เข้าคิว
  node redeem next               โค้ดถัดไปในคิว (เอาไปวางในหน้าแลกโค้ดด้วยตัวเอง)
  node redeem result <โค้ด> <ok|used|expired|invalid|gone>   บันทึกผลที่เห็นบนหน้าแลก
  node redeem skip <โค้ด...>     ไม่ต้องแลกโค้ดนี้
  node redeem list               ดูรายการโค้ดและผล
  node redeem watch [นาที]       ตรวจหน้าเว็บเป็นรอบ ๆ (อย่างน้อย 30 นาที)

โหมดอัตโนมัติ ("mode": "auto" ใน config.json — หน้าเข้าสู่ระบบของ Garena ปฏิเสธเบราว์เซอร์ที่เครื่องมือควบคุม จึงปิดไว้):
  login · run · now <โค้ด...> · status · logout
`;

const MANUAL = `โหมดแลกเอง: คำสั่งนี้ต้องให้เครื่องมือควบคุมเบราว์เซอร์บนหน้าของ Garena ซึ่ง Garena ปฏิเสธ ("Access is temporarily restricted", 9 ต.ค. 2026)
แลกด้วยมือในเบราว์เซอร์ปกติของคุณแทน: "npm run web" แล้วใช้แผง "แลกเอง" — หรือ "node redeem next" กับ "node redeem result <โค้ด> <ผล>"`;


async function main(argv) {
  argv = argv.slice();
  const gi = argv.indexOf('--game');                       // node redeem --game rov scan
  if (gi >= 0) { process.env.DF_GAME = store.gameId(argv[gi + 1]); argv.splice(gi, 2); }
  const [cmd, ...args] = argv;
  const cfg = store.config();
  const auto = cfg.mode === 'auto';
  if (!auto && ['login', 'logout', 'status', 'run'].includes(cmd)) { say(MANUAL); return 3; }
  switch (cmd) {
    case 'login': return cmdLogin(cfg);
    case 'logout': return cmdLogout(cfg);
    case 'status': return cmdStatus(cfg);
    case 'add': if (!args.length) { say('ใส่โค้ดด้วย: node redeem add <โค้ด>'); return 1; } cmdAdd(args); return 0;
    case 'now': {
      if (!args.length) { say('ใส่โค้ดด้วย: node redeem now <โค้ด>'); return 1; }
      cmdAdd(args);
      if (!auto) { say('เข้าคิวแล้ว — แลกด้วยมือ: `node redeem next` หรือหน้าเว็บ (npm run web)'); return 0; }
      const r = await cmdRun(cfg);
      return r.needLogin ? 2 : 0;
    }
    case 'run': { const r = await cmdRun(cfg); return r.needLogin ? 2 : 0; }
    case 'list': cmdList(); return 0;
    case 'scan': await cmdScan(cfg); return 0;
    case 'approve': {
      if (args.length) { cmdMark(args, ['found'], 'new'); return 0; }
      const waiting = Object.values(store.load().codes).filter(e => e.status === 'found');
      say(waiting.length ? 'รออนุมัติ: ' + waiting.map(e => e.code).join(' ') + '\nสั่ง `node redeem approve <โค้ด...>` หรือ `node redeem approve --all`' : 'ไม่มีโค้ดรออนุมัติ');
      return 0;
    }
    case 'skip': if (!args.length) { say('ใส่โค้ดด้วย'); return 1; } cmdMark(args, ['found', 'new', 'early', 'retry'], 'skip'); return 0;
    case 'next': {
      const q = store.pending(store.load(), Infinity);
      if (!q.length) { say('ไม่มีโค้ดในคิว — `node redeem scan` แล้ว `approve` หรือ `add <โค้ด>`'); return 0; }
      say(q[0].code);
      say(cfg.redeem === 'ingame' ? '\nกรอกในเกม ' + cfg.name + (cfg.how ? ': ' + cfg.how : '') : '\nวางที่ ' + cfg.portal + ' (เข้าสู่ระบบในเบราว์เซอร์ปกติของคุณ)');
      say('แล้วบันทึกผล: node redeem result ' + q[0].code + ' <' + store.RESULTS.join('|') + '>   · เหลือในคิว ' + q.length);
      return 0;
    }
    case 'result': {
      const db = store.load();
      const e = store.record(db, args[0], args[1]);
      if (!e) { say('ใช้: node redeem result <โค้ดที่อยู่ในคิว> <' + store.RESULTS.join('|') + '>'); return 1; }
      store.save(db); store.log(e.code + ' ' + e.status + ' (บันทึกผลเอง)');
      say('  ' + ICON[e.status] + ' ' + e.code + ' : ' + LABEL[e.status]);
      return 0;
    }
    case 'builds': {                                        // weapon build share codes (redeem/builds.js)
      const builds = require('./builds');
      if (args[0] === 'scan') {
        const pages = (cfg.buildSources || []).filter(s => s.enabled !== false);
        if (!pages.length) { say('ไม่มีหน้าเว็บโค้ดแต่งปืนใน config.json ("buildSources")'); return 0; }
        say('🔫 ตรวจหน้าเว็บโค้ดแต่งปืน ' + pages.length + ' แห่ง');
        const fresh = await builds.scan(pages, say);
        try { await builds.fetchPictures(say); } catch (e) { say('  ✗ รูปปืน: ' + e.message + ' (ข้ามไป)'); }
        say(fresh ? 'ชุดแต่งใหม่ ' + fresh + ' รายการ' : 'ไม่มีชุดแต่งใหม่');
        return 0;
      }
      if (args[0] === 'images') {                           // the pictures alone (after editing weapons.json)
        await builds.fetchPictures(say);
        return 0;
      }
      if (args[0] === 'add') {
        const { items, bad } = builds.parse(args.slice(1).join(' '));
        const db = builds.load();
        const fresh = builds.merge(db, items, 'manual');
        builds.save(db);
        for (const b of fresh) say('  + ' + b.full);
        for (const l of bad) say('  ✗ ไม่ใช่โค้ดแต่งปืน: ' + l);
        if (!fresh.length && !bad.length) say('มีอยู่แล้ว');
        return bad.length && !items.length ? 1 : 0;
      }
      const all = builds.list(builds.load()).filter(b => !b.hidden);
      if (!all.length) { say('ยังไม่มีโค้ดแต่งปืน — `node redeem builds scan`'); return 0; }
      for (const b of all) say((b.fav ? '⭐ ' : '   ') + b.full + '   ← ' + ((b.seen || []).join(', ') || 'เพิ่มเอง'));
      return 0;
    }
    case 'watch': return cmdWatch(cfg, args[0]);
    default: say(HELP); return cmd && cmd !== 'help' ? 1 : 0;
  }
}

if (require.main === module) {
  // The exit code is set and the process left to end by itself: process.exit() right after a
  // network request trips an assertion inside Node on Windows. The timer is for a handle that lingers.
  const end = code => { process.exitCode = code; setTimeout(() => process.exit(code), 4000).unref(); };
  main(process.argv.slice(2)).then(code => end(code || 0), e => { console.error('✗ ' + e.message); end(1); });
}

module.exports = { main, cmdRun, cmdScan, cmdAdd, cmdMark, cmdStatus, withPortal, ensureLogin };
