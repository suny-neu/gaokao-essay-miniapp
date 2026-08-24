const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const tokenValue = (wxss, token) => {
  const match = wxss.match(new RegExp(`${token}:\\s*(#[0-9A-F]{6})`, 'i'));
  assert.ok(match, `missing ${token}`);
  return match[1];
};

const luminance = (hex) => {
  const channels = hex.slice(1).match(/../g).map((value) => parseInt(value, 16) / 255);
  const linear = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));

  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
};

const contrast = (first, second) => {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};

test('global mint tokens and reusable learning primitives are available', () => {
  const wxss = read('app.wxss');

  for (const [token, value] of Object.entries({
    '--bg': '#F5F5F2',
    '--surface': '#FFFFFF',
    '--text': '#171A18',
    '--muted': '#59615D',
    '--accent': '#12A875',
    '--accent-text': '#087A56',
    '--accent2': '#12A875',
    '--accent-soft': '#E8F7F0',
    '--border': '#E4E7E2',
    '--good': '#087A56',
    '--warn': '#8A4700',
    '--bad': '#A83232',
    '--info': '#28559B'
  })) {
    assert.match(wxss, new RegExp(`${token}:\\s*${value}`, 'i'));
  }

  for (const className of [
    'primary-btn',
    'secondary-btn',
    'text-btn',
    'surface-card',
    'section-heading',
    'page-purpose',
    'empty-action'
  ]) {
    assert.match(wxss, new RegExp(`\\.${className}(?:\\s*,|\\s*\\{)`));
  }
});

test('small global and semantic text colors meet normal-text contrast', () => {
  const wxss = read('app.wxss');

  for (const [foreground, background] of [
    ['--muted', '--surface'],
    ['--muted', '--bg'],
    ['--accent-text', '--surface'],
    ['--accent-text', '--bg'],
    ['--accent-text', '--accent-soft'],
    ['--good', '--good-soft'],
    ['--warn', '--warn-soft'],
    ['--bad', '--bad-soft'],
    ['--info', '--info-soft']
  ]) {
    assert.ok(
      contrast(tokenValue(wxss, foreground), tokenValue(wxss, background)) >= 4.5,
      `${foreground} must meet 4.5:1 on ${background}`
    );
  }
});

test('global and core surfaces do not retain purple or warm brown systems', () => {
  const styles = [
    read('app.wxss'),
    read('components/panel-card/index.wxss'),
    read('components/metric-card/index.wxss'),
    read('components/alert-item/index.wxss'),
    ...['home', 'write', 'tutor', 'report', 'history', 'login', 'editor', 'result']
      .map((page) => read(`pages/${page}/index.wxss`))
  ].join('\n');

  assert.doesNotMatch(
    styles,
    /#(?:4f46e5|7c3aed|4338ca|6366f1|c97858|d98e6b|cc7b59|e2a480|9d5e43|866651|f2f0ff|f7e7df|f8f1ed|f5eee9)|rgba?\(\s*(?:79\s*,\s*70\s*,\s*229|99\s*,\s*102\s*,\s*241|201\s*,\s*120\s*,\s*88)/i
  );
});

test('core components consume global tokens and semantic alert colors', () => {
  const panel = read('components/panel-card/index.wxss');
  const metric = read('components/metric-card/index.wxss');
  const alert = read('components/alert-item/index.wxss');

  for (const style of [panel, metric, alert]) {
    assert.match(style, /background:\s*var\(--surface,\s*#FFFFFF\)/);
    assert.match(style, /border:\s*2rpx solid var\(--border,\s*#DEEAE5\)/);
    assert.match(style, /border-radius:\s*var\(--radius,\s*28rpx\)/);
    assert.match(style, /box-shadow:\s*var\(--shadow-sm,\s*none\)/);
  }

  assert.match(metric, /color:\s*var\(--text,\s*#172B25\)/);
  assert.match(metric, /color:\s*var\(--muted,\s*#52665F\)/);
  assert.match(alert, /var\(--warn,\s*#8A4700\)/);
  assert.match(alert, /var\(--info,\s*#28559B\)/);
  assert.match(alert, /color:\s*var\(--text,\s*#172B25\)/);
  assert.match(alert, /color:\s*var\(--muted,\s*#52665F\)/);
});
