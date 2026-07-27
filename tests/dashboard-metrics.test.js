const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFormalGradeMetrics } = require('../utils/dashboard-metrics');

test('首页统计排除陪练和失败记录', () => {
  const metrics = buildFormalGradeMetrics([
    { mode: 'coach', taskStatus: 'SUCCESS', scoreText: '15分 / 15', createdAt: Date.now() },
    { mode: 'grade', taskStatus: 'FAILED', scoreText: '14分 / 15', createdAt: Date.now() },
    { mode: 'grade', taskStatus: 'SUCCESS', scoreText: '9分 / 15', createdAt: Date.now() }
  ]);

  assert.equal(metrics.formalGrades.length, 1);
  assert.equal(metrics.average.valueText, '9');
  assert.equal(metrics.deltaText, '');
  assert.equal(metrics.trend.values.length, 1);
});

test('两个正式批改才生成真实差值', () => {
  const now = Date.now();
  const metrics = buildFormalGradeMetrics([
    { mode: 'grade', taskStatus: 'SUCCESS', scoreText: '11分 / 15', createdAt: now },
    { mode: 'grade', taskStatus: 'SUCCESS', scoreText: '9分 / 15', createdAt: now - 86400000 }
  ]);

  assert.equal(metrics.deltaText, '+2');
  assert.deepEqual(metrics.trend.values.map((item) => item.score), [9, 11]);
});

test('没有正式批改时不生成假趋势或能力值', () => {
  const metrics = buildFormalGradeMetrics([]);

  assert.equal(metrics.average.valueText, '--');
  assert.deepEqual(metrics.trend.values, []);
  assert.equal(metrics.grammar.valueText, '--');
  assert.equal(metrics.vocabulary.valueText, '--');
});
