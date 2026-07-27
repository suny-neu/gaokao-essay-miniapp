const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  normalizeGrowthProfile,
  buildGrowthHomeView
} = require('../utils/growth-profile');

test('首次使用显示真实空状态和基础任务', () => {
  const view = buildGrowthHomeView(normalizeGrowthProfile({}), 'application', 'score');

  assert.equal(view.dailyTask.title, '先完成第一次正式批改');
  assert.equal(view.emptyText, '完成第一次正式批改后，这里会形成你的成长起点');
  assert.deepEqual(view.trendPoints, []);
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

test('首页以今日提升任务为第一张核心卡', () => {
  const wxml = fs.readFileSync('pages/home/index.wxml', 'utf8');

  assert.ok(wxml.indexOf('今日提升任务') < wxml.indexOf('本周进步'));
  assert.ok(wxml.indexOf('本周进步') < wxml.indexOf('能力趋势'));
  assert.match(wxml, /重复出现/);
  assert.match(wxml, /已掌握/);
});
