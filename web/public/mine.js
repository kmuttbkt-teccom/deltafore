'use strict';
// What the player keeps for themselves — ticks of the checklist, fish caught, notes on a map,
// which build codes imported — lives in this browser only, under one key. Nothing of it goes
// to a server; tab 07 packs it into a file to carry to another device.

const Mine = (() => {
  const KEY = 'df-mine';
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } };
  const write = all => { try { localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch (e) { return false; } };   // no storage: the page works, nothing is kept
  return {
    all: read,
    get: (part, fallback) => { const v = read()[part]; return v === undefined ? fallback : v; },
    set: (part, value) => { const all = read(); all[part] = value; return write(all); },
    replace: all => write(all && typeof all === 'object' ? all : {})
  };
})();
