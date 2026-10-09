'use strict';
// A stand-in for the redemption page, for the tests only: the same element ids and classes,
// the same request path and answer codes, a sign-in that is one button on a second page.
// The sign-in is a session cookie, as on the real page.

const http = require('http');

const ANSWERS = { ODD1: 999999, GOOD1: 0, GOOD2: 0, USED1: 400072, OLD1: 400070, BAD1: 400054, SOON1: 400069, FULL1: 400068, KICK1: 300001, NET1: 503701 };

const PAGE = `<!doctype html><html lang="th"><meta charset="utf-8"><title>ศูนย์แลกรางวัล (จำลอง)</title>
<style>.state{display:none}.state.show{display:block}#diaTips,#superTips{display:none}</style>
<div class="wrapper"><div class="header"><div class="login-box">
  <div id="unlogin"><a id="btn-login" href="javascript:void(0)">เข้าสู่ระบบ</a></div>
  <div id="logined" class="logined" style="display:none"><span class="username"></span><a id="btn-logout" href="javascript:void(0)">ลงชื่อออก</a></div>
</div></div>
<div class="main-box">
  <div class="state state-before show"><a class="spr btn-signin" href="javascript:void(0)">ล็อกอินแลกรางวัลทันที</a></div>
  <div class="state state-after"><input class="spr exc-input" type="text"><a class="spr btn-exchange gray" href="javascript:void(0)">ไปแลก</a></div>
</div></div>
<p id="superTips" class="super-tips"></p>
<div id="diaTips" class="dia dia-tips"><a class="btn-close" href="javascript:void(0)">x</a><p></p></div>
<script>
const cookie = n => (document.cookie.split('; ').find(c => c.startsWith(n + '=')) || '').slice(n.length + 1);
const user = () => { try { const u = JSON.parse(decodeURIComponent(cookie('user_info'))); return u.openid && u.token ? u : null; } catch (e) { return null; } };
const $ = s => document.querySelector(s);
function paint() {
  const u = user();
  $('#unlogin').style.display = u ? 'none' : '';
  $('#logined').style.display = u ? '' : 'none';
  $('.username').textContent = u ? u.user_name : '';
  $('.state-before').classList.toggle('show', !u);
  $('.state-after').classList.toggle('show', !!u);
}
window.GLanguage = { th: {
  lang5: 'รับสำเร็จ! กรุณาตรวจสอบกล่องจดหมายในเกม', lang1: 'ขออภัย บัญชีของคุณได้ใช้สิทธิ์แลก CD Key ประเภทนี้ครบแล้ว',
  lang12: 'CD Key ไม่ถูกต้อง กรุณากรอกใหม่', lang2: 'ขออภัย คุณไม่ได้รับสิทธิ์ทดสอบ', lang6: 'ล้มเหลว กรุณาลองใหม่', lang_1: 'คุณเคยแลกรับสิทธิ์ไปแล้ว ห้ามแลกซ้ำ',
  networkError: 'เครือข่ายขัดข้อง กรุณาลองอีกครั้งในภายหลัง', error_hint_400067: 'ขณะนี้ผู้ใช้ได้ใช้สิทธิ์แลก CDKey ครบแล้ว', error_hint_400068: 'CDKey ถูกแลกครบแล้ว',
  error_hint_400069: 'ยังไม่ถึงเวลาแลก CDKey', error_hint_400070: 'หมดเวลาแลก CDKey แล้ว', error_hint_400072: 'ผู้ใช้นี้แลก CDKey แล้ว', error_hint_400073: 'แพ็กของขวัญ CDKey ผิดพลาด'
} };
const uB = { 400053: 'lang1', 400054: 'lang12', 503701: 'networkError', 503001: 'lang2', 400067: 'error_hint_400067', 400068: 'error_hint_400068', 400069: 'error_hint_400069', 400070: 'error_hint_400070', 400072: 'error_hint_400072', 400073: 'error_hint_400073' };
function setDiaTips(t) { $('#diaTips p').textContent = t; $('#diaTips').style.display = 'block'; }
function setSuperTips(t) { $('#superTips').textContent = t; $('#superTips').style.display = 'block'; setTimeout(() => $('#superTips').style.display = 'none', 2500); }
$('#diaTips .btn-close').onclick = () => $('#diaTips').style.display = 'none';
$('.btn-signin').onclick = $('#btn-login').onclick = () => location.href = '/sso';
$('#btn-logout').onclick = () => { document.cookie = 'user_info=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'; paint(); };
$('.exc-input').addEventListener('input', e => $('.btn-exchange').classList.toggle('gray', !e.target.value));
let busy = false;
$('.btn-exchange').onclick = async () => {
  if (busy) return; busy = true; setTimeout(() => busy = false, 300);
  if (!user()) { location.href = '/sso'; return; }
  const code = $('.exc-input').value.trim(); if (!code) return;
  const r = await fetch('/api/proxy/present/CdkV2/RedeemCDKey?cdkey=' + encodeURIComponent(code), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cdkey: code, role_info: { game_id: '30150' } }) }).then(r => r.json());
  if (r.code === 300001) { $('#btn-logout').onclick(); location.reload(); return; }
  if (r.code === 999999) return window.setSuperTips('ข้อความที่ไม่มีในตาราง');
  if (r.code === 0) window.setDiaTips(window.GLanguage.th.lang5); else window.setSuperTips(window.GLanguage.th[uB[r.code] || 'networkError'] || r.msg);
};
paint();
</script>`;

const SSO = `<!doctype html><meta charset="utf-8"><title>Garena (จำลอง)</title>
<button id="mock-login">เข้าสู่ระบบ (จำลอง)</button>
<script>document.querySelector('#mock-login').onclick = () => {
  document.cookie = 'user_info=' + encodeURIComponent(JSON.stringify({ openid: 'test-1', token: 'test-token', user_name: 'Tester01' })) + '; path=/';
  location.href = '/th/cdkgarena.html?operate_type=thirdcallback';
};</script>`;

// A page of the kind the watcher reads: real-looking codes among things that are not codes.
const CODES = `<!doctype html><meta charset="utf-8"><h1>Delta Force Codes OCTOBER 2026</h1>
<script>var x = "SCRIPT9999";</script>
<ul><li><strong>GARENADF2610A</strong> – 3 day skin</li><li><code>DFTH-8K2Q9</code>: voucher</li><li>IPHONE17 users can play at 120FPS</li></ul>
<p>Use code: HAWKOPS77 before 2026-10-31. โค้ด DELTA4EVER ใช้ได้ถึงสิ้นเดือน. Updated 20261009 for ANDROID14.</p>
<table><tr><td>XMAS2025GIFT</td><td>expired</td></tr></table>`;

function start(port) {
  const hits = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (code, type, body) => { res.writeHead(code, { 'content-type': type + '; charset=utf-8' }); res.end(body); };
    if (url.pathname.endsWith('/cdkgarena.html')) return send(200, 'text/html', PAGE);
    if (url.pathname === '/sso') return send(200, 'text/html', SSO);
    if (url.pathname === '/codes.html') return send(200, 'text/html', CODES);
    if (url.pathname === '/blocked.html') return send(403, 'text/plain', 'no');
    if (url.pathname.endsWith('/CdkV2/RedeemCDKey') && req.method === 'POST') {
      const cdkey = url.searchParams.get('cdkey');
      hits.push(cdkey);
      const signedIn = /user_info=[^;]*test-token/.test(decodeURIComponent(req.headers.cookie || ''));
      const code = !signedIn ? 300001 : cdkey in ANSWERS ? ANSWERS[cdkey] : 400054;
      return setTimeout(() => send(200, 'application/json', JSON.stringify({ code, msg: code ? 'error ' + code : 'ok' })), 120);
    }
    send(404, 'text/plain', 'not found');
  });
  return new Promise(resolve => server.listen(port || 0, '127.0.0.1', () => resolve({ server, hits, port: server.address().port })));
}

module.exports = { start };

if (require.main === module) start(Number(process.argv[2]) || 3197).then(m => console.log('mock portal: http://127.0.0.1:' + m.port + '/th/cdkgarena.html'));
