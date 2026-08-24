const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadRequestModule(state) {
  const source = fs.readFileSync(path.join(__dirname, '../utils/request.js'), 'utf8');
  const sandbox = {
    setTimeout,
    clearTimeout,
    wx: {
      request(options) {
        if (options.url.endsWith('/api/auth/wx-login')) {
          state.authRequests += 1;
          setTimeout(() => {
            if (state.authStatus && state.authStatus !== 200) {
              options.success({
                statusCode: state.authStatus,
                data: {
                  success: false,
                  code: 'AUTH_BACKEND_UNAVAILABLE',
                  message: '登录服务暂时不可用'
                }
              });
              return;
            }
            state.token = 'fresh-token';
            state.openId = 'fresh-open-id';
            options.success({
              statusCode: 200,
              data: {
                success: true,
                data: { token: state.token, openId: state.openId }
              }
            });
          }, 5);
          return {};
        }

        state.dashboardRequests += 1;
        options.success({
          statusCode: 200,
          data: {
            success: true,
            data: { essayType: 'application' }
          }
        });
        return {};
      }
    },
    require(modulePath) {
      if (modulePath === './config') return {
        config: {
          apiBaseUrl: 'https://api.example.test',
          authEndpoint: '/api/auth/wx-login',
          dashboardEndpoint: '/api/account/dashboard'
        },
        getRemoteConfigIssues: () => [],
        isLocalhostUrl: () => false
      };
      if (modulePath === './format') return { countEnglishWords: () => 0, uid: () => 'id' };
      if (modulePath === './auth') return {
        getAuthToken: () => state.token,
        getOpenId: () => state.openId,
        getLoginCode: async () => {
          state.loginCodeRequests += 1;
          return 'wx-code';
        },
        saveAuthSession: (session) => {
          state.token = session.token || state.token;
          state.openId = session.openId || state.openId;
        },
        isAuthSessionValid: () => Boolean(state.token && state.openId),
        clearAuthSession: () => {
          state.token = '';
          state.openId = '';
        }
      };
      if (modulePath === './report-view-model') return { normalizeScoreDimensions: (value) => value };
      if (modulePath === './model-essay') return { buildModelEssayViewModel: (value) => value };
      if (modulePath === './device-id') return { getDeviceId: () => 'device-concurrency' };
      if (modulePath === './storage') return {
        getHistory: () => [],
        normalizeSessionRecord: (value) => value,
        deleteHistoryItem: () => {},
        clearHistoryByFilter: () => {}
      };
      throw new Error(`unexpected module: ${modulePath}`);
    },
    module: { exports: {} }
  };

  vm.runInNewContext(source, sandbox);
  return sandbox.module.exports;
}

test('concurrent authorized requests share one WeChat login session', async () => {
  const state = {
    token: '',
    openId: '',
    loginCodeRequests: 0,
    authRequests: 0,
    dashboardRequests: 0
  };
  const request = loadRequestModule(state);

  await Promise.all([
    request.fetchDashboard('application'),
    request.fetchDashboard('application'),
    request.fetchDashboard('application')
  ]);

  assert.equal(state.loginCodeRequests, 1);
  assert.equal(state.authRequests, 1);
  assert.equal(state.dashboardRequests, 3);
});

test('failed WeChat login stops dependent authorized requests', async () => {
  const state = {
    token: '',
    openId: '',
    authStatus: 500,
    loginCodeRequests: 0,
    authRequests: 0,
    dashboardRequests: 0
  };
  const request = loadRequestModule(state);

  const results = await Promise.allSettled([
    request.fetchDashboard('application'),
    request.fetchDashboard('application'),
    request.fetchDashboard('application')
  ]);

  assert.equal(state.loginCodeRequests, 1);
  assert.equal(state.authRequests, 1);
  assert.equal(state.dashboardRequests, 0);
  assert.equal(results.every((result) => result.status === 'rejected'), true);
  assert.equal(results[0].reason.message, '登录服务暂时不可用');
});
