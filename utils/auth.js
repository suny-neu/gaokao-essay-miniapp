const { config } = require('./config');

function getAuthToken() {
  return wx.getStorageSync(config.storageKeys.authToken) || '';
}

function getOpenId() {
  return wx.getStorageSync(config.storageKeys.openId) || '';
}

function getUserId() {
  return wx.getStorageSync(config.storageKeys.userId) || '';
}

function getAuthExpiresAt() {
  return Number(wx.getStorageSync(config.storageKeys.authExpiresAt) || 0);
}

function isAuthSessionValid() {
  const token = getAuthToken();
  const openId = getOpenId();
  const expiresAt = getAuthExpiresAt();
  if (!token || !openId) {
    return false;
  }
  if (!expiresAt) {
    return true;
  }
  return expiresAt - Date.now() > 60 * 1000;
}

function saveAuthSession(session) {
  if (!session) {
    return;
  }
  if (session.token) {
    wx.setStorageSync(config.storageKeys.authToken, session.token);
  }
  if (session.openId) {
    wx.setStorageSync(config.storageKeys.openId, session.openId);
  }
  if (session.userId) {
    wx.setStorageSync(config.storageKeys.userId, session.userId);
  }
  if (session.expiresAtEpochSeconds) {
    wx.setStorageSync(config.storageKeys.authExpiresAt, Number(session.expiresAtEpochSeconds) * 1000);
  }
}

function clearAuthSession() {
  wx.removeStorageSync(config.storageKeys.authToken);
  wx.removeStorageSync(config.storageKeys.openId);
  wx.removeStorageSync(config.storageKeys.userId);
  wx.removeStorageSync(config.storageKeys.authExpiresAt);
}

function getLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (res.code) {
          resolve(res.code);
          return;
        }
        reject(new Error('wx.login 未返回 code'));
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

async function wechatLogin() {
  const code = await getLoginCode();
  if (!code) {
    throw new Error('未能获取微信登录 code');
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.apiBaseUrl}${config.authEndpoint}`,
      method: 'POST',
      timeout: 12000,
      header: {
        'content-type': 'application/json'
      },
      data: {
        code
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const payload = res.data || {};
          const data = (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data'))
            ? payload.data
            : payload;
          saveAuthSession(data || {});
          resolve(data || {});
          return;
        }
        let message = `微信登录失败（HTTP ${res.statusCode}）`;
        try {
          const payload = res.data || {};
          if (payload && payload.message) {
            message = payload.message;
          }
        } catch (e) {
          // ignore parse error
        }
        reject(new Error(message));
      },
      fail(err) {
        reject(err || new Error('微信登录请求失败'));
      }
    });
  });
}

module.exports = {
  getAuthToken,
  getOpenId,
  getUserId,
  getAuthExpiresAt,
  isAuthSessionValid,
  saveAuthSession,
  clearAuthSession,
  getLoginCode,
  wechatLogin
};
