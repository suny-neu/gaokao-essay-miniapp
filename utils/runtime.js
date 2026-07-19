function getMiniProgramRuntimeInfo() {
  const systemInfo = getSystemInfoSafe();
  if (typeof wx === 'undefined' || typeof wx.getAccountInfoSync !== 'function') {
    return {
      supported: false,
      appId: '',
      envVersion: '',
      version: '',
      isTouristAppId: false,
      platform: systemInfo.platform || '',
      isDevtools: isDevtoolsPlatform(systemInfo.platform)
    };
  }

  try {
    const info = wx.getAccountInfoSync();
    const miniProgram = (info && info.miniProgram) || {};
    const appId = miniProgram.appId || '';
    return {
      supported: true,
      appId,
      envVersion: miniProgram.envVersion || '',
      version: miniProgram.version || '',
      isTouristAppId: appId === 'touristappid',
      platform: systemInfo.platform || '',
      isDevtools: isDevtoolsPlatform(systemInfo.platform)
    };
  } catch (error) {
    return {
      supported: false,
      appId: '',
      envVersion: '',
      version: '',
      isTouristAppId: false,
      platform: systemInfo.platform || '',
      isDevtools: isDevtoolsPlatform(systemInfo.platform)
    };
  }
}

function getSystemInfoSafe() {
  if (typeof wx === 'undefined' || typeof wx.getSystemInfoSync !== 'function') {
    return {
      platform: ''
    };
  }

  try {
    return wx.getSystemInfoSync() || {
      platform: ''
    };
  } catch (error) {
    return {
      platform: ''
    };
  }
}

function isDevtoolsPlatform(platform) {
  return String(platform || '').toLowerCase() === 'devtools';
}

module.exports = {
  getMiniProgramRuntimeInfo
};
