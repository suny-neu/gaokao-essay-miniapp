const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (file) => fs.readFileSync(file, 'utf8');

test('home dashboard matches the approved mobile prototype structure', () => {
  const wxml = read('pages/home/index.wxml');

  for (const label of [
    '今天练什么',
    '今日提升任务',
    '本周进步',
    '连续学习',
    '能力趋势',
    '需要重点练习',
    '写作文',
    'AI 陪练',
    '看报告'
  ]) {
    assert.match(wxml, new RegExp(label));
  }

  assert.ok(wxml.indexOf('今日提升任务') < wxml.indexOf('本周进步'));
  assert.ok(wxml.indexOf('本周进步') < wxml.indexOf('能力趋势'));
  assert.ok(wxml.indexOf('能力趋势') < wxml.indexOf('需要重点练习'));
  assert.doesNotMatch(wxml, /🤖|DeepSeek|deepseek/i);
});

test('home dashboard uses a single-column mobile shell and black primary action', () => {
  const wxss = read('pages/home/index.wxss');

  assert.match(wxss, /\.dashboard-shell\s*\{/);
  assert.match(wxss, /\.task-primary[^}]*background:\s*var\(--ink\)/s);
  assert.match(wxss, /\.metric-grid[^}]*display:\s*grid/s);
  assert.match(wxss, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(wxss, /\.quick-nav[^}]*display:\s*flex/s);
  assert.match(wxss, /\.quick-nav[^}]*justify-content:\s*space-between/s);
  assert.match(wxss, /\.quick-nav-item[^}]*width:\s*31\.2%/s);
  assert.match(wxss, /\.quick-nav\s*\{[^}]*position:\s*relative/s);
  assert.match(wxss, /\.bottom-nav\s*\{[^}]*position:\s*fixed/s);
  assert.match(wxss, /\.bottom-nav[\s\S]*env\(safe-area-inset-bottom\)/);
});

test('home dashboard follows the airy reference hierarchy', () => {
  const wxml = read('pages/home/index.wxml');
  const pageConfig = JSON.parse(read('pages/home/index.json'));

  assert.equal(pageConfig.navigationStyle, 'custom');
  assert.match(wxml, />能力趋势</);
  assert.match(wxml, /class="task-duration"/);
  assert.match(wxml, /class="chart-empty-overlay"/);
  assert.match(wxml, /class="capability-row"/);
  assert.doesNotMatch(wxml, /wx:if="\{\{growthTrendPoints\.length\}\}" class="capability-row"/);
  assert.match(wxml, /class="bottom-nav"/);
  assert.match(wxml, />首页</);
  assert.match(wxml, />历史</);
  assert.match(wxml, />我的</);
  assert.doesNotMatch(wxml, /class="account-strip/);
  assert.doesNotMatch(wxml, />微信登录</);
});

test('home task card keeps its complete content while quota is loading', () => {
  const wxml = read('pages/home/index.wxml');
  const pageScript = read('pages/home/index.js');
  const wxss = read('pages/home/index.wxss');

  assert.match(wxml, /<view class="task-card">/);
  assert.doesNotMatch(wxml, /<panel-card extraClass="task-card">/);
  assert.match(pageScript, /dailyTask:\s*buildDefaultDailyTask\(\)/);
  assert.match(pageScript, /dailyActionText:\s*'开始今天练习'/);
  assert.match(pageScript, /dailyQuotaText:\s*'正在获取今日额度…'/);
  assert.match(wxss, /\.task-primary\[disabled\][^}]*background:\s*var\(--ink\)/s);
  assert.match(wxss, /\.task-card\s*\{[^}]*min-height:\s*370rpx[^}]*border-radius:\s*30rpx[^}]*background:\s*#EAF7F1/s);
  assert.match(wxss, /\.task-title\s*\{[^}]*font-size:\s*38rpx/s);
  assert.match(wxss, /\.task-primary\s*\{[^}]*width:\s*56%[^}]*height:\s*68rpx/s);
});

test('home dashboard has one authoritative responsive style pass', () => {
  const wxss = read('pages/home/index.wxss');
  const shellDeclarations = wxss.match(/(?:^|\n)\.dashboard-shell\s*\{/g) || [];

  assert.equal(shellDeclarations.length, 1);
  assert.match(wxss, /\.dashboard-shell\s*\{[^}]*env\(safe-area-inset-top\)/s);
  assert.match(wxss, /\.task-card\s*\{[^}]*min-height:\s*370rpx/s);
  assert.match(wxss, /\.dashboard-chart\s*\{[^}]*height:\s*236rpx/s);
  assert.doesNotMatch(wxss, /Reference layout refinement|Exact mobile proportion pass/);
});

test('panel card allows page styles to control the approved home layout', () => {
  const panelCardConfig = JSON.parse(read('components/panel-card/index.json'));

  assert.equal(panelCardConfig.styleIsolation, 'apply-shared');
  assert.equal(panelCardConfig.options, undefined);
});

test('home header starts below the native WeChat menu capsule', () => {
  const wxml = read('pages/home/index.wxml');
  const pageScript = read('pages/home/index.js');

  assert.match(wxml, /class="dashboard-shell" style="padding-top: \{\{homeTopInset\}\}px;"/);
  assert.match(pageScript, /getMenuButtonBoundingClientRect/);
  assert.match(pageScript, /getWindowInfo/);
});
