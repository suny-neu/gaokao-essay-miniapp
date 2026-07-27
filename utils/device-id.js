const STORAGE_KEY = 'gaokao-essay-device-id';
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function getDeviceId(runtime = typeof wx === 'undefined' ? null : wx) {
  if (!runtime) {
    return '';
  }
  const existing = String(runtime.getStorageSync(STORAGE_KEY) || '');
  if (DEVICE_ID_PATTERN.test(existing)) {
    return existing;
  }
  const created = createDeviceId(runtime);
  runtime.setStorageSync(STORAGE_KEY, created);
  return created;
}

function createDeviceId(runtime) {
  const bytes = new Uint8Array(16);
  if (runtime && typeof runtime.getRandomValues === 'function') {
    runtime.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes).map((value) => value.toString(16).padStart(2, '0')).join('');
}

module.exports = {
  STORAGE_KEY,
  DEVICE_ID_PATTERN,
  createDeviceId,
  getDeviceId
};
