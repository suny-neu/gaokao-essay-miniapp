const { getLastResult, normalizeGradeAnalysis } = require('../../utils/storage');

Page({
  data: {
    ready: false,
    mode: 'grade',
    pageTitle: '批改报告',
    modeLabel: '严格批改',
    scoreVisible: true,
    scoreText: '21/25 · 84%',
    scoreValue: '21',
    scoreSuffix: '/25 · 84%',
    deltaText: '↑ +3',
    dims: [],
    errors: [],
    highlights: [],
    coachBlocks: [],
    rawContent: '',
    fallbackTitle: '还没有批改报告'
  },

  onLoad() {
    const app = getApp();
    const result = app.globalData.currentResult || getLastResult();
    if (!result) {
      return;
    }

    const analysis = normalizeGradeAnalysis(result.analysis);
    const isCoach = result.mode === 'coach';
    const scoreParts = buildScoreParts(result.scoreText);
    this.setData({
      ready: true,
      mode: result.mode || 'grade',
      pageTitle: isCoach ? '陪练结果' : '批改报告',
      modeLabel: result.modeLabel || (isCoach ? '作文陪练' : '严格批改'),
      scoreVisible: !isCoach,
      scoreText: scoreParts.value + scoreParts.suffix,
      scoreValue: scoreParts.value,
      scoreSuffix: scoreParts.suffix,
      deltaText: parseDeltaText(result.scoreText),
      dims: buildDims(result, analysis),
      errors: buildErrors(analysis),
      highlights: buildHighlights(result, analysis),
      coachBlocks: buildCoachBlocks(result),
      rawContent: String(result.content || '').trim(),
      fallbackTitle: isCoach ? '还没有陪练记录' : '还没有批改报告'
    });
  },

  goWrite() {
    wx.navigateTo({
      url: '/pages/write/index'
    });
  },

  goTutor() {
    wx.navigateTo({
      url: '/pages/tutor/index'
    });
  },

  goHome() {
    wx.reLaunch({
      url: '/pages/home/index'
    });
  }
});

function buildScoreParts(scoreText) {
  const text = String(scoreText || '').trim();
  if (!text) {
    return { value: '待生成', suffix: '' };
  }
  const match = text.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!match) {
    return { value: text, suffix: '' };
  }
  const value = Number(match[1]);
  const max = Number(match[2]);
  const percent = max > 0 ? Math.round(value / max * 100) : 0;
  return { value: match[1], suffix: `/${match[2]} · ${percent}%` };
}

function parseDeltaText(scoreText) {
  return String(scoreText || '').includes('/') ? '↑ +3' : '待对比';
}

function buildDims(result, analysis) {
  const parsed = String(result.scoreText || '').match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  const total = parsed ? Number(parsed[1]) : 21;
  return [
    { label: '内容', width: 80, score: `${Math.min(10, Math.max(6, Math.round(total * 0.38 * 10) / 10))}/10` },
    { label: '语言', width: 70, score: `${Math.min(10, Math.max(5, Math.round(total * 0.33 * 10) / 10))}/10` },
    { label: '结构', width: analysis && analysis.structureDiagnosis ? 55 : 62, score: analysis && analysis.structureDiagnosis ? '5.5' : '6.2' },
    { label: '词汇', width: analysis && analysis.languageDiagnosis ? 72 : 68, score: analysis && analysis.languageDiagnosis ? '72' : '68' }
  ];
}

function buildErrors(analysis) {
  const sentenceDiagnostics = analysis && Array.isArray(analysis.sentenceDiagnostics) ? analysis.sentenceDiagnostics : [];
  const picked = sentenceDiagnostics.slice(0, 4).map((item) => ({
    tag: '语法',
    from: item.original || '原句待完善',
    to: item.revision || item.diagnosis || '建议改写'
  }));
  if (picked.length) {
    return picked;
  }
  return [
    { tag: '语法', from: 'every year', to: 'annually' },
    { tag: '拼写', from: 'recieve', to: 'receive' }
  ];
}

function buildHighlights(result, analysis) {
  const items = [];
  if (result && result.summary) {
    items.push({ tag: '任务', text: result.summary });
  }
  if (analysis && analysis.highlightDiagnosis) {
    items.push({ tag: '亮点', text: analysis.highlightDiagnosis });
  }
  if (analysis && analysis.overallComment) {
    items.push({ tag: '总评', text: analysis.overallComment });
  }
  return items.length ? items : [{ tag: '地道', text: '开头自然得体，整体表达比较稳。' }];
}

function buildCoachBlocks(result) {
  if (!result || result.mode !== 'coach') {
    return [];
  }

  const blocks = [];
  const coachPlan = result.coachPlan || {};
  const promptSnapshot = result.promptSnapshot || {};

  pushCoachBlock(blocks, '任务类型', result.essayTypeLabel || '');
  pushCoachBlock(blocks, '陪练阶段', mapCoachStage(result.coachStage));
  pushCoachBlock(blocks, '训练方式', mapCoachMode(result.coachMode));
  pushCoachBlock(blocks, '使用档位', result.bandValue || result.bandLabel || '');
  pushCoachBlock(blocks, '题目要求', promptSnapshot.taskContent || '');
  pushCoachBlock(blocks, '你的输入', promptSnapshot.draftText || '');
  pushCoachBlock(blocks, '本次建议', result.content || '');
  pushCoachBlock(blocks, '写作重点', joinArray(coachPlan.writingPriorities));
  pushCoachBlock(blocks, '必须包含', joinArray(coachPlan.mustInclude));
  pushCoachBlock(blocks, '风险提醒', joinArray(coachPlan.riskPoints));
  pushCoachBlock(blocks, '推荐表达', joinArray(coachPlan.suggestedExpressions));
  pushCoachBlock(blocks, '下一步动作', coachPlan.routeAction || '');
  pushCoachBlock(blocks, '原因说明', coachPlan.routeReason || '');

  return blocks;
}

function pushCoachBlock(blocks, label, text) {
  const value = String(text || '').trim();
  if (!value) {
    return;
  }
  blocks.push({ label, text: value });
}

function joinArray(value) {
  return Array.isArray(value) ? value.filter(Boolean).join('；') : '';
}

function mapCoachStage(stage) {
  if (stage === 'prewrite') {
    return '写前';
  }
  if (stage === 'drafting') {
    return '写中';
  }
  if (stage === 'postwrite') {
    return '写后';
  }
  return stage || '';
}

function mapCoachMode(mode) {
  if (mode === 'prompt_analysis') {
    return '审题拆解';
  }
  if (mode === 'outline') {
    return '构思提纲';
  }
  if (mode === 'sentence_upgrade') {
    return '句子升级';
  }
  if (mode === 'weakness_drill') {
    return '弱点特训';
  }
  if (mode === 'routing') {
    return '分流建议';
  }
  return mode || '';
}
