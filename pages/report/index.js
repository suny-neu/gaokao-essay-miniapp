const { getLastResult, normalizeGradeAnalysis, saveHistoryItem } = require('../../utils/storage');
const { buildReportViewModel } = require('../../utils/report-view-model');
const { fetchModelEssay } = require('../../utils/request');
const { buildModelEssayViewModel, canGenerateModelEssay } = require('../../utils/model-essay');

Page({
  data: {
    ready: false,
    mode: 'grade',
    pageTitle: '批改报告',
    modeLabel: '严格批改',
    scoreVisible: true,
    scoreText: '',
    scoreValue: '',
    scoreSuffix: '',
    deltaText: '',
    dims: [],
    corrections: [],
    upgrades: [],
    contentAdvice: '',
    improvedEssay: '',
    priority: '',
    nextPractice: '',
    legacyNotice: false,
    coachBlocks: [],
    rawContent: '',
    fallbackTitle: '还没有批改报告',
    modelEssayAvailable: false,
    modelEssayLoading: false,
    modelEssayReady: false,
    modelEssayError: '',
    modelEssay: buildModelEssayViewModel(null)
  },

  onLoad() {
    const app = getApp();
    const result = app.globalData.currentResult || getLastResult();
    if (!result) {
      return;
    }

    const analysis = normalizeGradeAnalysis(result.analysis);
    const viewModel = buildReportViewModel({
      ...result,
      analysis
    });
    const isCoach = viewModel.mode === 'coach';
    const modelEssay = buildModelEssayViewModel(analysis && analysis.modelEssay);
    this.currentResult = {
      ...result,
      analysis
    };
    this.setData({
      ready: true,
      mode: viewModel.mode,
      pageTitle: viewModel.pageTitle,
      modeLabel: viewModel.modeLabel,
      scoreVisible: viewModel.scoreVisible,
      scoreText: viewModel.scoreValue + viewModel.scoreSuffix,
      scoreValue: viewModel.scoreValue,
      scoreSuffix: viewModel.scoreSuffix,
      deltaText: viewModel.deltaText,
      dims: viewModel.dims,
      corrections: viewModel.corrections,
      upgrades: viewModel.upgrades,
      contentAdvice: viewModel.contentAdvice,
      improvedEssay: viewModel.improvedEssay,
      priority: viewModel.priority,
      nextPractice: viewModel.nextPractice,
      legacyNotice: viewModel.legacyNotice,
      coachBlocks: buildCoachBlocks(result),
      rawContent: String(result.content || '').trim(),
      fallbackTitle: isCoach ? '还没有陪练记录' : '还没有批改报告',
      modelEssayAvailable: canGenerateModelEssay(this.currentResult),
      modelEssayReady: Boolean(modelEssay.modelEssay),
      modelEssay
    });
  },

  async generateModelEssay() {
    await this.loadModelEssay(false);
  },

  regenerateModelEssay() {
    wx.showModal({
      title: '重新生成范文',
      content: '重新生成将消耗 1 次 AI 额度，已生成的范文会被新结果替换。',
      confirmText: '继续生成',
      success: (result) => {
        if (result.confirm) {
          this.loadModelEssay(true);
        }
      }
    });
  },

  async loadModelEssay(regenerate) {
    if (!this.data.modelEssayAvailable || this.data.modelEssayLoading || !this.currentResult) {
      return;
    }
    this.setData({
      modelEssayLoading: true,
      modelEssayError: ''
    });
    try {
      const payload = await fetchModelEssay(this.currentResult.id, regenerate);
      const modelEssay = buildModelEssayViewModel(payload);
      if (!modelEssay.modelEssay) {
        throw new Error('范文内容为空，请稍后重试');
      }
      this.currentResult = {
        ...this.currentResult,
        analysis: {
          ...(this.currentResult.analysis || {}),
          modelEssay
        }
      };
      saveHistoryItem(this.currentResult);
      const app = getApp();
      app.globalData.currentResult = this.currentResult;
      this.setData({
        modelEssayReady: true,
        modelEssay
      });
    } catch (error) {
      this.setData({
        modelEssayError: String((error && error.message) || '范文生成失败，请稍后重试')
      });
    } finally {
      this.setData({
        modelEssayLoading: false
      });
    }
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
  if (mode === 'sentence_correction') {
    return '检查错误';
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
