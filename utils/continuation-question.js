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
  const structured = normalizeQuestionFields(ocrResult);

  if (!text && !structured.sourceMaterial && !structured.paragraphOneStarter && !structured.paragraphTwoStarter) {
    return current;
  }

  const parsed = splitContinuationQuestionText(text);
  return {
    sourceMaterial: structured.sourceMaterial || parsed.sourceMaterial || current.sourceMaterial,
    paragraphOneStarter: structured.paragraphOneStarter || parsed.paragraphOneStarter || current.paragraphOneStarter,
    paragraphTwoStarter: structured.paragraphTwoStarter || parsed.paragraphTwoStarter || current.paragraphTwoStarter
  };
}

function splitContinuationQuestionText(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const sections = {
    sourceMaterial: [],
    paragraphOneStarter: [],
    paragraphTwoStarter: []
  };
  let activeField = 'sourceMaterial';
  let foundStarter = false;

  lines.forEach((line) => {
    const firstMatch = line.match(/^\s*(?:(?:paragraph|para\.?)\s*1|第一段(?:首句)?)\s*[:：.、-]?\s*(.*)$/i);
    const secondMatch = line.match(/^\s*(?:(?:paragraph|para\.?)\s*2|第二段(?:首句)?)\s*[:：.、-]?\s*(.*)$/i);

    if (firstMatch) {
      activeField = 'paragraphOneStarter';
      foundStarter = true;
      if (firstMatch[1]) sections[activeField].push(firstMatch[1]);
      return;
    }
    if (secondMatch) {
      activeField = 'paragraphTwoStarter';
      foundStarter = true;
      if (secondMatch[1]) sections[activeField].push(secondMatch[1]);
      return;
    }
    sections[activeField].push(line);
  });

  if (!foundStarter) {
    return {
      sourceMaterial: String(text || '').trim(),
      paragraphOneStarter: '',
      paragraphTwoStarter: ''
    };
  }

  return normalizeQuestionFields({
    sourceMaterial: sections.sourceMaterial.join('\n'),
    paragraphOneStarter: sections.paragraphOneStarter.join('\n'),
    paragraphTwoStarter: sections.paragraphTwoStarter.join('\n')
  });
}

module.exports = {
  normalizeQuestionFields,
  hasCompleteContinuationQuestion,
  applyQuestionOcr,
  splitContinuationQuestionText
};
