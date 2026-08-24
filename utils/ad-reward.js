const { config } = require('./config');
const { requestAdRewardSession, grantAdReward } = require('./request');

let videoAd = null;
let adLoading = false;

function isAdRewardAvailable(entitlement) {
  if (!entitlement || entitlement.adRewardEnabled !== true || entitlement.subscriptionActive) {
    return false;
  }
  const adUnitId = String(config.adRewardAdUnitId || '');
  if (!adUnitId || adUnitId.indexOf('xxxxxxxx') !== -1) {
    return false;
  }
  return true;
}

function needsAdReward(entitlement) {
  if (!isAdRewardAvailable(entitlement)) {
    return false;
  }
  const remaining = Number(entitlement.trialRemaining) || 0;
  const credits = Number(entitlement.adRewardCredits) || 0;
  return remaining <= 0 && credits <= 0;
}

function createVideoAd() {
  if (videoAd) {
    return videoAd;
  }
  if (typeof wx === 'undefined' || typeof wx.createRewardedVideoAd !== 'function') {
    return null;
  }
  const adUnitId = String(config.adRewardAdUnitId || '');
  if (!adUnitId || adUnitId.indexOf('xxxxxxxx') !== -1) {
    return null;
  }
  videoAd = wx.createRewardedVideoAd({ adUnitId });
  videoAd.onError(() => {
    adLoading = false;
  });
  return videoAd;
}

function showRewardedVideoAd() {
  return requestAdRewardSession().then((session) => new Promise((resolve, reject) => {
    const nonce = String((session && session.nonce) || '');
    if (!nonce) {
      reject(new Error('广告播放凭证无效，请重新尝试'));
      return;
    }
    const ad = createVideoAd();
    if (!ad) {
      reject(new Error('当前环境不支持激励视频广告'));
      return;
    }
    adLoading = true;
    let callbackAttached = false;

    const handleClose = (res) => {
      if (callbackAttached) {
        ad.offClose(handleClose);
        callbackAttached = false;
      }
      adLoading = false;
      if (res && res.isEnded) {
        grantAdReward(nonce)
          .then((data) => {
            resolve(data);
          })
          .catch((err) => {
            reject(err);
          });
      } else {
        reject(new Error('广告未完整播放，无法获得奖励'));
      }
    };

    ad.onClose(handleClose);
    callbackAttached = true;

    ad.show().catch(() => {
      ad.load().then(() => ad.show()).catch((err) => {
        if (callbackAttached) {
          ad.offClose(handleClose);
          callbackAttached = false;
        }
        adLoading = false;
        reject(new Error('广告加载失败，请稍后再试'));
      });
    });
  }));
}

function offerAdRewardDialog() {
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || typeof wx.showModal !== 'function') {
      reject(new Error('当前环境不支持弹窗'));
      return;
    }
    wx.showModal({
      title: '免费次数已用完',
      content: '看一段短视频广告，即可继续批改。是否继续？',
      confirmText: '看广告',
      cancelText: '算了',
      success(res) {
        if (res.confirm) {
          showRewardedVideoAd().then(resolve).catch(reject);
        } else {
          reject(new Error('用户取消'));
        }
      },
      fail() {
        reject(new Error('弹窗调用失败'));
      }
    });
  });
}

module.exports = {
  isAdRewardAvailable,
  needsAdReward,
  showRewardedVideoAd,
  offerAdRewardDialog
};
