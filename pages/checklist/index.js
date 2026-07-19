const { config, isPlaceholderDomain, isReleaseProfileReady } = require('../../utils/config');
const { getPrivacySetting, ensurePrivacyAuthorized } = require('../../utils/privacy');
const { formatTime } = require('../../utils/format');
const { getMiniProgramRuntimeInfo } = require('../../utils/runtime');
const { fetchBackendHealthStatus } = require('../../utils/request');

const manualItemsTemplate = [
  { id: 'real-appid', label: '已替换真实 AppID，并不再使用 touristappid' },
  { id: 'domain-console', label: '小程序后台已配置 request / upload 合法域名' },
  { id: 'domain-https', label: '域名已备案，HTTPS 证书和 TLS 1.2 检查通过' },
  { id: 'privacy-declare', label: '后台已填写用户隐私保护指引，并声明拍照 / 相册等用途' },
  { id: 'wechat-credential', label: '后端已填真实 AppID / AppSecret，code2session 可用' },
  { id: 'msg-sec', label: 'msgSecCheck 已真开，输入 / 输出 / OCR 都已联调' },
  { id: 'generation-live', label: '作文生成已切到真实链路，OCR 若未就绪则已在正式版关闭' },
  { id: 'category-record', label: '服务类目与小程序备案状态已在后台确认' },
  { id: 'review-material', label: '审核说明、测试路径、必要截图和备注都已准备' },
  { id: 'payment-plan', label: '若后续收费，已单独设计 iOS 支付策略' }
];

Page({
  data: {
    runtimeChecks: [],
    manualItems: [],
    backendHealth: null,
    privacyInfo: {
      supported: false,
      needAuthorization: false,
      privacyContractName: ''
    },
    progressText: '0 / 0',
    lastCheckedAt: ''
  },

  onShow() {
    this.refreshChecklist();
  },

  async refreshChecklist() {
    const [privacyInfo, backendHealthRaw] = await Promise.all([
      getPrivacySetting(),
      fetchBackendHealthStatus().catch((error) => ({
        status: 'unreachable',
        reviewReady: false,
        issuesCount: 1,
        issues: [error.message || '无法读取后端健康检查'],
        source: 'unreachable'
      }))
    ]);
    const manualState = this.loadManualState();
    const manualItems = manualItemsTemplate.map((item) => ({
      ...item,
      checked: !!manualState[item.id]
    }));
    const backendHealth = buildBackendHealthCard(backendHealthRaw);
    const runtimeChecks = buildRuntimeChecks(privacyInfo, backendHealth);

    this.setData({
      privacyInfo,
      runtimeChecks,
      manualItems,
      backendHealth,
      progressText: `${manualItems.filter((item) => item.checked).length} / ${manualItems.length}`,
      lastCheckedAt: formatTime(Date.now())
    });
  },

  toggleManualItem(event) {
    const { id } = event.currentTarget.dataset;
    const nextItems = this.data.manualItems.map((item) =>
      item.id === id
        ? {
            ...item,
            checked: !item.checked
          }
        : item
    );

    this.setData({
      manualItems: nextItems,
      progressText: `${nextItems.filter((item) => item.checked).length} / ${nextItems.length}`
    });
    this.saveManualState(nextItems);
  },

  async verifyPrivacyFlow() {
    try {
      await ensurePrivacyAuthorized();
      await this.refreshChecklist();
      wx.showToast({
        title: '隐私授权状态已刷新',
        icon: 'none'
      });
    } catch (error) {
      wx.showToast({
        title: error.message || '隐私授权未完成',
        icon: 'none'
      });
    }
  },

  clearManualState() {
    wx.removeStorageSync(config.storageKeys.launchChecklist);
    this.refreshChecklist();
  },

  loadManualState() {
    return wx.getStorageSync(config.storageKeys.launchChecklist) || {};
  },

  saveManualState(items) {
    const snapshot = {};
    items.forEach((item) => {
      snapshot[item.id] = !!item.checked;
    });
    wx.setStorageSync(config.storageKeys.launchChecklist, snapshot);
  }
});

function buildRuntimeChecks(privacyInfo, backendHealth) {
  const miniProgram = getMiniProgramRuntimeInfo();
  const checks = [
    {
      id: 'appid',
      label: '当前不是游客 AppID',
      detail: miniProgram.supported
        ? (miniProgram.appId || '当前环境未返回 AppID')
        : '当前环境不支持读取 AccountInfo，真机再确认一次。',
      status: !miniProgram.supported ? 'warn' : miniProgram.isTouristAppId ? 'todo' : 'ready'
    },
    {
      id: 'env-version',
      label: '当前环境版本信号可识别',
      detail: miniProgram.supported
        ? `envVersion=${miniProgram.envVersion || 'unknown'}${miniProgram.version ? `，version=${miniProgram.version}` : ''}`
        : '当前环境未返回 envVersion。',
      status: !miniProgram.supported ? 'warn' : miniProgram.envVersion ? 'ready' : 'warn'
    },
    {
      id: 'profile',
      label: '当前环境已切到体验 / 正式档',
      detail: `当前为 ${config.profileLabel}，envVersion=${config.runtimeEnvVersion || 'develop'}，serviceMode=${config.serviceMode}`,
      status: config.activeProfile === 'release' && config.serviceMode === 'http' ? 'ready' : 'todo'
    },
    {
      id: 'request-mode',
      label: '前端只走真实后端请求',
      detail: '当前前端不会再回退到演示数据，所有结果都依赖真实后端响应。',
      status: 'ready'
    },
    {
      id: 'billing-mode',
      label: '正式版不会暴露联调会员开通口',
      detail: `当前 billingMode=${config.billingMode || 'debug'}`,
      status: config.activeProfile !== 'release'
        ? 'warn'
        : config.billingMode === 'disabled' || config.billingMode === 'live'
          ? 'ready'
          : 'todo'
    },
    {
      id: 'api-base',
      label: '已填写真实 HTTPS 后端域名',
      detail: config.apiBaseUrl,
      status: isReleaseProfileReady(config) ? 'ready' : isPlaceholderDomain(config.apiBaseUrl) ? 'todo' : 'warn'
    },
    {
      id: 'backend-health',
      label: '后端健康检查链路可读取',
      detail: backendHealth ? backendHealth.summary : '正在等待后端状态。',
      status: backendHealth ? backendHealth.tone : 'warn'
    },
    {
      id: 'privacy-api',
      label: '隐私授权能力已接入',
      detail: privacyInfo.supported
        ? (privacyInfo.needAuthorization
            ? '当前用户还未完成同意，可点击下方按钮测试授权链路。'
            : '当前用户已同意隐私授权。')
        : '当前环境未返回隐私能力，真机和正式 AppID 下再核验一次。',
      status: privacyInfo.supported ? (privacyInfo.needAuthorization ? 'todo' : 'ready') : 'warn'
    },
    {
      id: 'ocr-entry',
      label: 'OCR 入口状态与后端能力一致',
      detail: backendHealth && backendHealth.capabilities && backendHealth.capabilities.ocrEnabled
        ? '后端声明 OCR 已启用，前端拍照识题 / 识材 / 识文 入口会先做 privacy authorize 检查。'
        : '后端未启用 OCR 时，前端会自动隐藏拍照识别入口，避免用户点到半成品能力。',
      status: 'ready'
    },
    {
      id: 'contact-entry',
      label: '首页已提供客服入口',
      detail: '审核或正式期如果用户遇到问题，可以直接从首页联系客服。',
      status: 'ready'
    }
  ];

  return checks;
}

function buildBackendHealthCard(raw) {
  const issues = Array.isArray(raw && raw.issues) ? raw.issues : [];
  const issuesCount = Number(raw && raw.issuesCount) || issues.length;

  if (!raw || raw.source === 'unreachable') {
    return {
      tone: 'warn',
      badge: '未连通',
      title: '还没拿到后端健康检查结果',
      summary: '小程序没有成功读取到 /api/health。提审前要确认域名、证书、服务器域名白名单和后端服务是否都已就绪。',
      issues,
      capabilities: {}
    };
  }

  if (raw.source === 'placeholder') {
    return {
      tone: 'todo',
      badge: '占位中',
      title: '还没有接到真实后端',
      summary: '前端域名仍是占位配置，所以健康检查只能停留在“未接后端”状态。先切 release 档，再改成真实 HTTPS 域名。',
      issues,
      capabilities: {}
    };
  }

  if (raw.source === 'config-invalid') {
    return {
      tone: 'todo',
      badge: '待切版',
      title: '前端正式配置还没切完整',
      summary: '现在还不适合直接联调正式后端。先把 release 档和真实 HTTPS 域名改对，再回来刷新这一页。',
      issues,
      capabilities: {}
    };
  }

  if (raw.reviewReady && issuesCount === 0) {
    return {
      tone: 'ready',
      badge: '已就绪',
      title: '后端启动审计已通过',
      summary: '当前 /api/health 返回 reviewReady=true，说明后端没有发现明显的占位密钥或上游缺失问题。',
      issues: [],
      capabilities: raw.capabilities || {}
    };
  }

  return {
    tone: 'warn',
    badge: `${issuesCount} 项待改`,
    title: '后端还有提审前必须清掉的问题',
    summary: `/api/health 已连通，但启动审计仍报出 ${issuesCount} 个问题。只要这些项没清完，提审时就很容易出现“前端已经联通，后端配置却还没真正上线级就绪”的情况。`,
    issues,
    capabilities: raw.capabilities || {}
  };
}
