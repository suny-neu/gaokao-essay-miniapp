const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('strict grading report owns the model essay generation flow', () => {
  const js = read('pages/report/index.js');
  const wxml = read('pages/report/index.wxml');

  assert.match(js, /fetchModelEssay/);
  assert.match(js, /canGenerateModelEssay/);
  assert.match(js, /generateModelEssay\(\)/);
  assert.match(js, /regenerateModelEssay\(\)/);
  assert.match(js, /wx\.showModal/);
  assert.match(wxml, /wx:if="\{\{mode === 'grade' && modelEssayAvailable\}\}"/);
  assert.match(wxml, /生成同题高分范文/);
});

test('model essay learning card contains all four learning sections', () => {
  const wxml = read('pages/report/index.wxml');

  for (const title of ['完整范文', '逐段拆解', '表达对比', '高分句式']) {
    assert.match(wxml, new RegExp(title));
  }
  assert.match(wxml, /重新生成/);
  assert.match(wxml, /modelEssayLoading/);
  assert.match(wxml, /modelEssayError/);
});

test('model essay entry card has a clear restrained typography hierarchy', () => {
  const wxss = read('pages/report/index.wxss');

  assert.match(wxss, /\.model-essay-entry-title\s*\{[^}]*font-size:\s*28rpx[^}]*font-weight:\s*700/s);
  assert.match(wxss, /\.model-essay-entry-copy\s*\{[^}]*font-size:\s*22rpx[^}]*line-height:\s*1\.65/s);
  assert.match(wxss, /\.model-essay-generate\s*\{[^}]*font-size:\s*24rpx[^}]*background:\s*var\(--ink\)/s);
});

test('generated model essay uses colored learning sections instead of continuous black text', () => {
  const wxss = read('pages/report/index.wxss');

  assert.match(wxss, /\.model-essay-content-card\s*\{[^}]*background:\s*#F8FBF9/s);
  assert.match(wxss, /\.learning-block\s*\{[^}]*background:\s*var\(--surface\)/s);
  assert.match(wxss, /\.learning-title\s*\{[^}]*color:\s*var\(--accent-text\)/s);
  assert.match(wxss, /\.insight-title\s*\{[^}]*color:\s*var\(--info\)/s);
  assert.match(wxss, /\.comparison-original\s*\{[^}]*background:\s*var\(--warn-soft\)/s);
  assert.match(wxss, /\.comparison-recommended\s*\{[^}]*background:\s*var\(--good-soft\)/s);
  assert.match(wxss, /\.reusable-expression\s*\{[^}]*color:\s*var\(--info\)/s);
});
