const test = require('node:test');
const assert = require('node:assert/strict');

test('dashboard endpoint is configured for the account aggregate', () => {
  const { config } = require('../utils/config');
  assert.equal(config.dashboardEndpoint, '/api/account/dashboard');
});

test('home uses the account aggregate for its first screen', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const homePage = fs.readFileSync(path.join(__dirname, '../pages/home/index.js'), 'utf8');

  assert.match(homePage, /fetchDashboard\(/);
  assert.match(homePage, /loadDashboardDetails\(/);
});

test('dashboard response normalization keeps stable defaults', () => {
  const { normalizeDashboard } = require('../utils/request');
  const normalized = normalizeDashboard({
    essayType: 'continuation',
    generatedAt: 123,
    entitlement: { dailyFreeRemaining: 4 },
    growth: { totalFormalGrades: 2 },
    weekly: { delta: 6, label: '+6分', status: 'IMPROVED' },
    streak: { days: 7, label: '已连续学习 7 天' }
  });

  assert.deepEqual(normalized, {
    essayType: 'continuation',
    generatedAt: 123,
    entitlement: { dailyFreeRemaining: 4 },
    growth: { totalFormalGrades: 2 },
    weekly: { delta: 6, label: '+6分', status: 'IMPROVED' },
    streak: { days: 7, label: '已连续学习 7 天' }
  });

  assert.deepEqual(normalizeDashboard({ essayType: 'unknown' }), {
    essayType: 'application',
    generatedAt: 0,
    entitlement: null,
    growth: null,
    weekly: { delta: 0, label: '等待更多记录', status: 'PENDING' },
    streak: { days: 0, label: '开始第一次练习' }
  });
});
