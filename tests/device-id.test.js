const test = require('node:test');
const assert = require('node:assert/strict');
const { DEVICE_ID_PATTERN, getDeviceId } = require('../utils/device-id');

test('生成并持久复用合法匿名设备 ID', () => {
  const storage = new Map();
  const runtime = {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    getRandomValues: (bytes) => {
      bytes.fill(7);
      return bytes;
    }
  };

  const first = getDeviceId(runtime);
  const second = getDeviceId(runtime);
  assert.match(first, DEVICE_ID_PATTERN);
  assert.equal(first, second);
  assert.equal(first.length, 32);
});
