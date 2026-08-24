const test = require('node:test');
const assert = require('node:assert/strict');

test('model essay endpoint is derived from the authenticated history record', () => {
  const { config } = require('../utils/config');
  const { buildModelEssayPath } = require('../utils/request');

  assert.equal(config.modelEssayEndpoint, '/api/gaokao-essay/history');
  assert.equal(
    buildModelEssayPath('essay / 1'),
    '/api/gaokao-essay/history/essay%20%2F%201/model-essay'
  );
});

test('model essay view model normalizes structured learning content', () => {
  const { buildModelEssayViewModel } = require('../utils/model-essay');
  const result = buildModelEssayViewModel({
    targetBand: '高分提升版',
    modelEssay: ' Dear Chris... ',
    paragraphInsights: [
      { title: '开头', purpose: '说明目的', keyExpression: 'I am writing to...' },
      null
    ],
    expressionComparisons: [
      { original: 'I want you come', recommended: 'I would like to invite you to come', reason: '更得体' }
    ],
    reusableExpressions: [' I am writing to... ', '', null],
    generatedAt: 123
  });

  assert.deepEqual(result, {
    targetBand: '高分提升版',
    modelEssay: 'Dear Chris...',
    paragraphInsights: [
      { title: '开头', purpose: '说明目的', keyExpression: 'I am writing to...' }
    ],
    expressionComparisons: [
      { original: 'I want you come', recommended: 'I would like to invite you to come', reason: '更得体' }
    ],
    reusableExpressions: ['I am writing to...'],
    generatedAt: 123
  });
});

test('model essay view model returns safe empty defaults', () => {
  const { buildModelEssayViewModel, canGenerateModelEssay } = require('../utils/model-essay');

  assert.deepEqual(buildModelEssayViewModel(null), {
    targetBand: '高分提升版',
    modelEssay: '',
    paragraphInsights: [],
    expressionComparisons: [],
    reusableExpressions: [],
    generatedAt: 0
  });
  assert.equal(canGenerateModelEssay({ id: 'essay_abc', mode: 'grade', taskStatus: 'SUCCESS', sourceType: 'local' }), true);
  assert.equal(canGenerateModelEssay({ id: '', mode: 'grade', taskStatus: 'SUCCESS', sourceType: 'local' }), false);
  assert.equal(canGenerateModelEssay({ id: 'coach-1', mode: 'coach', taskStatus: 'SUCCESS', sourceType: 'remote' }), false);
});
