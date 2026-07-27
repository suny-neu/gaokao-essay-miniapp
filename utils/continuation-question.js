function normalizeQuestionFields(fields = {}) {
  return {
    sourceMaterial: String(fields.sourceMaterial || '').trim(),
    paragraphOneStarter: String(fields.paragraphOneStarter || '').trim(),
    paragraphTwoStarter: String(fields.paragraphTwoStarter || '').trim()
  };
}

function hasCompleteContinuationQuestion(fields) {
  const normalized = normalizeQuestionFields(fields);
  return Boolean(
    normalized.sourceMaterial
    && normalized.paragraphOneStarter
    && normalized.paragraphTwoStarter
  );
}

function applyQuestionOcr(fields, ocrResult = {}) {
  const current = normalizeQuestionFields(fields);
  const text = String(ocrResult.text || '').trim();

  if (!text) {
    return current;
  }

  return {
    ...current,
    sourceMaterial: text
  };
}

module.exports = {
  normalizeQuestionFields,
  hasCompleteContinuationQuestion,
  applyQuestionOcr
};
