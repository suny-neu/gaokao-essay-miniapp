const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  normalizeGrowthProfile,
  buildGrowthHomeView,
  buildDashboardHighlights
} = require('../utils/growth-profile');

test('首次使用显示真实空状态和基础任务', () => {
  const view = buildGrowthHomeView(normalizeGrowthProfile({}), 'application', 'score');

  assert.equal(view.dailyTask.title, '完成一篇应用文批改');
  assert.equal(view.emptyText, '完成第一次正式批改后，这里会形成你的成长起点');
  assert.deepEqual(view.trendPoints, []);
});

test('旧版基础任务文案按新版首页统一展示', () => {
  const profile = normalizeGrowthProfile({
    dailyTask: {
      code: 'foundation',
      title: '先完成第一次正式批改',
      reason: '有了第一篇真实报告，系统才能为你建立个人成长起点。'
    }
  });

  assert.equal(profile.dailyTask.title, '完成一篇应用文批改');
  assert.equal(profile.dailyTask.reason, '重点练习：内容完整与表达准确');
});

test('应用文和续写趋势严格分开', () => {
  const profile = normalizeGrowthProfile({
    activeEssayType: 'application',
    profiles: {
      application: {
        state: 'TRACKING',
        scoreTrend: [
          { recordId: 'a1', createdAt: 1, score: 9, maxScore: 15 },
          { recordId: 'a2', createdAt: 2, score: 11, maxScore: 15 }
        ],
        capabilityTrends: {}
      },
      continuation: {
        state: 'STARTING_POINT',
        scoreTrend: [
          { recordId: 'c1', createdAt: 3, score: 18, maxScore: 25 }
        ],
        capabilityTrends: {}
      }
    }
  });

  assert.equal(buildGrowthHomeView(profile, 'application', 'score').trendPoints.length, 2);
  assert.equal(buildGrowthHomeView(profile, 'continuation', 'score').trendPoints.length, 1);
});

test('趋势折线使用同一 rpx 坐标系并精确连接相邻点', () => {
  const profile = normalizeGrowthProfile({
    profiles: {
      application: {
        state: 'TRACKING',
        scoreTrend: [
          { recordId: 'a1', createdAt: 1, score: 10, maxScore: 25 },
          { recordId: 'a2', createdAt: 2, score: 18, maxScore: 25 },
          { recordId: 'a3', createdAt: 3, score: 15, maxScore: 25 }
        ]
      }
    }
  });
  const view = buildGrowthHomeView(profile, 'application', 'score');
  const firstPoint = parseRpxPoint(view.trendPoints[0].style);
  const secondPoint = parseRpxPoint(view.trendPoints[1].style);
  const firstSegment = parseRpxSegment(view.trendSegments[0].style);
  const radians = firstSegment.angle * Math.PI / 180;

  assert.equal(firstSegment.left, firstPoint.left);
  assert.equal(firstSegment.top, firstPoint.top);
  assert.ok(Math.abs(firstSegment.left + firstSegment.width * Math.cos(radians) - secondPoint.left) < 0.01);
  assert.ok(Math.abs(firstSegment.top + firstSegment.width * Math.sin(radians) - secondPoint.top) < 0.01);
});

test('首页以今日提升任务为第一张核心卡', () => {
  const wxml = fs.readFileSync('pages/home/index.wxml', 'utf8');

  assert.ok(wxml.indexOf('今日提升任务') < wxml.indexOf('本周进步'));
  assert.ok(wxml.indexOf('本周进步') < wxml.indexOf('能力趋势'));
  assert.match(wxml, /priority-badge/);
  assert.match(wxml, /已掌握/);
});

test('dashboard highlights expose weekly streak capability and priorities', () => {
  const profile = normalizeGrowthProfile({
    activeEssayType: 'application',
    profiles: {
      application: {
        state: 'TRACKING',
        capabilityTrends: {
          content: [{ recordId: 'a1', createdAt: 1, code: 'content', percent: 82 }],
          structure: [{ recordId: 'a1', createdAt: 1, code: 'structure', percent: 68 }],
          language: [{ recordId: 'a1', createdAt: 1, code: 'language', percent: 76 }]
        }
      }
    },
    recentErrors: [
      { code: 'structure_flow', label: '文章结构', status: 'REPEATED', essayType: 'application' },
      { code: 'grammar_accuracy', label: '语法准确度', status: 'NEW', essayType: 'application' }
    ]
  });

  const highlights = buildDashboardHighlights(
    profile,
    'application',
    { delta: 6, label: '+6分', status: 'IMPROVED' },
    { days: 7, label: '已连续学习 7 天' }
  );

  assert.equal(highlights.weeklyMetric.value, '+6分');
  assert.equal(highlights.streakMetric.value, '7');
  assert.deepEqual(highlights.capabilityMetrics.map((item) => item.value), [82, 68, 76]);
  assert.deepEqual(highlights.priorityItems.map((item) => item.tone), ['attention', 'progress']);
});

function parseRpxPoint(style) {
  const match = style.match(/left:([\d.]+)rpx;top:([\d.]+)rpx/);
  assert.ok(match, `expected rpx point style, received: ${style}`);
  return { left: Number(match[1]), top: Number(match[2]) };
}

function parseRpxSegment(style) {
  const match = style.match(/left:([\d.]+)rpx;top:([\d.]+)rpx;width:([\d.]+)rpx;transform:rotate\(([-\d.]+)deg\)/);
  assert.ok(match, `expected rpx segment style, received: ${style}`);
  return {
    left: Number(match[1]),
    top: Number(match[2]),
    width: Number(match[3]),
    angle: Number(match[4])
  };
}
