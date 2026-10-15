function (ORIGINS) {
  // DELTAFORE fill helper — runs in the redemption page, in the player's own browser (computer,
  // phone or tablet), when the player presses the bookmark. The control room opens the page with
  // the queue in the address (#df=…); the helper keeps it in this tab, puts one code at a time in
  // the page's field, triggers confirmation (automatically or on click), reads the page's answer,
  // pauses, and goes on. Results go to the control room at once when its window is there, and
  // with the link back.
  var W = window, D = document, STORE = 'df-helper-job';
  if (W.__dfHelper) { W.__dfHelper.again(); return; }
  var $ = function (s) { return D.querySelector(s); };
  var CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{3,39}$/;
  var FILED = { ok: 1, used: 1, expired: 1, invalid: 1, gone: 1, early: 1 };
  var b64 = {
    dec: function (s) { return JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/'))); },
    enc: function (o) { return btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  };

  // ── the job: from the address the first time, from this tab's own storage after a reload ──
  var job = null;
  var save = function () { try { sessionStorage.setItem(STORE, JSON.stringify(job)); } catch (e) { /* private mode */ } };
  var fromAddress = function () {
    try {
      var m = /[#&]df=([A-Za-z0-9_-]+)/.exec(location.hash);
      if (!m) return false;
      var p = b64.dec(m[1]), back = String(p.b || '');
      if (!ORIGINS.some(function (o) { return back === o || back.indexOf(o + '/') === 0; })) back = '';
      job = {
        q: (p.q || []).map(String).filter(function (c) { return CODE.test(c); }).slice(0, 200),
        d: Math.min(120, Math.max(3, Number(p.d) || 10)), b: back, g: /^[a-z0-9]{2,20}$/.test(p.g || '') ? p.g : '',
        a: p.a === 1 || p.a === true || p.a === '1' ? 1 : 0,
        r: {}, skip: {}
      };
      history.replaceState(null, '', location.pathname + location.search);
      save();
      return true;
    } catch (e) { return false; }
  };
  if (!fromAddress()) { try { job = JSON.parse(sessionStorage.getItem(STORE)); } catch (e) { job = null; } }

  // ── the bar ──
  var el = function (tag, css, text) { var e = D.createElement(tag); e.style.cssText = css; if (text) e.textContent = text; return e; };
  var BTN = 'min-height:38px;padding:6px 14px;border:1px solid #3d5239;background:#1b251a;color:#e6ead8;font:600 14px/1.2 Tahoma,"Leelawadee UI",sans-serif;border-radius:4px;cursor:pointer;-webkit-appearance:none;margin:0';
  var bar = el('div', 'position:fixed;left:0;right:0;top:0;z-index:2147483647;box-sizing:border-box;padding:8px 12px 10px;padding-top:calc(8px + env(safe-area-inset-top, 0px));' +
    'background:#10150f;color:#e6ead8;border-bottom:2px solid #e9b949;font:15px/1.45 Tahoma,"Leelawadee UI",sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.55);text-align:center');
  var row = el('div', 'display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;justify-content:center');
  var title = el('b', 'color:#e9b949;letter-spacing:.06em', 'DELTAFORE');
  var count = el('span', 'color:#97a48c');
  var codeEl = el('span', 'font:700 18px/1.2 Consolas,"Courier New",monospace;color:#f6dc8c;letter-spacing:.06em;overflow-wrap:anywhere');
  var goB = el('button', BTN + ';background:#e9b949;color:#1a1405;border-color:#f6dc8c;font-weight:700', 'ยืนยัน · ไปแลก');
  var pauseB = el('button', BTN + ';background:#243322', 'พักชั่วคราว');
  var autoLabel = el('label', 'display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:14px;color:#f6dc8c;margin:0 4px;user-select:none');
  var autoCb = el('input', 'cursor:pointer;accent-color:#e9b949;width:16px;height:16px'); autoCb.type = 'checkbox';
  autoLabel.appendChild(autoCb); autoLabel.appendChild(D.createTextNode('กดแลกอัตโนมัติ'));
  var againB = el('button', BTN, 'ใส่โค้ดนี้อีกครั้ง');
  var skipB = el('button', BTN, 'ข้าม');
  var loadB = el('button', BTN + ';background:#e9b949;color:#1a1405;font-weight:700', 'ดึงโค้ดอัตโนมัติ ⚡');
  var backA = el('a', BTN + ';text-decoration:none;display:inline-flex;align-items:center', 'กลับศูนย์โค้ด');
  var line = el('div', 'margin-top:6px;color:#d5dbc6');
  [goB, pauseB, againB, skipB, loadB].forEach(function (b) { b.type = 'button'; });
  goB.id = 'df-go'; pauseB.id = 'df-pause'; autoCb.id = 'df-auto-cb'; againB.id = 'df-again'; skipB.id = 'df-skip'; loadB.id = 'df-load'; backA.id = 'df-back'; line.id = 'df-line'; bar.id = 'df-bar';
  [title, count, codeEl, goB, pauseB, autoLabel, againB, skipB, loadB, backA].forEach(function (e) { row.appendChild(e); });
  bar.appendChild(row); bar.appendChild(line); D.body.appendChild(bar);

  var room = W.opener;
  var tell = function (msg) {
    msg.df = 1;
    for (var i = 0; i < ORIGINS.length; i++) { try { if (room && !room.closed) room.postMessage(msg, ORIGINS[i]); } catch (e) { /* not that address */ } }
  };
  var signedIn = function () { var a = $('.state.state-after'); return !!a && a.classList.contains('show'); };

  // What a message of the page means — from the page's own table of texts, in every language it carries.
  var KEYS = {
    lang5: 'ok', lang_1: 'used', lang1: 'used', error_hint_400067: 'used', error_hint_400072: 'used',
    error_hint_400068: 'gone', error_hint_400070: 'expired', lang12: 'invalid', error_hint_400069: 'early',
    lang2: 'noaccess', networkError: 'retry', lang6: 'retry', error_hint_400073: 'retry'
  };
  var MEANS = {}, G = W.GLanguage || {};
  for (var lang in G) for (var key in KEYS) if (G[lang] && G[lang][key]) MEANS[String(G[lang][key]).replace(/\s+/g, ' ').trim()] = KEYS[key];

  var input = $('.exc-input'), button = $('.btn-exchange');
  // none · login · filled · wait · pause · ask · done
  var state = 'none', code = null, pressed = false, timer = null, autoTimer = null, until = 0, said = '', paused = false;
  var left = function () { return job ? job.q.filter(function (c) { return !job.r[c] && !job.skip[c]; }) : []; };
  var ring = function (on) { if (button) { button.style.outline = on ? '4px solid #e9b949' : ''; button.style.outlineOffset = on ? '5px' : ''; } };
  var label = function () { return (button && button.textContent.replace(/\s+/g, ' ').trim()) || 'ไปแลก'; };

  var cancelAuto = function () { if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; } };
  var triggerAuto = function () {
    cancelAuto();
    if (paused || !job || !job.a || state !== 'filled' || !button) return;
    autoTimer = setTimeout(function () {
      if (state === 'filled' && !paused && job && job.a && button && !pressed) {
        button.click();
      }
    }, 1200);
  };

  var show = function () {
    var isAuto = job && job.a;
    autoCb.checked = !!isAuto;
    var filed = job ? Object.keys(job.r).length : 0;
    count.textContent = job ? (job.q.length - left().length + (code ? 1 : 0)) + '/' + job.q.length : '';
    codeEl.textContent = code || '';
    goB.style.display = (state === 'filled' && (!isAuto || paused)) ? '' : 'none';
    pauseB.style.display = (state === 'filled' || state === 'pause' || state === 'wait') ? '' : 'none';
    pauseB.textContent = paused ? 'ทำต่อ ▶' : 'พักชั่วคราว';
    autoLabel.style.display = job ? 'inline-flex' : 'none';
    againB.style.display = state === 'ask' ? '' : 'none';
    skipB.style.display = state === 'filled' || state === 'ask' ? '' : 'none';
    backA.style.display = job && job.b ? 'inline-flex' : 'none';
    loadB.style.display = state === 'none' ? '' : 'none';
    if (job && job.b) {
      backA.href = job.b + '#res=' + b64.enc({ g: job.g, r: Object.keys(job.r).map(function (c) { return [c, job.r[c].s]; }) });
      backA.textContent = filed ? 'กลับศูนย์โค้ด (ส่งผล ' + filed + ' รายการ)' : 'กลับศูนย์โค้ด';
    }
    var sec = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    line.textContent =
      paused ? '⏸ พักชั่วคราว — กด «ทำต่อ ▶» เพื่อดำเนินการต่อ'
      : state === 'none' ? 'ยังไม่มีคิว — กด «ดึงโค้ดอัตโนมัติ ⚡» หรือเปิดจากศูนย์โค้ด'
      : state === 'login' ? 'เข้าสู่ระบบ Garena ด้วยตัวคุณเองก่อน แล้วกดบุ๊กมาร์กนี้อีกครั้ง (คิวยังอยู่)'
      : state === 'filled' ? (isAuto ? 'ใส่โค้ด ' + code + ' ให้แล้ว — กำลังกดยืนยันอัตโนมัติ… (หรือกดปุ่ม «' + label() + '» ทันที)' : 'ใส่โค้ดให้แล้ว — กด «ยืนยัน · ไปแลก» หรือปุ่ม «' + label() + '» ของหน้าเว็บ')
      : state === 'wait' ? 'ส่งแล้ว รอคำตอบของหน้าเว็บ…'
      : state === 'pause' ? '«' + said + '» — จดแล้ว · โค้ดถัดไปในอีก ' + sec + ' วินาที'
      : state === 'ask' ? 'หน้าเว็บตอบว่า «' + said + '» — ใส่โค้ดนี้อีกครั้ง หรือข้าม'
      : 'หมดคิวแล้ว — จดผล ' + filed + ' รายการ' + (job.b ? ' · กด «กลับศูนย์โค้ด»' : '');
    D.body.style.paddingTop = bar.offsetHeight + 'px';       // the bar must not sit on the page's own header
  };
  loadB.onclick = function () {
    line.textContent = 'กำลังดึงรายการโค้ดล่าสุด…';
    fetch('https://kmuttbkt-teccom.github.io/deltafore/data/codes.json?_=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (db) {
        var q = Object.values(db.codes || {})
          .filter(function (e) { return ['new', 'early', 'retry'].includes(e.status); })
          .map(function (e) { return e.code; });
        if (!q.length) {
          q = Object.values(db.codes || {})
            .filter(function (e) { return !['invalid', 'expired', 'gone'].includes(e.status); })
            .map(function (e) { return e.code; });
        }
        if (q.length) {
          job = {
            q: q, d: 8, b: 'https://kmuttbkt-teccom.github.io/deltafore/', g: 'deltaforce', a: 1, r: {}, skip: {}
          };
          save();
          next();
        } else {
          line.textContent = 'ไม่พบโค้ดที่รอแลก';
        }
      })
      .catch(function (e) { line.textContent = 'เชื่อมต่อศูนย์โค้ดไม่ได้ (' + e.message + ')'; });
  };
  var beat = function () { tell({ type: 'state', state: state, code: code, text: said, done: job ? job.q.length - left().length : 0, total: job ? job.q.length : 0, sec: Math.max(0, Math.ceil((until - Date.now()) / 1000)), auto: job ? !!job.a : false, paused: paused }); };
  var set = function (s) { state = s; show(); beat(); };

  var fill = function (c) {
    cancelAuto();
    var close = $('#diaTips .btn-close');
    if (close && $('#diaTips').getClientRects().length) close.click();          // the box of the last answer
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, c);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    code = c; pressed = false; ring(true);
    set('filled');
    triggerAuto();
  };
  var next = function () {
    clearTimeout(timer); timer = null; cancelAuto(); until = 0; code = null; pressed = false; ring(false);
    if (!job || !job.q.length) return set('none');
    if (!input || !button) { said = 'ไม่พบช่องกรอกโค้ดในหน้านี้'; return set('ask'); }
    if (!signedIn()) return set('login');
    var q = left();
    if (!q.length) return set('done');
    fill(q[0]);
  };
  var sent = function () {                                  // sending: player click or auto click
    cancelAuto();
    pressed = true; ring(false); set('wait');
    clearTimeout(timer);
    timer = setTimeout(function () { if (state === 'wait') { said = 'หน้าเว็บไม่ตอบใน 20 วินาที'; pressed = false; set('ask'); } }, 20000);
  };

  // The page shows every answer through these two functions; the text is read on its way to the screen.
  var answer = function (text) {
    text = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!code || !pressed || !text) return;                 // not the answer to the code we put in
    var status = MEANS[text] || 'unknown';
    clearTimeout(timer); cancelAuto(); pressed = false; said = text;
    if (!FILED[status]) return set('ask');                  // the player decides: again, or skip
    job.r[code] = { s: status, t: text }; save();
    tell({ type: 'result', code: code, status: status, text: text });
    code = null; until = Date.now() + job.d * 1000;
    timer = setTimeout(function () { if (!paused) next(); }, job.d * 1000);
    set('pause');
  };
  ['setSuperTips', 'setDiaTips'].forEach(function (name) {
    var f = W[name];
    if (typeof f !== 'function') return;
    W[name] = function (t) { try { answer(t); } catch (e) { /* never in the page's way */ } return f.apply(this, arguments); };
  });

  autoCb.addEventListener('change', function () {
    if (job) { job.a = autoCb.checked ? 1 : 0; save(); }
    if (job && job.a) { if (state === 'filled') triggerAuto(); }
    else { cancelAuto(); }
    show(); beat();
  });
  pauseB.addEventListener('click', function () {
    paused = !paused;
    if (paused) {
      cancelAuto();
      if (timer) { clearTimeout(timer); timer = null; }
    } else {
      if (state === 'filled') triggerAuto();
      else if (state === 'pause') next();
    }
    show(); beat();
  });
  if (button) button.addEventListener('click', function () { if (state === 'filled' && input.value.trim() === code) sent(); }, true);
  goB.addEventListener('click', function () { if (state === 'filled' && button) button.click(); });
  againB.addEventListener('click', function () { if (state === 'ask' && code && signedIn() && input) fill(code); else next(); });
  skipB.addEventListener('click', function () { cancelAuto(); if (code) { job.skip[code] = 1; save(); } next(); });

  setInterval(function () { if (state === 'pause' && !paused) { show(); beat(); } }, 1000);
  W.addEventListener('hashchange', function () { if (fromAddress()) next(); });     // a new queue from the control room
  W.__dfHelper = { again: function () { if (fromAddress()) next(); else { show(); beat(); } } };
  next();
}
