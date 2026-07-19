Page({
  onLoad() {
    wx.redirectTo({
      url: '/pages/report/index',
      fail: () => {
        wx.reLaunch({
          url: '/pages/report/index'
        });
      }
    });
  }
});
