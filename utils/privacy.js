const { getMiniProgramRuntimeInfo } = require('./runtime');

function getPrivacySetting() {
  return new Promise((resolve) => {
    if (!wx.getPrivacySetting) {
      resolve({
        supported: false,
        needAuthorization: false,
        privacyContractName: ''
      });
      return;
    }

    const runtimeInfo = getMiniProgramRuntimeInfo();
    if (runtimeInfo.isTouristAppId) {
      resolve({
        supported: false,
        needAuthorization: false,
        privacyContractName: ''
      });
      return;
    }

    let settled = false;
    const finalize = (payload) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(payload);
    };

    const timer = setTimeout(() => {
      finalize({
        supported: false,
        needAuthorization: false,
        privacyContractName: ''
      });
    }, 1200);

    wx.getPrivacySetting({
      success(res) {
        clearTimeout(timer);
        finalize({
          supported: true,
          needAuthorization: !!res.needAuthorization,
          privacyContractName: res.privacyContractName || ''
        });
      },
      fail() {
        clearTimeout(timer);
        finalize({
          supported: false,
          needAuthorization: false,
          privacyContractName: ''
        });
      }
    });
  });
}

async function ensurePrivacyAuthorized() {
  const setting = await getPrivacySetting();
  const runtimeInfo = getMiniProgramRuntimeInfo();
  if (runtimeInfo.isDevtools) {
    return {
      ...setting,
      supported: false,
      needAuthorization: false
    };
  }

  if (!setting.supported || !setting.needAuthorization || !wx.requirePrivacyAuthorize) {
    return setting;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finalizeResolve = (payload) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(payload);
    };
    const finalizeReject = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
    const timer = setTimeout(() => {
      finalizeReject(new Error('隐私授权等待超时，请稍后重试'));
    }, 2500);

    wx.requirePrivacyAuthorize({
      success() {
        clearTimeout(timer);
        finalizeResolve({
          supported: true,
          needAuthorization: false,
          privacyContractName: setting.privacyContractName
        });
      },
      fail(err) {
        clearTimeout(timer);
        if (isPrivacyDenied(err)) {
          finalizeReject(new Error('继续使用前，请先同意小程序隐私保护指引'));
          return;
        }
        finalizeReject(normalizePrivacyError(err));
      }
    });
  });
}

function isPrivacyDenied(error) {
  const message = `${(error && error.errMsg) || ''}${(error && error.message) || ''}`.toLowerCase();
  return message.includes('deny')
    || message.includes('disagree')
    || message.includes('103')
    || message.includes('104');
}

function normalizePrivacyError(error) {
  if (!error) {
    return new Error('隐私授权校验失败');
  }
  if (error instanceof Error) {
    return error;
  }
  if (error.message) {
    return new Error(error.message);
  }
  if (error.errMsg) {
    return new Error(error.errMsg);
  }
  return new Error('隐私授权校验失败');
}

module.exports = {
  getPrivacySetting,
  ensurePrivacyAuthorized,
  isPrivacyDenied
};
