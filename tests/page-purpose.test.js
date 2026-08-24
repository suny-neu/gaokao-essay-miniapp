const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const corePages = [
  'home',
  'write',
  'tutor',
  'report',
  'history',
  'login',
  'editor',
  'result'
];

const readPage = (page) => fs.readFileSync(path.join(__dirname, `../pages/${page}/index.wxml`), 'utf8');

function initialActionPrimaryCounts(wxml) {
  const counts = [];
  const opener = /<view class="[^"]*\binitial-action\b[^"]*">/g;
  let match;

  while ((match = opener.exec(wxml))) {
    const tags = /<\/?view\b[^>]*>/g;
    tags.lastIndex = match.index;
    let depth = 0;
    let closingIndex = wxml.length;
    let tag;

    while ((tag = tags.exec(wxml))) {
      depth += tag[0].startsWith('</') ? -1 : 1;
      if (depth === 0) {
        closingIndex = tag.index;
        break;
      }
    }

    counts.push((wxml.slice(match.index, closingIndex).match(/primary-btn/g) || []).length);
  }

  return counts;
}

test('每个用户页面先说明用途，并在首个行动区保留一个主动作', () => {
  corePages.forEach((page) => {
    const wxml = readPage(page);
    const purposeMatches = wxml.match(/class="[^"]*page-purpose[^"]*"/g) || [];
    const actionCounts = initialActionPrimaryCounts(wxml);

    assert.equal(purposeMatches.length, 1, `${page} should have one page purpose`);
    assert.ok(actionCounts.length, `${page} should declare its initial action region`);
  });
});

test('each interactive initial-action branch has exactly one dominant action', () => {
  const expectedPrimaryCounts = {
    home: [1],
    write: [1],
    tutor: [1],
    report: [1, 1],
    history: [1],
    login: [1, 1],
    editor: [0],
    result: [0]
  };

  Object.entries(expectedPrimaryCounts).forEach(([page, expected]) => {
    assert.deepEqual(initialActionPrimaryCounts(readPage(page)), expected, page);
  });
});

test('首页按今日任务、进步、能力趋势和入口展示', () => {
  const wxml = readPage('home');
  const task = wxml.indexOf('今日提升任务');
  const progress = wxml.indexOf('本周进步');
  const score = wxml.indexOf('能力趋势');
  const entries = wxml.indexOf('写作文');

  assert.ok(task >= 0 && task < progress && progress < score && score < entries);
});
