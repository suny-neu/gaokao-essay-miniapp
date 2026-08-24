const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const script = path.join(root, 'scripts/generate-release-ad-config.js');
const trackedConfigPath = path.join(root, 'utils/release-ad-config.js');

function runGenerator(args = [], environment = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: { ...process.env, ...environment },
    encoding: 'utf8'
  });
}

function clearReleaseConfigCaches() {
  delete require.cache[require.resolve('../utils/config')];
  delete require.cache[trackedConfigPath];
}

function withRestoredTrackedConfig(callback) {
  const previous = fs.existsSync(trackedConfigPath) ? fs.readFileSync(trackedConfigPath) : null;
  try {
    callback();
  } finally {
    if (previous === null) fs.rmSync(trackedConfigPath, { force: true });
    else fs.writeFileSync(trackedConfigPath, previous);
    clearReleaseConfigCaches();
  }
}

test('tracked default release config keeps the production API with ads unavailable', () => {
  clearReleaseConfigCaches();
  const releaseConfig = require('../utils/release-ad-config');
  const configured = require('../utils/config');

  assert.deepEqual(releaseConfig, { adRewardAdUnitId: '' });
  assert.equal(configured.activeProfile, 'release');
  assert.equal(configured.config.apiBaseUrl, 'https://api.gaokaoessay.cn');
  assert.equal(configured.config.adRewardAdUnitId, '');
});

test('release ad config generator rejects a missing ad unit ID without changing the tracked default', () => {
  withRestoredTrackedConfig(() => {
    const before = fs.readFileSync(trackedConfigPath);
    const result = runGenerator([], { GAOKAO_RELEASE_AD_UNIT_ID: '' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /GAOKAO_RELEASE_AD_UNIT_ID/);
    assert.deepEqual(fs.readFileSync(trackedConfigPath), before);
  });
});

test('release ad config generator rejects a placeholder ad unit ID without changing the tracked default', () => {
  withRestoredTrackedConfig(() => {
    const before = fs.readFileSync(trackedConfigPath);
    const result = runGenerator([], { GAOKAO_RELEASE_AD_UNIT_ID: 'adunit-xxxxxxxxxxxxxxxx' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /valid WeChat rewarded-video ad unit/i);
    assert.deepEqual(fs.readFileSync(trackedConfigPath), before);
  });
});

test('release ad config generator writes a valid tracked package input consumed by config', () => {
  withRestoredTrackedConfig(() => {
    const result = runGenerator([], { GAOKAO_RELEASE_AD_UNIT_ID: 'adunit-verified123456' });

    assert.equal(result.status, 0, result.stderr);
    clearReleaseConfigCaches();
    assert.deepEqual(require('../utils/release-ad-config'), { adRewardAdUnitId: 'adunit-verified123456' });
    assert.equal(require('../utils/config').activeProfile, 'release');
  });
});

test('release ad config validation compares the environment with the tracked package input', () => {
  withRestoredTrackedConfig(() => {
    let result = runGenerator(['--validate'], { GAOKAO_RELEASE_AD_UNIT_ID: 'adunit-validated123456' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not match/i);

    result = runGenerator([], { GAOKAO_RELEASE_AD_UNIT_ID: 'adunit-validated123456' });
    assert.equal(result.status, 0, result.stderr);
    result = runGenerator(['--validate'], { GAOKAO_RELEASE_AD_UNIT_ID: 'adunit-validated123456' });
    assert.equal(result.status, 0, result.stderr);
  });
});

test('development generation disables ads without redirecting the API to localhost', () => {
  withRestoredTrackedConfig(() => {
    let result = runGenerator([], { GAOKAO_RELEASE_AD_UNIT_ID: 'adunit-devreset123456' });
    assert.equal(result.status, 0, result.stderr);
    result = runGenerator(['--dev']);
    assert.equal(result.status, 0, result.stderr);

    clearReleaseConfigCaches();
    assert.deepEqual(require('../utils/release-ad-config'), { adRewardAdUnitId: '' });
    assert.equal(require('../utils/config').activeProfile, 'release');
    assert.equal(require('../utils/config').config.apiBaseUrl, 'https://api.gaokaoessay.cn');
  });
});
