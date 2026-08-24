const { config } = require('./config');
const { modeLabelMap, typeLabelMap, bandLabelMap } = require('./constants');
const { summarizeText } = require('./format');
const { normalizeScoreDimensions } = require('./report-view-model');
const { buildModelEssayViewModel } = require('./model-essay');

function getHistory() {
  return (wx.getStorageSync(config.storageKeys.history) || []).map(normalizeSessionRecord);
}

function saveHistoryItem(item) {
  const normalized = normalizeSessionRecord(item);
  const history = getHistory();
  const next = [normalized, ...history.filter((record) => record.id !== normalized.id)].slice(0, 20);
  wx.setStorageSync(config.storageKeys.history, next);
  wx.setStorageSync(config.storageKeys.lastResult, normalized);
  return next;
}

function getLatestHistory() {
  const history = getHistory();
  return history.length ? history[0] : null;
}

function getLastResult() {
  const result = wx.getStorageSync(config.storageKeys.lastResult) || null;
  return result ? normalizeSessionRecord(result) : null;
}

function clearHistory() {
  wx.removeStorageSync(config.storageKeys.history);
  wx.removeStorageSync(config.storageKeys.lastResult);
}

function clearHistoryByFilter(filters = {}) {
  const next = getHistory().filter((item) => !matchesHistoryFilters(item, filters));
  wx.setStorageSync(config.storageKeys.history, next);
  const lastResult = getLastResult();
  if (lastResult && matchesHistoryFilters(lastResult, filters)) {
    wx.removeStorageSync(config.storageKeys.lastResult);
  }
  return next;
}

function deleteHistoryItem(id) {
  const next = getHistory().filter((item) => item.id !== id);
  wx.setStorageSync(config.storageKeys.history, next);
  return next;
}

function normalizeSessionRecord(item = {}) {
  const mode = item.mode || 'coach';
  const essayType = item.essayType || 'application';
  const band = normalizeBandId(item.band, item.bandLabel, item.bandValue);
  const createdAt = Number(item.createdAt || item.createdAtEpochMillis || Date.now());
  const content = String(item.content || '');
  const promptSnapshot = item.promptSnapshot || {};
  const bandLabel = resolveBandLabel(item, band);

  return {
    ...item,
    id: item.id || '',
    mode,
    modeLabel: item.modeLabel || modeLabelMap[mode] || mode,
    essayType,
    essayTypeLabel: item.essayTypeLabel || typeLabelMap[essayType] || essayType,
    band,
    bandLabel,
    bandValue: item.bandValue || resolveBandValue(band, bandLabel),
    coachStage: item.coachStage || (item.coachPlan && item.coachPlan.stage) || '',
    coachMode: item.coachMode || (item.coachPlan && item.coachPlan.coachingMode) || '',
    createdAt,
    content,
    wordCount: Number(item.wordCount || 0),
    scoreText: item.scoreText || '',
    summary: item.summary || summarizeText(extractSummaryText(item, promptSnapshot, content)),
    coachPlan: normalizeCoachPlan(item.coachPlan),
    analysis: normalizeGradeAnalysis(item.analysis),
    promptSnapshot: {
      taskContent: promptSnapshot.taskContent || '',
      sourceMaterial: promptSnapshot.sourceMaterial || '',
      draftText: promptSnapshot.draftText || '',
      requirements: promptSnapshot.requirements || ''
    },
    source: item.source || 'remote',
    taskStatus: item.taskStatus || 'SUCCESS',
    sourceType: item.sourceType || 'local'
  };
}

function normalizeCoachPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return null;
  }

  return {
    stage: plan.stage || '',
    coachingMode: plan.coachingMode || '',
    typeJudgment: plan.typeJudgment || '',
    identityTone: plan.identityTone || '',
    templateId: plan.templateId || '',
    scenario: plan.scenario || '',
    taskPurpose: plan.taskPurpose || '',
    officialLogic: plan.officialLogic || '',
    opening: plan.opening || '',
    body: plan.body || '',
    ending: plan.ending || '',
    clueReuse: plan.clueReuse || '',
    emotionalFlow: plan.emotionalFlow || '',
    secondOpeningBridge: plan.secondOpeningBridge || '',
    bandRecommendation: plan.bandRecommendation || '',
    bandReason: plan.bandReason || '',
    drillFocus: plan.drillFocus || '',
    successCheck: plan.successCheck || '',
    routeAction: plan.routeAction || '',
    routeReason: plan.routeReason || '',
    writingPriorities: normalizeStringArray(plan.writingPriorities),
    drillTasks: normalizeStringArray(plan.drillTasks),
    mustInclude: normalizeStringArray(plan.mustInclude),
    riskPoints: normalizeStringArray(plan.riskPoints),
    suggestedExpressions: normalizeStringArray(plan.suggestedExpressions)
  };
}

function normalizeGradeAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object') {
    return null;
  }

  return {
    typeJudgment: analysis.typeJudgment || '',
    wordCountRisk: analysis.wordCountRisk || '',
    alignmentDiagnosis: analysis.alignmentDiagnosis || '',
    languageFitnessDiagnosis: analysis.languageFitnessDiagnosis || '',
    flowDiagnosis: analysis.flowDiagnosis || '',
    machineRiskDiagnosis: analysis.machineRiskDiagnosis || '',
    contentDiagnosis: analysis.contentDiagnosis || '',
    structureDiagnosis: analysis.structureDiagnosis || '',
    languageDiagnosis: analysis.languageDiagnosis || '',
    highlightDiagnosis: analysis.highlightDiagnosis || '',
    lossPointDiagnosis: analysis.lossPointDiagnosis || '',
    overallComment: analysis.overallComment || '',
    secondDraftGuidance: analysis.secondDraftGuidance || '',
    improvedEssay: analysis.improvedEssay || '',
    modelEssay: analysis.modelEssay ? buildModelEssayViewModel(analysis.modelEssay) : null,
    scoreDimensions: normalizeScoreDimensions(analysis.scoreDimensions),
    sentenceDiagnostics: normalizeSentenceDiagnostics(analysis.sentenceDiagnostics),
    weaknessProfile: analysis.weaknessProfile
      ? {
          headline: analysis.weaknessProfile.headline || '',
          nextFocus: analysis.weaknessProfile.nextFocus || '',
          sampleSize: Number(analysis.weaknessProfile.sampleSize || 0),
          tags: Array.isArray(analysis.weaknessProfile.tags)
            ? analysis.weaknessProfile.tags.map((tag) => ({
                code: tag.code || '',
                label: tag.label || '',
                hitCount: Number(tag.hitCount || 0)
              }))
            : []
        }
      : null
  };
}

function normalizeSentenceDiagnostics(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const normalized = {
        original: item && item.original ? String(item.original) : '',
        diagnosis: item && item.diagnosis ? String(item.diagnosis) : '',
        revision: item && item.revision ? String(item.revision) : ''
      };
      if (hasOwn(item, 'kind')) {
        normalized.kind = String(item.kind || '').trim();
      }
      if (hasOwn(item, 'errorType')) {
        normalized.errorType = String(item.errorType || '').trim();
      }
      if (hasOwn(item, 'legacyInferred')) {
        normalized.legacyInferred = Boolean(item.legacyInferred);
      }
      return normalized;
    })
    .filter((item) => item.original || item.diagnosis || item.revision);
}

function hasOwn(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function extractSummaryText(item, promptSnapshot, content) {
  return (
    item.summary ||
    promptSnapshot.taskContent ||
    promptSnapshot.draftText ||
    promptSnapshot.sourceMaterial ||
    content
  );
}

function normalizeBandId(band, bandLabel, bandValue) {
  const candidates = [band, bandLabel, bandValue]
    .filter(Boolean)
    .map((value) => String(value));

  if (candidates.includes('band1')) {
    return 'band1';
  }
  if (candidates.includes('band2')) {
    return 'band2';
  }
  if (candidates.includes('band3')) {
    return 'band3';
  }
  if (candidates.some((value) => value.includes('进阶版') || value.includes('进阶') || value.includes('档次1'))) {
    return 'band1';
  }
  if (candidates.some((value) => value.includes('学霸版') || value.includes('学霸') || value.includes('档次2'))) {
    return 'band2';
  }
  if (candidates.some((value) => value.includes('满分压轴版') || value.includes('满分') || value.includes('档次3'))) {
    return 'band3';
  }
  return '';
}

function resolveBandLabel(item, normalizedBandId) {
  if (normalizedBandId && bandLabelMap[normalizedBandId]) {
    return bandLabelMap[normalizedBandId];
  }
  return item.bandLabel || item.bandValue || item.band || '';
}

function resolveBandValue(normalizedBandId, bandLabel) {
  if (normalizedBandId === 'band1') {
    return '进阶版';
  }
  if (normalizedBandId === 'band2') {
    return '学霸版';
  }
  if (normalizedBandId === 'band3') {
    return '满分压轴版';
  }
  return bandLabel || '';
}

function matchesHistoryFilters(item, filters = {}) {
  if (filters.mode && filters.mode !== 'all' && item.mode !== filters.mode) {
    return false;
  }
  if (filters.essayType && filters.essayType !== 'all' && item.essayType !== filters.essayType) {
    return false;
  }
  if (filters.taskStatus && filters.taskStatus !== 'all' && item.taskStatus !== filters.taskStatus) {
    return false;
  }
  return true;
}

module.exports = {
  getHistory,
  saveHistoryItem,
  getLatestHistory,
  getLastResult,
  clearHistory,
  clearHistoryByFilter,
  deleteHistoryItem,
  normalizeSessionRecord,
  normalizeCoachPlan,
  normalizeGradeAnalysis,
  matchesHistoryFilters
};
