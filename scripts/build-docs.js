'use strict';
// node scripts/build-docs.js — fills docs/, the folder GitHub Pages serves (the workflow in
// .github/workflows/pages.yml uploads it on every push to main). The site there has no server
// behind it: the page reads these files and keeps what the visitor does in the browser.
// Run it before a commit that should reach the site.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs');
const copy = (from, to) => {
  const src = path.join(ROOT, from);
  if (!fs.existsSync(src)) return false;
  const dst = path.join(OUT, to || path.basename(from));
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return true;
};

const done = [];
// the page itself
for (const f of fs.readdirSync(path.join(ROOT, 'web/public'))) if (copy('web/public/' + f, f)) done.push(f);
// what it reads instead of asking a server
for (const f of ['events.json', 'PRO-GUIDE.md', 'ROV-GUIDE.md', 'DF-EVENTS.md', 'DF-MAPS.md', 'DF-TIPS.md', 'maps.json', 'checklist.json', 'fish.json']) if (copy(f)) done.push(f);
for (const f of ['codes.json', 'codes-rov.json', 'builds.json']) {
  if (copy('data/' + f, 'data/' + f)) done.push('data/' + f);
  if (f !== 'builds.json') copy('data/' + f, f);            // the page also looks for the two lists beside itself
}
// the pictures of the build cards, worked out here (on the server /api/builds does it)
try {
  const builds = require('../redeem/builds');
  fs.writeFileSync(path.join(OUT, 'data/build-pictures.json'), JSON.stringify(builds.pictures(builds.load())));
  done.push('data/build-pictures.json');
} catch (e) { console.log('no pictures: ' + e.message); }
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

// never in the site: the browser profile, the log, the key of the phone link
for (const bad of ['data/browser-profile', 'data/redeem.log', 'data/web-key']) {
  if (fs.existsSync(path.join(OUT, bad))) throw new Error('docs/' + bad + ' must not be published — remove it');
}
console.log('docs/ ← ' + done.length + ' files: ' + done.join(' · '));
