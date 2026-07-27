const { config, getRemoteConfigIssues, isLocalhostUrl } = require('./config');
const { countEnglishWords, uid } = require('./format');
const { getAuthToken, getOpenId, getLoginCode, saveAuthSession, isAuthSessionValid, clearAuthSession } = require('./auth');
const { normalizeScoreDimensions } = require('./report-view-model');
const { getDeviceId } = require('./device-id');
const {
  getHistory,
  normalizeSessionRecord,
  deleteHistoryItem: deleteLocalHistoryItem,
  clearHistoryByFilter
} = require('./storage');

function submitEssayTask(payload, handlers = {}) {
  return requestRemote(payload, handlers);
}

function extractOcrText(options = {}) {
  return uploadOcrImage(options);
}

function fetchEssayHistory(limit = 20, filters = {}) {
  return fetchEssayHistoryPage({
    offset: 0,
    limit,
    filters
  }).then((page) => page.items);
}

function fetchBackendHealthStatus() {
  const configIssues = getRemoteConfigIssues(config);
  if (configIssues.length) {
    return Promise.resolve(buildInvalidRemoteConfigHealthStatus(configIssues));
  }

  return requestPublicJson(config.healthEndpoint, {
    timeout: 12000
  }).then((data) => normalizeBackendHealthResponse(data, 'remote'));
}

function fetchAccountEntitlement() {
  return requestJson(config.entitlementEndpoint);
}

function fetchStudyProfile(essayType = 'application') {
  const normalizedType = essayType === 'continuation' ? 'continuation' : 'application';
  return requestJson(`${config.studyProfileEndpoint}?essayType=${encodeURIComponent(normalizedType)}`)
    .then((data) => normalizeStudyProfile(data));
}

function fetchBillingPlans() {
  return requestJson(config.billingPlansEndpoint);
}

function activateMembershipPlan(planCode, autoRenew = false, billingMode = config.billingMode) {
  if (billingMode === 'disabled') {
    return Promise.reject(createRequestError('当前正式版已关闭联调会员开通入口，请接入真实支付后再开放购买', 'BILLING_DISABLED'));
  }

  if (billingMode === 'live') {
    return activateLiveMembershipPlan(planCode, autoRenew);
  }

  return requestJson(config.debugSubscriptionEndpoint, {
    method: 'POST',
    data: {
      planCode,
      autoRenew
    }
  });
}

async function activateLiveMembershipPlan(planCode, autoRenew = false) {
  const order = await requestJson(config.subscriptionCreateOrderEndpoint, {
    method: 'POST',
    data: {
      planCode,
      autoRenew
    },
    timeout: 20000
  });

  if (!order || !order.outTradeNo || !order.payParams) {
    throw createRequestError('支付下单成功，但未拿到可用的支付参数', 'PAYMENT_ORDER_INVALID');
  }

  await requestMiniProgramPayment(order.payParams);
  const finalState = await pollPaymentOrder(order.outTradeNo);
  if (finalState && finalState.paid && finalState.entitlement) {
    return finalState.entitlement;
  }

  if (isTerminalPaymentFailure(finalState && finalState.status)) {
    throw createRequestError(resolvePaymentFailureMessage(finalState), finalState.status || 'PAYMENT_FAILED');
  }

  throw createRequestError(
    (finalState && finalState.syncMessage) || '支付已发起，会员状态还在确认中，请稍后回到首页再看一次。',
    'PAYMENT_PENDING'
  );
}

function fetchEssayHistoryPage(options = {}) {
  const offset = Number(options.offset || 0);
  const limit = Number(options.limit || 20);
  const filters = options.filters || {};

  return requestJson(buildHistoryUrl(offset, limit, filters))
    .then((data) => normalizeHistoryPageResponse(data, offset, limit, 'remote'));
}

function fetchEssayHistoryDetail(id) {
  return requestJson(`${config.historyEndpoint}/${encodeURIComponent(id)}`)
    .then((data) =>
      normalizeSessionRecord({
        ...data,
        sourceType: 'remote'
      })
    );
}

function deleteEssayHistoryItem(id, sourceType = 'remote') {
  if (sourceType === 'local') {
    const beforeSize = getHistory().length;
    deleteLocalHistoryItem(id);
    return Promise.resolve({
      affectedCount: beforeSize === getHistory().length ? 0 : 1
    });
  }

  return requestJson(`${config.historyEndpoint}/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  }).then((data) => {
    deleteLocalHistoryItem(id);
    return data || {
      affectedCount: 1
    };
  });
}

function clearEssayHistory(filters = {}, sourceType = 'remote') {
  if (sourceType === 'local') {
    const beforeSize = applyHistoryFilters(getHistory(), filters).length;
    clearHistoryByFilter(filters);
    return Promise.resolve({
      affectedCount: beforeSize
    });
  }

  return requestJson(buildHistoryClearUrl(filters), {
    method: 'DELETE'
  }).then((data) => {
    clearHistoryByFilter(filters);
    return data || {
      affectedCount: 0
    };
  });
}

async function fetchChallenge(token) {
  try {
    const res = await new Promise((resolve, reject) => {
      wx.request({
        url: `${config.apiBaseUrl}${config.challengeEndpoint}`,
        method: 'GET',
        timeout: 8000,
        header: {
          'content-type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
          'X-Device-ID': getDeviceId()
        },
        success: resolve,
        fail: reject
      });
    });
    const parsed = parseRequestPayload(res.data);
    const apiResponse = unwrapApiResponse(parsed);
    if (res.statusCode >= 200 && res.statusCode < 300 && !apiResponse.error) {
      return String((apiResponse.data && apiResponse.data.challenge) || '');
    }
    return '';
  } catch (e) {
    return '';
  }
}

async function requestRemote(payload, handlers = {}, hasRetried = false) {
  assertRemoteConfigReady();
  const authContext = await prepareAuthorizedContext();
  const token = authContext.token;
  const openId = authContext.openId;
  const challenge = await fetchChallenge(token);
  const requestData = {
    ...payload,
    wxCode: authContext.loginCode,
    openId
  };

  return new Promise((resolve, reject) => {
    const streamState = {
      partialText: '',
      finalMeta: {}
    };

    const requestTask = wx.request({
      url: `${config.apiBaseUrl}${config.endpoint}`,
      method: 'POST',
      timeout: 120000,
      enableChunked: !!config.enableChunked,
      responseType: 'arraybuffer',
      header: {
        'content-type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
        'X-Challenge': challenge || '',
        'X-Device-ID': getDeviceId()
      },
      data: requestData,
      success(res) {
        if (res.statusCode === 401 && !hasRetried) {
          clearAuthSession();
          requestRemote(payload, handlers, true).then(resolve).catch(reject);
          return;
        }
        const rawText = decodeArrayBuffer(res.data);
        const parsed = tryParseJson(rawText) || parseFinalPayloadFromStream(rawText, streamState);
        const apiResponse = unwrapApiResponse(parsed);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (apiResponse.error) {
            reject(createRequestError(apiResponse.message, apiResponse.code));
            return;
          }
          const normalizedPayload = apiResponse.data || parsed;
          if (normalizedPayload.token || normalizedPayload.openId) {
            saveAuthSession(normalizedPayload);
          }
          resolve(normalizeResponse(normalizedPayload, payload));
          return;
        }
        reject(createRequestError(apiResponse.message || `请求失败：HTTP ${res.statusCode}`, apiResponse.code));
      },
      fail(err) {
        reject(normalizeTransportError(err, `${config.apiBaseUrl}${config.endpoint}`));
      }
    });

    if (config.enableChunked && requestTask && typeof requestTask.onChunkReceived === 'function') {
      bindChunkEvents(requestTask, handlers, streamState);
    }
  });
}

async function requestJson(path, options = {}, hasRetried = false) {
  assertRemoteConfigReady();
  const authContext = await prepareAuthorizedContext();
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.apiBaseUrl}${path}`,
      method: options.method || 'GET',
      timeout: options.timeout || 15000,
      header: {
        'content-type': 'application/json',
        Authorization: authContext.token ? `Bearer ${authContext.token}` : ''
      },
      data: options.data || {},
      success(res) {
        if (res.statusCode === 401 && !hasRetried) {
          clearAuthSession();
          requestJson(path, options, true).then(resolve).catch(reject);
          return;
        }

        const parsedPayload = parseRequestPayload(res.data);
        const apiResponse = unwrapApiResponse(parsedPayload);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (apiResponse.error) {
            reject(createRequestError(apiResponse.message, apiResponse.code));
            return;
          }
          if (apiResponse.data && (apiResponse.data.token || apiResponse.data.openId)) {
            saveAuthSession(apiResponse.data);
          }
          resolve(apiResponse.data);
          return;
        }

        reject(createRequestError(apiResponse.message || `请求失败：HTTP ${res.statusCode}`, apiResponse.code));
      },
      fail(err) {
        reject(normalizeTransportError(err, `${config.apiBaseUrl}${path}`));
      }
    });
  });
}

async function uploadOcrImage(options = {}, hasRetried = false) {
  assertRemoteConfigReady();
  const filePath = options.filePath || '';
  const scene = options.scene || 'task';

  if (!filePath) {
    throw new Error('缺少待识别图片');
  }

  const authContext = await prepareAuthorizedContext();
  const challenge = await fetchChallenge(authContext.token);

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${config.apiBaseUrl}${config.ocrEndpoint}`,
      filePath,
      name: 'file',
      timeout: 30000,
      header: {
        Authorization: authContext.token ? `Bearer ${authContext.token}` : '',
        'X-Challenge': challenge || '',
        'X-Device-ID': getDeviceId()
      },
      formData: {
        scene
      },
      success(res) {
        if (res.statusCode === 401 && !hasRetried) {
          clearAuthSession();
          uploadOcrImage(options, true).then(resolve).catch(reject);
          return;
        }

        const parsedPayload = parseRequestPayload(res.data);
        const apiResponse = unwrapApiResponse(parsedPayload);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (apiResponse.error) {
            reject(createRequestError(apiResponse.message, apiResponse.code));
            return;
          }
          resolve(normalizeOcrResponse(apiResponse.data || parsedPayload, scene));
          return;
        }

        reject(createRequestError(apiResponse.message || `OCR 请求失败：HTTP ${res.statusCode}`, apiResponse.code));
      },
      fail(err) {
        reject(normalizeTransportError(err, `${config.apiBaseUrl}${config.ocrEndpoint}`));
      }
    });
  });
}

function assertRemoteConfigReady() {
  const configIssues = getRemoteConfigIssues(config);

  if (configIssues.length) {
    throw new Error(configIssues[0]);
  }
}

function requestPublicJson(path, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.apiBaseUrl}${path}`,
      method: options.method || 'GET',
      timeout: options.timeout || 15000,
      header: {
        'content-type': 'application/json'
      },
      data: options.data || {},
      success(res) {
        const parsedPayload = parseRequestPayload(res.data);
        const apiResponse = unwrapApiResponse(parsedPayload);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (apiResponse.error) {
            reject(createRequestError(apiResponse.message, apiResponse.code));
            return;
          }
          resolve(apiResponse.data);
          return;
        }

        reject(createRequestError(apiResponse.message || `请求失败：HTTP ${res.statusCode}`, apiResponse.code));
      },
      fail(err) {
        reject(normalizeTransportError(err, `${config.apiBaseUrl}${path}`));
      }
    });
  });
}

async function prepareAuthorizedContext() {
  const cachedOpenId = getOpenId();
  const needsFreshLogin = !isAuthSessionValid() || !cachedOpenId;
  const loginCode = needsFreshLogin ? await getLoginCode().catch(() => '') : '';
  const session = await ensureAuthSession(loginCode);
  return {
    loginCode,
    token: session.token || getAuthToken(),
    openId: session.openId || cachedOpenId
  };
}

async function ensureAuthSession(loginCode) {
  const localToken = getAuthToken();
  const localOpenId = getOpenId();
  if (isAuthSessionValid()) {
    return {
      token: localToken,
      openId: localOpenId
    };
  }

  if (!config.authEndpoint || !loginCode) {
    return {
      token: localToken,
      openId: localOpenId
    };
  }

  return new Promise((resolve) => {
    wx.request({
      url: `${config.apiBaseUrl}${config.authEndpoint}`,
      method: 'POST',
      timeout: 12000,
      header: {
        'content-type': 'application/json'
      },
      data: {
        code: loginCode
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const apiResponse = unwrapApiResponse(res.data || {});
          const data = apiResponse.data || {};
          saveAuthSession(data);
          resolve({
            token: data.token || localToken,
            openId: data.openId || localOpenId
          });
          return;
        }
        resolve({
          token: localToken,
          openId: localOpenId
        });
      },
      fail() {
        resolve({
          token: localToken,
          openId: localOpenId
        });
      }
    });
  });
}

function bindChunkEvents(requestTask, handlers, streamState) {
  const decoder = createDecoder();
  let streamText = '';

  if (handlers.onStatus) {
    handlers.onStatus('请求已发出，正在等待服务端流式响应...');
  }

  requestTask.onChunkReceived((chunkRes) => {
    const chunkText = decoder.decode(chunkRes.data);
    streamText += chunkText;
    const parsed = parseSseLikeBuffer(streamText);
    streamText = parsed.rest;

    parsed.events.forEach((event) => {
      if (event.type === 'status' && handlers.onStatus) {
        handlers.onStatus(event.content);
        return;
      }
      if (event.type === 'meta') {
        streamState.finalMeta = {
          ...streamState.finalMeta,
          ...(tryParseJson(event.content) || {})
        };
        if (streamState.finalMeta.token || streamState.finalMeta.openId) {
          saveAuthSession(streamState.finalMeta);
        }
        return;
      }
      if (event.type === 'done') {
        return;
      }
      streamState.partialText += event.content;
      if (handlers.onChunk) {
        handlers.onChunk(event.content);
      }
    });
  });
}

function normalizeResponse(raw, payload) {
  const data = raw && raw.data ? raw.data : raw;
  const content =
    data.content ||
    data.result ||
    data.output ||
    joinSections(data.sections) ||
    '接口已响应，但未返回可显示内容。';

  return {
    id: data.id || uid('remote'),
    clientRequestId: data.clientRequestId || payload.clientRequestId || '',
    mode: payload.mode,
    essayType: payload.essayType,
    coachStage: payload.mode === 'coach' ? payload.coachStage || '' : '',
    coachMode: payload.mode === 'coach' ? payload.coachMode || '' : '',
    band: payload.band || 'band2',
    content,
    wordCount: Number(data.wordCount || data.words || 0) || (payload.mode === 'generate' ? countEnglishWords(content) : 0),
    scoreText: data.scoreText || data.score || '',
    source: 'remote',
    coachPlan: normalizeCoachPlan(data.coachPlan),
    analysis: normalizeGradeAnalysis(data.analysis)
  };
}

function normalizeStudyProfile(data = {}) {
  const tags = Array.isArray(data.tags)
    ? data.tags.map((tag) => ({
        code: String(tag.code || ''),
        label: String(tag.label || ''),
        hitCount: Number(tag.hitCount || 0)
      }))
    : [];

  return {
    ready: !!data.ready,
    title: String(data.title || '你的提分档案还没开始'),
    headline: String(data.headline || ''),
    nextFocus: String(data.nextFocus || ''),
    tags,
    sampleSize: Number(data.sampleSize || 0),
    badgeText: String(data.badgeText || ''),
    applicationCount: Number(data.applicationCount || 0),
    continuationCount: Number(data.continuationCount || 0),
    latestScoreText: String(data.latestScoreText || ''),
    lastUpdatedText: String(data.lastUpdatedText || ''),
    primaryActionLabel: String(data.primaryActionLabel || '继续提分'),
    secondaryActionLabel: String(data.secondaryActionLabel || '查看最近批改'),
    primaryActionKind: String(data.primaryActionKind || 'continue_grade'),
    secondaryActionKind: String(data.secondaryActionKind || 'view_latest_grade'),
    suggestedEssayType: String(data.suggestedEssayType || '') === 'continuation' ? 'continuation' : 'application',
    growth: data.growth || null
  };
}

function normalizeOcrResponse(data, scene) {
  const text = String((data && data.text) || (data && data.content) || '').trim();
  return {
    text,
    lineCount: Number(data && data.lineCount) || countTextLines(text),
    source: (data && data.source) || 'remote',
    provider: (data && data.provider) || 'ocr',
    scene: (data && data.scene) || scene || 'task'
  };
}

function buildLocalHistoryPage(offset, limit, filters = {}) {
  const filtered = applyHistoryFilters(getHistory(), filters);
  const items = filtered.slice(offset, offset + limit).map((item) => ({
    ...item,
    sourceType: 'local'
  }));
  return {
    items,
    offset,
    limit,
    hasMore: offset + limit < filtered.length,
    nextOffset: offset + items.length,
    sourceType: 'local'
  };
}

function findLocalHistoryDetail(id) {
  const target = getHistory().find((item) => item.id === id);
  if (!target) {
    return Promise.reject(new Error('未找到对应的历史记录'));
  }
  return {
    ...target,
    sourceType: 'local'
  };
}

function parseRequestPayload(payload) {
  if (typeof payload === 'string') {
    return tryParseJson(payload) || {};
  }
  if (payload && typeof payload === 'object' && typeof payload.byteLength === 'number') {
    return tryParseJson(decodeArrayBuffer(payload)) || {};
  }
  return payload || {};
}

function buildHistoryUrl(offset, limit, filters = {}) {
  const params = [
    `offset=${Math.max(offset, 0)}`,
    `limit=${Math.min(Math.max(limit, 1), 20)}`
  ];
  if (filters.mode && filters.mode !== 'all') {
    params.push(`mode=${encodeURIComponent(filters.mode)}`);
  }
  if (filters.essayType && filters.essayType !== 'all') {
    params.push(`essayType=${encodeURIComponent(filters.essayType)}`);
  }
  if (filters.taskStatus && filters.taskStatus !== 'all') {
    params.push(`taskStatus=${encodeURIComponent(filters.taskStatus)}`);
  }
  return `${config.historyEndpoint}?${params.join('&')}`;
}

function buildHistoryClearUrl(filters = {}) {
  const params = [];
  if (filters.mode && filters.mode !== 'all') {
    params.push(`mode=${encodeURIComponent(filters.mode)}`);
  }
  if (filters.essayType && filters.essayType !== 'all') {
    params.push(`essayType=${encodeURIComponent(filters.essayType)}`);
  }
  if (filters.taskStatus && filters.taskStatus !== 'all') {
    params.push(`taskStatus=${encodeURIComponent(filters.taskStatus)}`);
  }
  return params.length ? `${config.historyEndpoint}?${params.join('&')}` : config.historyEndpoint;
}

function normalizeHistoryPageResponse(data, fallbackOffset, fallbackLimit, sourceType) {
  if (Array.isArray(data)) {
    const items = data.map((item) =>
      normalizeSessionRecord({
        ...item,
        sourceType
      })
    );
    return {
      items,
      offset: fallbackOffset,
      limit: fallbackLimit,
      hasMore: false,
      nextOffset: fallbackOffset + items.length,
      sourceType
    };
  }

  const records = Array.isArray(data && data.items) ? data.items : [];
  const items = records.map((item) =>
    normalizeSessionRecord({
      ...item,
      sourceType
    })
  );
  const offset = Number(data && data.offset) || fallbackOffset;
  const limit = Number(data && data.limit) || fallbackLimit;
  const nextOffset = Number(data && data.nextOffset);

  return {
    items,
    offset,
    limit,
    hasMore: !!(data && data.hasMore),
    nextOffset: Number.isFinite(nextOffset) ? nextOffset : offset + items.length,
    sourceType
  };
}

function applyHistoryFilters(records, filters = {}) {
  return records.filter((item) => {
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
  });
}

function parseSseLikeBuffer(buffer) {
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() || '';
  const events = [];
  let currentEventName = '';

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      currentEventName = '';
      return;
    }
    if (trimmed.startsWith('event:')) {
      currentEventName = trimmed.slice(6).trim();
      return;
    }
    if (trimmed.startsWith('data:')) {
      const body = trimmed.slice(5).trim();
      const json = tryParseJson(body);
      if (json && json.type) {
        events.push({
          type: json.type,
          content: json.content || json.text || ''
        });
      } else {
        events.push({
          type: currentEventName || 'chunk',
          content: body
        });
      }
      return;
    }
    events.push({
      type: currentEventName || 'chunk',
      content: trimmed
    });
  });

  return {
    events,
    rest
  };
}

function parseFinalPayloadFromStream(rawText, streamState) {
  const parsed = parseSseLikeBuffer(rawText);
  const meta = {
    ...streamState.finalMeta
  };
  let finalText = streamState.partialText || '';

  parsed.events.forEach((event) => {
    if (event.type === 'meta') {
      Object.assign(meta, tryParseJson(event.content) || {});
      return;
    }
    if (event.type === 'chunk' && !streamState.partialText) {
      finalText += event.content;
    }
  });

  return {
    ...meta,
    content: meta.content || meta.finalText || finalText
  };
}

function createDecoder() {
  if (typeof TextDecoder !== 'undefined') {
    const decoder = new TextDecoder('utf-8');
    return {
      decode(buffer) {
        return decoder.decode(buffer, { stream: true });
      }
    };
  }

  return {
    decode(buffer) {
      const bytes = new Uint8Array(buffer);
      let result = '';
      bytes.forEach((byte) => {
        result += String.fromCharCode(byte);
      });
      return decodeURIComponent(escape(result));
    }
  };
}

function decodeArrayBuffer(data) {
  if (typeof data === 'string') {
    return data;
  }
  return createDecoder().decode(data);
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function unwrapApiResponse(payload) {
  if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'success')) {
    if (payload.success === false) {
      return {
        error: true,
        code: payload.code || 'UNKNOWN_ERROR',
        message: payload.message || '请求失败'
      };
    }
    return {
      error: false,
      code: payload.code || 'OK',
      data: payload.data || {},
      message: payload.message || ''
    };
  }

  return {
    error: false,
    code: 'OK',
    data: payload,
    message: ''
  };
}

function createRequestError(message, code = 'REQUEST_ERROR') {
  const error = new Error(message || '请求失败');
  error.code = code || 'REQUEST_ERROR';
  return error;
}

function normalizeTransportError(error, url = '') {
  const errText = String((error && error.errMsg) || (error && error.message) || '').trim();
  const normalizedUrl = String(url || '');

  if (/timeout/i.test(errText)) {
    return createRequestError('请求超时了，请确认后端服务已启动，并且当前环境能访问这个接口地址。', 'REQUEST_TIMEOUT');
  }

  if (isLocalhostUrl(normalizedUrl)) {
    return createRequestError(
      '当前请求地址还是 127.0.0.1 / localhost。开发者工具本机联调可以用，但真机或远程调试访问不到你电脑本机服务。',
      'LOCALHOST_UNREACHABLE'
    );
  }

  if (/fail/i.test(errText)) {
    return createRequestError('网络请求失败，请确认后端地址、服务状态和 HTTPS 配置是否正常。', 'REQUEST_NETWORK_FAILED');
  }

  return createRequestError(errText || '网络请求失败，请稍后再试。', 'REQUEST_TRANSPORT_FAILED');
}

function requestMiniProgramPayment(payParams = {}) {
  if (typeof wx.requestPayment !== 'function') {
    return Promise.reject(createRequestError('当前环境不支持拉起微信支付', 'PAYMENT_NOT_SUPPORTED'));
  }

  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: String(payParams.timeStamp || ''),
      nonceStr: String(payParams.nonceStr || ''),
      package: String(payParams.package || ''),
      signType: String(payParams.signType || 'RSA'),
      paySign: String(payParams.paySign || ''),
      success() {
        resolve();
      },
      fail(error) {
        const errText = String((error && error.errMsg) || '');
        if (/cancel/i.test(errText)) {
          reject(createRequestError('你已取消支付，本次不会扣费。', 'PAYMENT_CANCELLED'));
          return;
        }
        reject(createRequestError('微信支付没有完成，请稍后重试。', 'PAYMENT_REQUEST_FAILED'));
      }
    });
  });
}

async function pollPaymentOrder(outTradeNo) {
  let latest = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    latest = await requestJson(`${config.billingOrderStatusEndpoint}/${encodeURIComponent(outTradeNo)}`, {
      timeout: 15000
    });
    if (latest && latest.paid) {
      return latest;
    }
    if (isTerminalPaymentFailure(latest && latest.status)) {
      return latest;
    }
    await delay(1500);
  }
  return latest;
}

function isTerminalPaymentFailure(status) {
  const normalized = String(status || '').toUpperCase();
  return ['CLOSED', 'REVOKED', 'PAYERROR'].includes(normalized);
}

function resolvePaymentFailureMessage(result) {
  const status = String((result && result.status) || '').toUpperCase();
  if (status === 'CLOSED') {
    return '订单已关闭，请重新发起支付。';
  }
  if (status === 'REVOKED') {
    return '这笔支付已被撤销，请重新发起。';
  }
  if (status === 'PAYERROR') {
    return '支付没有成功，请检查支付账户后重试。';
  }
  return (result && result.syncMessage) || '支付没有完成，请稍后再试。';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function joinSections(sections) {
  if (!Array.isArray(sections)) {
    return '';
  }
  return sections
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }
      if (!item) {
        return '';
      }
      const title = item.title ? `【${item.title}】` : '';
      const body = item.content || item.text || '';
      return `${title}\n${body}`.trim();
    })
    .filter(Boolean)
    .join('\n\n');
}

function buildPlaceholderBackendHealthStatus() {
  return normalizeBackendHealthResponse(
    {
      status: 'placeholder',
      reviewReady: false,
      issues: [
        '当前 apiBaseUrl 还是占位域名，无法请求真实 /api/health。',
        '请先切到 release 档位，并把域名改成已备案的 HTTPS 服务地址。'
      ]
    },
    'placeholder'
  );
}

function buildInvalidRemoteConfigHealthStatus(issues) {
  return normalizeBackendHealthResponse(
    {
      status: 'config-invalid',
      reviewReady: false,
      issues
    },
    'config-invalid'
  );
}

function normalizeBackendHealthResponse(data, source) {
  const issues = Array.isArray(data && data.issues)
    ? data.issues.filter(Boolean).map((item) => String(item))
    : [];
  const issuesCount = Number(data && data.issuesCount);
  const rawCapabilities = data && typeof data.capabilities === 'object' && data.capabilities
    ? data.capabilities
    : {};
  return {
    status: String((data && data.status) || 'unknown'),
    reviewReady: !!(data && data.reviewReady) && issues.length === 0,
    issuesCount: Number.isFinite(issuesCount) ? issuesCount : issues.length,
    issues,
    source: source || 'remote',
    capabilities: {
      generationAvailable: !!rawCapabilities.generationAvailable,
      generationMode: String(rawCapabilities.generationMode || ''),
      ocrEnabled: !!rawCapabilities.ocrEnabled,
      ocrMode: String(rawCapabilities.ocrMode || ''),
      debugSubscriptionEnabled: !!rawCapabilities.debugSubscriptionEnabled,
      paymentEnabled: !!rawCapabilities.paymentEnabled,
      paymentMode: String(rawCapabilities.paymentMode || ''),
      storageMode: String(rawCapabilities.storageMode || ''),
      authMode: String(rawCapabilities.authMode || '')
    }
  };
}

function normalizeGradeAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object') {
    return null;
  }

  const weaknessProfile = analysis.weaknessProfile && typeof analysis.weaknessProfile === 'object'
    ? {
        headline: String(analysis.weaknessProfile.headline || ''),
        nextFocus: String(analysis.weaknessProfile.nextFocus || ''),
        sampleSize: Number(analysis.weaknessProfile.sampleSize || 0),
        tags: Array.isArray(analysis.weaknessProfile.tags)
          ? analysis.weaknessProfile.tags.map((tag) => ({
              code: String((tag && tag.code) || ''),
              label: String((tag && tag.label) || ''),
              hitCount: Number((tag && tag.hitCount) || 0)
            }))
          : []
      }
    : null;

  return {
    typeJudgment: String(analysis.typeJudgment || ''),
    wordCountRisk: String(analysis.wordCountRisk || ''),
    alignmentDiagnosis: String(analysis.alignmentDiagnosis || ''),
    languageFitnessDiagnosis: String(analysis.languageFitnessDiagnosis || ''),
    flowDiagnosis: String(analysis.flowDiagnosis || ''),
    machineRiskDiagnosis: String(analysis.machineRiskDiagnosis || ''),
    contentDiagnosis: String(analysis.contentDiagnosis || ''),
    structureDiagnosis: String(analysis.structureDiagnosis || ''),
    languageDiagnosis: String(analysis.languageDiagnosis || ''),
    highlightDiagnosis: String(analysis.highlightDiagnosis || ''),
    lossPointDiagnosis: String(analysis.lossPointDiagnosis || ''),
    overallComment: String(analysis.overallComment || ''),
    secondDraftGuidance: String(analysis.secondDraftGuidance || ''),
    improvedEssay: String(analysis.improvedEssay || ''),
    scoreDimensions: normalizeScoreDimensions(analysis.scoreDimensions),
    sentenceDiagnostics: Array.isArray(analysis.sentenceDiagnostics)
      ? analysis.sentenceDiagnostics
        .map((item) => ({
          original: String((item && item.original) || ''),
          diagnosis: String((item && item.diagnosis) || ''),
          revision: String((item && item.revision) || '')
        }))
        .filter((item) => item.original || item.diagnosis || item.revision)
      : [],
    weaknessProfile
  };
}

function normalizeCoachPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return null;
  }

  return {
    stage: String(plan.stage || ''),
    coachingMode: String(plan.coachingMode || ''),
    typeJudgment: String(plan.typeJudgment || ''),
    identityTone: String(plan.identityTone || ''),
    templateId: String(plan.templateId || ''),
    scenario: String(plan.scenario || ''),
    taskPurpose: String(plan.taskPurpose || ''),
    officialLogic: String(plan.officialLogic || ''),
    opening: String(plan.opening || ''),
    body: String(plan.body || ''),
    ending: String(plan.ending || ''),
    clueReuse: String(plan.clueReuse || ''),
    emotionalFlow: String(plan.emotionalFlow || ''),
    secondOpeningBridge: String(plan.secondOpeningBridge || ''),
    bandRecommendation: String(plan.bandRecommendation || ''),
    bandReason: String(plan.bandReason || ''),
    drillFocus: String(plan.drillFocus || ''),
    successCheck: String(plan.successCheck || ''),
    routeAction: String(plan.routeAction || ''),
    routeReason: String(plan.routeReason || ''),
    writingPriorities: normalizeStringArray(plan.writingPriorities),
    drillTasks: normalizeStringArray(plan.drillTasks),
    mustInclude: normalizeStringArray(plan.mustInclude),
    riskPoints: normalizeStringArray(plan.riskPoints),
    suggestedExpressions: normalizeStringArray(plan.suggestedExpressions)
  };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function countTextLines(text) {
  if (!text) {
    return 0;
  }
  return text.split('\n').length;
}

module.exports = {
  submitEssayTask,
  extractOcrText,
  fetchAccountEntitlement,
  fetchStudyProfile,
  fetchBillingPlans,
  activateMembershipPlan,
  fetchBackendHealthStatus,
  fetchEssayHistory,
  fetchEssayHistoryPage,
  fetchEssayHistoryDetail,
  deleteEssayHistoryItem,
  clearEssayHistory
};
