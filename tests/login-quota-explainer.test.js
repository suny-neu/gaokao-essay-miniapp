const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBuildMembershipQuotaExplainer() {
  const source = fs.readFileSync(path.join(__dirname, '../pages/login/index.js'), 'utf8');
  const pageDirectory = path.join(__dirname, '../pages/login');
  const sandbox = {
    require: (modulePath) => require(path.resolve(pageDirectory, modulePath)),
    module: { exports: {} },
    Page: () => {}
  };

  vm.runInNewContext(`${source}\nmodule.exports = { buildMembershipQuotaExplainer };`, sandbox);
  return sandbox.module.exports.buildMembershipQuotaExplainer;
}

test('login explains a confirmed daily allowance using backend values', () => {
  const buildMembershipQuotaExplainer = loadBuildMembershipQuotaExplainer();

  assert.deepEqual(
    JSON.parse(JSON.stringify(buildMembershipQuotaExplainer({
      trialPolicy: 'daily',
      dailyFreeLimit: 3,
      dailyFreeRemaining: 3,
      adRewardEnabled: true,
      adRewardCredits: 1
    }, 'fulfilled'))),
    {
      quotaTitle: '每天 3 次免费使用',
      quotaDescription: '今天还可免费批改 3 次。',
      adTitle: '广告奖励还剩 1 次',
      adDescription: '每天免费次数用完后，会优先使用已有奖励次数。'
    }
  );
});

test('login explains a legacy total trial without presenting it as daily usage', () => {
  const buildMembershipQuotaExplainer = loadBuildMembershipQuotaExplainer();

  assert.deepEqual(
    JSON.parse(JSON.stringify(buildMembershipQuotaExplainer({
      trialPolicy: 'total',
      trialTotalLimit: 5,
      trialRemaining: 3,
      adRewardEnabled: true,
      adRewardCredits: 1
    }, 'fulfilled'))),
    {
      quotaTitle: '免费体验共 5 次',
      quotaDescription: '当前还剩 3 次，成功生成或批改后扣减。',
      adTitle: '广告奖励还剩 1 次',
      adDescription: '免费体验次数用完后，会优先使用已有奖励次数。'
    }
  );
});

test('login keeps allowance copy neutral while loading or after a failure', () => {
  const buildMembershipQuotaExplainer = loadBuildMembershipQuotaExplainer();

  assert.deepEqual(
    JSON.parse(JSON.stringify(buildMembershipQuotaExplainer(null, 'pending'))),
    {
      quotaTitle: '正在获取使用额度',
      quotaDescription: '额度获取后会在这里显示。',
      adTitle: '广告奖励状态待确认',
      adDescription: '请稍候。'
    }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(buildMembershipQuotaExplainer(null, 'rejected'))),
    {
      quotaTitle: '暂时无法获取使用额度',
      quotaDescription: '请稍后刷新页面再试。',
      adTitle: '广告奖励状态暂不可用',
      adDescription: '请稍后刷新页面再试。'
    }
  );
});

test('login renders its allowance copy from the entitlement explainer', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '../pages/login/index.wxml'), 'utf8');

  assert.match(wxml, /\{\{quotaExplainer\.quotaTitle\}\}/);
  assert.match(wxml, /\{\{quotaExplainer\.quotaDescription\}\}/);
  assert.match(wxml, /\{\{quotaExplainer\.adTitle\}\}/);
  assert.doesNotMatch(wxml, /每天 5 次免费使用|当天未用完不累计到次日/);
});
