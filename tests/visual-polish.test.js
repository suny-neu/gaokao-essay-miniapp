const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('home separates content actions from the safe-area bottom navigation', () => {
  const wxml = read('pages/home/index.wxml');
  const wxss = read('pages/home/index.wxss');

  assert.match(wxml, /class="quick-nav"/);
  assert.match(wxml, /class="bottom-nav"/);
  assert.doesNotMatch(wxml, /class="quick-actions"/);
  assert.match(wxss, /\.quick-nav\s*\{/);
  assert.match(wxss, /\.quick-nav\s*\{[^}]*position:\s*relative/s);
  assert.match(wxss, /\.bottom-nav[\s\S]*env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(wxss, /\.quick-action\s*\{[^}]*border:/s);
});

test('home keeps the full trend frame visible before the first report', () => {
  const wxml = read('pages/home/index.wxml');
  const wxss = read('pages/home/index.wxss');

  assert.match(wxml, /class="chart-empty-overlay"/);
  assert.match(wxml, /class="capability-row"/);
  assert.match(wxss, /\.trend-dashboard-card\s*\{[^}]*min-height:\s*440rpx/s);
  assert.match(wxss, /\.chart-empty-overlay\s*\{/);
  assert.match(wxss, /\.summary-metric-card\s*\{[^}]*min-height:\s*168rpx/s);
});

test('writing page exposes OCR as compact section actions', () => {
  const wxml = read('pages/write/index.wxml');
  const wxss = read('pages/write/index.wxss');

  assert.match(wxml, /class="section-action question-ocr-action"/);
  assert.match(wxml, /class="section-action draft-ocr-action"/);
  assert.doesNotMatch(wxml, /class="write-btn write-btn-secondary ocr-btn"/);
  assert.match(wxss, /\.section-action(?:\s*,|\s*\{)/);
  assert.match(wxss, /\.source-input\s*\{[^}]*min-height:\s*180rpx/s);
});
