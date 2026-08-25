const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveTaskRequestError } = require('../utils/task-flow');

test('quota errors explain when the allowance returns', () => {
  assert.equal(
    resolveTaskRequestError({ code: 'TRIAL_DAILY_LIMIT_REACHED' }),
    '今天的免费批改次数已用完，明天恢复。'
  );
  assert.equal(
    resolveTaskRequestError({ code: 'TRIAL_TOTAL_LIMIT_REACHED' }),
    '15天免费额度已用完，明天不会自动恢复，请开通会员继续。'
  );
  assert.equal(
    resolveTaskRequestError({ code: 'DEVICE_DAILY_LIMIT_REACHED' }),
    '当前设备今天的批改次数已用完，明天恢复。'
  );
  assert.equal(
    resolveTaskRequestError({ code: 'IP_DAILY_LIMIT_REACHED' }),
    '当前网络今天的批改额度已用完，明天恢复。'
  );
});

test('rate limiting explains that the user should wait instead of retrying repeatedly', () => {
  assert.equal(
    resolveTaskRequestError({ code: 'RATE_LIMITED' }),
    '操作太频繁，请等待1分钟后再试，不要连续点击。'
  );
});
