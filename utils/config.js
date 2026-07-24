const { getMiniProgramRuntimeInfo } = require('./runtime');

const profileOptions = {
  local: {
    profileId: 'local',
    profileLabel: '本地联调',
    serviceMode: 'http',
    apiBaseUrl: 'http://127.0.0.1:8080',
    billingMode: 'debug',
    requireHttps: false
  },
  release: {
    profileId: 'release',
    profileLabel: '体验 / 正式模式',
    enabled: true,
    serviceMode: 'http',
    apiBaseUrl: 'https://api.gaokaoessay.cn',
    billingMode: 'disabled',
    requireHttps: true
  }
};

const runtimeInfo = getMiniProgramRuntimeInfo();
const runtimeEnvVersion = String(runtimeInfo.envVersion || '').toLowerCase();
const releaseProfileReady = getProfileConfigIssues(profileOptions.release, runtimeInfo).length === 0;
const shouldUseReleaseProfile = releaseProfileReady;

// 默认优先走线上：开发者工具/真机/体验版/正式版都直接连 https://api.gaokaoessay.cn。
// 如需本地调试后端，请把 release.enabled 改为 false 或设置 apiBaseUrl 为本地地址。
const activeProfile = shouldUseReleaseProfile ? 'release' : 'local';

const config = {
  ...profileOptions[activeProfile],
  activeProfile,
  runtimeEnvVersion,
  profileOptions,
  endpoint: '/api/gaokao-essay',
  challengeEndpoint: '/api/gaokao-essay/challenge',
  authEndpoint: '/api/auth/wx-login',
  historyEndpoint: '/api/gaokao-essay/history',
  ocrEndpoint: '/api/ocr/extract',
  entitlementEndpoint: '/api/account/entitlement',
  studyProfileEndpoint: '/api/account/study-profile',
  billingPlansEndpoint: '/api/billing/plans',
  debugSubscriptionEndpoint: '/api/billing/subscription/debug-activate',
  subscriptionCreateOrderEndpoint: '/api/billing/subscription/create-order',
  billingOrderStatusEndpoint: '/api/billing/orders',
  healthEndpoint: '/api/health',
  enableChunked: true,
  storageKeys: {
    history: 'gaokao-essay-history',
    lastResult: 'gaokao-essay-last-result',
    authToken: 'gaokao-essay-auth-token',
    openId: 'gaokao-essay-open-id',
    userId: 'gaokao-essay-user-id',
    authExpiresAt: 'gaokao-essay-auth-expires-at',
    launchChecklist: 'gaokao-essay-launch-checklist',
    membershipState: 'gaokao-essay-membership-state'
  }
};

function isPlaceholderDomain(url) {
  return !url || /your-domain\.com|your-release-domain\.com/.test(url);
}

function isLocalhostUrl(url) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(String(url || ''));
}

function getProfileConfigIssues(targetConfig, runtime = runtimeInfo) {
  const issues = [];
  const requireHttps = targetConfig.requireHttps !== false;

  if (targetConfig.enabled === false) {
    issues.push('正式域名已预配置，但当前还未手动启用。等备案通过且 HTTPS 配好后，将 release.enabled 改为 true。');
  }

  if (targetConfig.serviceMode !== 'http') {
    issues.push('当前前端还没有切到真实请求模式，请先把 serviceMode 保持为 http。');
    return issues;
  }

  if (!targetConfig.apiBaseUrl) {
    issues.push('当前 apiBaseUrl 还是空的，请先填入真实后端地址。');
    return issues;
  }

  if (!/^https?:\/\//.test(targetConfig.apiBaseUrl)) {
    issues.push('当前 apiBaseUrl 不是有效的 HTTP / HTTPS 地址。');
  }

  if (!runtime.isDevtools && isLocalhostUrl(targetConfig.apiBaseUrl)) {
    issues.push('当前是真机调试，但 apiBaseUrl 仍指向 127.0.0.1 / localhost。手机无法访问你电脑本机服务，请改成线上 HTTPS 域名。');
  }

  if (requireHttps && !/^https:\/\//.test(targetConfig.apiBaseUrl)) {
    issues.push('当前 apiBaseUrl 不是 HTTPS 域名，小程序提审环境不能使用非 HTTPS 地址。');
  }

  if (requireHttps && isPlaceholderDomain(targetConfig.apiBaseUrl)) {
    issues.push('当前 apiBaseUrl 仍是占位域名，请替换成真实后端地址。');
  }

  return issues;
}

function getRemoteConfigIssues(targetConfig = config) {
  return getProfileConfigIssues(targetConfig, runtimeInfo);
}

function isReleaseProfileReady(targetConfig = config) {
  return getRemoteConfigIssues(targetConfig).length === 0;
}

module.exports = {
  config,
  profileOptions,
  activeProfile,
  runtimeEnvVersion,
  runtimeInfo,
  getRemoteConfigIssues,
  getProfileConfigIssues,
  isLocalhostUrl,
  isPlaceholderDomain,
  isReleaseProfileReady
};
