const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadWeeklyMetricBuilder() {
  const source = fs.readFileSync(path.join(__dirname, '../pages/home/index.js'), 'utf8');
  const pageDirectory = path.join(__dirname, '../pages/home');
  const sandbox = {
    require: (modulePath) => require(path.resolve(pageDirectory, modulePath)),
    module: { exports: {} },
    Page: () => {}
  };

  vm.runInNewContext(`${source}\nmodule.exports = { buildLegacyWeeklyMetric };`, sandbox);
  return sandbox.module.exports.buildLegacyWeeklyMetric;
}

function grade(id, date, score, essayType = 'application') {
  return {
    id,
    mode: 'grade',
    taskStatus: 'SUCCESS',
    essayType,
    scoreText: `${score}分 / 15`,
    createdAt: new Date(`${date}T12:00:00+08:00`).getTime()
  };
}

test('本周进步比较本周与上周同题型正式批改的平均分', () => {
  const buildWeeklyMetric = loadWeeklyMetricBuilder();
  const records = [
    grade('current-1', '2026-08-24', 13),
    grade('current-2', '2026-08-25', 11),
    grade('previous-1', '2026-08-17', 7),
    grade('previous-2', '2026-08-23', 9)
  ];

  assert.deepEqual(
    JSON.parse(JSON.stringify(buildWeeklyMetric(records, 'application', new Date('2026-08-25T20:00:00+08:00')))),
    { delta: 4, label: '+4分', status: 'IMPROVED' }
  );
});

test('本周进步不会混合应用文与读后续写分数', () => {
  const buildWeeklyMetric = loadWeeklyMetricBuilder();
  const records = [
    grade('current-app', '2026-08-25', 12),
    grade('previous-app', '2026-08-18', 10),
    grade('current-continuation', '2026-08-25', 15, 'continuation'),
    grade('previous-continuation', '2026-08-18', 5, 'continuation')
  ];

  assert.equal(
    buildWeeklyMetric(records, 'application', new Date('2026-08-25T20:00:00+08:00')).label,
    '+2分'
  );
});

test('只有一篇正式批改时保持等待状态', () => {
  const buildWeeklyMetric = loadWeeklyMetricBuilder();
  const records = [
    grade('current-1', '2026-08-24', 12)
  ];

  assert.deepEqual(
    JSON.parse(JSON.stringify(buildWeeklyMetric(records, 'application', new Date('2026-08-25T20:00:00+08:00')))),
    { delta: 0, label: '等待更多记录', status: 'PENDING' }
  );
});

test('没有上周样本时用最近两篇正式批改显示本周进步', () => {
  const buildWeeklyMetric = loadWeeklyMetricBuilder();
  const records = [
    grade('current-1', '2026-08-24', 12),
    grade('current-2', '2026-08-25', 13)
  ];

  assert.deepEqual(
    JSON.parse(JSON.stringify(buildWeeklyMetric(records, 'application', new Date('2026-08-25T20:00:00+08:00')))),
    { delta: 1, label: '+1分', status: 'IMPROVED' }
  );
});
