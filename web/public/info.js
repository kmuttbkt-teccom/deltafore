'use strict';
// Tab 06 — what the game runs now and how to do it, and what gives an edge. Two pages of plain
// Markdown kept at the root of the project (DF-EVENTS.md, DF-TIPS.md), read as files beside the
// page — the same with the server and without one — and drawn with app.js's md(). A line that
// is only {{countdown}}, {{ammo}} or {{rarity}} becomes a drawing made here. It leans on app.js
// for $ / $$ / esc / md. (The maps have a tab of their own: maps.js.)

(() => {
  const DOCS = { events: 'DF-EVENTS.md', tips: 'DF-TIPS.md' };
  const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  // the six grades of the game, lowest first: items, armour and ammunition share the colours
  const GRADES = [['เทา', '#9aa0a6'], ['เขียว', '#5fbf6b'], ['ฟ้า', '#4ea3e0'], ['ม่วง', '#a06be0'], ['ทอง', '#e9b949'], ['แดง', '#ef5b4e']];
  const kept = {};
  let doc = 'events', shown = false;
  try { const d = sessionStorage.getItem('df-info'); if (DOCS[d]) doc = d; } catch (e) {}

  // A page says "ends 15 ต.ค."; the reader wants "five days left". Every first cell of a table
  // that is a day and a month gets it; the year is the one in the page's "ข้อมูล ณ วันที่ …" line.
  // What it found comes back, one entry per closing day, for the countdown drawn above the table.
  function daysLeft(text) {
    const year = Number((/ข้อมูล ณ วันที่[^\n]*?(\d{4})/.exec(text) || [])[1]) || new Date().getFullYear();
    const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), days = [];
    $$('#info-doc td:first-child').forEach(td => {
      const day = td.textContent.trim(), m = /^(\d{1,2}) (\S+)$/.exec(day), month = m ? MONTHS.indexOf(m[2]) : -1;
      if (month < 0) return;
      const n = Math.round((new Date(year, month, Number(m[1])) - today) / 864e5);
      const tag = document.createElement('span');
      tag.className = 'left' + (n < 0 ? ' over' : n <= 3 ? ' soon' : '');
      tag.textContent = n < 0 ? 'จบแล้ว' : n === 0 ? 'วันนี้วันสุดท้าย' : 'เหลือ ' + n + ' วัน';
      td.appendChild(tag);
      if (n < 0) td.parentNode.classList.add('over');
      const what = td.nextElementSibling ? td.nextElementSibling.textContent.trim() : '';
      let d = days.find(x => x.day === day);
      if (!d) days.push(d = { day, n, what: [] });
      if (what) d.what.push(what);
    });
    return days.sort((a, b) => a.n - b.n);
  }

  // ── the drawings ──
  const countdown = days => `<div class="countdown">` + days.filter(d => d.n >= 0).map(d => `<div class="cd ${d.n <= 3 ? 'now' : d.n <= 7 ? 'soon' : ''}">
      <div class="cd-n"><b>${d.n}</b><span>${d.n === 0 ? 'วันนี้' : 'วัน'}</span></div>
      <div class="cd-what"><label>ปิด ${esc(d.day)}</label><ul>${d.what.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>
    </div>`).join('') + `</div>`;
  const rarity = () => `<div class="grades">` + GRADES.map((g, i) => `<span style="--c:${g[1]}"><b>Lv${i + 1}</b>${g[0]}</span>`).join('<i>→</i>') + `</div>`;
  // rows = the bullet, columns = the vest it meets: through, part of it, or nothing until the vest breaks
  const ammo = () => {
    const head = `<div class="mx-c mx-corner">กระสุน ↓ เกราะ →</div>` + GRADES.map((g, i) => `<div class="mx-c mx-h" style="--c:${g[1]}">Lv${i + 1}</div>`).join('');
    const rows = GRADES.map((g, a) => `<div class="mx-c mx-h" style="--c:${g[1]}">Lv${a + 1}</div>` +
      GRADES.map((x, v) => a > v ? `<div class="mx-c pen">ทะลุ</div>` : a === v ? `<div class="mx-c part">บางส่วน</div>` : `<div class="mx-c stop">ไม่เข้าตัว</div>`).join('')).join('');
    return `<div class="matrix" role="img" aria-label="ตารางกระสุนเทียบเกราะ: กระสุนเลเวลสูงกว่าเกราะทะลุ เท่ากันเข้าบางส่วน ต่ำกว่าไม่เข้าตัวจนกว่าเกราะแตก">${head}${rows}</div>
      <p class="hint"><span class="key pen"></span>ทะลุ ดาเมจเข้าตัวเต็ม <span class="key part"></span>เข้าตัวบางส่วน <span class="key stop"></span>ไม่เข้าตัวจนกว่าเกราะแตก — สรุปจากกฎในตารางด้านล่าง ไม่ใช่ตัวเลขดาเมจจริงของแต่ละกระสุน</p>`;
  };

  async function draw() {
    const want = doc, box = $('#info-doc');
    $$('#info-docs button').forEach(b => b.classList.toggle('on', b.dataset.doc === want));
    if (kept[want] === undefined) {
      box.textContent = 'กำลังโหลด…'; $('#info-toc').innerHTML = '';
      try {
        const r = await fetch(DOCS[want], { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        kept[want] = await r.text();
      } catch (e) { if (doc === want) box.textContent = 'โหลดไม่ได้: ' + e.message; return; }
    }
    if (doc !== want) return;                              // another page was picked meanwhile
    box.innerHTML = md(kept[want]);
    $$('#info-doc h2').forEach((h, i) => { h.id = 'i-' + (i + 1); });   // md() numbers them g-1…, the guide tab's own
    $('#info-toc').innerHTML = $$('#info-doc h2').map(h => `<a href="#${h.id}">${esc(h.textContent)}</a>`).join('');
    const days = daysLeft(kept[want]);
    const made = { countdown: () => countdown(days), ammo, rarity };
    $$('#info-doc p').forEach(p => {
      const m = /^\{\{([a-z]+)\}\}$/.exec(p.textContent.trim());
      if (m && made[m[1]]) p.outerHTML = made[m[1]]();
    });
  }

  $('#info-docs').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-doc]'); if (!b || !DOCS[b.dataset.doc]) return;
    doc = b.dataset.doc;
    try { sessionStorage.setItem('df-info', doc); } catch (e) {}
    draw();
  });
  $('#info-toc').addEventListener('click', ev => {
    const a = ev.target.closest('a'); if (!a) return;
    ev.preventDefault();                                   // the hash belongs to the tabs
    const h = document.getElementById(a.getAttribute('href').slice(1)); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const open = () => { if (location.hash === '#info' && !shown) { shown = true; draw(); } };
  window.addEventListener('hashchange', open);
  open();
  // this tab belongs to one game: on another game it gives way to the first tab
  setInterval(() => { if (typeof S === 'object' && S && S.game !== 'deltaforce' && location.hash === '#info') location.hash = 'codes'; }, 1000);
})();
