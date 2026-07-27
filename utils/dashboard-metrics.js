const { normalizeScoreDimensions, parseScoreText } = require('./report-view-model');

function buildFormalGradeMetrics(history, now = Date.now()) {
  const formalGrades = (Array.isArray(history) ? history : [])
    .filter((item) => item && item.mode === 'grade' && item.taskStatus !== 'FAILED')
    .filter((item) => parseScoreText(item.scoreText).valid)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const parsed = formalGrades.map((item) => parseScoreText(item.scoreText));
  const average = parsed.length
    ? {
        valueText: formatNumber(parsed.reduce((sum, item) => sum + item.value, 0) / parsed.length),
        unitText: `/${formatNumber(parsed.reduce((sum, item) => sum + item.max, 0) / parsed.length)}`,
        helperText: `最近 ${parsed.length} 次正式批改`
      }
    : { valueText: '--', unitText: '', helperText: '批改后自动统计' };

  return {
    formalGrades,
    average,
    deltaText: buildDeltaText(parsed),
    trend: buildTrend(formalGrades, now),
    grammar: buildDimensionMetric(formalGrades, 'language', '按正式批改语言分统计'),
    vocabulary: buildDimensionMetric(formalGrades, 'vocabulary', '按正式批改词汇分统计')
  };
}

function buildDimensionMetric(history, code, helperText) {
  const percentages = history.map((item) => {
    const total = parseScoreText(item.scoreText).value;
    const dims = normalizeScoreDimensions(item.analysis && item.analysis.scoreDimensions, total);
    const target = dims.find((dim) => dim.code === code);
    return target ? Math.round(target.score / target.maxScore * 100) : null;
  }).filter((value) => value !== null);

  if (!percentages.length) {
    return { valueText: '--', unitText: '', helperText: '有分项评分后显示' };
  }
  return {
    valueText: formatNumber(percentages.reduce((sum, value) => sum + value, 0) / percentages.length),
    unitText: '%',
    helperText
  };
}

function buildDeltaText(parsed) {
  if (parsed.length < 2) {
    return '';
  }
  const delta = parsed[0].value - parsed[1].value;
  if (Math.abs(delta) < 0.01) {
    return '持平';
  }
  return `${delta > 0 ? '+' : ''}${formatNumber(delta)}`;
}

function buildTrend(history, now) {
  const boundary = startOfDay(now) - 6 * 86400000;
  const byDay = new Map();
  history.forEach((item) => {
    const createdAt = Number(item.createdAt || 0);
    if (createdAt < boundary) {
      return;
    }
    const parsed = parseScoreText(item.scoreText);
    const key = formatDateKey(createdAt);
    const values = byDay.get(key) || [];
    values.push({ score: parsed.value, max: parsed.max });
    byDay.set(key, values);
  });

  const values = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, scores]) => ({
    date,
    score: Number(formatNumber(scores.reduce((sum, item) => sum + item.score, 0) / scores.length)),
    max: Number(formatNumber(scores.reduce((sum, item) => sum + item.max, 0) / scores.length))
  }));
  return { values };
}

function startOfDay(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatDateKey(value) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

module.exports = {
  buildFormalGradeMetrics
};
