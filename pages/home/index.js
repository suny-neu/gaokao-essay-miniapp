const { fetchStudyProfile, fetchAccountEntitlement, fetchBackendHealthStatus, fetchEssayHistoryPage, fetchEssayHistoryDetail } = require('../../utils/request');
const { getHistory, saveHistoryItem } = require('../../utils/storage');
const { isAuthSessionValid, getAuthToken, getOpenId, wechatLogin } = require('../../utils/auth');
const { buildStudyProfile } = require('../../utils/study-profile');

Page({
  data: {
    loading: true,
    loadError: '',
    authState: {
      loggedIn: false,
      openIdMask: '',
      logging: false
    },
    daysToGaokao: 0,
    greetingText: '',
    countdownLabel: '',
    topInsight: null,
    scoreSummary: buildEmptyScoreSummary(),
    statCards: [],
    focusCards: [],
    trendPoints: [],
    trendSegments: [],
    footerHint: '',
    latestGradeId: '',
    latestGradeSourceType: '',
    latestGradeReady: false
  },

  onShow() {
    this.refreshAuthState();
    this.loadDashboard();
  },

  onPullDownRefresh() {
    this.loadDashboard().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadDashboard() {
    this.setData({
      loading: true,
      loadError: ''
    });

    const localHistory = getHistory();
    const [profileResult, entitlementResult, healthResult, historyResult] = await Promise.allSettled([
      fetchStudyProfile(),
      fetchAccountEntitlement(),
      fetchBackendHealthStatus(),
      fetchEssayHistoryPage({
        offset: 0,
        limit: 12,
        filters: {}
      })
    ]);

    const remoteHistory = historyResult.status === 'fulfilled' ? historyResult.value.items || [] : [];
    const mergedHistory = mergeHistoryRecords(remoteHistory, localHistory)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

    const profile = profileResult.status === 'fulfilled'
      ? profileResult.value
      : buildStudyProfile(mergedHistory);

    const entitlement = entitlementResult.status === 'fulfilled' ? entitlementResult.value : null;
    const health = healthResult.status === 'fulfilled' ? healthResult.value : null;
    const gradeHistory = mergedHistory.filter((item) => item && item.mode === 'grade' && item.taskStatus !== 'FAILED');
    const latestGrade = gradeHistory[0] || null;
    const dashboard = buildDashboardViewModel({
      profile,
      entitlement,
      health,
      history: mergedHistory,
      gradeHistory
    });

    this.setData({
      loading: false,
      daysToGaokao: dashboard.daysToGaokao,
      greetingText: dashboard.greetingText,
      countdownLabel: dashboard.countdownLabel,
      topInsight: dashboard.topInsight,
      scoreSummary: dashboard.scoreSummary,
      statCards: dashboard.statCards,
      focusCards: dashboard.focusCards,
      trendPoints: dashboard.trendPoints,
      trendSegments: dashboard.trendSegments,
      footerHint: dashboard.footerHint,
      latestGradeId: latestGrade ? latestGrade.id : '',
      latestGradeSourceType: latestGrade ? latestGrade.sourceType || 'local' : '',
      latestGradeReady: !!(latestGrade && latestGrade.content)
    });

    if (!mergedHistory.length && profileResult.status !== 'fulfilled' && historyResult.status !== 'fulfilled') {
      this.setData({
        loadError: '暂时没拉到远端数据，先展示本地默认首页。'
      });
    }
  },

  async openLatestGrade() {
    const latestId = this.data.latestGradeId;
    if (!latestId) {
      this.goReport();
      return;
    }

    const localHistory = getHistory();
    let target = localHistory.find((item) => item.id === latestId) || null;

    if ((!target || !target.content) && this.data.latestGradeSourceType === 'remote') {
      wx.showLoading({
        title: '正在打开报告'
      });
      try {
        target = await fetchEssayHistoryDetail(latestId);
        saveHistoryItem(target);
      } catch (error) {
        wx.showToast({
          title: error.message || '打开报告失败',
          icon: 'none'
        });
        return;
      } finally {
        wx.hideLoading();
      }
    }

    if (!target) {
      this.goReport();
      return;
    }

    getApp().globalData.currentResult = target;
    wx.navigateTo({
      url: '/pages/report/index'
    });
  },

  handleTopInsight() {
    const action = this.data.topInsight && this.data.topInsight.action;
    this.executeAction(action || 'continue_grade');
  },

  handleFocusAction(event) {
    const action = event.currentTarget.dataset.action || 'continue_grade';
    this.executeAction(action);
  },

  goWrite() {
    wx.navigateTo({
      url: '/pages/write/index'
    });
  },

  goCoach() {
    wx.navigateTo({
      url: '/pages/tutor/index'
    });
  },

  goReport() {
    wx.navigateTo({
      url: '/pages/report/index'
    });
  },

  executeAction(actionKind) {
    switch (actionKind) {
      case 'grade_continuation':
        wx.navigateTo({
          url: '/pages/write/index?mode=grade&type=continuation'
        });
        break;
      case 'grade_application':
        wx.navigateTo({
          url: '/pages/write/index?mode=grade&type=application'
        });
        break;
      case 'view_latest_grade':
        this.openLatestGrade();
        break;
      case 'go_history':
        this.goReport();
        break;
      case 'continue_grade':
      default:
        wx.navigateTo({
          url: '/pages/write/index?mode=grade&type=application'
        });
        break;
    }
  },

  onShareAppMessage() {
    return {
      title: '高考英语作文助手：学习概览',
      path: '/pages/home/index'
    };
  },

  onShareTimeline() {
    return {
      title: '高考英语作文助手'
    };
  },

  refreshAuthState() {
    const token = getAuthToken();
    const openId = getOpenId();
    const loggedIn = !!(token && openId && isAuthSessionValid());
    this.setData({
      authState: {
        loggedIn,
        logging: false,
        openIdMask: loggedIn ? maskOpenId(openId) : ''
      }
    });
  },

  async handleHomeLogin() {
    if (this.data.authState.logging) {
      return;
    }
    this.setData({ 'authState.logging': true });
    wx.showLoading({ title: '登录中' });
    try {
      await wechatLogin();
      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success' });
      this.refreshAuthState();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: (error && error.message) || '登录失败', icon: 'none' });
      this.setData({ 'authState.logging': false });
    }
  },

  goAuth() {
    if (this.data.authState.loggedIn) {
      wx.navigateTo({ url: '/pages/login/index' });
    } else {
      this.handleHomeLogin();
    }
  }
});

function maskOpenId(openId) {
  if (!openId || openId.length <= 10) {
    return openId;
  }
  return `${openId.slice(0, 6)}…${openId.slice(-4)}`;
}

function buildDashboardViewModel({ profile, entitlement, health, history, gradeHistory }) {
  const daysToGaokao = calculateGaokaoCountdown();
  const latestGrade = gradeHistory[0] || null;
  const latestScore = parseScoreText(latestGrade && latestGrade.scoreText);
  const weekPracticeCount = countRange(history, 7);
  const previousWeekCount = countRange(history, 14) - weekPracticeCount;
  const averageScore = computeAverageScore(gradeHistory);
  const grammarAccuracy = computeGrammarAccuracy(gradeHistory, profile);
  const vocabRichness = computeVocabularyRichness(gradeHistory);
  const trend = buildTrendSeries(gradeHistory);

  return {
    daysToGaokao,
    greetingText: resolveGreetingText(profile, weekPracticeCount),
    countdownLabel: '距离高考(天)',
    topInsight: buildTopInsight(profile, health),
    scoreSummary: {
      value: latestScore.valueText,
      max: latestScore.maxText,
      percentText: latestScore.percentText,
      deltaText: buildDeltaText(gradeHistory),
      caption: latestGrade
        ? `${latestGrade.essayTypeLabel} · ${latestGrade.bandLabel || '最近一次严格批改'}`
        : '先做一次严格批改，首页就会开始记录你的提分走势',
      actionText: latestGrade ? '查看报告' : '去批改'
    },
    statCards: [
      {
        label: '本周练习',
        value: String(weekPracticeCount),
        unit: '篇',
        helper: previousWeekCount > 0 ? `较上周 ${weekPracticeCount - previousWeekCount >= 0 ? '+' : ''}${weekPracticeCount - previousWeekCount}` : '从今天开始积累'
      },
      {
        label: '平均分',
        value: averageScore.valueText,
        unit: averageScore.unitText,
        helper: averageScore.helperText
      },
      {
        label: '语法稳定',
        value: String(grammarAccuracy.value),
        unit: '%',
        helper: grammarAccuracy.helperText
      },
      {
        label: '词汇丰富',
        value: String(vocabRichness.value),
        unit: '',
        helper: vocabRichness.helperText
      }
    ],
    focusCards: buildFocusCards(profile),
    trendPoints: trend.points,
    trendSegments: trend.segments,
    footerHint: buildFooterHint(entitlement, health)
  };
}

function buildTopInsight(profile, health) {
  const runtimeReadyFlag = health && health.data ? health.data.reviewReady : null;
  const primaryTag = profile && Array.isArray(profile.tags) ? profile.tags[0] : null;

  if (runtimeReadyFlag === false) {
    return {
      badge: '服务提醒',
      title: '后端还没完全就绪',
      subtitle: '先检查接口健康状态，再安排真机联调。',
      action: 'go_history',
      tone: 'warning'
    };
  }

  if (primaryTag) {
    return {
      badge: '需要关注',
      title: `${primaryTag.label} · 高频丢分`,
      subtitle: profile.nextFocus || `最近样本里，这个问题出现了 ${primaryTag.hitCount || 1} 次。`,
      action: resolveProfileAction(profile, primaryTag),
      tone: 'warning'
    };
  }

  return {
    badge: '学习概览',
    title: '先积累 1 到 2 篇严格批改',
    subtitle: profile && profile.headline
      ? profile.headline
      : '首页会自动形成你的弱项画像和趋势卡片。',
    action: 'grade_application',
    tone: 'soft'
  };
}

function buildFocusCards(profile) {
  const tags = profile && Array.isArray(profile.tags) ? profile.tags.slice(0, 2) : [];
  if (!tags.length) {
    return [
      {
        id: 'starter-grade',
        badge: '开始记录',
        title: '先批一篇应用文',
        subtitle: '做完第一次严格批改，首页才会开始沉淀分数和弱项。',
        tone: 'amber',
        action: 'grade_application'
      },
      {
        id: 'starter-coach',
        badge: '先陪练',
        title: '如果还没动笔，先走 AI 陪练',
        subtitle: '先拆题列提纲，再回来做正式写作会更稳。',
        tone: 'violet',
        action: 'continue_grade'
      }
    ];
  }

  return tags.map((tag, index) => ({
    id: tag.code || `focus-${index}`,
    badge: index === 0 ? '高频错误' : '弱项预警',
    title: tag.label,
    subtitle: profile.nextFocus || `最近 ${profile.sampleSize || 1} 篇里反复出现，建议单点突破。`,
    tone: index === 0 ? 'amber' : 'violet',
    action: resolveProfileAction(profile, tag)
  }));
}

function resolveProfileAction(profile, tag) {
  if (tag && tag.code === 'continuation_alignment') {
    return 'grade_continuation';
  }
  if (profile && profile.secondaryActionKind === 'view_latest_grade') {
    return 'view_latest_grade';
  }
  return (profile && profile.primaryActionKind) || 'continue_grade';
}

function buildFooterHint(entitlement, health) {
  if (entitlement && entitlement.subscriptionActive) {
    return '当前账号已开通会员，可继续不限次使用。';
  }

  if (entitlement && Number(entitlement.trialRemaining) >= 0) {
    return `当前试用还剩 ${Math.max(Number(entitlement.trialRemaining) || 0, 0)} 次，生成和批改共用。`;
  }

  if (health && health.data && health.data.capabilities && health.data.capabilities.generationAvailable) {
    return '批改、陪练、学习档案都已接通，可以继续真机体验。';
  }

  return '首页数据会随你的批改记录持续更新。';
}

function resolveGreetingText(profile, weekPracticeCount) {
  if (profile && profile.ready && profile.headline) {
    return profile.headline;
  }
  if (weekPracticeCount > 0) {
    return `这周已经练了 ${weekPracticeCount} 篇，继续保持。`;
  }
  return '继续加油，今天先来一篇？';
}

function calculateGaokaoCountdown(now = new Date()) {
  const year = now.getMonth() > 5 || (now.getMonth() === 5 && now.getDate() > 7)
    ? now.getFullYear() + 1
    : now.getFullYear();
  const examDate = new Date(year, 5, 7, 0, 0, 0, 0);
  const diff = examDate.getTime() - startOfDay(now).getTime();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function computeAverageScore(history) {
  const parsed = history
    .map((item) => parseScoreText(item.scoreText))
    .filter((item) => item.valid);

  if (!parsed.length) {
    return {
      valueText: '--',
      unitText: '',
      helperText: '批改后自动统计'
    };
  }

  const averageValue = parsed.reduce((sum, item) => sum + item.value, 0) / parsed.length;
  const averageMax = parsed.reduce((sum, item) => sum + item.max, 0) / parsed.length;

  return {
    valueText: formatDecimal(averageValue),
    unitText: averageMax ? `/${formatDecimal(averageMax)}` : '',
    helperText: `最近 ${parsed.length} 次严格批改`
  };
}

function computeGrammarAccuracy(history, profile) {
  const parsed = history
    .map((item) => parseScoreText(item.scoreText))
    .filter((item) => item.valid);
  let value = parsed.length
    ? Math.round((parsed.reduce((sum, item) => sum + item.percent, 0) / parsed.length) * 100)
    : 84;

  const grammarTag = profile && Array.isArray(profile.tags)
    ? profile.tags.find((item) => item.code === 'grammar_accuracy')
    : null;

  if (grammarTag && grammarTag.hitCount > 0) {
    value -= Math.min(grammarTag.hitCount * 3, 10);
  }

  value = clamp(value, 55, 99);

  return {
    value,
    helperText: grammarTag ? `近期重点：${grammarTag.label}` : '按最近批改走势估算'
  };
}

function computeVocabularyRichness(history) {
  const texts = history
    .slice(0, 5)
    .map((item) => (item.analysis && item.analysis.improvedEssay) || item.content || '')
    .filter(Boolean);

  if (!texts.length) {
    return {
      value: 72,
      helperText: '开始写作后自动评估'
    };
  }

  const scores = texts.map((text) => {
    const words = String(text || '').toLowerCase().match(/[a-z]+/g) || [];
    if (!words.length) {
      return 72;
    }
    const unique = new Set(words).size;
    return clamp(Math.round((unique / words.length) * 220), 45, 99);
  });

  const average = Math.round(scores.reduce((sum, item) => sum + item, 0) / scores.length);
  return {
    value: average,
    helperText: '按最近作文文本估算'
  };
}

function countRange(history, days) {
  const boundary = startOfDay(new Date()).getTime() - (days - 1) * 86400000;
  return history.filter((item) => Number(item.createdAt || 0) >= boundary).length;
}

function buildDeltaText(history) {
  const parsed = history
    .map((item) => parseScoreText(item.scoreText))
    .filter((item) => item.valid)
    .slice(0, 2);

  if (parsed.length < 2) {
    return '';
  }

  const delta = parsed[0].value - parsed[1].value;
  if (Math.abs(delta) < 0.1) {
    return '持平';
  }
  return `${delta > 0 ? '+' : ''}${formatDecimal(delta)}`;
}

function buildTrendSeries(history) {
  const gradeMap = new Map();
  history.forEach((item) => {
    const parsed = parseScoreText(item.scoreText);
    if (!parsed.valid) {
      return;
    }
    const dateKey = formatDateKey(item.createdAt);
    const current = gradeMap.get(dateKey) || [];
    current.push(parsed.percent);
    gradeMap.set(dateKey, current);
  });

  const days = [];
  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(startOfDay(new Date()).getTime() - index * 86400000);
    const key = formatDateKey(date.getTime());
    const bucket = gradeMap.get(key) || [];
    const avg = bucket.length
      ? bucket.reduce((sum, item) => sum + item, 0) / bucket.length
      : null;
    days.push({
      key,
      value: avg
    });
  }

  const fallback = history.length
    ? 0.72
    : 0.46;
  let lastValue = fallback;
  const normalized = days.map((item) => {
    if (item.value === null) {
      return lastValue;
    }
    lastValue = item.value;
    return item.value;
  });

  const chartWidth = 560;
  const chartOffset = 12;
  const points = normalized.map((value, index) => {
    const x = normalized.length === 1
      ? chartOffset
      : chartOffset + (index / (normalized.length - 1)) * chartWidth;
    const y = 18 + (1 - clamp(value, 0, 1)) * 64;
    return {
      x,
      y
    };
  });

  return {
    points: points.map((point) => ({
      style: `left:${point.x}rpx;top:${point.y}rpx;`
    })),
    segments: points.slice(0, -1).map((point, index) => {
      const next = points[index + 1];
      const dx = next.x - point.x;
      const dy = next.y - point.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      return {
        style: `left:${point.x}rpx;top:${point.y + 8}rpx;width:${length}rpx;transform:rotate(${angle}deg);`
      };
    })
  };
}

function parseScoreText(scoreText) {
  const text = String(scoreText || '').trim();
  const match = text.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!match) {
    return {
      valid: false,
      value: 0,
      max: 0,
      percent: 0,
      valueText: '--',
      maxText: '--',
      percentText: ''
    };
  }

  const value = Number(match[1]);
  const max = Number(match[2]);
  const percent = max > 0 ? value / max : 0;

  return {
    valid: true,
    value,
    max,
    percent,
    valueText: formatDecimal(value),
    maxText: formatDecimal(max),
    percentText: `${Math.round(percent * 100)}%`
  };
}

function mergeHistoryRecords(primary = [], fallback = []) {
  const merged = [];
  const seen = new Set();
  [primary, fallback].forEach((list) => {
    (Array.isArray(list) ? list : []).forEach((item) => {
      if (!item || !item.id || seen.has(item.id)) {
        return;
      }
      seen.add(item.id);
      merged.push(item);
    });
  });
  return merged;
}

function formatDateKey(timestamp) {
  const date = new Date(Number(timestamp || Date.now()));
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDecimal(value) {
  if (!Number.isFinite(value)) {
    return '--';
  }
  return Math.round(value * 10) % 10 === 0 ? String(Math.round(value)) : value.toFixed(1);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildEmptyScoreSummary() {
  return {
    value: '--',
    max: '--',
    percentText: '',
    deltaText: '',
    caption: '先做一次严格批改，首页会形成你的学习趋势。',
    actionText: '去批改'
  };
}
