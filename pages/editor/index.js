Page({
  onLoad(query) {
    const target = buildCompatTarget(query || {});
    wx.redirectTo({
      url: target,
      fail: () => {
        wx.reLaunch({
          url: target
        });
      }
    });
  }
});

function buildCompatTarget(query) {
  const mode = query.mode === 'coach' ? 'coach' : 'grade';
  const essayType = query.type === 'continuation' ? 'continuation' : 'application';

  if (mode === 'coach') {
    return `/pages/tutor/index?type=${essayType}`;
  }

  return `/pages/write/index?mode=${mode}&type=${essayType}`;
}
