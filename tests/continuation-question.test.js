const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  normalizeQuestionFields,
  hasCompleteContinuationQuestion,
  applyQuestionOcr
} = require('../utils/continuation-question');

test('续写题目保持原文和两段首句三个结构化字段', () => {
  assert.deepEqual(normalizeQuestionFields({
    sourceMaterial: '  Story  ',
    paragraphOneStarter: ' Paragraph 1: He ran. ',
    paragraphTwoStarter: ' Paragraph 2: They smiled. '
  }), {
    sourceMaterial: 'Story',
    paragraphOneStarter: 'Paragraph 1: He ran.',
    paragraphTwoStarter: 'Paragraph 2: They smiled.'
  });
});

test('原文和两段首句必须全部填写', () => {
  assert.equal(hasCompleteContinuationQuestion({
    sourceMaterial: 'Story',
    paragraphOneStarter: 'Paragraph 1',
    paragraphTwoStarter: ''
  }), false);
});

test('空 OCR 结果不会覆盖已有题目', () => {
  const current = {
    sourceMaterial: 'Existing story',
    paragraphOneStarter: 'Existing first',
    paragraphTwoStarter: 'Existing second'
  };

  assert.deepEqual(applyQuestionOcr(current, { text: '' }), current);
});

test('续写页只展示一个题目卡和一个作答区', () => {
  const wxml = fs.readFileSync('pages/write/index.wxml', 'utf8');

  assert.equal((wxml.match(/continuation-question-card/g) || []).length, 1);
  assert.equal((wxml.match(/starter-card/g) || []).length, 0);
  assert.match(wxml, /题目已给/);
  assert.match(wxml, /我的续写/);
});
