const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildReportViewModel,
  normalizeScoreDimensions
} = require('../utils/report-view-model');

test('陪练结果不显示评分卡', () => {
  const viewModel = buildReportViewModel({
    mode: 'coach',
    content: '先补充一个具体例子。'
  });

  assert.equal(viewModel.scoreVisible, false);
  assert.equal(viewModel.pageTitle, '陪练结果');
  assert.equal(viewModel.scoreValue, '');
});

test('没有真实分项时不从总分推算', () => {
  const viewModel = buildReportViewModel({
    mode: 'grade',
    scoreText: '9分 / 15',
    analysis: {}
  });

  assert.deepEqual(viewModel.dims, []);
  assert.equal(viewModel.deltaText, '');
});

test('只保留完整且总分一致的四项评分', () => {
  const dimensions = normalizeScoreDimensions([
    { code: 'content', label: '内容', score: 3, maxScore: 5 },
    { code: 'language', label: '语言', score: 3, maxScore: 5 },
    { code: 'structure', label: '结构', score: 2, maxScore: 3 },
    { code: 'vocabulary', label: '词汇', score: 1, maxScore: 2 }
  ], 9);

  assert.equal(dimensions.length, 4);
  assert.equal(dimensions[0].scoreText, '3/5');
  assert.equal(dimensions[0].width, 60);
  assert.deepEqual(normalizeScoreDimensions(dimensions, 10), []);
});

test('无真实亮点时返回空数组', () => {
  const viewModel = buildReportViewModel({
    mode: 'grade',
    scoreText: '9分 / 15',
    analysis: {}
  });

  assert.deepEqual(viewModel.highlights, []);
});
