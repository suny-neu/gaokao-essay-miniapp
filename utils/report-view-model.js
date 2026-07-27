const DIMENSION_DEFINITIONS = {
  content: { label: '内容', maxScore: 5 },
  language: { label: '语言', maxScore: 5 },
  structure: { label: '结构', maxScore: 3 },
  vocabulary: { label: '词汇', maxScore: 2 }
};

function buildReportViewModel(result = {}) {
  const isCoach = result.mode === 'coach';
  const analysis = result.analysis && typeof result.analysis === 'object'
    ? result.analysis
    : {};
  const score = parseScoreText(result.scoreText);

  return {
    mode: isCoach ? 'coach' : 'grade',
    pageTitle: isCoach ? '陪练结果' : '批改报告',
    modeLabel: result.modeLabel || (isCoach ? 'AI 陪练' : '严格批改'),
    scoreVisible: !isCoach && score.valid,
    scoreValue: isCoach || !score.valid ? '' : formatNumber(score.value),
    scoreSuffix: isCoach || !score.valid ? '' : `/${formatNumber(score.max)} · ${Math.round(score.value / score.max * 100)}%`,
    deltaText: '',
    dims: isCoach || !score.valid
      ? []
      : normalizeScoreDimensions(analysis.scoreDimensions, score.value),
    errors: buildErrors(analysis),
    highlights: buildHighlights(result, analysis)
  };
}

function normalizeScoreDimensions(value, expectedTotal) {
  if (!Array.isArray(value)) {
    return [];
  }

  const byCode = new Map();
  value.forEach((item) => {
    const code = String((item && item.code) || '');
    const definition = DIMENSION_DEFINITIONS[code];
    const score = Number(item && item.score);
    const maxScore = Number(item && item.maxScore);
    if (
      !definition ||
      !Number.isFinite(score) ||
      !Number.isFinite(maxScore) ||
      maxScore !== definition.maxScore ||
      score < 0 ||
      score > maxScore ||
      byCode.has(code)
    ) {
      return;
    }
    byCode.set(code, {
      code,
      label: definition.label,
      score,
      maxScore,
      scoreText: `${formatNumber(score)}/${formatNumber(maxScore)}`,
      width: Math.round(score / maxScore * 100)
    });
  });

  const ordered = Object.keys(DIMENSION_DEFINITIONS).map((code) => byCode.get(code));
  if (ordered.some((item) => !item)) {
    return [];
  }

  const total = ordered.reduce((sum, item) => sum + item.score, 0);
  if (Number.isFinite(Number(expectedTotal)) && Math.abs(total - Number(expectedTotal)) > 0.01) {
    return [];
  }
  return ordered;
}

function buildErrors(analysis) {
  const diagnostics = Array.isArray(analysis.sentenceDiagnostics)
    ? analysis.sentenceDiagnostics
    : [];
  return diagnostics.slice(0, 8).map((item) => {
    const diagnosis = String((item && item.diagnosis) || '').trim();
    const tag = classifyDiagnosis(diagnosis);
    return {
      tag,
      from: String((item && item.original) || '').trim(),
      to: String((item && item.revision) || '').trim(),
      reason: diagnosis,
      isRealError: tag === '语法' || tag === '拼写'
    };
  }).filter((item) => item.from || item.to || item.reason);
}

function buildHighlights(result, analysis) {
  const items = [];
  if (result.summary) {
    items.push({ tag: '任务', text: String(result.summary).trim() });
  }
  if (analysis.highlightDiagnosis) {
    items.push({ tag: '亮点', text: String(analysis.highlightDiagnosis).trim() });
  }
  if (analysis.overallComment) {
    items.push({ tag: '总评', text: String(analysis.overallComment).trim() });
  }
  return items.filter((item) => item.text);
}

function classifyDiagnosis(diagnosis) {
  if (/拼写|单词拼错|大小写/.test(diagnosis)) {
    return '拼写';
  }
  if (/语法|时态|主谓一致|冠词|介词|单复数|句法/.test(diagnosis)) {
    return '语法';
  }
  if (/内容|细节|空洞|具体|要点|信息不足/.test(diagnosis)) {
    return '内容补充';
  }
  return '表达升级';
}

function parseScoreText(scoreText) {
  const match = String(scoreText || '').match(/(\d+(?:\.\d+)?)\s*(?:分)?\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!match) {
    return { valid: false, value: 0, max: 0 };
  }
  const value = Number(match[1]);
  const max = Number(match[2]);
  return {
    valid: Number.isFinite(value) && Number.isFinite(max) && max > 0 && value >= 0 && value <= max,
    value,
    max
  };
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

module.exports = {
  buildReportViewModel,
  normalizeScoreDimensions,
  parseScoreText
};
