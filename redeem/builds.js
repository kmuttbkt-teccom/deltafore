'use strict';
// Weapon builds that players share: the game's gunsmith gives every build a share code, one
// line of the shape  "CI-19 Assault Rifle-Warfare-6HLOANO09MFFCME3G7LT2"  (weapon name, mode,
// code) that another player pastes into "import" to get the same attachments. They are kept in
// data/builds.json, found on the pages of "buildSources" in config.json or pasted in by hand.
// They are not redeem codes: nothing is sent anywhere, the player copies a line into the game.

const fs = require('fs');
const path = require('path');
const store = require('./store');

const UA = 'deltafore-code-watcher/1.0 (personal use; one request per page per scan)';
const FILE = () => path.join(store.DATA, 'builds.json');

// The end of a weapon's name tells its class.
const CLASSES = [
  ['Compact Assault Rifle', 'AR'], ['Assault Rifle', 'AR'], ['Carbine', 'AR'], ['Battle Rifle', 'BR'], ['Submachine Gun', 'SMG'],
  ['Sniper Rifle', 'SR'], ['Marksman Rifle', 'DMR'], ['Light Machine Gun', 'LMG'], ['General Machine Gun', 'LMG'], ['Machine Gun', 'LMG'],
  ['Shotgun', 'SG'], ['Pistol', 'HG'], ['Revolver', 'HG']
];
const CLASS_RE = CLASSES.map(c => c[0]).join('|');
// A page's text: "<model> <class>-<mode>-<code>"; the model is one word (two for a few weapons).
const ON_PAGE = new RegExp("((?:AS Val|Desert Eagle|[A-Za-z0-9.][A-Za-z0-9.'-]{0,14}) (?:" + CLASS_RE + '))-(Warfare|Operations)-([A-Z0-9]{18,24})(?![A-Za-z0-9])', 'g');
// A line pasted by the player: whatever the game wrote, in whatever language — name, mode, code.
const PASTED = /^(.{2,60})-([^-\n]{2,24})-([A-Z0-9]{18,24})$/;

const classOf = name => { const c = CLASSES.find(x => name.endsWith(x[0])); return c ? c[1] : ''; };
const modeOf = m => /warfare|สงคราม|สมรภูมิ/i.test(m) ? 'Warfare' : /operation|ปฏิบัติการ/i.test(m) ? 'Operations' : m.trim();
const make = (name, mode, code) => ({ code, name: name.trim(), mode: modeOf(mode), cls: classOf(name.trim()), full: name.trim() + '-' + mode.trim() + '-' + code });

// Every build on a page. The codes often sit in the page's data (inside scripts), not in its
// visible text, so the whole source is read: tags become breaks, the usual escapes are undone.
function extract(html) {
  const text = String(html).replace(/\\u002[dD]/g, '-').replace(/\\"/g, '"').replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&').replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');
  const out = new Map();
  for (const m of text.matchAll(ON_PAGE)) if (!out.has(m[3])) out.set(m[3], make(m[1], m[2], m[3]));
  return [...out.values()];
}

// Lines pasted by hand → { items, bad }.
function parse(text) {
  const items = [], bad = [];
  for (const raw of String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 100)) {
    const m = PASTED.exec(raw);
    if (m) items.push(make(m[1], m[2], m[3])); else bad.push(raw.slice(0, 80));
  }
  return { items, bad };
}

function load() {
  try { return JSON.parse(fs.readFileSync(FILE(), 'utf8')); }
  catch (e) {
    if (e.code === 'ENOENT') return { builds: {} };
    throw new Error('data/builds.json อ่านไม่ได้: ' + e.message);
  }
}
function save(db) {
  fs.mkdirSync(store.DATA, { recursive: true });
  const tmp = FILE() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE());
}

// Puts builds in the list; one already known only gains the page it was seen on. Returns the new ones.
function merge(db, items, source) {
  const fresh = [];
  for (const it of items) {
    const known = db.builds[it.code];
    if (known) { if (source !== 'manual' && !(known.seen || []).includes(source)) known.seen = (known.seen || []).concat(source); continue; }
    db.builds[it.code] = Object.assign({}, it, { source, seen: source === 'manual' ? [] : [source], addedAt: new Date().toISOString(), fav: false, hidden: false });
    fresh.push(db.builds[it.code]);
  }
  return fresh;
}

const list = db => Object.values(db.builds).sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || (b.seen || []).length - (a.seen || []).length || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

async function scan(sources, say) {
  const pages = (sources || []).filter(s => s.enabled !== false);
  const results = await Promise.all(pages.map(async src => {
    try {
      const r = await fetch(src.url, { headers: { 'user-agent': UA, 'accept': 'text/html' }, signal: AbortSignal.timeout(25000), redirect: 'follow' });
      if (!r.ok) return { src, error: 'ตอบ ' + r.status + ' (ข้ามไป)' };
      return { src, items: extract(await r.text()) };
    } catch (e) {
      return { src, error: e.name === 'TimeoutError' ? 'ไม่ตอบใน 25 วินาที' : e.message };
    }
  }));
  const db = load();
  let fresh = 0;
  for (const r of results) {
    if (r.error) { say('  ✗ ' + r.src.name + ' — ' + r.error); continue; }
    const n = merge(db, r.items, r.src.name).length;
    fresh += n;
    say('  ✓ ' + r.src.name + ' — พบ ' + r.items.length + ' ชุดแต่ง' + (n ? ' (ใหม่ ' + n + ')' : ''));
  }
  save(db);
  return fresh;
}

// ── pictures ──
// A build card shows the real firearm the weapon is modelled on: the lead image of its
// Wikipedia article, asked for with "free licence only" and shown straight from Wikimedia with
// a link to the file's page (its author and licence). weapons.json says which article; what
// the encyclopedia answered is kept in data/weapon-images.json. Not the game's own art.
const ROOT = path.join(__dirname, '..');
const IMAGES = () => path.join(store.DATA, 'weapon-images.json');
const modelOf = name => name.replace(new RegExp(' (?:' + CLASS_RE + ')$'), '');
const weaponMap = () => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'weapons.json'), 'utf8')); } catch (e) { return {}; } };
const loadImages = () => { try { return JSON.parse(fs.readFileSync(IMAGES(), 'utf8')); } catch (e) { return {}; } };

// model → { src, w, h, page, real } for every model of the list that has a picture
function pictures(db) {
  const map = weaponMap(), got = loadImages(), out = {};
  for (const b of Object.values(db.builds)) {
    const m = modelOf(b.name), want = map[m], img = want && (want.file ? got['File:' + want.file] : got[want.wiki]);
    if (img && img.src) out[m] = Object.assign({ real: want.real || want.wiki }, img);
  }
  return out;
}

// Asks Wikipedia for the pictures not yet known (one request for up to 50 articles).
async function fetchPictures(say) {
  const map = weaponMap(), got = loadImages();
  const titles = [...new Set(Object.keys(map).filter(k => k !== '_' && map[k].wiki).map(k => map[k].wiki))].filter(t => !(t in got));
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=pageimages&piprop=thumbnail%7Cname&pithumbsize=480&pilicense=free&redirects=1&titles=' + encodeURIComponent(batch.join('|'));
    const r = await fetch(url, { headers: { 'user-agent': 'deltafore/1.0 (personal tool; thumbnails of firearm articles)' }, signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error('Wikipedia ตอบ ' + r.status);
    const q = (await r.json()).query || {};
    const hop = {};                                         // the title asked for → the article it led to
    for (const x of (q.normalized || []).concat(q.redirects || [])) hop[x.from] = x.to;
    const page = {};
    for (const p of q.pages || []) page[p.title] = p;
    for (const t of batch) {
      let to = t; for (let n = 0; n < 4 && hop[to]; n++) to = hop[to];
      const p = page[to];
      got[t] = p && p.thumbnail ? { src: p.thumbnail.source, w: p.thumbnail.width, h: p.thumbnail.height, page: 'https://en.wikipedia.org/wiki/File:' + encodeURIComponent(p.pageimage) } : {};
    }
  }
  // files named outright (Wikimedia Commons)
  const files = [...new Set(Object.keys(map).filter(k => k !== '_' && map[k].file).map(k => 'File:' + map[k].file))].filter(t => !(t in got));
  if (files.length) {
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=url&iiurlwidth=480&titles=' + encodeURIComponent(files.join('|'));
    const r = await fetch(url, { headers: { 'user-agent': 'deltafore/1.0 (personal tool; thumbnails of firearm articles)' }, signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error('Wikimedia Commons ตอบ ' + r.status);
    const q = (await r.json()).query || {};
    const hop = {}; for (const x of q.normalized || []) hop[x.from] = x.to;
    const page = {}; for (const p of q.pages || []) page[p.title] = p;
    for (const t of files) {
      const p = page[hop[t] || t], ii = p && p.imageinfo && p.imageinfo[0];
      got[t] = ii && ii.thumburl ? { src: ii.thumburl, w: ii.thumbwidth, h: ii.thumbheight, page: ii.descriptionurl } : {};
    }
  }
  fs.mkdirSync(store.DATA, { recursive: true });
  fs.writeFileSync(IMAGES(), JSON.stringify(got, null, 2));
  const have = Object.values(got).filter(x => x.src).length;
  if (say) say('  🖼  รูปปืน: ' + have + ' จาก ' + Object.keys(got).length + ' บทความ' + (titles.length + files.length ? ' (ถามใหม่ ' + (titles.length + files.length) + ')' : ''));
  return have;
}

module.exports = { extract, parse, load, save, merge, list, scan, classOf, modeOf, modelOf, pictures, fetchPictures, CLASSES };
