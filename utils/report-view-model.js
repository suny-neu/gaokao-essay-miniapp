const DIMENSION_DEFINITIONS = {
  content: { label: '内容', maxScore: 5 },
  language: { label: '语言', maxScore: 5 },
  structure: { label: '结构', maxScore: 3 },
  vocabulary: { label: '词汇', maxScore: 2 }
};

const ERROR_TYPE_LABELS = {
  GRAMMAR: '语法',
  SPELLING: '拼写',
  WORD_CHOICE: '用词',
  PUNCTUATION: '标点',
  CONTENT: '内容'
};

function buildReportViewModel(result = {}) {
  const isCoach = result.mode === 'coach';
  const analysis = result.analysis && typeof result.analysis === 'object'
    ? result.analysis
    : {};
  const score = parseScoreText(result.scoreText);
  const diagnostics = buildDiagnostics(analysis);

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
    corrections: diagnostics.corrections,
    upgrades: diagnostics.upgrades,
    legacyNotice: diagnostics.legacyNotice,
    contentAdvice: joinAdvice(
      analysis.contentDiagnosis,
      ...diagnostics.contentSuggestions
    ),
    // Keep this alias for pages or records that still consume the old view-model shape.
    errors: diagnostics.corrections,
    improvedEssay: String(analysis.improvedEssay || '').trim(),
    priority: firstNonEmpty(
      analysis.lossPointDiagnosis,
      analysis.languageDiagnosis,
      analysis.structureDiagnosis,
      analysis.overallComment
    ),
    nextPractice: firstNonEmpty(
      analysis.secondDraftGuidance,
      analysis.weaknessProfile && analysis.weaknessProfile.nextFocus
    ),
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

function buildDiagnostics(analysis) {
  const diagnostics = Array.isArray(analysis.sentenceDiagnostics)
    ? analysis.sentenceDiagnostics
    : [];
  const corrections = [];
  const upgrades = [];
  const contentSuggestions = [];
  let legacyNotice = false;

  diagnostics.forEach((item) => {
    const row = buildDiagnosticRow(item);
    if (!row) {
      return;
    }

    if (hasOwn(item, 'kind')) {
      const kind = normalizeToken(item.kind);
      if (kind === 'ERROR_CORRECTION') {
        if (!hasEnglishPair(row)) {
          const suggestion = firstNonEmpty(row.reason, row.to, row.from);
          if (suggestion) {
            contentSuggestions.push(suggestion);
          }
          return;
        }
        corrections.push({
          ...row,
          tag: errorTypeLabel(item.errorType),
          kind,
          errorType: normalizeToken(item.errorType),
          isRealError: true,
          legacyInferred: Boolean(item.legacyInferred)
        });
      } else if (kind === 'EXPRESSION_UPGRADE') {
        upgrades.push({
          ...row,
          tag: '表达升级',
          kind,
          errorType: 'NONE',
          isRealError: false,
          legacyInferred: Boolean(item.legacyInferred)
        });
      }
      return;
    }

    const tag = classifyDiagnosis(row.reason);
    const legacyRow = {
      ...row,
      tag,
      kind: tag === '表达升级' ? 'EXPRESSION_UPGRADE' : 'ERROR_CORRECTION',
      errorType: legacyErrorType(tag),
      isRealError: tag !== '表达升级',
      legacyInferred: true
    };
    if (legacyRow.isRealError) {
      if (hasEnglishPair(legacyRow)) {
        corrections.push(legacyRow);
      } else {
        const suggestion = firstNonEmpty(legacyRow.reason, legacyRow.to, legacyRow.from);
        if (suggestion) {
          contentSuggestions.push(suggestion);
        }
      }
    } else {
      upgrades.push(legacyRow);
    }
    legacyNotice = true;
  });

  return { corrections, upgrades, contentSuggestions, legacyNotice };
}

function buildDiagnosticRow(item) {
  const diagnosis = String((item && item.diagnosis) || '').trim();
  const row = {
    from: String((item && item.original) || '').trim(),
    to: String((item && item.revision) || '').trim(),
    reason: diagnosis
  };
  return row.from || row.to || row.reason ? row : null;
}

function hasEnglishPair(row) {
  return isEnglishText(row.from) && isEnglishText(row.to);
}

function isEnglishText(value) {
  const text = String(value || '').trim();
  return /[A-Za-z]/.test(text) && !/[\u3400-\u9fff]/.test(text);
}

function joinAdvice(...values) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean))).join('\n');
}

function errorTypeLabel(errorType) {
  return ERROR_TYPE_LABELS[normalizeToken(errorType)] || '错误';
}

function legacyErrorType(tag) {
  if (tag === '语法') {
    return 'GRAMMAR';
  }
  if (tag === '拼写') {
    return 'SPELLING';
  }
  if (tag === '内容补充') {
    return 'CONTENT';
  }
  return 'NONE';
}

function hasOwn(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeToken(value) {
  return String(value || '').trim().toUpperCase();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) {
      return text;
    }
  }
  return '';
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
