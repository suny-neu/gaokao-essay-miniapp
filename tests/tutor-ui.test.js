const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('陪练使用多行输入并展示输入输出说明', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '../pages/tutor/index.wxml'), 'utf8');

  assert.match(wxml, /<textarea/);
  assert.doesNotMatch(wxml, /<input[\s>]/);
  assert.match(wxml, /输入什么/);
  assert.match(wxml, /你会得到/);
});
