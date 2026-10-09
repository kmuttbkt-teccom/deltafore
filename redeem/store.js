'use strict';
// The list of codes and what became of each: data/codes.json (written whole, through a
// temporary file) and data/redeem.log (one line per attempt).
// One list per game: Delta Force is the first and keeps the old names (the top of config.json,
// data/codes.json); every other game is an entry of "games" in config.json and has
// data/codes-<id>.json. The game is an argument everywhere, and falls back to DF_GAME.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = process.env.DF_DATA_DIR || path.join(ROOT, 'data');

const DEFAULTS = {
  // 'manual': the tool finds and keeps the codes, the player redeems in their own browser and reports the result.
  // 'auto':   the tool drives a browser on the redemption page — Garena's sign-in page refuses such a browser (seen 2026-10-09).
  mode: 'manual',
  portal: 'https://redeem.df.garena.sg/th/cdkgarena.html',
  browser: 'auto',
  headless: false,
  delayBetweenCodesSec: [8, 15],
  maxCodesPerRun: 10,
  maxInvalidPerDay: 5,
  maxTriesPerCode: 3,
  loginWaitMin: 10,
  keepLoginDays: 30,
  rejectOptionalCookies: true,
  watchEveryMin: 120,
  sources: []
};

const FIRST = 'deltaforce';
const gameId = g => {
  const id = g || process.env.DF_GAME || FIRST;
  if (!/^[a-z0-9]{2,20}$/.test(id)) throw new Error('ชื่อเกมไม่ถูกต้อง: ' + id);
  return id;
};

function config(g) {
  let user = {};
  const file = process.env.DF_CONFIG || path.join(ROOT, 'config.json');
  if (fs.existsSync(file)) {
    try { user = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { throw new Error('config.json อ่านไม่ได้ (JSON ผิดรูป): ' + e.message); }
  }
  const c = Object.assign({}, DEFAULTS, user);
  const id = gameId(g), others = user.games || {};
  // redeem: 'web' — on a page of the publisher (the fill helper works there) · 'ingame' — typed into the game itself
  c.games = [{ id: FIRST, name: user.name || 'Delta Force', redeem: 'web' }].concat(Object.keys(others).map(k => ({ id: k, name: others[k].name || k, redeem: others[k].redeem || 'ingame' })));
  c.game = id; c.name = c.games[0].name; c.redeem = 'web'; c.how = '';
  if (id !== FIRST) {
    const o = others[id];
    if (!o) throw new Error('ไม่รู้จักเกม "' + id + '" — เพิ่มใน config.json ช่อง "games"');
    Object.assign(c, { name: o.name || id, redeem: o.redeem || 'ingame', how: o.how || '', portal: o.portal || '', sources: o.sources || [], words: o.words === true, mode: 'manual' });
  }
  if (process.env.DF_PORTAL_URL) c.portal = process.env.DF_PORTAL_URL;
  if (process.env.DF_HEADLESS) c.headless = process.env.DF_HEADLESS === '1';
  c.profileDir = path.join(DATA, 'browser-profile');
  return c;
}

// What a code can be:
//   found    seen on a watched page, waits for `approve`
//   new      waits for its first attempt
//   early    not open yet — tried again on a later run
//   retry    the attempt did not get an answer — tried again (up to maxTriesPerCode)
//   ok · used · gone · expired · invalid · failed · skip   — finished, never sent again
const PENDING = ['new', 'early', 'retry'];
const DONE = ['ok', 'used', 'gone', 'expired', 'invalid', 'failed', 'skip'];

const FILE = g => path.join(DATA, gameId(g) === FIRST ? 'codes.json' : 'codes-' + gameId(g) + '.json');

function load(g) {
  try { return JSON.parse(fs.readFileSync(FILE(g), 'utf8')); }
  catch (e) {
    if (e.code === 'ENOENT') return { codes: {} };
    throw new Error(path.basename(FILE(g)) + ' อ่านไม่ได้: ' + e.message);
  }
}

function save(db, g) {
  fs.mkdirSync(DATA, { recursive: true });
  const tmp = FILE(g) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE(g));
}

function log(line, g) {
  fs.mkdirSync(DATA, { recursive: true });
  const id = gameId(g);
  fs.appendFileSync(path.join(DATA, 'redeem.log'), new Date().toISOString() + ' ' + (id === FIRST ? '' : '[' + id + '] ') + line + '\n');
}

// A code as it is typed into the page: no spaces round it, case kept (codes are case-sensitive).
// A space inside is refused, not removed: two codes pasted as one must not become a third.
const clean = s => String(s || '').trim();
const valid = s => /^[A-Za-z0-9][A-Za-z0-9_-]{3,39}$/.test(s);

// Adds a code unless it is already known (in any letter case). Returns the entry and whether it is new.
function add(db, raw, { source, status } = {}) {
  const code = clean(raw);
  if (!valid(code)) return { error: 'รูปแบบไม่ใช่โค้ด: ' + raw };
  const key = Object.keys(db.codes).find(k => k.toLowerCase() === code.toLowerCase());
  if (key) return { entry: db.codes[key], fresh: false };
  const entry = { code, status: status || 'new', source: source || 'manual', addedAt: new Date().toISOString(), tries: 0 };
  db.codes[code] = entry;
  return { entry, fresh: true };
}

function find(db, raw) {
  const code = clean(raw).toLowerCase();
  const key = Object.keys(db.codes).find(k => k.toLowerCase() === code);
  return key ? db.codes[key] : null;
}

// The queue, most promising first: codes the player typed in, then codes seen on a page about the
// Garena edition, then the rest (pages about the Global edition — mostly not valid on Garena);
// within a group the one seen on more pages, then the older one.
const rank = e => e.source === 'manual' ? 0 : (e.seen || [e.source]).some(s => /^garena/i.test(s)) ? 1 : 2;
const pending = (db, max) => Object.values(db.codes)
  .filter(e => PENDING.includes(e.status) && e.tries < max)
  .sort((a, b) => rank(a) - rank(b) || (b.seen || []).length - (a.seen || []).length || (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0));

// What the player saw on the page, reported by hand (a code still waiting, or one only found so far).
const RESULTS = ['ok', 'used', 'expired', 'invalid', 'gone', 'early'];   // 'early': not open yet — stays in the queue
function record(db, raw, result) {
  const e = find(db, raw);
  if (!e || !RESULTS.includes(result) || !(PENDING.includes(e.status) || e.status === 'found')) return null;
  e.status = result; e.triedAt = new Date().toISOString(); if (result !== 'early') e.tries = (e.tries || 0) + 1; e.note = 'บันทึกผลเอง';
  return e;
}

const day = iso => (iso || '').slice(0, 10);
const invalidToday = db => Object.values(db.codes)
  .filter(e => e.status === 'invalid' && day(e.triedAt) === day(new Date().toISOString())).length;

module.exports = { DATA, FIRST, gameId, config, load, save, log, add, find, pending, invalidToday, record, clean, PENDING, DONE, RESULTS };
