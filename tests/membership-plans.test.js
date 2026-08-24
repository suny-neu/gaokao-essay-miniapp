const test = require('node:test');
const assert = require('node:assert/strict');

const { buildEntitlementCard, decoratePlans } = require('../utils/membership');

test('终身会员展示终身不限量且不展示有效期', () => {
  const card = buildEntitlementCard({
    subscriptionActive: true,
    subscriptionPlanCode: 'founder_lifetime',
    subscriptionPlanName: '创始终身会员',
    subscriptionExpiresAt: ''
  });
  const plan = decoratePlans([{
    planCode: 'founder_lifetime',
    planName: '创始终身会员',
    durationDays: 0,
    lifetime: true,
    priceFen: 59900,
    description: '终身不限量作文生成与严格批改'
  }], {
    subscriptionActive: true,
    subscriptionPlanCode: 'founder_lifetime',
    subscriptionExpiresAt: ''
  })[0];

  assert.equal(card.subtitle, '终身不限量');
  assert.equal(plan.badgeLabel, '终身不限量');
  assert.equal(plan.helperText.includes('有效期至'), false);
});

test('真实支付模式禁用缺少服务端套餐配置的产品', () => {
  const plan = decoratePlans([{
    planCode: 'annual',
    planName: '包年会员',
    durationDays: 365,
    priceFen: 0,
    description: '365 天不限次'
  }], {}, '', 'live')[0];

  assert.equal(plan.actionDisabled, true);
  assert.equal(plan.actionLabel, '暂未配置');
});

test('真实支付模式仅以服务端可购买状态开放套餐', () => {
  const disabledPaymentPlan = decoratePlans([{
    planCode: 'monthly', planName: '包月会员', durationDays: 30, priceFen: 3900,
    purchasable: false, paymentMode: 'disabled'
  }], {}, '', 'live')[0];
  const unreadyPaymentPlan = decoratePlans([{
    planCode: 'annual', planName: '包年会员', durationDays: 365, priceFen: 29900,
    purchasable: false, paymentMode: 'configured-but-unready'
  }], {}, '', 'live')[0];

  assert.equal(disabledPaymentPlan.actionDisabled, true);
  assert.equal(disabledPaymentPlan.actionLabel, '暂未开放');
  assert.equal(unreadyPaymentPlan.actionDisabled, true);
  assert.equal(unreadyPaymentPlan.actionLabel, '支付未就绪');
});

test('终身会员不能再选择月卡或年卡', () => {
  const plans = decoratePlans([{
    planCode: 'monthly', planName: '包月会员', durationDays: 30, priceFen: 3900, purchasable: true
  }, {
    planCode: 'annual', planName: '包年会员', durationDays: 365, priceFen: 29900, purchasable: true
  }], {
    subscriptionActive: true,
    subscriptionPlanCode: 'founder_lifetime',
    subscriptionExpiresAt: ''
  }, '', 'live');

  assert.deepEqual(plans.map((plan) => plan.actionDisabled), [true, true]);
  assert.deepEqual(plans.map((plan) => plan.actionLabel), ['已享终身权益', '已享终身权益']);
});
