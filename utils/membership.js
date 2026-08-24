const { formatTime } = require('./format');

function buildEmptyEntitlement() {
  return {
    subscriptionActive: false,
    accessMode: 'unavailable',
    trialPolicy: 'unknown',
    trialLimit: null,
    trialTotalLimit: null,
    trialDailyLimit: null,
    trialUsed: 0,
    trialRemaining: null,
    trialResetAt: '',
    subscriptionStatus: 'INACTIVE',
    subscriptionPlanCode: '',
    subscriptionPlanName: '',
    subscriptionStartedAt: '',
    subscriptionExpiresAt: '',
    subscriptionAutoRenew: false,
    subscriptionProvider: '',
    adRewardEnabled: false,
    adRewardCredits: 0,
    serverTime: ''
  };
}

function buildEntitlementCard(entitlement = {}) {
  const normalized = {
    ...buildEmptyEntitlement(),
    ...(entitlement || {})
  };

  if (normalized.subscriptionActive) {
    const isLifetime = normalized.subscriptionPlanCode === 'founder_lifetime';
    return {
      eyebrow: '会员权益',
      title: `已开通${normalized.subscriptionPlanName || '会员'}`,
      subtitle: isLifetime
        ? '终身不限量'
        : normalized.subscriptionExpiresAt
        ? `有效期至 ${formatTimeText(normalized.subscriptionExpiresAt)}`
        : '当前账号已解锁不限次使用。',
      tags: [
        '不限次作文生成',
        '不限次严格批改',
        isLifetime ? '终身不限量' : (normalized.subscriptionAutoRenew ? '自动续费已开启' : '可继续切换套餐')
      ],
      progressPercent: 100,
      progressLabel: isDebugSubscription(normalized)
        ? '当前是联调会员态，不会真实扣费'
        : '当前是正式会员态',
      actionLabel: '查看套餐'
    };
  }

  if (normalized.trialPolicy === 'unknown') {
    return {
      eyebrow: '使用额度',
      title: '额度暂不可用',
      subtitle: '请等待服务端确认后再开始批改。',
      tags: ['额度待确认', '广告奖励待确认'],
      progressPercent: 0,
      progressLabel: '暂不扣减本地额度',
      actionLabel: '查看套餐'
    };
  }

  const policy = normalized.trialPolicy || (normalized.trialTotalLimit ? 'total' : 'daily');
  const fallbackLimit = policy === 'total' ? 5 : 3;
  const limit = Math.max(
    Number(normalized.trialLimit || normalized.trialTotalLimit || normalized.trialDailyLimit) || fallbackLimit,
    1
  );
  const used = Math.max(Number(normalized.trialUsed) || 0, 0);
  const parsedRemaining = Number(normalized.trialRemaining);
  const remaining = Number.isFinite(parsedRemaining) ? Math.max(parsedRemaining, 0) : Math.max(limit - used, 0);
  const progressPercent = Math.min(100, Math.round((used / limit) * 100));
  const isTotalTrial = policy === 'total';
  const adRewardAvailable = !normalized.subscriptionActive && normalized.adRewardEnabled;
  const adRewardCredits = Math.max(Number(normalized.adRewardCredits) || 0, 0);

  return {
    eyebrow: '试用额度',
    title: remaining > 0
      ? (isTotalTrial ? `还剩 ${remaining} 次体验` : `今日还剩 ${remaining} 次`)
      : (adRewardAvailable && adRewardCredits > 0
          ? `广告奖励 ${adRewardCredits} 次`
          : (isTotalTrial ? '免费体验已用完' : '今日试用已用完')),
    subtitle: isTotalTrial
      ? `新用户总共可体验 ${limit} 次，成功生成或批改后才会扣减。`
      : (normalized.trialResetAt
          ? `每天可试用 ${limit} 次，${formatTimeText(normalized.trialResetAt)} 自动重置。`
          : `每天可试用 ${limit} 次。`),
    tags: [
      `已用 ${used} / ${limit}`,
      adRewardAvailable
        ? (adRewardCredits > 0 ? `广告奖励 ${adRewardCredits} 次可用` : '用完可看广告得次数')
        : (remaining > 0 ? `还能再用 ${remaining} 次` : '建议开通包月或包年'),
      isTotalTrial ? '陪练 / 批改共用' : '生成 / 批改共用'
    ],
    progressPercent,
    progressLabel: remaining > 0
      ? '当前仍可继续使用'
      : (adRewardAvailable
          ? '看广告可以继续获得批改次数'
          : (isTotalTrial ? '试用已结束，会员可继续不限次使用' : '重置后会恢复试用次数')),
    actionLabel: '查看套餐'
  };
}

function decoratePlans(plans = [], entitlement = {}, activatingPlanCode = '', billingMode = 'debug') {
  const currentPlanCode = entitlement.subscriptionPlanCode || '';
  const currentPlanExpireText = entitlement.subscriptionExpiresAt
    ? formatTimeText(entitlement.subscriptionExpiresAt)
    : '';
  const allowDebugActivate = billingMode === 'debug';
  const liveBillingEnabled = billingMode === 'live';

  return plans.map((plan) => {
    const isLifetime = !!plan.lifetime;
    const serverConfigured = Boolean(
      plan.planCode
      && plan.planName
      && Number(plan.priceFen) > 0
      && (isLifetime || Number(plan.durationDays) > 0)
    );
    const isCurrent = !!entitlement.subscriptionActive && currentPlanCode === plan.planCode;
    const isLifetimeMember = !!entitlement.subscriptionActive && currentPlanCode === 'founder_lifetime';
    const lockedByLifetime = isLifetimeMember && !isLifetime;
    const paymentUnavailable = liveBillingEnabled && plan.purchasable !== true;
    const actionLabel = activatingPlanCode === plan.planCode
      ? '开通中...'
      : isCurrent
        ? '当前套餐'
        : lockedByLifetime
          ? '已享终身权益'
        : liveBillingEnabled && !serverConfigured
          ? '暂未配置'
        : paymentUnavailable
          ? (plan.paymentMode === 'configured-but-unready' ? '支付未就绪' : '暂未开放')
        : liveBillingEnabled
          ? '立即开通'
          : allowDebugActivate
            ? '联调开通'
            : '暂未开放';
    return {
      ...plan,
      lifetime: isLifetime,
      serverConfigured,
      badgeLabel: isLifetime ? '终身不限量' : (plan.recommended ? '更推荐' : `${plan.durationDays} 天`),
      toneClass: plan.recommended ? 'plan-card-recommended' : '',
      actionLabel,
      actionDisabled: activatingPlanCode === plan.planCode || isCurrent || lockedByLifetime || (liveBillingEnabled && (!serverConfigured || paymentUnavailable)) || (!allowDebugActivate && !liveBillingEnabled),
      helperText: isCurrent && isLifetime
        ? '终身不限量'
        : isCurrent && currentPlanExpireText
        ? `当前有效期至 ${currentPlanExpireText}`
        : plan.description
    };
  });
}

function resolveMembershipRuntimeNote(serviceMode, billingMode = 'debug') {
  if (billingMode === 'live') {
    return '当前已接入真实支付模式，后续请重点联调支付下单、回调与会员生效链路。';
  }
  if (billingMode === 'disabled') {
    return serviceMode === 'http'
      ? '当前先按免费版运行，会员购买入口会在真实支付配置完成后自动开放。'
      : '当前会员链路尚未接入，请先完成后端接口和支付方案配置。';
  }
  return serviceMode === 'http'
    ? '当前是本地 / 测试联调会员模式，点“联调开通”会调用后端调试接口，不会走真实支付扣费。'
    : '当前会员链路尚未接入，请先完成后端接口和支付方案配置。';
}

function isDebugSubscription(entitlement = {}) {
  const provider = String(entitlement.subscriptionProvider || '').toLowerCase();
  return provider === 'debug' || provider === 'sandbox';
}

function formatTimeText(value) {
  if (!value) {
    return '';
  }
  return formatTime(value).replace(/^\d{4}-/, '');
}

module.exports = {
  buildEmptyEntitlement,
  buildEntitlementCard,
  decoratePlans,
  resolveMembershipRuntimeNote
};
