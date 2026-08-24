const METRIC_TABS = [
  { code: 'score', label: '总分' },
  { code: 'content', label: '内容' },
  { code: 'language', label: '语言' },
  { code: 'structure', label: '结构' },
  { code: 'vocabulary', label: '词汇' }
];

function normalizeGrowthProfile(data = {}) {
  const profiles = data.profiles || {};
  return {
    totalFormalGrades: Number(data.totalFormalGrades || 0),
    activeEssayType: data.activeEssayType === 'continuation' ? 'continuation' : 'application',
    profiles: {
      application: normalizeEssayTypeProfile(profiles.application, 'application'),
      continuation: normalizeEssayTypeProfile(profiles.continuation, 'continuation')
    },
    dailyTask: normalizeDailyTask(data.dailyTask),
    recentErrors: normalizeErrors(data.recentErrors),
    masteryItems: normalizeMasteryItems(data.masteryItems)
  };
}

function normalizeEssayTypeProfile(data = {}, essayType) {
  const capabilityTrends = data.capabilityTrends || {};
  return {
    essayType,
    state: String(data.state || 'EMPTY'),
    scoreTrend: normalizePoints(data.scoreTrend, false),
    capabilityTrends: {
      content: normalizePoints(capabilityTrends.content, true),
      language: normalizePoints(capabilityTrends.language, true),
      structure: normalizePoints(capabilityTrends.structure, true),
      vocabulary: normalizePoints(capabilityTrends.vocabulary, true)
    },
    comparison: {
      headline: String((data.comparison && data.comparison.headline) || ''),
      improved: toStringList(data.comparison && data.comparison.improved),
      declined: toStringList(data.comparison && data.comparison.declined)
    }
  };
}

function normalizePoints(points, capability) {
  if (!Array.isArray(points)) {
    return [];
  }
  return points.map((item) => capability
    ? {
        recordId: String(item.recordId || ''),
        createdAt: Number(item.createdAt || 0),
        value: Number(item.percent)
      }
    : {
        recordId: String(item.recordId || ''),
        createdAt: Number(item.createdAt || 0),
        value: Number(item.score),
        max: Number(item.maxScore)
      })
    .filter((item) => Number.isFinite(item.value) && (!capability ? item.max > 0 : true));
}

function normalizeDailyTask(data = {}) {
  const code = String(data.code || 'foundation');
  const isFoundation = code === 'foundation';
  return {
    code,
    title: isFoundation ? '完成一篇应用文批改' : String(data.title || '完成一篇应用文批改'),
    reason: isFoundation ? '重点练习：内容完整与表达准确' : String(data.reason || '重点练习：内容完整与表达准确'),
    essayType: data.essayType === 'continuation' ? 'continuation' : 'application',
    route: String(data.route || '/pages/write/index?mode=grade&type=application'),
    minutes: Number(data.minutes || 10)
  };
}

function normalizeErrors(errors) {
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors.map((item) => ({
    code: String(item.code || ''),
    label: String(item.label || ''),
    status: String(item.status || 'NEW'),
    occurrences: Number(item.occurrences || 0),
    consecutiveOccurrences: Number(item.consecutiveOccurrences || 0),
    evidence: String(item.evidence || ''),
    essayType: item.essayType === 'continuation' ? 'continuation' : 'application'
  }));
}

function normalizeMasteryItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => ({
    code: String(item.code || ''),
    label: String(item.label || ''),
    status: String(item.status || ''),
    updatedAt: Number(item.updatedAt || 0)
  }));
}

function buildGrowthHomeView(profile, essayType = 'application', metric = 'score') {
  const normalizedType = essayType === 'continuation' ? 'continuation' : 'application';
  const normalizedMetric = METRIC_TABS.some((item) => item.code === metric) ? metric : 'score';
  const typeProfile = profile.profiles[normalizedType];
  const rawPoints = normalizedMetric === 'score'
    ? typeProfile.scoreTrend
    : typeProfile.capabilityTrends[normalizedMetric];
  const geometry = buildTrendGeometry(rawPoints, normalizedMetric === 'score');
  const emptyText = typeProfile.state === 'STARTING_POINT'
    ? '这是你的成长起点，完成下一篇后就能看到变化'
    : '完成第一次正式批改后，这里会形成你的成长起点';

  return {
    essayType: normalizedType,
    essayTypeTabs: [
      { code: 'application', label: '应用文' },
      { code: 'continuation', label: '读后续写' }
    ],
    metricTabs: METRIC_TABS,
    activeMetric: normalizedMetric,
    dailyTask: profile.dailyTask,
    weekSummary: {
      ...typeProfile.comparison,
      improvedText: typeProfile.comparison.improved.join('、'),
      declinedText: typeProfile.comparison.declined.join('、')
    },
    trendPoints: geometry.points,
    trendSegments: geometry.segments,
    emptyText,
    recentErrors: profile.recentErrors.filter((item) => item.essayType === normalizedType).slice(0, 3),
    masteryItems: profile.masteryItems.slice(0, 6)
  };
}

function buildDashboardHighlights(profile, essayType = 'application', weekly = {}, streak = {}) {
  const normalizedType = essayType === 'continuation' ? 'continuation' : 'application';
  const typeProfile = profile.profiles[normalizedType];
  const weeklyStatus = String(weekly.status || 'PENDING').toUpperCase();
  const streakDays = Math.max(0, Number(streak.days || 0));

  return {
    weeklyMetric: {
      value: String(weekly.label || '等待积累'),
      helper: weeklyStatus === 'IMPROVED'
        ? '较上周进步明显'
        : weeklyStatus === 'DECLINED'
          ? '本周需要多关注'
          : weeklyStatus === 'STABLE'
            ? '本周表现稳定'
            : '完成更多批改后生成',
      tone: weeklyStatus === 'DECLINED' ? 'attention' : weeklyStatus === 'IMPROVED' ? 'positive' : 'neutral'
    },
    streakMetric: {
      value: String(streakDays),
      unit: '天',
      helper: String(streak.label || '开始第一次练习'),
      tone: streakDays > 0 ? 'streak' : 'neutral'
    },
    capabilityMetrics: [
      capabilityMetric('内容', typeProfile.capabilityTrends.content),
      capabilityMetric('结构', typeProfile.capabilityTrends.structure),
      capabilityMetric('语言', typeProfile.capabilityTrends.language)
    ],
    priorityItems: buildPriorityItems(profile.recentErrors, normalizedType)
  };
}

function capabilityMetric(label, points) {
  const latest = Array.isArray(points) && points.length ? points[points.length - 1] : null;
  return {
    label,
    value: latest ? Math.round(latest.value) : '--'
  };
}

function buildPriorityItems(errors, essayType) {
  const items = (Array.isArray(errors) ? errors : [])
    .filter((item) => item.essayType === essayType)
    .slice(0, 2)
    .map((item) => ({
      code: item.code,
      label: item.label,
      helper: item.evidence || (item.status === 'REPEATED' ? '近期重复出现，建议优先处理' : '已加入下一次练习重点'),
      badge: item.status === 'REPEATED' ? '优先' : '提升中',
      tone: item.status === 'REPEATED' ? 'attention' : 'progress'
    }));

  if (items.length) {
    return items;
  }

  return [
    {
      code: 'structure_flow',
      label: '文章结构',
      helper: '完成首次批改后生成真实评估',
      badge: '待评估',
      tone: 'attention'
    },
    {
      code: 'language_naturalness',
      label: '高级句式',
      helper: '完成首次批改后生成真实评估',
      badge: '待评估',
      tone: 'progress'
    }
  ];
}

function buildTrendGeometry(rawPoints, scoreMetric) {
  if (!rawPoints.length) {
    return { points: [], segments: [] };
  }
  const chartLeft = 8;
  const chartWidth = 536;
  const chartTop = 28;
  const chartHeight = 180;
  const values = rawPoints.map((item) => scoreMetric ? item.value / item.max * 100 : item.value);
  const points = rawPoints.map((item, index) => {
    const left = rawPoints.length === 1
      ? chartLeft + chartWidth / 2
      : chartLeft + index / (rawPoints.length - 1) * chartWidth;
    const percent = Math.max(0, Math.min(100, values[index]));
    const top = chartTop + (1 - percent / 100) * chartHeight;
    return {
      ...item,
      index,
      dateLabel: formatMonthDay(item.createdAt),
      style: `left:${left}rpx;top:${top}rpx`
    };
  });
  const segments = [];
  for (let index = 1; index < points.length; index += 1) {
    const previousLeft = Number(points[index - 1].style.match(/left:([\d.]+)rpx/)[1]);
    const currentLeft = Number(points[index].style.match(/left:([\d.]+)rpx/)[1]);
    const previousTop = Number(points[index - 1].style.match(/top:([\d.]+)rpx/)[1]);
    const currentTop = Number(points[index].style.match(/top:([\d.]+)rpx/)[1]);
    const width = Math.hypot(currentLeft - previousLeft, currentTop - previousTop);
    const angle = Math.atan2(currentTop - previousTop, currentLeft - previousLeft) * 180 / Math.PI;
    segments.push({
      index,
      style: `left:${previousLeft}rpx;top:${previousTop}rpx;width:${width}rpx;transform:rotate(${angle}deg)`
    });
  }
  return { points, segments };
}

function formatMonthDay(createdAt) {
  const date = new Date(Number(createdAt || 0));
  if (!Number.isFinite(date.getTime()) || !createdAt) {
    return '';
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function toStringList(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '')).filter(Boolean) : [];
}

module.exports = {
  normalizeGrowthProfile,
  buildGrowthHomeView,
  buildDashboardHighlights
};
