const { isAuthSessionValid, getAuthToken, getOpenId, getUserId, getAuthExpiresAt, clearAuthSession, wechatLogin } = require('../../utils/auth');
const { fetchAccountEntitlement, fetchBillingPlans, activateMembershipPlan, deleteAccount } = require('../../utils/request');
const { clearHistory } = require('../../utils/storage');
const { config } = require('../../utils/config');
const { buildEmptyEntitlement, decoratePlans } = require('../../utils/membership');

Page({
  data: {
    loggedIn: false,
    openId: '',
    userId: '',
    expiresAtText: '',
    logging: false,
    deletingAccount: false,
    entitlement: buildEmptyEntitlement(),
    membershipPlans: [],
    membershipLoading: false,
    membershipError: '',
    activatingPlanCode: '',
    quotaExplainer: buildMembershipQuotaExplainer(null, 'pending')
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const token = getAuthToken();
    const openId = getOpenId();
    const loggedIn = !!(token && openId && isAuthSessionValid());

    let expiresAtText = '';
    if (loggedIn) {
      const expiresAt = getAuthExpiresAt();
      if (expiresAt) {
        const date = new Date(expiresAt);
        expiresAtText = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
      }
    }

    this.setData({
      loggedIn,
      openId: loggedIn ? maskOpenId(openId) : '',
      userId: getUserId(),
      expiresAtText
    });

    if (loggedIn) {
      this.refreshMembership();
    } else {
      this.setData({
        entitlement: buildEmptyEntitlement(),
        membershipPlans: [],
        membershipError: '',
        quotaExplainer: buildMembershipQuotaExplainer(null, 'pending')
      });
    }
  },

  async refreshMembership() {
    if (this.data.membershipLoading) {
      return;
    }
    this.setData({
      membershipLoading: true,
      membershipError: '',
      quotaExplainer: buildMembershipQuotaExplainer(null, 'pending')
    });
    try {
      const [entitlement, plans] = await Promise.all([
        fetchAccountEntitlement(),
        fetchBillingPlans()
      ]);
      this.setData({
        entitlement,
        membershipPlans: decoratePlans(plans || [], entitlement, '', config.billingMode),
        quotaExplainer: buildMembershipQuotaExplainer(entitlement, 'fulfilled')
      });
    } catch (error) {
      this.setData({
        membershipError: (error && error.message) || '会员信息暂时加载失败，请稍后重试。',
        quotaExplainer: buildMembershipQuotaExplainer(null, 'rejected')
      });
    } finally {
      this.setData({ membershipLoading: false });
    }
  },

  async handlePlanPurchase(event) {
    const planCode = event && event.currentTarget && event.currentTarget.dataset.planCode;
    const plan = this.data.membershipPlans.find((item) => item.planCode === planCode);
    if (!plan || plan.actionDisabled || this.data.activatingPlanCode) {
      return;
    }

    this.setData({
      activatingPlanCode: planCode,
      membershipPlans: decoratePlans(this.data.membershipPlans, this.data.entitlement, planCode, config.billingMode)
    });
    try {
      const entitlement = await activateMembershipPlan(planCode, false, config.billingMode);
      if (!entitlement || !entitlement.subscriptionActive || entitlement.subscriptionPlanCode !== planCode) {
        throw new Error('支付已发起，但会员状态仍在确认中，请稍后刷新查看。');
      }
      const plans = await fetchBillingPlans();
      this.setData({
        entitlement,
        membershipPlans: decoratePlans(plans || [], entitlement, '', config.billingMode),
        quotaExplainer: buildMembershipQuotaExplainer(entitlement, 'fulfilled')
      });
      wx.showToast({ title: '会员已开通', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '开通未完成，请稍后重试', icon: 'none' });
      this.setData({
        membershipPlans: decoratePlans(this.data.membershipPlans, this.data.entitlement, '', config.billingMode)
      });
    } finally {
      this.setData({ activatingPlanCode: '' });
    }
  },

  openMembershipPlans() {
    wx.pageScrollTo({
      selector: '#membership-plans',
      duration: 300
    });
  },

  async handleWechatLogin() {
    if (this.data.logging) {
      return;
    }
    this.setData({ logging: true });
    wx.showLoading({ title: '微信登录中' });
    try {
      await wechatLogin();
      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success' });
      this.refresh();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: (error && error.message) || '登录失败', icon: 'none' });
    } finally {
      this.setData({ logging: false });
    }
  },

  handleLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出当前微信账号？本地草稿会保留。',
      success: (res) => {
        if (res.confirm) {
          clearAuthSession();
          this.refresh();
          wx.showToast({ title: '已退出', icon: 'success' });
        }
      }
    });
  },

  handleDeleteAccount() {
    if (this.data.deletingAccount) {
      return;
    }
    wx.showModal({
      title: '注销账户',
      content: '注销后，作文、报告、使用次数和会员状态将被删除，且无法恢复。',
      confirmText: '继续注销',
      confirmColor: '#c43d3d',
      success: (firstResult) => {
        if (!firstResult.confirm) {
          return;
        }
        wx.showModal({
          title: '再次确认',
          content: '确定永久注销当前账户吗？支付流水如有发生将依法匿名化保留。',
          confirmText: '永久注销',
          confirmColor: '#c43d3d',
          success: async (secondResult) => {
            if (!secondResult.confirm) {
              return;
            }
            this.setData({ deletingAccount: true });
            wx.showLoading({ title: '正在注销' });
            try {
              await deleteAccount();
              clearAuthSession();
              clearHistory();
              wx.removeStorageSync(config.storageKeys.membershipState);
              wx.hideLoading();
              this.refresh();
              wx.showToast({ title: '账户已注销', icon: 'success' });
            } catch (error) {
              wx.hideLoading();
              wx.showToast({ title: (error && error.message) || '注销失败，请稍后重试', icon: 'none' });
            } finally {
              this.setData({ deletingAccount: false });
            }
          }
        });
      }
    });
  }
});

function pad(value) {
  return value < 10 ? `0${value}` : `${value}`;
}

function maskOpenId(openId) {
  if (!openId || openId.length <= 10) {
    return openId;
  }
  return `${openId.slice(0, 6)}…${openId.slice(-4)}`;
}

function buildMembershipQuotaExplainer(entitlement, status = 'fulfilled') {
  if (status === 'pending') {
    return {
      quotaTitle: '正在获取使用额度',
      quotaDescription: '额度获取后会在这里显示。',
      adTitle: '广告奖励状态待确认',
      adDescription: '请稍候。'
    };
  }

  if (status !== 'fulfilled' || !entitlement) {
    return {
      quotaTitle: '暂时无法获取使用额度',
      quotaDescription: '请稍后刷新页面再试。',
      adTitle: '广告奖励状态暂不可用',
      adDescription: '请稍后刷新页面再试。'
    };
  }

  const adCredits = Math.max(Number(entitlement.adRewardCredits) || 0, 0);
  const freeAllowanceLabel = entitlement.trialPolicy === 'daily'
    ? '每天免费次数'
    : entitlement.trialPolicy === 'total'
      ? '免费体验次数'
      : '免费额度';
  const ad = adCredits > 0
    ? {
        adTitle: `广告奖励还剩 ${adCredits} 次`,
        adDescription: `${freeAllowanceLabel}用完后，会优先使用已有奖励次数。`
      }
    : entitlement.adRewardEnabled
      ? {
          adTitle: '免费次数用完可看广告继续',
          adDescription: '广告奖励到账后，会优先于会员权益使用。'
        }
      : {
          adTitle: '暂未提供广告奖励',
          adDescription: '体验次数用完后可查看会员权益。'
        };

  const dailyLimit = Number(entitlement.dailyFreeLimit);
  const dailyRemaining = Number(entitlement.dailyFreeRemaining);
  if (entitlement.trialPolicy === 'daily' && Number.isFinite(dailyLimit) && dailyLimit > 0 && Number.isFinite(dailyRemaining)) {
    const remaining = Math.min(Math.max(dailyRemaining, 0), dailyLimit);
    const totalLimit = Number(entitlement.trialTotalLimit);
    const totalRemaining = Number(entitlement.trialTotalRemaining);
    if (Number.isFinite(totalLimit) && totalLimit > 0 && Number.isFinite(totalRemaining) && totalRemaining <= 0) {
      return {
        quotaTitle: '15天免费额度已用完',
        quotaDescription: '免费体验已结束，开通会员后可以继续使用。',
        ...ad
      };
    }
    const totalDescription = Number.isFinite(totalLimit) && totalLimit > 0 && Number.isFinite(totalRemaining)
      ? `总计还剩 ${Math.max(totalRemaining, 0)}/${totalLimit} 次。`
      : '';
    return {
      quotaTitle: `每天 ${dailyLimit} 次免费使用`,
      quotaDescription: `今天还可免费批改 ${remaining} 次。${totalDescription}`,
      ...ad
    };
  }

  if (entitlement.trialPolicy === 'total') {
    const totalLimit = Number(entitlement.trialTotalLimit || entitlement.trialLimit);
    const totalRemaining = Number(entitlement.trialRemaining);
    if (Number.isFinite(totalLimit) && totalLimit > 0 && Number.isFinite(totalRemaining)) {
      const remaining = Math.min(Math.max(totalRemaining, 0), totalLimit);
      return {
        quotaTitle: `免费体验共 ${totalLimit} 次`,
        quotaDescription: `当前还剩 ${remaining} 次，成功生成或批改后扣减。`,
        ...ad
      };
    }
  }

  return {
    quotaTitle: '使用额度暂时无法确认',
    quotaDescription: '请稍后刷新页面再试。',
    adTitle: '广告奖励状态暂不可用',
    adDescription: '请稍后刷新页面再试。'
  };
}
