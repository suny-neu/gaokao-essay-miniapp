const { config } = require('../../utils/config');
const {
  fetchAccountEntitlement,
  fetchBillingPlans,
  activateMembershipPlan
} = require('../../utils/request');
const {
  buildEntitlementCard,
  decoratePlans,
  resolveMembershipRuntimeNote
} = require('../../utils/membership');

Page({
  data: {
    loading: true,
    loadError: '',
    entitlementCard: buildEntitlementCard(),
    plans: [],
    runtimeNote: '',
    activatingPlanCode: '',
    // iOS 微信小程序不允许用微信支付售卖虚拟商品（会员），需隐藏购买入口
    purchaseHidden: false,
    purchaseHiddenReason: ''
  },

  onLoad() {
    this.detectPurchaseAvailability();
  },

  onShow() {
    this.loadMemberCenter();
  },

  onPullDownRefresh() {
    this.loadMemberCenter().finally(() => wx.stopPullDownRefresh());
  },

  detectPurchaseAvailability() {
    let platform = '';
    try {
      platform = String((wx.getDeviceInfo && wx.getDeviceInfo().platform) || '').toLowerCase();
    } catch (error) {
      platform = '';
    }
    if (platform === 'ios') {
      this.setData({
        purchaseHidden: true,
        purchaseHiddenReason: '由于平台规则限制，iOS 设备暂不支持在小程序内开通会员。你可以继续使用免费次数与看广告得次数，或改用安卓设备完成开通。'
      });
    }
  },

  async loadMemberCenter() {
    this.setData({ loading: true, loadError: '' });
    const [entitlementResult, plansResult] = await Promise.allSettled([
      fetchAccountEntitlement(),
      fetchBillingPlans()
    ]);

    const entitlement = entitlementResult.status === 'fulfilled' ? entitlementResult.value : null;
    const plans = plansResult.status === 'fulfilled' && Array.isArray(plansResult.value)
      ? plansResult.value
      : [];

    this.entitlement = entitlement || {};
    this.setData({
      loading: false,
      entitlementCard: buildEntitlementCard(entitlement || {}),
      plans: decoratePlans(plans, entitlement || {}, this.data.activatingPlanCode, config.billingMode),
      runtimeNote: resolveMembershipRuntimeNote(config.serviceMode, config.billingMode),
      loadError: entitlementResult.status !== 'fulfilled'
        ? '会员状态暂时没有拉取成功，下拉可以重试。'
        : ''
    });
  },

  async handleActivate(event) {
    const planCode = String((event.currentTarget.dataset && event.currentTarget.dataset.planCode) || '');
    if (!planCode || this.data.activatingPlanCode) {
      return;
    }
    if (this.data.purchaseHidden) {
      wx.showToast({ title: '当前设备暂不支持线上开通', icon: 'none' });
      return;
    }

    this.setData({ activatingPlanCode: planCode });
    this.refreshPlanActions();
    wx.showLoading({ title: '正在发起支付' });
    try {
      await activateMembershipPlan(planCode, false);
      wx.hideLoading();
      wx.showToast({ title: '会员已开通', icon: 'success' });
      await this.loadMemberCenter();
    } catch (error) {
      wx.hideLoading();
      const code = String((error && error.code) || '');
      const message = String((error && error.message) || '开通失败，请稍后再试');
      if (code === 'PAYMENT_CANCELLED') {
        wx.showToast({ title: '已取消支付', icon: 'none' });
      } else if (code === 'PAYMENT_PENDING') {
        wx.showModal({
          title: '支付确认中',
          content: message,
          showCancel: false,
          confirmText: '我知道了'
        });
      } else if (code === 'WECHAT_PAY_NOT_READY' || code === 'BILLING_DISABLED') {
        wx.showModal({
          title: '支付暂未开放',
          content: '会员支付正在接入中，当前可以先使用免费次数和看广告得次数。',
          showCancel: false,
          confirmText: '我知道了'
        });
      } else {
        wx.showToast({ title: message.slice(0, 40), icon: 'none' });
      }
    } finally {
      this.setData({ activatingPlanCode: '' });
      this.refreshPlanActions();
    }
  },

  refreshPlanActions() {
    fetchBillingPlans()
      .then((plans) => {
        this.setData({
          plans: decoratePlans(
            Array.isArray(plans) ? plans : [],
            this.entitlement || {},
            this.data.activatingPlanCode,
            config.billingMode
          )
        });
      })
      .catch(() => {});
  },

  goWrite() {
    wx.navigateTo({ url: '/pages/write/index' });
  },

  onShareAppMessage() {
    return {
      title: '高考英语作文助手 · 会员中心',
      path: '/pages/member/index'
    };
  }
});
