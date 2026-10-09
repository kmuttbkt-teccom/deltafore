'use strict';
// Watched pages: each is fetched once per scan (a plain request that says what it is) and
// searched for things that look like redeem codes. A page of text is a poor witness, so
// what is found waits for `approve` unless the source is marked "auto": true in config.json.

const UA = 'deltafore-code-watcher/1.0 (personal use; one request per page per scan)';

// Words that are shaped like codes but are not.
const STOP = new Set(('ANDROID IPHONE WINDOWS GARENA DELTAFORCE DELTA FORCE MOBILE STEAM GOOGLE FACEBOOK DISCORD YOUTUBE TIKTOK ' +
  'REDEEM CODES CODE CDKEY UPDATE UPDATED ACTIVE EXPIRED REWARD REWARDS WARFARE OPERATIONS SEASON GLOBAL OFFICIAL ' +
  'JANUARY FEBRUARY MARCH APRIL AUGUST SEPTEMBER OCTOBER NOVEMBER DECEMBER COPYRIGHT PLAYSTATION BLUESTACKS LDPLAYER').split(' '));
const HARDWARE = /^(HTTP|HTTPS|UTF|MP4|H26[45]|IOS|ANDROID|IPHONE|IPAD|GALAXY|PIXEL|REDMI|POCO|WINDOWS|RTX|GTX|RYZEN|SNAPDRAGON|PLAYSTATION|PS|XBOX|S|A|M|AK|SCAR|MP|UZI|QBZ|AUG|G|K|CI|SG|RM)-?\d+[A-Z]{0,3}$/;

// Where a page says its codes are over — in the languages of the regions the game is published in.
const EXPIRED = /expired|no longer (work|valid)|หมดอายุ|hết hạn|het han|kedaluwarsa|kadaluarsa|expirad|caducad|vencid|過期|已失效|失效|süresi dol|منتهي/i;
const ACTIVE = /active|working|valid|ใช้ได้|còn hạn|aktif|ativos?|activos?|vigentes?|有效|可用/i;

const text = html => html
  .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#?\w+;/g, ' ');

// A code as publishers print them: 6–24 letters and digits. In capitals it needs a digit or one
// of the game's own prefixes; in mixed case (DFWizard309) a digit and two capitals; without any
// digit (fvzeLrxYajwVviFSTSZ) only when it stands alone in its element (`alone`).
// `words` (a game whose codes are often plain capitals, like RoV's SEAMONSTER): a word of 8+
// capitals counts too, where it stands alone in its element.
function looksLikeCode(t, alone, words) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{5,23}$/.test(t)) return false;
  const U = t.toUpperCase();
  if (words && alone && /^[A-Z]{8,24}$/.test(t) && !STOP.has(t)) return true;
  if (STOP.has(U) || /^\d+$/.test(t) || /^(19|20)\d\d-?\d\d-?\d\d$/.test(t)) return false;
  if (HARDWARE.test(U) || /^\d+(K|FPS|HZ|GB|MB|MS|MM|P|X)$/.test(U)) return false;
  const up = (t.match(/[A-Z]/g) || []).length, low = (t.match(/[a-z]/g) || []).length, digit = /\d/.test(t);
  if (!low) return /^(GARENA|DELTAFORCE|DF)[A-Z0-9-]{3,}$/.test(t) || (digit && up > 0);
  if (!up) return false;                                   // an ordinary word
  if (digit) return up >= 2;
  return !!alone && t.length >= 12 && up >= 4 && low >= 4;
}

// The page without the parts it calls expired: a section under an "expired" heading (up to the
// next heading of that level), a table row or a list item that says so.
function dropExpired(html) {
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let out = '', last = 0, skip = 0, m;
  while ((m = re.exec(html))) {
    if (!skip) out += html.slice(last, m.index);
    const level = Number(m[1]), title = text(m[2]);
    if (skip && level <= skip) skip = 0;
    if (!skip && EXPIRED.test(title) && !ACTIVE.test(title)) skip = level;
    if (!skip) out += m[0];
    last = re.lastIndex;
  }
  if (!skip) out += html.slice(last);
  return out.replace(/<(tr|li)\b[^>]*>[\s\S]*?<\/\1>/gi, row => EXPIRED.test(text(row)) ? ' ' : row);
}

// Codes on a page: a <code>/<strong>/<b>/<td>/<li>/<h3>/<h4> that holds a code and nothing else
// (or a code, a separator, a description) — or a token right after the word for "code".
function extract(html, match, words) {
  const out = new Set();
  const body = dropExpired(html.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' '));
  for (const m of body.matchAll(/<(code|strong|b|td|li|h3|h4|mark|kbd)\b[^>]*>([\s\S]{0,160}?)<\/\1>/gi)) {
    const t = /^([A-Za-z0-9][A-Za-z0-9-]{5,23})(\s*$|\s*[:：–—|(=→-]\s)/.exec(text(m[2]).trim());
    if (t && looksLikeCode(t[1], !t[2].trim(), words)) out.add(t[1]);
  }
  for (const m of text(body).matchAll(/(?:codes?|โค้ด|โค๊ด|cdk(?:ey)?|giftcode|mã|kode|c[oó]digos?|序號|兌換碼|禮包碼)\s*[:："“'‘-]?\s*([A-Za-z0-9][A-Za-z0-9-]{5,23})(?![A-Za-z0-9-])/gi)) {
    if (looksLikeCode(m[1], false)) out.add(m[1]);
  }
  const re = match ? new RegExp(match) : null;
  return [...out].filter(c => !re || re.test(c));
}

// All pages at once (each is another site, one request each); the report keeps their order.
async function scan(sources, say, words) {
  const list = (sources || []).filter(s => s.enabled !== false);
  const results = await Promise.all(list.map(async src => {
    try {
      const r = await fetch(src.url, { headers: { 'user-agent': UA, 'accept': 'text/html' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
      if (!r.ok) return { src, error: 'ตอบ ' + r.status + ' (ข้ามไป)' };
      return { src, codes: extract(await r.text(), src.match, words || src.words === true) };
    } catch (e) {
      return { src, error: e.name === 'TimeoutError' ? 'ไม่ตอบใน 20 วินาที' : e.message };
    }
  }));
  const found = [];
  for (const r of results) {
    if (r.error) { say('  ✗ ' + r.src.name + ' — ' + r.error); continue; }
    say('  ✓ ' + r.src.name + ' — พบ ' + r.codes.length + ' รายการ');
    for (const code of r.codes) found.push({ code, source: r.src.name, auto: r.src.auto === true });
  }
  return found;
}

module.exports = { scan, extract, looksLikeCode, dropExpired };
