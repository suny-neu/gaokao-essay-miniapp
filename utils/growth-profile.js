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
  return {
    code: String(data.code || 'foundation'),
    title: String(data.title || '先完成第一次正式批改'),
    reason: String(data.reason || '有了第一篇真实报告，系统才能为你建立个人成长起点。'),
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

function buildTrendGeometry(rawPoints, scoreMetric) {
  if (!rawPoints.length) {
    return { points: [], segments: [] };
  }
  const values = rawPoints.map((item) => scoreMetric ? item.value / item.max * 100 : item.value);
  const points = rawPoints.map((item, index) => {
    const left = rawPoints.length === 1 ? 50 : index / (rawPoints.length - 1) * 100;
    const percent = Math.max(0, Math.min(100, values[index]));
    return {
      ...item,
      index,
      style: `left:${left}%;top:${100 - percent}%`
    };
  });
  const segments = [];
  for (let index = 1; index < points.length; index += 1) {
    const previousLeft = Number(points[index - 1].style.match(/left:([\d.]+)/)[1]);
    const currentLeft = Number(points[index].style.match(/left:([\d.]+)/)[1]);
    const previousTop = Number(points[index - 1].style.match(/top:([\d.]+)/)[1]);
    const currentTop = Number(points[index].style.match(/top:([\d.]+)/)[1]);
    const width = Math.hypot(currentLeft - previousLeft, currentTop - previousTop);
    const angle = Math.atan2(currentTop - previousTop, currentLeft - previousLeft) * 180 / Math.PI;
    segments.push({
      index,
      style: `left:${previousLeft}%;top:${previousTop}%;width:${width}%;transform:rotate(${angle}deg)`
    });
  }
  return { points, segments };
}

function toStringList(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '')).filter(Boolean) : [];
}

module.exports = {
  normalizeGrowthProfile,
  buildGrowthHomeView
};
