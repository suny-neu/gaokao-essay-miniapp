const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (file) => fs.readFileSync(file, 'utf8');

test('history start button centers its label vertically', () => {
  const wxml = read('pages/history/index.wxml');
  const wxss = read('pages/history/index.wxss');

  assert.match(wxml, /class="primary-btn history-start"/);
  assert.match(wxss, /\.history-start\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*justify-content:\s*center[^}]*line-height:\s*1/s);
});
