const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('account deletion endpoint is configured', () => {
  const { config } = require('../utils/config');
  assert.equal(config.accountEndpoint, '/api/account');
});

test('login page exposes a separate destructive account action', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '../pages/login/index.wxml'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '../pages/login/index.js'), 'utf8');

  assert.match(wxml, /注销账户/);
  assert.match(wxml, /bindtap="handleDeleteAccount"/);
  assert.match(page, /deleteAccount\(\)/);
  assert.match(page, /clearHistory\(\)/);
});
