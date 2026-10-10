'use strict';
// Tab 07 — the player's own: a checklist that comes back unticked each day / week (checklist.json),
// the fishing handbook (fish.json), and carrying all of it to another device as one file.
// Everything ticked here is kept in this browser (mine.js). It leans on app.js for
// $ / $$ / esc / api / S / FINAL / copyText and draws two chips into the header.

(() => {
  const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const BY = { float: ['🎈', 'คันทุ่น'], lure: ['🎣', 'คันเหยื่อปลอม'], both: ['🎈🎣', 'ได้ทั้งสองแบบ'] };
  const CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{3,39}$/;
  let list = null, book = null, tab = 'check', packed = '', plan = null;
  try { const t = sessionStorage.getItem('df-my'); if (['check', 'fish', 'move'].includes(t)) tab = t; } catch (e) {}

  // ── the checklist ──
  // A tick is kept as the period it was made in: when the day (or the week) turns at the game's
  // reset hour, the kept period no longer matches and the item shows unticked again. No timer.
  const check = () => Object.assign({ done: {}, own: [], hour: 0, weekday: 1 }, Mine.get('check', {}));
  const stamp = d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  const period = (kind, c, now) => {
    if (kind === 'once') return 'x';
    const d = new Date((now || Date.now()) - c.hour * 36e5);
    if (kind === 'daily') return 'd' + stamp(d);
    return 'w' + stamp(new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() - c.weekday + 7) % 7));
  };
  const left = until => { const n = new Date(), t = new Date(until + 'T00:00:00'); return Math.round((t - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5); };
  const items = (kind, c) => ((list && list[kind]) || []).concat((c.own || []).filter(o => o.kind === kind)).filter(it => !it.until || left(it.until) >= 0);
  const ticked = (it, kind, c) => c.done[it.id] === period(kind, c);

  // the header: how much of today is done, and what closes soonest
  function chips() {
    const box = $('#my-chips'); if (!box || !list) return;
    const c = check(), today = items('daily', c), done = today.filter(it => ticked(it, 'daily', c)).length;
    const next = items('once', c).filter(it => it.until && !ticked(it, 'once', c)).sort((a, b) => left(a.until) - left(b.until))[0];
    box.innerHTML = `<a class="chip ${done === today.length ? 'ok' : 'gold'}" href="#my">วันนี้ <b>${done}/${today.length}</b></a>` +
      (next ? `<a class="chip ${left(next.until) <= 3 ? 'bad' : ''}" href="#my" title="${esc(next.text)}">ใกล้ปิด <b>${left(next.until) === 0 ? 'วันนี้วันสุดท้าย' : 'เหลือ ' + left(next.until) + ' วัน'}</b></a>` : '');
  }

  function drawCheck() {
    const c = check();
    const row = (it, kind) => {
      const on = ticked(it, kind, c), n = it.until ? left(it.until) : null;
      return `<div class="tick-row"><button class="tick ${on ? 'on' : ''}" data-tick="${esc(it.id)}" data-kind="${kind}" aria-pressed="${on}"><i>${on ? '☑' : '☐'}</i><span>${esc(it.text)}</span>` +
        (n !== null ? `<em class="${n <= 3 ? 'soon' : ''}">${n === 0 ? 'วันนี้วันสุดท้าย' : 'เหลือ ' + n + ' วัน'}</em>` : '') + `</button>` +
        (it.mine ? `<button class="btn ghost mini" data-untick="${esc(it.id)}" title="ลบรายการนี้">ลบ</button>` : '') + `</div>`;
    };
    const group = (kind, title, sub) => {
      const all = items(kind, c).slice().sort((a, b) => kind === 'once' ? left(a.until || '2999-01-01') - left(b.until || '2999-01-01') : 0);
      const done = all.filter(it => ticked(it, kind, c)).length;
      return `<div class="panel"><h2><b>${title}</b><span>${done}/${all.length} · ${sub}</span></h2>
        <div class="meter"><i style="width:${all.length ? Math.round(done / all.length * 100) : 0}%"></i></div>
        ${all.map(it => row(it, kind)).join('') || '<p class="empty">ไม่มีรายการ</p>'}
        ${kind === 'weekly' && list.weeklyNote ? `<p class="hint">${esc(list.weeklyNote)}</p>` : ''}</div>`;
    };
    $('#my-body').innerHTML =
      group('daily', '☀️ วันนี้', 'กลับมาว่างเองทุกวันเวลา ' + String(c.hour).padStart(2, '0') + ':00') +
      group('weekly', '📅 สัปดาห์นี้', 'กลับมาว่างเองทุกวัน' + DAYS[c.weekday]) +
      group('once', '⏰ ทำครั้งเดียวก่อนปิด', 'เรียงตามวันปิด · ที่ปิดไปแล้วไม่แสดง') +
      `<div class="panel slim"><h2><b>ตั้งค่า</b><span>เวลารีเซ็ตของเกมยังไม่ยืนยัน — ตั้งให้ตรงกับตัวนับถอยหลังในหน้าภารกิจของเกม</span></h2>
        <div class="row wrap">
          <label class="set">รีเซ็ตรายวันเวลา <select id="my-hour">${[...Array(24).keys()].map(h => `<option value="${h}" ${h === c.hour ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select></label>
          <label class="set">รีเซ็ตรายสัปดาห์วัน <select id="my-weekday">${DAYS.map((d, i) => `<option value="${i}" ${i === c.weekday ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        </div>
        <div class="row wrap">
          <input id="my-own" class="bd-q" type="text" maxlength="120" placeholder="เพิ่มรายการของฉัน เช่น ฟาร์มคีย์การ์ด 2 รอบ" autocomplete="off">
          <select id="my-own-kind"><option value="daily">ทุกวัน</option><option value="weekly">ทุกสัปดาห์</option><option value="once">ครั้งเดียว</option></select>
          <button class="btn" id="my-own-add">เพิ่ม</button>
        </div></div>`;
  }

  // ── the fishing handbook ──
  const fishing = () => Object.assign({ got: {}, level: 1 }, Mine.get('fish', {}));
  function drawFish() {
    const f = fishing(), all = book.fish, got = all.filter(x => f.got[x.name]).length;
    const gate = book.gates.find(g => g.level >= f.level) || null, need = gate ? gate.need : [];
    const one = x => `<button class="fishb ${f.got[x.name] ? 'on' : ''} ${need.includes(x.name) ? 'need' : ''}" data-fish="${esc(x.name)}" aria-pressed="${!!f.got[x.name]}" title="${esc(BY[x.by][1] + (x.note ? ' · ' + x.note : ''))}">
        <i>${f.got[x.name] ? '☑' : '☐'}</i><b>${esc(x.name)}</b><small>${BY[x.by][0]} ${BY[x.by][1]}${need.includes(x.name) ? ' · ต้องส่งด่านถัดไป' : ''}${x.note ? ' · ⚠️' : ''}</small></button>`;
    $('#my-body').innerHTML =
      `<div class="panel"><h2><b>🎣 สมุดตกปลา</b><span>จับแล้ว ${got}/${all.length} ชนิด · ข้อมูลจากคู่มือของผู้เล่น ณ ${esc(book.asOf)} — ใช้สมุดปลาในเกมเป็นหลัก</span></h2>
        <div class="meter"><i style="width:${Math.round(got / all.length * 100)}%"></i></div>
        <div class="row wrap"><label class="set">เลเวลตกปลาของฉัน <input id="my-fish-level" type="number" min="1" max="50" value="${Number(f.level) || 1}" inputmode="numeric"></label>
          <span class="hint">🎈 คันทุ่น = ได้ตั้งแต่เริ่ม · 🎣 คันเหยื่อปลอม = ปลดหลังผ่านด่านเลเวล 10</span></div>
        ${gate ? `<div class="gate"><b>ด่านสอบถัดไป: เลเวล ${gate.level}</b><span>ต้องส่ง: ${esc(gate.text)}</span><span>ปลดล็อก: ${esc(gate.unlock)}</span>
          ${need.length ? `<span>${need.map(n => `<em class="${f.got[n] ? 'ok' : ''}">${f.got[n] ? '☑' : '☐'} ${esc(n)}</em>`).join(' ')}</span>` : ''}
          <small>เลเวลจะหยุดนิ่งที่ด่านจนกว่าจะกลับไปหา Joe Reed ที่ Layali Grove (Easy)</small></div>` : `<div class="gate"><b>ผ่านด่านสอบครบแล้ว</b><span>เลเวล 41–50 ไม่มีด่าน</span></div>`}
      </div>` +
      book.tiers.map(t => {
        const mine = all.filter(x => x.tier === t.id);
        return `<div class="panel"><h2 style="--c:${esc(t.color)}"><b class="tier">${esc(t.name)}</b><span>${mine.filter(x => f.got[x.name]).length}/${mine.length}</span></h2>
          <div class="fishes">${mine.map(one).join('')}</div>
          ${mine.filter(x => x.note).map(x => `<p class="hint"><b>${esc(x.name)}:</b> ${esc(x.note)}</p>`).join('')}</div>`;
      }).join('');
  }

  // ── carrying it to another device ──
  // One file: what is kept in this browser, the results of the codes, the stars of the builds.
  const buildMarks = async () => {
    try { const r = await fetch('/api/builds'); if (r.ok) { const o = {}; for (const b of (await r.json()).builds) if (b.fav || b.hidden) o[b.code] = { fav: !!b.fav, hidden: !!b.hidden }; return { live: true, marks: o }; } } catch (e) { /* no server behind this page */ }
    let o = {}; try { o = JSON.parse(localStorage.getItem('df_build_marks') || '{}') || {}; } catch (e) { /* none kept */ }
    return { live: false, marks: o };
  };
  const games = () => (S && S.games ? S.games.map(g => g.id) : ['deltaforce']);
  async function pack() {
    const out = { app: 'deltafore', v: 1, at: new Date().toISOString(), mine: Mine.all(), codes: {}, builds: (await buildMarks()).marks };
    for (const g of games()) {
      out.codes[g] = {};
      for (const e of (await api('/api/state', null, g)).codes) if (FINAL.includes(e.status)) out.codes[g][e.code] = e.status;
    }
    return out;
  }
  const count = d => ({
    codes: Object.values(d.codes || {}).reduce((a, o) => a + Object.keys(o || {}).length, 0), stars: Object.keys(d.builds || {}).length,
    ticks: Object.keys(((d.mine || {}).check || {}).done || {}).length, fish: Object.values(((d.mine || {}).fish || {}).got || {}).filter(Boolean).length,
    notes: Object.keys((d.mine || {}).notes || {}).length, works: Object.keys((d.mine || {}).works || {}).length
  });
  const words = n => `ผลโค้ด ${n.codes} · ดาว/ซ่อนชุดแต่ง ${n.stars} · ชุดแต่งที่ลองแล้ว ${n.works} · ปลา ${n.fish} · โน้ตแผนที่ ${n.notes} · เช็กลิสต์ ${n.ticks}`;

  // What a file would change here. Nothing kept on this device is taken away: a result is filed only
  // where this device has none, a star is only added, notes of both devices are kept one under the other.
  async function read(text) {
    let d; try { d = JSON.parse(text); } catch (e) { throw new Error('ข้อความนี้ไม่ใช่ไฟล์ย้ายข้อมูล (อ่านเป็น JSON ไม่ได้)'); }
    if (!d || d.app !== 'deltafore' || typeof d !== 'object') throw new Error('ไม่ใช่ไฟล์ย้ายข้อมูลของ DELTAFORE');
    const p = { data: d, codes: [], stars: [], at: d.at };
    for (const g of games()) {
      const have = {}; for (const e of (await api('/api/state', null, g)).codes) have[e.code] = e.status;
      for (const code in (d.codes || {})[g] || {}) {
        const to = d.codes[g][code];
        if (CODE.test(code) && FINAL.includes(to) && !FINAL.includes(have[code])) p.codes.push({ g, code, to, fresh: !(code in have) });
      }
    }
    const mine = await buildMarks();
    p.live = mine.live;
    for (const code in d.builds || {}) for (const k of ['fav', 'hidden']) if (d.builds[code] && d.builds[code][k] === true && !(mine.marks[code] || {})[k]) p.stars.push({ code, k });
    return p;
  }
  function mergeMine(theirs) {
    const all = Mine.all(), t = theirs && typeof theirs === 'object' ? theirs : {};
    const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    all.works = Object.assign({}, obj(all.works), Object.fromEntries(Object.entries(obj(t.works)).filter(([k, v]) => v === 'ok' || v === 'no')));
    const notes = Object.assign({}, obj(all.notes));
    for (const [k, v] of Object.entries(obj(t.notes))) {
      if (typeof v !== 'string' || !v.trim()) continue;
      notes[k] = !notes[k] ? v.slice(0, 4000) : notes[k].includes(v.trim()) ? notes[k] : (notes[k] + '\n— จากอีกเครื่อง —\n' + v).slice(0, 4000);
    }
    all.notes = notes;
    const mf = obj(all.fish), tf = obj(t.fish);
    all.fish = { got: Object.assign({}, obj(mf.got), Object.fromEntries(Object.entries(obj(tf.got)).filter(([, v]) => v === true))), level: Math.min(50, Math.max(Number(mf.level) || 1, Number(tf.level) || 1)) };
    const mc = obj(all.check), tc = obj(t.check), own = (Array.isArray(mc.own) ? mc.own : []).slice();
    for (const o of Array.isArray(tc.own) ? tc.own : []) if (o && typeof o.id === 'string' && typeof o.text === 'string' && ['daily', 'weekly', 'once'].includes(o.kind) && !own.some(x => x.id === o.id)) own.push({ id: o.id.slice(0, 40), text: o.text.slice(0, 120), kind: o.kind, mine: true });
    const clock = {};                                       // the reset hour and day: this device's own if it has set them
    if (Number.isInteger(tc.hour) && tc.hour >= 0 && tc.hour < 24) clock.hour = tc.hour;
    if (Number.isInteger(tc.weekday) && tc.weekday >= 0 && tc.weekday < 7) clock.weekday = tc.weekday;
    all.check = Object.assign(clock, mc, { done: Object.assign({}, obj(tc.done), obj(mc.done)), own });
    Mine.replace(all);
  }
  async function apply(p) {
    let done = 0;
    for (const g of games()) {
      const fresh = p.codes.filter(c => c.g === g && c.fresh).map(c => c.code);
      for (let i = 0; i < fresh.length; i += 40) await api('/api/add', { text: fresh.slice(i, i + 40).join(' ') }, g);   // a code this device has never seen: listed first
    }
    for (const c of p.codes) { await api('/api/mark', { code: c.code, to: c.to }, c.g); done++; }
    if (p.live) for (const s of p.stars) await fetch('/api/builds/mark', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: s.code, to: s.k === 'fav' ? 'fav' : 'hide' }) });
    else if (p.stars.length) {
      let mk = {}; try { mk = JSON.parse(localStorage.getItem('df_build_marks') || '{}') || {}; } catch (e) { /* none kept */ }
      for (const s of p.stars) mk[s.code] = Object.assign(mk[s.code] || {}, { [s.k]: true });
      try { localStorage.setItem('df_build_marks', JSON.stringify(mk)); } catch (e) { /* not kept */ }
    }
    mergeMine(p.data.mine);
    return done;
  }

  function drawMove() {
    $('#my-body').innerHTML =
      `<div class="panel"><h2><b>📤 ส่งออกจากเครื่องนี้</b><span>รวมเป็นไฟล์เดียว: ผลของโค้ด · ดาวของชุดแต่ง · ชุดแต่งที่ลองแล้ว · สมุดปลา · โน้ตแผนที่ · เช็กลิสต์</span></h2>
        <div class="row wrap"><button class="btn gold" id="mv-pack">สร้างไฟล์ย้ายข้อมูล</button><button class="btn" id="mv-save" hidden>ดาวน์โหลดไฟล์</button><button class="btn" id="mv-copy" hidden>คัดลอกข้อความ</button><span class="hint" id="mv-out-msg"></span></div>
        <textarea id="mv-out" rows="4" readonly hidden spellcheck="false"></textarea>
        <p class="hint">ไฟล์นี้ไม่มีรหัสผ่านหรือข้อมูลบัญชี — มีแต่รายการโค้ดกับสิ่งที่คุณติ๊กไว้</p></div>
      <div class="panel"><h2><b>📥 นำเข้ามาที่เครื่องนี้</b><span>ของที่มีอยู่ในเครื่องนี้ไม่ถูกลบ: ผลโค้ดบันทึกเฉพาะตัวที่เครื่องนี้ยังไม่มีผล · ดาวมีแต่เพิ่ม · โน้ตของสองเครื่องเก็บไว้ทั้งคู่</span></h2>
        <textarea id="mv-in" rows="4" spellcheck="false" autocomplete="off" placeholder="วางข้อความจากเครื่องอื่นที่นี่ หรือเลือกไฟล์ด้านล่าง"></textarea>
        <div class="row wrap"><input type="file" id="mv-file" accept=".json,application/json,text/plain"><button class="btn" id="mv-read">ตรวจดูก่อน</button><button class="btn gold" id="mv-apply" hidden>นำเข้า</button><span class="hint" id="mv-in-msg"></span></div></div>`;
    packed = ''; plan = null;
  }

  const DRAW = { check: drawCheck, fish: drawFish, move: drawMove };
  function draw() {
    $$('#my-tabs button').forEach(b => b.classList.toggle('on', b.dataset.my === tab));
    if (!list || !book) return;
    DRAW[tab]();
    chips();
  }
  const say = (id, text, kind) => { const el = $(id); if (el) { el.textContent = text; el.className = 'hint ' + (kind || ''); } };

  $('#page-my').addEventListener('click', async ev => {
    const t = ev.target.closest('button'); if (!t) return;
    if (t.dataset.my) { tab = t.dataset.my; try { sessionStorage.setItem('df-my', tab); } catch (e) {} return draw(); }
    if (t.dataset.tick) {
      const c = check(), key = period(t.dataset.kind, c);
      if (c.done[t.dataset.tick] === key) delete c.done[t.dataset.tick]; else c.done[t.dataset.tick] = key;
      Mine.set('check', c); return draw();
    }
    if (t.dataset.untick) { const c = check(); c.own = c.own.filter(o => o.id !== t.dataset.untick); delete c.done[t.dataset.untick]; Mine.set('check', c); return draw(); }
    if (t.id === 'my-own-add') {
      const text = $('#my-own').value.trim(); if (!text) return;
      const c = check(); c.own.push({ id: 'my-' + Date.now().toString(36), text: text.slice(0, 120), kind: $('#my-own-kind').value, mine: true });
      Mine.set('check', c); return draw();
    }
    if (t.dataset.fish) { const f = fishing(); if (f.got[t.dataset.fish]) delete f.got[t.dataset.fish]; else f.got[t.dataset.fish] = true; Mine.set('fish', f); return draw(); }
    if (t.id === 'mv-pack') {
      try {
        const d = await pack(); packed = JSON.stringify(d);
        $('#mv-out').value = packed; $('#mv-out').hidden = false; $('#mv-save').hidden = false; $('#mv-copy').hidden = false;
        say('#mv-out-msg', words(count(d)), 'ok');
      } catch (e) { say('#mv-out-msg', 'สร้างไม่ได้: ' + e.message, 'bad'); }
      return;
    }
    if (t.id === 'mv-save' && packed) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([packed], { type: 'application/json' }));
      a.download = 'deltafore-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return;
    }
    if (t.id === 'mv-copy' && packed) { const ok = await copyText(packed); return say('#mv-out-msg', ok ? 'คัดลอกแล้ว ✓ — วางในช่องนำเข้าของอีกเครื่อง' : 'คัดลอกไม่ได้ — แตะค้างที่ข้อความด้านล่างแล้วคัดลอกเอง', ok ? 'ok' : 'bad'); }
    if (t.id === 'mv-read') {
      plan = null; $('#mv-apply').hidden = true;
      try {
        plan = await read($('#mv-in').value.trim());
        const n = count(plan.data);
        say('#mv-in-msg', `ไฟล์ของวันที่ ${plan.at ? new Date(plan.at).toLocaleDateString('th-TH-u-ca-gregory') : '?'} มี: ${words(n)} — จะบันทึกผลโค้ดใหม่ ${plan.codes.length} ตัว (เป็นโค้ดที่เครื่องนี้ไม่เคยเห็น ${plan.codes.filter(c => c.fresh).length}) · เพิ่มดาว/ซ่อน ${plan.stars.length}`, 'ok');
        $('#mv-apply').hidden = false;
      } catch (e) { say('#mv-in-msg', e.message, 'bad'); }
      return;
    }
    if (t.id === 'mv-apply' && plan) {
      t.disabled = true;
      try { const n = await apply(plan); say('#mv-in-msg', `นำเข้าแล้ว ✓ — บันทึกผลโค้ด ${n} ตัว · เพิ่มดาว/ซ่อน ${plan.stars.length} · รวมสมุดปลา โน้ต เช็กลิสต์ และชุดแต่งที่ลองแล้ว`, 'ok'); plan = null; t.hidden = true; chips(); if (typeof refresh === 'function') refresh(); }
      catch (e) { say('#mv-in-msg', 'นำเข้าไม่ครบ: ' + e.message, 'bad'); }
      t.disabled = false;
    }
  });
  $('#page-my').addEventListener('change', ev => {
    const t = ev.target;
    if (t.id === 'my-hour' || t.id === 'my-weekday') { const c = check(); c.hour = Number($('#my-hour').value) || 0; c.weekday = Number($('#my-weekday').value) || 0; Mine.set('check', c); return draw(); }
    if (t.id === 'my-fish-level') { const f = fishing(); f.level = Math.min(50, Math.max(1, Math.round(Number(t.value) || 1))); Mine.set('fish', f); return draw(); }
    if (t.id === 'mv-file' && t.files && t.files[0]) {
      if (t.files[0].size > 2e6) return say('#mv-in-msg', 'ไฟล์ใหญ่เกินไป — ไม่ใช่ไฟล์ย้ายข้อมูล', 'bad');
      t.files[0].text().then(text => { $('#mv-in').value = text; say('#mv-in-msg', 'อ่านไฟล์แล้ว — กด "ตรวจดูก่อน"'); });
    }
  });
  $('#page-my').addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'my-own') $('#my-own-add').click(); });

  // the two lists are small and the header chips need them: read once when the page opens
  (async () => {
    try {
      const [a, b] = await Promise.all([fetch('checklist.json', { cache: 'no-store' }), fetch('fish.json', { cache: 'no-store' })]);
      if (!a.ok || !b.ok) throw new Error('HTTP ' + (a.ok ? b.status : a.status));
      list = await a.json(); book = await b.json();
      draw();
    } catch (e) { $('#my-body').innerHTML = `<p class="empty">โหลดเช็กลิสต์ไม่ได้: ${esc(e.message)}</p>`; }
  })();
  window.addEventListener('hashchange', () => { if (location.hash === '#my' && list) draw(); });   // a new day may have begun since it was drawn
  setInterval(chips, 60000);
  // this tab belongs to one game: on another game it gives way to the first tab
  setInterval(() => { if (typeof S === 'object' && S && S.game !== 'deltaforce' && location.hash === '#my') location.hash = 'codes'; }, 1000);
})();
