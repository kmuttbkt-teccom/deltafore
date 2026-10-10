'use strict';
// Tab 04 — weapon build share codes: a list to search and copy from. It leans on app.js for
// $ / $$ / esc / copyText / refresh and the state S, and talks to the server with its own
// requests (/api/builds…). Without a server (the page opened as plain files) it reads
// data/builds.json and keeps the stars in this browser.

(() => {
  const CLS = { AR: 'ไรเฟิลจู่โจม', BR: 'แบทเทิลไรเฟิล', SMG: 'ปืนกลมือ', SR: 'สไนเปอร์', DMR: 'มาร์กส์แมน', LMG: 'ปืนกล', SG: 'ลูกซอง', HG: 'ปืนพก' };
  let all = [], pics = {}, pages = 0, loaded = false, live = true, mode = 'all', cls = '', q = '';

  // The picture on a card: the real firearm the weapon is modelled on (a free-licensed photo
  // from Wikipedia / Wikimedia Commons, with a link to its page) — or, where there is none,
  // a plain outline of the weapon's class, drawn here.
  const CLASS_WORDS = /(?: Compact)? (?:Assault Rifle|Carbine|Battle Rifle|Submachine Gun|Sniper Rifle|Marksman Rifle|Light Machine Gun|General Machine Gun|Machine Gun|Shotgun|Pistol|Revolver)$/;
  const modelOf = name => name.replace(CLASS_WORDS, '');
  const LONG = '<path d="M8 36l50-5v14L8 52z"/><path d="M58 29h92v17H58z"/><path d="M92 46h13l-7 21H86z"/>';
  const SIL = {
    AR: LONG + '<path d="M150 34h74v5h-74z"/><path d="M150 31h46v11h-46z"/><path d="M113 46h16l7 27h-17z"/><path d="M204 26h4v8h-4z"/>',
    BR: LONG + '<path d="M150 34h80v5h-80z"/><path d="M150 31h52v11h-52z"/><path d="M113 46h17v25h-17z"/><path d="M74 22h40v6H74z"/>',
    SMG: '<path d="M30 38l34-6v12l-34 8z"/><path d="M64 29h74v17H64z"/><path d="M138 34h40v5h-40z"/><path d="M92 46h13l-7 21H86z"/><path d="M112 46h12v30h-12z"/>',
    SR: LONG + '<path d="M150 35h84v4h-84z"/><path d="M68 15h74v9H68z"/><path d="M82 24h6v5h-6zM124 24h6v5h-6z"/><path d="M112 46h14v12h-14z"/><path d="M200 39l-9 30h4l8-30zM204 39l9 30h-4l-8-30z"/>',
    DMR: LONG + '<path d="M150 35h78v4h-78z"/><path d="M150 32h40v10h-40z"/><path d="M76 17h56v8H76z"/><path d="M86 25h6v4h-6zM118 25h6v4h-6z"/><path d="M113 46h15v22h-15z"/>',
    LMG: LONG + '<path d="M150 34h80v5h-80z"/><path d="M150 31h40v11h-40z"/><path d="M108 46h34v24h-34z"/><path d="M196 39l-9 30h4l8-30zM200 39l9 30h-4l-8-30z"/><path d="M98 22h34v4H98z"/>',
    SG: LONG + '<path d="M150 33h78v5h-78z"/><path d="M150 40h66v5h-66z"/><path d="M166 38h30v12h-30z"/>',
    HG: '<path d="M72 26h98v17H72z"/><path d="M80 43h30l-9 33H74z"/><path d="M110 43h22v4a10 10 0 0 1-10 10h-12z" fill-opacity=".55"/><path d="M166 22h4v4h-4z"/>'
  };
  const outline = c => `<svg viewBox="0 0 240 86" role="img" aria-label="ภาพเงาตามประเภทปืน"><g fill="currentColor">${SIL[c] || SIL.AR}</g></svg>`;
  // What the build is made of — where a source page lists it — slot by slot, and the page itself
  // (it shows the build as it looks in the game; the game's own pictures are not copied here).
  const SLOT_TH = { Muzzle: 'ปากกระบอก', Barrel: 'ลำกล้อง', Optic: 'ศูนย์เล็ง', Stock: 'พานท้าย', Mag: 'แม็กกาซีน', Foregrip: 'กริปหน้า', 'Rear Grip': 'ด้ามจับ',
    'Right Rail': 'รางขวา', 'Left Rail': 'รางซ้าย', 'Upper Patch': 'การ์ดมือบน', Handguard: 'การ์ดมือ', 'Upper Handguard': 'การ์ดมือบน', 'Gas Block': 'แก๊สบล็อก',
    'Cheek Pad': 'แก้มประทับ', 'Mag Mount': 'ตัวช่วยเปลี่ยนแม็ก', 'Grip Mount': 'ฐานกริป', 'Heat Shield': 'กันความร้อน', 'Charging Handle': 'คันรั้งลูกเลื่อน', Unique: 'ชิ้นพิเศษ' };
  const STYLE_TH = { 'Long Range': 'ระยะไกล', 'Close Range': 'ระยะประชิด', Sniper: 'ซุ่มยิง', Secondary: 'ปืนรอง', 'Hip fire': 'ยิงไม่เล็ง' };
  const made = b => {
    const n = b.att ? Object.keys(b.att).length : 0;
    const facts = [b.style && 'สไตล์: ' + (STYLE_TH[b.style] || b.style), b.pick && 'มีคนใช้ ' + b.pick + '%', b.updated && 'ข้อมูลเมื่อ ' + new Date(b.updated).toLocaleDateString('th-TH-u-ca-gregory', { month: 'short', year: 'numeric' })].filter(Boolean);
    const list = n ? `<details class="att"><summary>แต่งอะไรบ้าง · ${n}${b.count && b.count !== n ? ' จาก ' + b.count : ''} ชิ้น</summary><dl>${Object.keys(b.att).map(k => `<dt>${esc(SLOT_TH[k] || k)}</dt><dd>${esc(b.att[k])}</dd>`).join('')}</dl></details>`
      : b.count ? `<div class="att-none">แต่ง ${b.count} ชิ้น — รายการชิ้นส่วนดูได้ที่หน้าต้นทาง</div>` : '';
    const link = b.link ? `<a class="src-link" href="${esc(b.link)}" target="_blank" rel="noopener">ดูชุดแต่งนี้ (รูปในเกม) ที่ต้นทาง ↗</a>` : '';
    return (facts.length ? `<div class="facts">${esc(facts.join(' · '))}</div>` : '') + list + link;
  };
  const picture = b => {
    const p = pics[modelOf(b.name)];
    // the weapon as it looks in the game: shown from the site that hosts it (named and linked), never copied here
    if (p && p.game) return `<div class="pic game" data-cls="${esc(b.cls)}"><img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${esc(p.src)}" alt="${esc(modelOf(b.name))} ในเกม"></div><a class="cred" href="${esc(p.page)}" target="_blank" rel="noopener">ภาพในเกม · แสดงจาก ${esc(p.by)} ↗</a>`;
    return p ? `<div class="pic" data-cls="${esc(b.cls)}"><img loading="lazy" decoding="async" src="${esc(p.src)}" alt="ปืนจริงต้นแบบ: ${esc(p.real)}" width="${Number(p.w) || 480}" height="${Number(p.h) || 240}"></div><a class="cred" href="${esc(p.page)}" target="_blank" rel="noopener">ยังไม่มีภาพในเกมของรุ่นนี้ — ปืนจริงต้นแบบ: ${esc(p.real)} · ภาพ Wikimedia</a>`
      : `<div class="pic none">${outline(b.cls)}</div><span class="cred">ยังไม่มีรูปของรุ่นนี้ — ภาพเงาตามประเภท</span>`;
  };

  const call = async (path, body) => {
    const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'HTTP ' + r.status);
    return r.json();
  };
  const marks = () => { try { return JSON.parse(localStorage.getItem('df_build_marks') || '{}'); } catch (e) { return {}; } };
  // "did this code import into my game?" — the pages these codes come from serve the Global game, and
  // Garena says its codes are its own. What the player found is kept in this browser (mine.js): { code: 'ok' | 'no' }
  const works = () => Mine.get('works', {});

  async function load() {
    try {
      const d = await call('/api/builds');
      all = d.builds; pics = d.pictures || {}; pages = d.pages; live = true;
    } catch (e) {                                           // no server behind this page: the file, read-only
      try {
        const d = await (await fetch('data/builds.json')).json();
        const mk = marks();
        all = Object.values(d.builds || {}).map(b => Object.assign(b, mk[b.code] || {}));
        live = false;
        try { pics = await (await fetch('data/build-pictures.json')).json(); } catch (e3) { pics = {}; }
      } catch (e2) { all = []; live = false; }
    }
    loaded = true;
    draw();
  }

  function draw() {
    const n = f => all.filter(b => !b.hidden).filter(f).length;
    const chips = [['all', 'ทั้งหมด', n(() => true)], ['Warfare', 'Warfare', n(b => b.mode === 'Warfare')], ['Operations', 'Operations', n(b => b.mode === 'Operations')], ['fav', '⭐ ที่ชอบ', n(b => b.fav)]];
    const w = works();
    if (n(b => w[b.code] === 'ok')) chips.push(['works', '✓ นำเข้าได้', n(b => w[b.code] === 'ok')]);
    if (n(b => w[b.code] === 'no')) chips.push(['fails', '✗ นำเข้าไม่ได้', n(b => w[b.code] === 'no')]);
    if (all.some(b => b.hidden)) chips.push(['hidden', 'ซ่อนไว้', all.filter(b => b.hidden).length]);
    if (!chips.some(c => c[0] === mode)) mode = 'all';       // the last build of a filter was unmarked
    const shown = all.filter(b => mode === 'hidden' ? b.hidden : !b.hidden);
    const classes = Object.keys(CLS).filter(k => all.some(b => !b.hidden && b.cls === k));
    $('#bd-filters').innerHTML = chips.map(c => `<button class="fchip ${mode === c[0] ? 'on' : ''}" data-bm="${c[0]}">${c[1]}<b>${c[2]}</b></button>`).join('') +
      classes.map(k => `<button class="fchip ${cls === k ? 'on' : ''}" data-bc="${k}">${CLS[k]}</button>`).join('');
    const want = q.trim().toLowerCase();
    const rows = shown
      .filter(b => mode === 'all' || mode === 'hidden' || (mode === 'fav' ? b.fav : mode === 'works' ? w[b.code] === 'ok' : mode === 'fails' ? w[b.code] === 'no' : b.mode === mode))
      .filter(b => !cls || b.cls === cls)
      .filter(b => !want || b.name.toLowerCase().includes(want) || b.code.toLowerCase().includes(want))
      .sort((a, b) => (w[a.code] === 'no') - (w[b.code] === 'no'));        // the ones that did not import go last
    $('#bd-list').innerHTML = rows.map(b => `<div class="bd m-${esc(b.mode)} ${b.fav ? 'fav' : ''} ${w[b.code] === 'ok' ? 'w-ok' : w[b.code] === 'no' ? 'w-no' : ''}">
      <button class="star" data-bstar="${esc(b.code)}" title="${b.fav ? 'เอาออกจากที่ชอบ' : 'เก็บไว้ในที่ชอบ'}" aria-label="ที่ชอบ">${b.fav ? '★' : '☆'}</button>
      ${picture(b)}
      <h3>${esc(b.name)}</h3>
      <div class="tags"><span class="tag m">${esc(b.mode)}</span>${b.cls ? `<span class="tag">${CLS[b.cls]}</span>` : ''}${w[b.code] === 'ok' ? '<span class="tag ok">นำเข้าได้ ✓</span>' : w[b.code] === 'no' ? '<span class="tag bad">นำเข้าไม่ได้</span>' : ''}</div>
      <div class="code">${esc(b.full)}</div>
      ${made(b)}
      <div class="from">${(b.seen || []).length ? 'จาก ' + esc(b.seen.join(' · ')) : 'เพิ่มเอง'}</div>
      <div class="acts"><button class="btn gold mini" data-bcopy="${esc(b.code)}">คัดลอก</button><button class="btn ghost mini" data-bhide="${esc(b.code)}">${b.hidden ? 'เอากลับมา' : 'ซ่อน'}</button></div>
      <div class="tried">ลองในเกมแล้ว:<button class="${w[b.code] === 'ok' ? 'on ok' : ''}" data-bwork="${esc(b.code)}" data-to="ok" aria-pressed="${w[b.code] === 'ok'}">✓ นำเข้าได้</button><button class="${w[b.code] === 'no' ? 'on no' : ''}" data-bwork="${esc(b.code)}" data-to="no" aria-pressed="${w[b.code] === 'no'}">✗ ไม่ได้</button></div>
    </div>`).join('');
    $('#bd-empty').hidden = rows.length > 0;
    $('#bd-empty').textContent = !all.length ? 'ยังไม่มีโค้ดแต่งปืน — กด "ตรวจหาโค้ดแต่งปืนใหม่"' : 'ไม่มีชุดแต่งที่ตรงกับตัวกรอง';
    $('#bd-count').textContent = all.filter(b => !b.hidden).length + ' ชุดแต่ง' + (pages ? ' · เฝ้า ' + pages + ' เว็บ' : '') + (live ? '' : ' · อ่านจากไฟล์ (ไม่มีเซิร์ฟเวอร์)');
    $('#bd-scan').disabled = !live; $('#bd-add').disabled = !live;
  }

  const say = (id, text, kind) => { const el = $(id); el.textContent = text; el.className = 'hint ' + (kind || ''); };

  async function mark(code, to, patch) {
    const b = all.find(x => x.code === code); if (!b) return;
    Object.assign(b, patch); draw();
    if (live) return call('/api/builds/mark', { code, to }).catch(e => say('#bd-msg', e.message, 'bad'));
    const mk = marks(); mk[code] = Object.assign(mk[code] || {}, patch);
    try { localStorage.setItem('df_build_marks', JSON.stringify(mk)); } catch (e) { /* not kept */ }
  }

  async function scan() {
    try {
      const r = await call('/api/job?game=deltaforce', { cmd: 'builds' });
      if (!r.started) return say('#bd-msg', 'มีงานอื่นทำอยู่ — รอสักครู่แล้วกดอีกครั้ง', 'bad');
    } catch (e) { return say('#bd-msg', e.message, 'bad'); }
    say('#bd-msg', 'กำลังตรวจหน้าเว็บ…');
    const before = all.length;
    if (typeof refresh === 'function') refresh();           // app.js then follows the command (its log is on tab 01)
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (i > 1 && typeof S === 'object' && S && !(S.job.running && S.job.cmd === 'builds')) break;
    }
    await load();
    say('#bd-msg', all.length > before ? 'พบชุดแต่งใหม่ ' + (all.length - before) + ' รายการ' : 'ไม่มีชุดแต่งใหม่', 'ok');
  }

  async function add() {
    const text = $('#bd-input').value.trim();
    if (!text) return say('#bd-addmsg', 'วางบรรทัดโค้ดแต่งปืนก่อน', 'bad');
    try {
      const r = await call('/api/builds/add', { text });
      const parts = [];
      if (r.added) parts.push('เพิ่ม ' + r.added + ' ชุด');
      if (r.known) parts.push('มีอยู่แล้ว ' + r.known);
      if (r.bad.length) parts.push('ไม่ใช่รูปแบบ "ชื่อปืน-โหมด-โค้ด": ' + r.bad.length + ' บรรทัด');
      say('#bd-addmsg', parts.join(' · '), r.bad.length ? 'bad' : 'ok');
      if (!r.bad.length) $('#bd-input').value = '';
      await load();
    } catch (e) { say('#bd-addmsg', e.message, 'bad'); }
  }

  document.addEventListener('click', async ev => {
    const t = ev.target.closest('button'); if (!t) return;
    if (t.dataset.bm) { mode = t.dataset.bm; return draw(); }
    if (t.dataset.bc) { cls = cls === t.dataset.bc ? '' : t.dataset.bc; return draw(); }
    if (t.dataset.bcopy) {
      const b = all.find(x => x.code === t.dataset.bcopy); if (!b) return;
      const ok = await copyText(b.full);
      t.textContent = ok ? 'คัดลอกแล้ว ✓' : 'คัดลอกไม่ได้ — แตะค้างที่โค้ด';
      setTimeout(() => { t.textContent = 'คัดลอก'; }, 1800);
      return;
    }
    if (t.dataset.bstar) { const b = all.find(x => x.code === t.dataset.bstar); return b && mark(b.code, b.fav ? 'unfav' : 'fav', { fav: !b.fav }); }
    if (t.dataset.bhide) { const b = all.find(x => x.code === t.dataset.bhide); return b && mark(b.code, b.hidden ? 'show' : 'hide', { hidden: !b.hidden }); }
    if (t.dataset.bwork) {                                  // pressed again: the mark is taken off
      const w = works();
      if (w[t.dataset.bwork] === t.dataset.to) delete w[t.dataset.bwork]; else w[t.dataset.bwork] = t.dataset.to;
      Mine.set('works', w);
      return draw();
    }
    if (t.id === 'bd-scan') return scan();
    if (t.id === 'bd-add') return add();
  });
  $('#bd-q').addEventListener('input', ev => { q = ev.target.value; draw(); });
  // a picture that does not come (its site is down, or stopped lending it): the outline of the class instead
  $('#bd-list').addEventListener('error', ev => {
    const box = ev.target.tagName === 'IMG' && ev.target.closest('.pic'); if (!box) return;
    box.className = 'pic none'; box.innerHTML = outline(box.dataset.cls);
    const cred = box.nextElementSibling; if (cred && cred.classList.contains('cred')) cred.textContent = 'โหลดรูปไม่ได้ — ภาพเงาตามประเภท';
  }, true);

  const open = () => { if (location.hash === '#builds' && !loaded) load(); };
  window.addEventListener('hashchange', open);
  open();
  // this tab belongs to one game: on another game it gives way to the first tab
  setInterval(() => { if (typeof S === 'object' && S && S.game !== 'deltaforce' && location.hash === '#builds') location.hash = 'codes'; }, 1000);
})();
