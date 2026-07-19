const { submitEssayTask } = require('./request');
const { saveHistoryItem } = require('./storage');
const { uid, summarizeText } = require('./format');
const { modeLabelMap, typeLabelMap, bandLabelMap, resolveBandValue } = require('./constants');

async function submitTaskAndOpenReport(payload, options = {}) {
  const handlers = {};
  if (typeof options.onStatus === 'function') {
    handlers.onStatus = options.onStatus;
  }
  if (typeof options.onChunk === 'function') {
    handlers.onChunk = options.onChunk;
  }

  const result = await submitEssayTask(payload, handlers);
  const session = composeSession(result, payload);
  getApp().globalData.currentResult = session;
  saveHistoryItem(session);
  return session;
}

function composeSession(result, payload) {
  return {
    id: result.id || uid('session'),
    clientRequestId: result.clientRequestId || payload.clientRequestId || '',
    mode: payload.mode,
    modeLabel: modeLabelMap[payload.mode] || payload.mode,
    essayType: payload.essayType,
    essayTypeLabel: typeLabelMap[payload.essayType] || payload.essayType,
    coachStage: payload.mode === 'coach' ? payload.coachStage || '' : '',
    coachMode: payload.mode === 'coach' ? payload.coachMode || '' : '',
    band: payload.mode === 'grade' ? '' : (payload.band || 'band2'),
    bandLabel: payload.mode === 'grade' ? '' : (bandLabelMap[payload.band] || ''),
    bandValue: payload.mode === 'grade' ? '' : resolveBandValue(payload.band),
    content: result.content || '',
    wordCount: Number(result.wordCount || 0),
    scoreText: result.scoreText || '',
    summary: summarizeText(
      payload.taskContent
      || payload.draftText
      || payload.sourceMaterial
      || result.content
    ),
    coachPlan: result.coachPlan || null,
    analysis: result.analysis || null,
    promptSnapshot: {
      taskContent: payload.taskContent || '',
      sourceMaterial: payload.sourceMaterial || '',
      draftText: payload.draftText || '',
      requirements: payload.requirements || ''
    },
    source: result.source || 'remote',
    taskStatus: 'SUCCESS',
    createdAt: Date.now(),
    sourceType: 'local'
  };
}

function resolveTaskRequestError(error) {
  if (error && error.code === 'REQUEST_IN_PROGRESS') {
    return '上一条相同请求还在处理中，先别重复点。';
  }
  if (error && error.code === 'REQUEST_ALREADY_FAILED') {
    return '上一条相同请求已经失败，请重新提交一次。';
  }
  const rawMessage = String((error && error.message) || (error && error.errMsg) || '').trim();
  if (!rawMessage) {
    return '请求失败，请稍后再试';
  }
  if (rawMessage.includes('127.0.0.1') || rawMessage.includes('localhost')) {
    return '当前还在请求本地地址，真机访问不到，请换成线上 HTTPS 域名。';
  }
  if (/timeout/i.test(rawMessage)) {
    return '请求超时，请确认后端服务正常。';
  }
  if (rawMessage.includes('网络请求失败')) {
    return '网络请求失败，请检查域名、HTTPS 和服务状态。';
  }
  return rawMessage.slice(0, 60);
}

function shouldReuseClientRequestId(error) {
  const code = String((error && error.code) || '').trim();
  return [
    'REQUEST_TIMEOUT',
    'LOCALHOST_UNREACHABLE',
    'REQUEST_NETWORK_FAILED',
    'REQUEST_TRANSPORT_FAILED',
    'REQUEST_IN_PROGRESS'
  ].includes(code);
}

module.exports = {
  submitTaskAndOpenReport,
  resolveTaskRequestError,
  shouldReuseClientRequestId
};
