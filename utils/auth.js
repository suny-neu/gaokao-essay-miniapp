const { config } = require('./config');

function getAuthToken() {
  return wx.getStorageSync(config.storageKeys.authToken) || '';
}

function getOpenId() {
  return wx.getStorageSync(config.storageKeys.openId) || '';
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
  if (session.expiresAtEpochSeconds) {
    wx.setStorageSync(config.storageKeys.authExpiresAt, Number(session.expiresAtEpochSeconds) * 1000);
  }
}

function clearAuthSession() {
  wx.removeStorageSync(config.storageKeys.authToken);
  wx.removeStorageSync(config.storageKeys.openId);
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

module.exports = {
  getAuthToken,
  getOpenId,
  getAuthExpiresAt,
  isAuthSessionValid,
  saveAuthSession,
  clearAuthSession,
  getLoginCode
};
