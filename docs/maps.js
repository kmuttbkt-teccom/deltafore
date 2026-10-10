'use strict';
// Tab 05 — every Operations map and where its loot is. The picture is the interactive map of
// another site, shown inside the tab exactly as that site serves it (named, linked, never
// copied here). Around it: what maps.json counted on that map, and this map's own notes from
// DF-MAPS.md. It leans on app.js for $ / $$ / esc / md.

(() => {
  // the names the map sites use for what holds loot → what a Thai player calls it
  const TH = {
    'Safe': 'ตู้เซฟ', 'Small Safe': 'เซฟเล็ก', 'Server': 'เซิร์ฟเวอร์', 'Computer': 'คอมพิวเตอร์', 'Protocol Crate': 'กล่องลับ (Protocol)',
    'Large Weapon Crate': 'ลังอาวุธใหญ่', 'Weapon Crate': 'ลังอาวุธ', 'Premium Storage Box': 'กล่องเก็บของพรีเมียม', 'Premium Suitcase': 'กระเป๋าเดินทางพรีเมียม',
    'Briefcase': 'กระเป๋าเอกสาร', 'Hidden Stash': 'แคชซ่อน', 'Flight Case': 'เคสอุปกรณ์', 'Bird Nest': 'รังนก', 'Ammo Crate': 'ลังกระสุน',
    'Computer Case': 'เคสคอม', 'Computer Bag': 'กระเป๋าคอม', 'Field Supply Box': 'กล่องเสบียงสนาม', 'Military Med Kit': 'ชุดแพทย์ทหาร',
    'Pile Of Medical Supplies': 'กองเวชภัณฑ์', 'Tool Cabinet': 'ตู้เครื่องมือ', 'Travel Bag': 'กระเป๋าเดินทาง', 'Storage Box': 'กล่องเก็บของ',
    'Courier Carton': 'กล่องพัสดุ', 'Drawer': 'ลิ้นชัก', 'Piece Of Clothing': 'เสื้อผ้า', 'Garbage Bin': 'ถังขยะ', 'Climbing Bag': 'เป้ปีนเขา',
    'Cement Truck': 'รถปูน', 'Combination Lock': 'ประตูกดรหัส'
  };
  const EXIT = { 'Exfil': 'ออกได้เลย', 'Conditional Exfil': 'มีเงื่อนไข', 'Random Exfil': 'สุ่มเปิด', 'Paid Exfil': 'จ่ายเงิน', 'Trigger': 'ต้องสับคันโยก' };
  // what a run is planned around; the rest is shown folded
  const MAIN = ['Safe', 'Small Safe', 'Server', 'Computer', 'Protocol Crate', 'Large Weapon Crate', 'Premium Storage Box', 'Premium Suitcase', 'Briefcase', 'Hidden Stash'];
  const GENERAL = { id: '_all', name: 'หลักทั่วไป', icon: '🧭', levels: 'ใช้ได้ทุกแผนที่' };

  let data = null, notes = [], cur = '', from = 0, loaded = false;
  try { cur = sessionStorage.getItem('df-map') || ''; } catch (e) {}

  const sum = o => Object.values(o || {}).reduce((a, n) => a + n, 0);
  // DF-MAPS.md cut at its "## " headings: [{ head, body }]
  const cut = text => text.replace(/\r/g, '').split(/\n(?=## )/).map(s => ({ head: (/^## (.*)$/m.exec(s) || [])[1] || '', body: s }));
  const part = word => (notes.find(s => s.head.includes(word)) || {}).body || '';

  const tile = (icon, n, label, more) => `<div class="tile"><i>${icon}</i><b>${esc(n)}</b><span>${esc(label)}</span>${more ? `<small>${esc(more)}</small>` : ''}</div>`;
  const chips = (list, cls) => list.map(x => `<span class="pill ${cls || ''}">${esc(x)}</span>`).join('');

  function overview(m) {
    const L = m.loot || {}, t = [];
    if (L.Safe || L['Small Safe']) t.push(tile('🔐', L.Safe || 0, 'ตู้เซฟ', L['Small Safe'] ? '+ เซฟเล็ก ' + L['Small Safe'] : ''));
    if ((m.keycards || []).length) t.push(tile('🗝️', m.keycards.length, 'ห้องคีย์การ์ด'));
    if (m.swipes) t.push(tile('🗝️', m.swipes, 'จุดรูดคีย์การ์ด'));
    if (L['Protocol Crate']) t.push(tile('📦', L['Protocol Crate'], 'กล่องลับ', (m.crates || []).join(' ')));
    if (L.Server || L.Computer) t.push(tile('💻', (L.Server || 0) + (L.Computer || 0), 'เซิร์ฟเวอร์ + คอม'));
    if (m.red) t.push(tile('🔴', sum(m.red), 'จุดของแดง', Object.keys(m.red).length + ' ชนิด'));
    if (m.spawns) t.push(tile('🪂', m.spawns, 'จุดเกิด'));
    if (m.exits) t.push(tile('🚪', sum(m.exits), 'ทางออก'));
    return t.length ? `<div class="tiles">${t.join('')}</div>` : '';
  }

  function contents(m) {
    if (!m.loot) return '';
    const L = m.loot, main = MAIN.filter(k => L[k]), max = Math.max(1, ...main.map(k => L[k]));
    const rest = Object.keys(L).filter(k => !MAIN.includes(k)).sort((a, b) => L[b] - L[a]);
    return `<div class="panel">
      <h2><b>ของในแผนที่นี้</b><span>จำนวนหมุดบนแผนที่ของ ${esc(data.source.name)} ณ ${esc(data.asOf)} — ข้อมูลจากผู้เล่น ไม่ใช่ของทางเกม</span></h2>
      <div class="bars">${main.map(k => `<div class="bar"><label>${esc(TH[k] || k)}<small>${esc(k)}</small></label><div><i style="width:${Math.round(L[k] / max * 100)}%"></i></div><b>${L[k]}</b></div>`).join('')}</div>
      ${rest.length ? `<details class="more"><summary>ภาชนะอื่น ๆ อีก ${rest.length} ชนิด</summary><div class="pills">${rest.map(k => `<span class="pill">${esc(TH[k] || k)} <b>${L[k]}</b></span>`).join('')}</div></details>` : ''}
      ${m.exits ? `<h3>🚪 ทางออก</h3><div class="pills">${Object.keys(m.exits).map(k => `<span class="pill">${esc(EXIT[k] || k)} <b>${m.exits[k]}</b></span>`).join('')}</div>` : ''}
      ${m.red ? `<h3>🔴 ของแดงที่มีจุดเกิดบนแผนที่</h3><div class="pills">${Object.keys(m.red).sort((a, b) => m.red[b] - m.red[a]).map(k => `<span class="pill red">${esc(k)} <b>${m.red[k]}</b></span>`).join('')}</div>` : ''}
      ${(m.keycards || []).length ? `<h3>🗝️ ห้องคีย์การ์ด ${m.keycards.length} ห้อง</h3><div class="pills">${chips(m.keycards, 'key')}</div><p class="hint">ชื่อตามที่แผนที่ด้านบนใช้ — เลือกชื่อห้องจากช่องเลือกของแผนที่เพื่อให้ชี้ตำแหน่ง · ??? คือห้องที่ยังไม่มีชื่อในข้อมูลต้นทาง</p>` : ''}
      ${L['Combination Lock'] && data.doorCodes ? `<h3>🔢 ประตูกดรหัส ${L['Combination Lock']} จุด</h3><div class="row wrap"><a class="btn" href="${esc(data.doorCodes.url)}" target="_blank" rel="noopener">ดูรหัสประตูของวันนี้ที่ ${esc(data.doorCodes.name)} ↗</a></div><p class="hint">${esc(data.doorCodes.note || '')}</p>` : ''}
      ${(m.zones || []).length ? `<h3>📍 โซน</h3><div class="pills">${chips(m.zones)}</div>` : ''}
      ${m.also ? `<p class="hint">⚠️ ${esc(m.also)}</p>` : ''}
    </div>`;
  }

  // The map itself. It is the other site's own page in a frame: scripts and its own storage are
  // let through (it is an application), moving this tab somewhere else is not.
  function frame(m) {
    const list = m.embeds || [];
    if (!list.length) return `<div class="panel map-none"><h2><b>🗺️ แผนที่</b></h2><p>${esc(m.none || 'ยังไม่มีแผนที่แบบโต้ตอบของแผนที่นี้')}</p>
      <div class="row wrap">${(m.links || []).map(l => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)} ↗</a>`).join('')}</div></div>`;
    const e = list[Math.min(from, list.length - 1)], host = new URL(e.url).hostname.replace(/^www\./, '');
    return `<div class="panel map-embed">
      <div class="row wrap">
        ${list.length > 1 ? list.map((x, i) => `<button class="fchip ${x === e ? 'on' : ''}" data-from="${i}">${esc(x.name)}</button>`).join('') : ''}
        <a class="btn gold" href="${esc(e.url)}" target="_blank" rel="noopener">เปิดแผนที่เต็มจอ ↗</a>
        <span class="hint">แผนที่และหมุดทั้งหมดเป็นของ ${esc(host)} — แสดงจากเว็บนั้นโดยตรง${e.note ? ' · ' + esc(e.note) : ''}</span>
      </div>
      <iframe class="map-frame" src="${esc(e.url)}" title="แผนที่ ${esc(m.name)} — ${esc(host)}" loading="lazy" referrerpolicy="no-referrer" allow="fullscreen" sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>
      <p class="hint">ลาก/ซูมได้เหมือนแผนที่ทั่วไป · ปุ่ม <b>Filter Points</b> เลือกประเภทของที่จะให้แสดง (Loot Points · Red Loot · Extraction · Spawn) · ช่องด้านบนเลือกระดับความยาก ชั้น และห้องคีย์การ์ด · ถ้ากรอบว่าง ให้กด "เปิดแผนที่เต็มจอ"</p>
    </div>`;
  }

  function draw() {
    if (!data) return;
    const all = data.maps.concat(GENERAL), m = all.find(x => x.id === cur) || all[0];
    cur = m.id;
    $('#map-pick').innerHTML = all.map(x => `<button class="mapbtn ${x === m ? 'on' : ''}" data-map="${esc(x.id)}"><i>${x.icon || '🗺️'}</i><b>${esc(x.name)}</b><small>${esc(x.levels || (x.embeds && !x.embeds.length ? 'ยังไม่มีแผนที่โต้ตอบ' : ''))}</small></button>`).join('');
    if (m === GENERAL) {
      $('#map-body').innerHTML = `<article class="panel guide">${md(['หลักที่ใช้ได้ทุกแผนที่', 'วางเส้นทางหนึ่งรอบ', 'ดูตำแหน่งบนแผนที่', 'แหล่งข้อมูล'].map(part).join('\n\n'))}</article>`;
      return;
    }
    const own = part(m.doc || m.name);
    $('#map-body').innerHTML = `<div class="panel map-head">
        <h2><b>${m.icon || ''} ${esc(m.name)}</b><span>${esc([m.levels && 'ระดับ ' + m.levels, m.floors && 'ชั้น ' + m.floors].filter(Boolean).join(' · '))}</span></h2>
        <p class="bd-how">${esc(m.th || '')}</p>${overview(m)}
      </div>` + frame(m) +
      `<div class="panel slim map-mine"><h2><b>📝 โน้ตของฉัน — ${esc(m.name)}</b><span>เก็บในเบราว์เซอร์นี้ · ย้ายเครื่องได้ที่แท็บ "ของฉัน"</span></h2>
        <textarea id="map-note" rows="3" spellcheck="false" placeholder="เส้นทางที่ลองแล้วได้ผล · จุดเกิดที่ชอบ · ห้องที่คุ้ม · ทางออกที่โดนดักบ่อย…">${esc((Mine.get('notes', {})[m.id]) || '')}</textarea><span class="hint" id="map-note-msg"></span></div>` +
      contents(m) +
      (own ? `<article class="panel guide map-notes">${md(own.replace(/^## .*$/m, '## บันทึกของแผนที่นี้'))}</article>` : '');
  }

  async function load() {
    loaded = true;
    try {
      const [a, b] = await Promise.all([fetch('maps.json', { cache: 'no-store' }), fetch('DF-MAPS.md', { cache: 'no-store' })]);
      if (!a.ok) throw new Error('HTTP ' + a.status);
      data = await a.json();
      notes = b.ok ? cut(await b.text()) : [];
      draw();
    } catch (e) { loaded = false; $('#map-body').innerHTML = `<p class="empty">โหลดข้อมูลแผนที่ไม่ได้: ${esc(e.message)}</p>`; }
  }

  $('#page-maps').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.map) { cur = b.dataset.map; from = 0; try { sessionStorage.setItem('df-map', cur); } catch (e) {} draw(); }
    else if (b.dataset.from) { from = Number(b.dataset.from) || 0; draw(); }
  });

  // the player's own notes on a map: kept as they are typed
  let noteTimer = null;
  $('#page-maps').addEventListener('input', ev => {
    if (ev.target.id !== 'map-note') return;
    const id = cur, text = ev.target.value;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      const notes = Mine.get('notes', {});
      if (text.trim()) notes[id] = text.slice(0, 4000); else delete notes[id];
      const kept = Mine.set('notes', notes), msg = $('#map-note-msg');
      if (msg) { msg.textContent = kept ? 'บันทึกแล้ว ✓' : 'เบราว์เซอร์นี้ไม่ให้เก็บข้อมูล — โน้ตจะหายเมื่อปิดหน้า'; setTimeout(() => { if (msg.isConnected) msg.textContent = ''; }, 1800); }
    }, 400);
  });

  const open = () => { if (location.hash === '#maps' && !loaded) load(); };
  window.addEventListener('hashchange', open);
  open();
  // this tab belongs to one game: on another game it gives way to the first tab
  setInterval(() => { if (typeof S === 'object' && S && S.game !== 'deltaforce' && location.hash === '#maps') location.hash = 'codes'; }, 1000);
})();
