// DELTAFORE fill-helper-loader.js
// Tiny bootstrap loader for mobile Safari (iPhone/iPad), Chrome, and desktop browsers.
// Fetches fill-helper.js and executes it with verified origins.
(function () {
  var baseUrl = 'https://kmuttbkt-teccom.github.io/deltafore/';
  try {
    var cs = document.currentScript;
    if (cs && cs.src) {
      baseUrl = cs.src.replace(/\/[^/]*$/, '/');
    } else if (window.location && window.location.origin && window.location.origin.indexOf('http') === 0 && !window.location.hostname.endsWith('garena.sg')) {
      baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
    }
  } catch (e) {}

  var origins = [baseUrl.replace(/\/$/, ''), 'https://kmuttbkt-teccom.github.io', 'http://localhost:4310', 'http://127.0.0.1:4310'];
  if (window.location && window.location.origin) origins.push(window.location.origin);

  fetch(baseUrl + 'fill-helper.js?_=' + Date.now())
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(function (src) {
      var runner = new Function('ORIGINS', 'return (' + src + ')(ORIGINS);');
      runner(origins);
    })
    .catch(function (err) {
      alert('DELTAFORE: โหลดตัวช่วยกรอกไม่ได้ (' + err.message + ')');
    });
})();
