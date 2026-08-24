const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadHomePage({ remoteItems = [], historyError = null, detail = null } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../pages/home/index.js'), 'utf8');
  const pageDirectory = path.join(__dirname, '../pages/home');
  const calls = { page: [], detail: [], toasts: [], navigations: [] };
  const app = { globalData: {} };
  let pageDefinition;
  const requestStub = {
    fetchStudyProfile: async () => ({}),
    fetchAccountEntitlement: async () => ({}),
    fetchBackendHealthStatus: async () => ({}),
    fetchEssayHistoryPage: async (options) => {
      calls.page.push(options);
      if (historyError) {
        throw historyError;
      }
      return { items: remoteItems };
    },
    fetchEssayHistoryDetail: async (id) => {
      calls.detail.push(id);
      return detail;
    }
  };
  const storageStub = {
    getHistory: () => [],
    saveHistoryItem: () => {}
  };
  const sandbox = {
    require: (modulePath) => {
      if (modulePath === '../../utils/request') return requestStub;
      if (modulePath === '../../utils/storage') return storageStub;
      if (modulePath === '../../utils/ad-reward') {
        return { offerAdRewardDialog: () => Promise.resolve(), isAdRewardAvailable: () => false };
      }
      return require(path.resolve(pageDirectory, modulePath));
    },
    module: { exports: {} },
    Page: (definition) => { pageDefinition = definition; },
    getApp: () => app,
    wx: {
      showLoading: () => {},
      hideLoading: () => {},
      showToast: (options) => calls.toasts.push(options),
      navigateTo: (options) => calls.navigations.push(options)
    }
  };

  vm.runInNewContext(source, sandbox);
  return { pageDefinition, calls, app };
}

function createPageInstance(pageDefinition) {
  return {
    data: {
      ...pageDefinition.data,
      latestGradeId: '',
      latestGradeSourceType: ''
    },
    setData(patch) {
      Object.assign(this.data, patch);
    }
  };
}

test('看报告会在首页历史请求失败后重新获取最新正式批改', async () => {
  const summary = {
    id: 'grade-1',
    mode: 'grade',
    taskStatus: 'SUCCESS',
    scoreText: '11分 / 15',
    createdAt: 10,
    sourceType: 'remote'
  };
  const detail = { ...summary, content: '完整报告内容' };
  const { pageDefinition, calls, app } = loadHomePage({ remoteItems: [summary], detail });
  const page = createPageInstance(pageDefinition);

  await pageDefinition.openLatestGrade.call(page);

  assert.deepEqual(
    JSON.parse(JSON.stringify(calls.page[0].filters)),
    { mode: 'grade', taskStatus: 'SUCCESS' }
  );
  assert.deepEqual(calls.detail, ['grade-1']);
  assert.equal(app.globalData.currentResult.content, '完整报告内容');
  assert.deepEqual(
    JSON.parse(JSON.stringify(calls.navigations)),
    [{ url: '/pages/report/index' }]
  );
  assert.equal(calls.toasts.length, 0);
});

test('重新获取报告超时时显示加载失败而不是误报没有批改', async () => {
  const { pageDefinition, calls } = loadHomePage({ historyError: new Error('timeout') });
  const page = createPageInstance(pageDefinition);

  await pageDefinition.openLatestGrade.call(page);

  assert.equal(calls.toasts[0].title, '报告加载失败，请稍后重试');
});

test('服务器明确没有正式批改时才提示先完成批改', async () => {
  const { pageDefinition, calls } = loadHomePage({ remoteItems: [] });
  const page = createPageInstance(pageDefinition);

  await pageDefinition.openLatestGrade.call(page);

  assert.equal(calls.toasts[0].title, '先完成一次正式批改');
});
