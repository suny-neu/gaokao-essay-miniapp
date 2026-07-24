const { isAuthSessionValid, getAuthToken, getOpenId, getUserId, getAuthExpiresAt, clearAuthSession, wechatLogin } = require('../../utils/auth');

Page({
  data: {
    loggedIn: false,
    openId: '',
    userId: '',
    expiresAtText: '',
    logging: false
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
