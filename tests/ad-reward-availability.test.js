const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadIsAdRewardAvailable(adUnitId) {
  const source = fs.readFileSync(path.join(__dirname, '../utils/ad-reward.js'), 'utf8');
  const sandbox = {
    require: (modulePath) => {
      if (modulePath === './config') {
        return { config: { adRewardAdUnitId: adUnitId } };
      }
      if (modulePath === './request') {
        return { grantAdReward: () => Promise.resolve({}) };
      }
      throw new Error(`unexpected module: ${modulePath}`);
    },
    module: { exports: {} }
  };

  vm.runInNewContext(source, sandbox);
  return sandbox.module.exports.isAdRewardAvailable;
}

function loadShowRewardedVideoAd(events) {
  const source = fs.readFileSync(path.join(__dirname, '../utils/ad-reward.js'), 'utf8');
  let closeHandler = null;
  const sandbox = {
    wx: {
      createRewardedVideoAd() {
        events.push('create-ad');
        return {
          onError() {},
          onClose(handler) { closeHandler = handler; },
          offClose() {},
          show() {
            events.push('show-ad');
            closeHandler({ isEnded: true });
            return Promise.resolve();
          },
          load() { return Promise.resolve(); }
        };
      }
    },
    require: (modulePath) => {
      if (modulePath === './config') return { config: { adRewardAdUnitId: 'adunit-confirmed-local' } };
      if (modulePath === './request') return {
        requestAdRewardSession() {
          events.push('request-session');
          return Promise.resolve({ nonce: 'session-nonce' });
        },
        grantAdReward(nonce) {
          events.push(`grant:${nonce}`);
          return Promise.resolve({ granted: 1 });
        }
      };
      throw new Error(`unexpected module: ${modulePath}`);
    },
    module: { exports: {} }
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.module.exports.showRewardedVideoAd;
}

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

test('a configured local video ad is unavailable when the server disables rewards', () => {
  const isAdRewardAvailable = loadIsAdRewardAvailable('adunit-confirmed-local');
  const buildDailyQuotaView = loadBuildDailyQuotaView();
  const entitlement = {
    trialPolicy: 'daily',
    dailyFreeLimit: 5,
    dailyFreeRemaining: 0,
    adRewardCredits: 0,
    adRewardEnabled: false
  };

  assert.equal(isAdRewardAvailable(entitlement), false);
  assert.equal(
    buildDailyQuotaView(entitlement, 'fulfilled', isAdRewardAvailable(entitlement)).dailyQuotaActionKind,
    'membership'
  );
});

test('a server-enabled reward and configured local ad permits the video branch', () => {
  const isAdRewardAvailable = loadIsAdRewardAvailable('adunit-confirmed-local');
  const buildDailyQuotaView = loadBuildDailyQuotaView();
  const entitlement = {
    trialPolicy: 'daily',
    dailyFreeLimit: 5,
    dailyFreeRemaining: 0,
    adRewardCredits: 0,
    adRewardEnabled: true
  };

  assert.equal(isAdRewardAvailable(entitlement), true);
  assert.equal(
    buildDailyQuotaView(entitlement, 'fulfilled', isAdRewardAvailable(entitlement)).dailyQuotaActionKind,
    'watch_ad'
  );
});

test('rewarded video obtains a server session before playback and submits its nonce only after completion', async () => {
  const events = [];
  const showRewardedVideoAd = loadShowRewardedVideoAd(events);

  await showRewardedVideoAd();

  assert.deepEqual(events, ['request-session', 'create-ad', 'show-ad', 'grant:session-nonce']);
});
