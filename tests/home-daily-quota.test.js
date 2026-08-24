const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBuildDailyQuotaView() {
  const source = fs.readFileSync(path.join(__dirname, '../pages/home/index.js'), 'utf8');
  const pageDirectory = path.join(__dirname, '../pages/home');
  const sandbox = {
    require: (modulePath) => require(path.resolve(pageDirectory, modulePath)),
    module: { exports: {} },
    Page: () => {}
  };

  vm.runInNewContext(`${source}\nmodule.exports = { buildDailyQuotaView };`, sandbox);
  return sandbox.module.exports.buildDailyQuotaView;
}

test('confirmed daily entitlement uses the authoritative remaining and limit fields', () => {
  const buildDailyQuotaView = loadBuildDailyQuotaView();

  assert.deepEqual(
    JSON.parse(JSON.stringify(buildDailyQuotaView({
      trialPolicy: 'daily',
      dailyFreeLimit: 5,
      dailyFreeRemaining: 3,
      trialRemaining: 1
    }, 'fulfilled'))),
    {
      dailyQuotaText: '今日免费批改 3/5 次',
      dailyActionText: '开始10分钟练习',
      dailyQuotaEmpty: false,
      dailyQuotaActionEnabled: true,
      dailyQuotaActionKind: 'start_task'
    }
  );
});

test('legacy total trial is labelled as total experience instead of a daily quota', () => {
  const buildDailyQuotaView = loadBuildDailyQuotaView();

  assert.deepEqual(
    JSON.parse(JSON.stringify(buildDailyQuotaView({
      trialPolicy: 'total',
      trialTotalLimit: 5,
      trialRemaining: 3
    }, 'fulfilled'))),
    {
      dailyQuotaText: '免费体验还剩 3/5 次',
      dailyActionText: '开始体验练习',
      dailyQuotaEmpty: false,
      dailyQuotaActionEnabled: true,
      dailyQuotaActionKind: 'start_task'
    }
  );
});

test('missing or failed entitlement never invents available daily credits', () => {
  const buildDailyQuotaView = loadBuildDailyQuotaView();

  assert.deepEqual(
    JSON.parse(JSON.stringify(buildDailyQuotaView(null, 'pending'))),
    {
      dailyQuotaText: '正在获取今日额度',
      dailyActionText: '额度获取中',
      dailyQuotaEmpty: false,
      dailyQuotaActionEnabled: false,
      dailyQuotaActionKind: 'none'
    }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(buildDailyQuotaView(null, 'rejected'))),
    {
      dailyQuotaText: '暂时无法获取额度',
      dailyActionText: '暂不可开始',
      dailyQuotaEmpty: false,
      dailyQuotaActionEnabled: false,
      dailyQuotaActionKind: 'none'
    }
  );
});

test('stored ad credits are used directly after daily credits are exhausted', () => {
  const buildDailyQuotaView = loadBuildDailyQuotaView();

  assert.deepEqual(
    JSON.parse(JSON.stringify(buildDailyQuotaView({
      trialPolicy: 'daily',
      dailyFreeLimit: 5,
      dailyFreeRemaining: 0,
      adRewardCredits: 2
    }, 'fulfilled', true))),
    {
      dailyQuotaText: '今日免费批改已用完，广告奖励还剩 2 次',
      dailyActionText: '开始10分钟练习',
      dailyQuotaEmpty: true,
      dailyQuotaActionEnabled: true,
      dailyQuotaActionKind: 'start_task'
    }
  );
});

test('only an empty free and ad balance asks the student to watch a video', () => {
  const buildDailyQuotaView = loadBuildDailyQuotaView();

  assert.deepEqual(
    JSON.parse(JSON.stringify(buildDailyQuotaView({
      trialPolicy: 'daily',
      dailyFreeLimit: 5,
      dailyFreeRemaining: 0,
      adRewardCredits: 0
    }, 'fulfilled', true))),
    {
      dailyQuotaText: '今日免费批改已用完',
      dailyActionText: '看视频继续批改',
      dailyQuotaEmpty: true,
      dailyQuotaActionEnabled: true,
      dailyQuotaActionKind: 'watch_ad'
    }
  );
});

test('an empty balance without a usable ad offers membership instead of a video', () => {
  const buildDailyQuotaView = loadBuildDailyQuotaView();

  assert.deepEqual(
    JSON.parse(JSON.stringify(buildDailyQuotaView({
      trialPolicy: 'daily',
      dailyFreeLimit: 5,
      dailyFreeRemaining: 0,
      adRewardCredits: 0
    }, 'fulfilled', false))),
    {
      dailyQuotaText: '今日免费批改已用完',
      dailyActionText: '查看会员权益',
      dailyQuotaEmpty: true,
      dailyQuotaActionEnabled: true,
      dailyQuotaActionKind: 'membership'
    }
  );
});
