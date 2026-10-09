'use strict';
// The Garena Delta Force redemption page (redeem.df.garena.sg/<lang>/cdkgarena.html), used the
// way a player uses it: the code goes into the page's own field and the page's own button is
// pressed. The answer is read from the page's own request (…/CdkV2/RedeemCDKey → { code, msg }).
//
// What the page looks like (2026-10):
//   #unlogin  a#btn-login            #logined  span.username  a#btn-logout
//   .state.state-before.show  a.btn-signin          (not signed in)
//   .state.state-after.show   input.exc-input  a.btn-exchange
//   #diaTips (success box)    #superTips (error line)
// Signing in is a redirect to Garena's own page and is always done by the player.

const { sleep } = require('./cdp');

// The answer codes of the page (its table `uB` and the texts of window.GLanguage).
const RESULT = {
  0:      ['ok',      'รับสำเร็จ — ของอยู่ในกล่องจดหมายในเกม'],
  400072: ['used',    'บัญชีนี้แลกโค้ดนี้ไปแล้ว'],
  400053: ['used',    'บัญชีนี้ใช้สิทธิ์ของแพ็กประเภทนี้ครบแล้ว'],
  400067: ['used',    'บัญชีนี้ใช้สิทธิ์ของกลุ่มโค้ดนี้ครบแล้ว'],
  400068: ['gone',    'โค้ดถูกแลกครบจำนวนแล้ว'],
  400070: ['expired', 'หมดเวลาแลกโค้ดนี้แล้ว'],
  400054: ['invalid', 'โค้ดไม่ถูกต้อง (หรือเป็นโค้ดของเซิร์ฟเวอร์อื่น)'],
  400069: ['early',   'ยังไม่ถึงเวลาแลก — จะลองใหม่รอบหน้า'],
  400073: ['retry',   'แพ็กของขวัญตั้งค่าผิดที่ฝั่งเซิร์ฟเวอร์ — จะลองใหม่รอบหน้า'],
  503001: ['failed',  'บัญชีนี้ไม่มีสิทธิ์ (ข้อความของหน้าเว็บ: ยังไม่ได้รับสิทธิ์ทดสอบ)'],
  503701: ['retry',   'เครือข่ายขัดข้อง — จะลองใหม่รอบหน้า'],
  300001: ['login',   'การเข้าสู่ระบบหมดอายุ'],
  601008: ['login',   'ต้องเข้าสู่ระบบใหม่'],
  503601: ['login',   'ต้องเข้าสู่ระบบใหม่']
};

const API = 'CdkV2/RedeemCDKey';

const STATE = `(() => {
  const shown = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const after = document.querySelector('.state.state-after');
  const input = document.querySelector('.exc-input');
  const text = el => el && shown(el) ? el.innerText.trim() : '';
  return {
    url: location.href,
    ready: !!input && !!document.querySelector('.state.state-before'),
    loggedIn: !!after && after.classList.contains('show') && shown(document.querySelector('#logined')),
    username: (document.querySelector('#logined .username') || {}).innerText || '',
    dia: text(document.querySelector('#diaTips')),
    tip: text(document.querySelector('#superTips')),
    captcha: [...document.querySelectorAll('iframe[src*="captcha" i], iframe[src*="challenge" i], [id*="captcha" i], [class*="captcha" i]')].some(shown)
  };
})()`;

class Portal {
  constructor(session, cfg) {
    this.s = session; this.cfg = cfg;
    this.origin = new URL(cfg.portal).origin;
  }

  state() { return this.s.eval(STATE); }

  // The page loaded and showing one of its two faces.
  async open() {
    await this.s.send('Page.navigate', { url: this.cfg.portal });
    const end = Date.now() + 45000;
    let st = null;
    while (Date.now() < end) {
      try { st = await this.state(); } catch (e) { if (this.s.closed) throw e; st = null; }
      if (st && st.ready) break;
      await sleep(500);
    }
    if (!st || !st.ready) throw new Error('หน้าแลกโค้ดไม่ขึ้นภายใน 45 วินาที (' + this.cfg.portal + ') — เน็ตช้า หรือหน้าเว็บเปลี่ยนโครงสร้าง');
    // the page decides signed-in / not after its scripts ran; give it a moment to settle
    await sleep(1200);
    if (this.cfg.rejectOptionalCookies) {
      // the cookie banner comes up a little after the page; it is answered with "reject all optional"
      await this.s.until(`(() => { const b = document.querySelector('#onetrust-reject-all-handler'); if (b && b.getClientRects().length) { b.click(); return true; } return false; })()`, 2500, 500);
    }
    return this.state();
  }

  // Waits while the player signs in (Garena's page, any captcha there, two-step codes: all theirs).
  async waitLogin(minutes, note) {
    const end = Date.now() + minutes * 60000;
    let told = 0;
    for (;;) {
      let st = null;
      try { st = await this.state(); } catch (e) { if (this.s.closed) throw e; }
      const here = st && st.url.startsWith(this.origin);
      if (here && st.ready && st.loggedIn) return st;
      // Garena's sign-in page refusing this browser: nothing to wait for, and nothing here will try to get past it
      let refused = false;
      try { refused = await this.s.eval(`!!document.body && /Access is temporarily restricted|unusual activity from your device/i.test(document.body.innerText)`); } catch (e) { if (this.s.closed) throw e; }
      if (refused) return { blocked: true };
      if (Date.now() >= end) return null;
      if (note && Date.now() - told > 60000) { note(Math.ceil((end - Date.now()) / 60000)); told = Date.now(); }
      await sleep(1500);
    }
  }

  // Takes the player to Garena's sign-in page (the page's own button).
  clickSignIn() {
    return this.s.eval(`(() => { const b = document.querySelector('.main-box .btn-signin') || document.querySelector('#btn-login'); if (b) b.click(); return !!b; })()`);
  }

  // The page keeps the sign-in in cookies that end with the browser session. Give them a
  // date so the next run is still signed in. They stay inside the browser profile — this
  // tool never writes them anywhere else.
  async keepLogin() {
    const days = Number(this.cfg.keepLoginDays) || 0;
    if (!days) return 0;
    const { cookies } = await this.s.send('Network.getCookies', { urls: [this.origin + '/'] });
    let n = 0;
    for (const c of cookies) {
      if (!c.session || !/^(user_info|garena_channel_info)$/.test(c.name)) continue;
      const r = await this.s.send('Network.setCookie', {
        name: c.name, value: c.value, domain: c.domain, path: c.path,
        secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
        expires: Math.floor(Date.now() / 1000) + days * 86400
      });
      if (r.success) n++;
    }
    return n;
  }

  async logout() {
    await this.s.eval(`(() => { const b = document.querySelector('#btn-logout'); if (b) b.click(); })()`);
    await sleep(2500);
    const { cookies } = await this.s.send('Network.getCookies', { urls: [this.origin + '/'] });
    for (const c of cookies) {
      if (/^(user_info|garena_channel_info)$/.test(c.name)) await this.s.send('Network.deleteCookies', { name: c.name, domain: c.domain, path: c.path });
    }
  }

  // One code → { status, text, api }.  status: ok used gone expired invalid early retry failed login captcha
  async redeem(code) {
    const s = this.s;
    let reqId = null, answer = null;
    const offs = [
      s.on('Network.requestWillBeSent', p => {
        if (p.request.method === 'POST' && p.request.url.includes(API)) reqId = p.requestId;
      }),
      s.on('Network.loadingFinished', p => {
        if (p.requestId !== reqId) return;
        s.send('Network.getResponseBody', { requestId: reqId }).then(r => {
          try { answer = JSON.parse(r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body); }
          catch (e) { answer = { code: -1, msg: 'คำตอบอ่านไม่ได้' }; }
        }).catch(() => { answer = { code: -1, msg: 'อ่านคำตอบไม่ได้' }; });
      }),
      s.on('Network.loadingFailed', p => { if (p.requestId === reqId) answer = { code: -1, msg: p.errorText || 'ส่งไม่สำเร็จ' }; })
    ];
    try {
      const before = await this.state();
      if (!before.loggedIn) return { status: 'login', text: 'ยังไม่ได้เข้าสู่ระบบ' };
      if (before.captcha) return { status: 'captcha', text: 'หน้าเว็บขอให้ยืนยันตัวตน' };

      // close what the last code left on the screen, then type and press — as the page expects
      const put = await s.eval(`(() => {
        const dia = document.querySelector('#diaTips .btn-close'); if (dia && dia.getClientRects().length) dia.click();
        const input = document.querySelector('.exc-input'), btn = document.querySelector('.btn-exchange');
        if (!input || !btn) return false;
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(code)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        btn.click();
        return true;
      })()`);
      if (!put) return { status: 'retry', text: 'ไม่พบช่องกรอกโค้ดหรือปุ่มแลกบนหน้าเว็บ' };

      const end = Date.now() + 25000;
      let st = null;
      while (!answer && Date.now() < end) {
        await sleep(300);
        try { st = await this.state(); } catch (e) { st = null; }
        if (st && st.captcha) return { status: 'captcha', text: 'หน้าเว็บขอให้ยืนยันตัวตน' };
        if (st && st.ready && !st.loggedIn && !reqId) return { status: 'login', text: 'หน้าเว็บพาออกจากระบบ' };
      }
      await sleep(600); // let the page put its own message up
      try { st = await this.state(); } catch (e) { st = null; }
      const shown = st ? (st.dia || st.tip) : '';

      // an answer that could not be read: the page may have signed out and reloaded under us
      if (answer && answer.code === -1) {
        const until = Date.now() + 6000;
        while (Date.now() < until && !(st && st.ready)) { await sleep(400); try { st = await this.state(); } catch (e) { st = null; } }
        if (st && st.ready && !st.loggedIn) return { status: 'login', text: 'หน้าเว็บพาออกจากระบบ' };
      }
      if (!answer) return { status: 'retry', text: shown || 'หน้าเว็บไม่ตอบภายใน 25 วินาที' };
      const known = RESULT[answer.code];
      if (known) return { status: known[0], text: known[1], api: answer.code, page: shown };
      return { status: 'retry', text: shown || answer.msg || 'คำตอบที่ไม่รู้จัก', api: answer.code, page: shown };
    } finally {
      offs.forEach(off => off());
      try {
        await s.eval(`(() => { const dia = document.querySelector('#diaTips .btn-close'); if (dia && dia.getClientRects().length) dia.click();
          const input = document.querySelector('.exc-input'); if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
      } catch (e) { /* the page is reloading */ }
    }
  }
}

module.exports = { Portal, RESULT };
