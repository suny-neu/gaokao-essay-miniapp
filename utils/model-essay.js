function buildModelEssayViewModel(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  return {
    targetBand: text(data.targetBand) || '高分提升版',
    modelEssay: text(data.modelEssay),
    paragraphInsights: normalizeParagraphInsights(data.paragraphInsights),
    expressionComparisons: normalizeExpressionComparisons(data.expressionComparisons),
    reusableExpressions: normalizeStrings(data.reusableExpressions),
    generatedAt: Number(data.generatedAt || 0)
  };
}

function canGenerateModelEssay(record) {
  const recordId = String((record && record.id) || '');
  return Boolean(
    record
    && recordId.startsWith('essay_')
    && record.mode === 'grade'
    && record.taskStatus === 'SUCCESS'
  );
}

function normalizeParagraphInsights(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => ({
      title: text(item && item.title),
      purpose: text(item && item.purpose),
      keyExpression: text(item && item.keyExpression)
    }))
    .filter((item) => item.title || item.purpose || item.keyExpression);
}

function normalizeExpressionComparisons(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => ({
      original: text(item && item.original),
      recommended: text(item && item.recommended),
      reason: text(item && item.reason)
    }))
    .filter((item) => item.original || item.recommended || item.reason);
}

function normalizeStrings(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(text).filter(Boolean);
}

function text(value) {
  return String(value || '').trim();
}

module.exports = {
  buildModelEssayViewModel,
  canGenerateModelEssay
};
