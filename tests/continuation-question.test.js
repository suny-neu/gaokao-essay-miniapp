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

test('题目 OCR 自动拆分原文和两段首句', () => {
  const result = applyQuestionOcr({}, {
    text: [
      'A boy found a lost dog and took it home.',
      'His parents helped him look for its owner.',
      'Paragraph 1: The next morning, the boy saw a notice.',
      'Paragraph 2:',
      'The owner thanked the boy warmly.'
    ].join('\n')
  });

  assert.deepEqual(result, {
    sourceMaterial: 'A boy found a lost dog and took it home.\nHis parents helped him look for its owner.',
    paragraphOneStarter: 'The next morning, the boy saw a notice.',
    paragraphTwoStarter: 'The owner thanked the boy warmly.'
  });
});

test('结构化 OCR 字段优先填入对应题目区域', () => {
  const result = applyQuestionOcr({}, {
    text: 'unstructured fallback',
    sourceMaterial: 'Story source',
    paragraphOneStarter: 'First starter',
    paragraphTwoStarter: 'Second starter'
  });

  assert.deepEqual(result, {
    sourceMaterial: 'Story source',
    paragraphOneStarter: 'First starter',
    paragraphTwoStarter: 'Second starter'
  });
});

test('续写页只展示一个题目卡和一个作答区', () => {
  const wxml = fs.readFileSync('pages/write/index.wxml', 'utf8');

  assert.equal((wxml.match(/continuation-question-card/g) || []).length, 1);
  assert.equal((wxml.match(/starter-card/g) || []).length, 0);
  assert.match(wxml, /题目已给/);
  assert.match(wxml, /我的续写/);
});
