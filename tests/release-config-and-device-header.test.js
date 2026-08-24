const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadGrantAdReward(requests) {
  const source = fs.readFileSync(path.join(__dirname, '../utils/request.js'), 'utf8');
  const sandbox = {
    wx: {
      request(options) {
        requests.push(options);
        options.success({ statusCode: 200, data: { success: true, data: {} } });
      }
    },
    require(modulePath) {
      if (modulePath === './config') return {
        config: { apiBaseUrl: 'https://api.example.test', adRewardGrantEndpoint: '/api/account/ad-reward/grant' },
        getRemoteConfigIssues: () => [],
        isLocalhostUrl: () => false
      };
      if (modulePath === './format') return { countEnglishWords: () => 0, uid: () => 'id' };
      if (modulePath === './auth') return {
        getAuthToken: () => 'token', getOpenId: () => 'open', getLoginCode: () => 'code',
        saveAuthSession: () => {}, isAuthSessionValid: () => true, clearAuthSession: () => {}
      };
      if (modulePath === './report-view-model') return { normalizeScoreDimensions: (value) => value };
      if (modulePath === './model-essay') return { buildModelEssayViewModel: (value) => value };
      if (modulePath === './device-id') return { getDeviceId: () => 'device-task9' };
      if (modulePath === './storage') return {
        getHistory: () => [], normalizeSessionRecord: (value) => value,
        deleteHistoryItem: () => {}, clearHistoryByFilter: () => {}
      };
      throw new Error(`unexpected module: ${modulePath}`);
    },
    module: { exports: {} }
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.module.exports.grantAdReward;
}

test('ad reward request sends the durable device ID header', async () => {
  const requests = [];
  const grantAdReward = loadGrantAdReward(requests);

  await grantAdReward();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.example.test/api/account/ad-reward/grant');
  assert.equal(requests[0].header['X-Device-ID'], 'device-task9');
});

test('release config accepts an injected rewarded-video ad unit', () => {
  const { profileOptions, getProfileConfigIssues } = require('../utils/config');
  const issues = getProfileConfigIssues({
    ...profileOptions.release,
    adRewardAdUnitId: 'adunit-confirmedrelease123'
  }, { isDevtools: false, envVersion: 'release' });

  assert.equal(issues.some((issue) => issue.includes('激励视频广告位')), false);
});

test('release config rejects a placeholder rewarded-video ad unit', () => {
  const { profileOptions, getProfileConfigIssues } = require('../utils/config');
  const issues = getProfileConfigIssues({
    ...profileOptions.release,
    adRewardAdUnitId: 'adunit-xxxxxxxxxxxxxxxx'
  }, { isDevtools: false, envVersion: 'release' });

  assert.ok(issues.some((issue) => issue.includes('激励视频广告位')));
});

test('missing rewarded-video configuration does not block normal API requests', () => {
  const { profileOptions, getRemoteConfigIssues, isReleaseProfileReady } = require('../utils/config');
  const releaseWithoutAds = {
    ...profileOptions.release,
    adRewardAdUnitId: ''
  };

  assert.deepEqual(getRemoteConfigIssues(releaseWithoutAds), []);
  assert.equal(isReleaseProfileReady(releaseWithoutAds), false);
});

test('empty entitlement is explicitly unavailable instead of a retired total quota', () => {
  const { buildEmptyEntitlement } = require('../utils/membership');
  const entitlement = buildEmptyEntitlement();

  assert.equal(entitlement.trialPolicy, 'unknown');
  assert.equal(entitlement.trialRemaining, null);
  assert.equal(entitlement.adRewardEnabled, false);
});
