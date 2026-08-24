const { uid } = require('../../utils/format');
const { submitTaskAndOpenReport, resolveTaskRequestError, shouldReuseClientRequestId } = require('../../utils/task-flow');
const { extractOcrText, fetchAccountEntitlement } = require('../../utils/request');
const { offerAdRewardDialog, isAdRewardAvailable } = require('../../utils/ad-reward');
const {
  normalizeQuestionFields,
  hasCompleteContinuationQuestion,
  applyQuestionOcr
} = require('../../utils/continuation-question');

const REVIEW_PROGRESS_STAGES = [
  { after: 0, text: '正在检查作文…' },
  { after: 4000, text: '正在分析内容与结构…' },
  { after: 10000, text: '正在生成批改建议…' },
  { after: 17000, text: '即将完成…' }
];

const ESSAY_TYPE_PRESETS = {
  application: {
    taskTag: '议论文 · 100-120 词',
    promptText: '假定你是李华，英国朋友 Peter 来信询问你校的科技创新活动。请回信介绍一项你参与过的活动。',
    draftText: "Dear Peter,\nI'm glad to hear from you. Our school holds a science innovation week every year, and I joined a robotics workshop.",
    requirements: ['字数 100-120', '含 3 个要点'],
    targetWordCount: 120
  },
  continuation: {
    taskTag: '读后续写 · 120-150 词',
    promptText: '请根据所给材料和两段段首句，续写短文，使之构成一篇完整的故事。',
    draftText: '',
    requirements: ['字数 120-150', '分两段续写'],
    targetWordCount: 150
  }
};

Page({
  data: {
    mode: 'grade',
    essayType: 'application',
    taskTag: '议论文 · 100-120 词',
    promptText: '假定你是李华，英国朋友 Peter 来信询问你校的科技创新活动。请回信介绍一项你参与过的活动。',
    sourceMaterial: '',
    paragraphOneStarter: '',
    paragraphTwoStarter: '',
    editingContinuationQuestion: true,
    requirements: ['字数 100-120', '含 3 个要点'],
    draftText: "Dear Peter,\nI'm glad to hear from you. Our school holds a science innovation week every year, and I joined a robotics workshop.",
    questionOcrLoading: false,
    aiHint: {
      from: 'every year',
      to: 'annually'
    },
    wordCount: 20,
    targetWordCount: 120,
    wordCountPercent: 0,
    loading: false,
    submitRequestId: '',
    submitStatus: '',
    ocrLoading: false
  },

  onLoad(query) {
    const mode = query && query.mode === 'coach' ? 'coach' : 'grade';
    const essayType = query && query.type === 'continuation' ? 'continuation' : 'application';
    this.applyEssayType(essayType);
    this.setData({ mode });
    this.refreshWordCount(this.data.draftText);
  },

  chooseEssayType(event) {
    const essayType = event.currentTarget.dataset.type === 'continuation' ? 'continuation' : 'application';
    if (essayType === this.data.essayType) {
      return;
    }
    this.applyEssayType(essayType);
    this.refreshWordCount(this.data.draftText);
  },

  applyEssayType(essayType) {
    const preset = ESSAY_TYPE_PRESETS[essayType] || ESSAY_TYPE_PRESETS.application;
    this.setData({
      essayType,
      taskTag: preset.taskTag,
      promptText: preset.promptText,
      draftText: preset.draftText,
      requirements: preset.requirements,
      targetWordCount: preset.targetWordCount
    });
  },

  handlePromptInput(event) {
    this.setData({
      promptText: event.detail.value || ''
    });
  },

  handleSourceMaterialInput(event) {
    this.setData({
      sourceMaterial: event.detail.value || ''
    });
  },

  handleParagraphOneInput(event) {
    this.setData({
      paragraphOneStarter: event.detail.value || ''
    });
  },

  handleParagraphTwoInput(event) {
    this.setData({
      paragraphTwoStarter: event.detail.value || ''
    });
  },

  startEditingContinuationQuestion() {
    this.setData({
      editingContinuationQuestion: true
    });
  },

  finishEditingContinuationQuestion() {
    if (!hasCompleteContinuationQuestion(this.data)) {
      wx.showToast({
        title: '请补全原文和两段首句',
        icon: 'none'
      });
      return;
    }

    this.setData({
      editingContinuationQuestion: false
    });
  },

  handleDraftInput(event) {
    const draftText = event.detail.value || '';
    this.setData({
      draftText
    });
    this.refreshWordCount(draftText);
  },

  goFormalEditor() {
    this.submitForReview();
  },

  goTutor() {
    wx.navigateTo({
      url: `/pages/tutor/index?type=${this.data.essayType}`
    });
  },
  chooseQuestionImageAndOcr() {
    if (this.data.questionOcrLoading || this.data.ocrLoading || this.data.loading) {
      return;
    }

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      camera: 'back',
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];

        if (file && file.tempFilePath) {
          this.runQuestionOcr(file.tempFilePath);
        }
      },
      fail: (error) => {
        const message = String((error && error.errMsg) || '');

        if (!/cancel/i.test(message)) {
          wx.showToast({
            title: '选择题目图片失败',
            icon: 'none'
          });
        }
      }
    });
  },

  async runQuestionOcr(filePath) {
    this.setData({
      questionOcrLoading: true,
      submitStatus: '正在识别题目…'
    });

    try {
      const result = await extractOcrText({
        filePath,
        scene: 'question'
      });

      const text = String((result && result.text) || '').trim();

      if (!text) {
        throw new Error('没有识别到题目文字，请换一张清晰图片');
      }

      if (this.data.essayType === 'continuation') {
        const question = applyQuestionOcr(this.data, result);
        const fullySplit = hasCompleteContinuationQuestion(question);
        this.setData({
          ...question,
          editingContinuationQuestion: true,
          submitStatus: fullySplit
            ? '已自动拆分原文和两段首句，请逐项校对'
            : '题目已识别，请检查并补全未拆分出的段首句'
        });
      } else {
        this.setData({
          promptText: text,
          submitStatus: '题目识别完成，请检查是否准确'
        });
      }

      wx.showToast({
        title: '题目识别完成',
        icon: 'success'
      });
    } catch (error) {
      const message = String(
        (error && error.message) || '题目识别失败'
      );

      this.setData({
        submitStatus: `题目识别失败：${message}`
      });

      wx.showToast({
        title: message,
        icon: 'none'
      });
    } finally {
      this.setData({
        questionOcrLoading: false
      });
    }
  },
  chooseImageAndOcr() {
    if (this.data.ocrLoading || this.data.loading) {
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      camera: 'back',
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (file && file.tempFilePath) {
          this.runOcr(file.tempFilePath);
        }
      },
      fail: (err) => {
        const msg = String((err && err.errMsg) || '');
        if (!/cancel/i.test(msg)) {
          wx.showToast({ title: '选图失败，请重试', icon: 'none' });
        }
      }
    });
  },

  async runOcr(filePath) {
    this.setData({ ocrLoading: true, submitStatus: '正在识别手写文字…' });
    try {
      const result = await extractOcrText({ filePath, scene: 'task' });
      const text = String((result && result.text) || '').trim();
      if (!text) {
        this.setData({ submitStatus: '没识别到文字，换个清晰点的照片试试。' });
        wx.showToast({ title: '没识别到文字', icon: 'none' });
        return;
      }
      const lines = result && result.lineCount ? `已识别 ${result.lineCount} 行，` : '';
      this.setData({
        draftText: text,
        submitStatus: `${lines}请校对后再提交`
      });
      this.refreshWordCount(text);
      wx.showToast({ title: '识别完成，记得校对', icon: 'none' });
    } catch (error) {
      const message = String((error && error.message) || '识别失败');
      this.setData({ submitStatus: `识别失败：${message}` });
      wx.showToast({ title: message, icon: 'none' });
    } finally {
      this.setData({ ocrLoading: false });
    }
  },
  startReviewProgress() {
    this.stopReviewProgress();

    const startedAt = Date.now();
    this.setData({
      submitStatus: REVIEW_PROGRESS_STAGES[0].text
    });

    this.reviewProgressTimer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      let currentText = REVIEW_PROGRESS_STAGES[0].text;

      REVIEW_PROGRESS_STAGES.forEach((stage) => {
        if (elapsed >= stage.after) {
          currentText = stage.text;
        }
      });

      if (currentText !== this.data.submitStatus) {
        this.setData({
          submitStatus: currentText
        });
      }
    }, 500);
  },

  stopReviewProgress() {
    if (this.reviewProgressTimer) {
      clearInterval(this.reviewProgressTimer);
      this.reviewProgressTimer = null;
    }
  },
  async submitForReview() {
    if (this.data.loading || this.data.ocrLoading || this.data.questionOcrLoading) {
      return;
    }

    const draftText = String(this.data.draftText || '').trim();
    if (!draftText) {
      wx.showToast({
        title: '请先写一点作文内容',
        icon: 'none'
      });
      return;
    }

    const isContinuation = this.data.essayType === 'continuation';
    const {
      sourceMaterial,
      paragraphOneStarter,
      paragraphTwoStarter
    } = normalizeQuestionFields(this.data);

    if (isContinuation && !sourceMaterial) {
      wx.showToast({
        title: '请先填写原文材料',
        icon: 'none'
      });
      return;
    }

    if (isContinuation && (!paragraphOneStarter || !paragraphTwoStarter)) {
      wx.showToast({
        title: '请填写两段段首句',
        icon: 'none'
      });
      return;
    }

    const payload = {
      clientRequestId: this.data.submitRequestId || uid('req'),
      mode: 'grade',
      essayType: this.data.essayType,
      band: '',
      bandValue: '',
      taskContent: isContinuation
        ? [
            `第一段段首句：${paragraphOneStarter}`,
            `第二段段首句：${paragraphTwoStarter}`
          ].join('\n')
        : String(this.data.promptText || '').trim(),
      sourceMaterial: isContinuation ? sourceMaterial : '',
      draftText,
      requirements: this.data.requirements.join('；')
    };

    this.setData({
      loading: true,
      submitRequestId: payload.clientRequestId
    });

    this.startReviewProgress();

    try {
      await submitTaskAndOpenReport(payload);
      this.setData({
        submitRequestId: '',
        submitStatus: '批改完成，正在打开报告...'
      });
      wx.navigateTo({
        url: '/pages/report/index'
      });
    } catch (error) {
      if (!shouldReuseClientRequestId(error)) {
        this.setData({
          submitRequestId: ''
        });
      }
      if (isQuotaExhaustedError(error)) {
        const entitlement = await fetchAccountEntitlement().catch(() => null);
        if (isAdRewardAvailable(entitlement)) {
          this.handleAdRewardOffer();
          return;
        }
      }
      const message = resolveTaskRequestError(error);
      this.setData({
        submitStatus: `提交失败：${message}`
      });
      wx.showToast({
        title: message,
        icon: 'none'
      });
    } finally {
      this.stopReviewProgress();
      this.setData({
        loading: false
      });
    }
  },
  onUnload() {
    this.stopReviewProgress();
  },

  handleAdRewardOffer() {
    this.setData({
      submitStatus: '免费次数已用完，看广告可继续',
      loading: false
    });
    this.stopReviewProgress();
    offerAdRewardDialog()
      .then(() => {
        wx.showToast({ title: '已获得批改次数', icon: 'success' });
        this.setData({ loading: false });
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  },

  refreshWordCount(text) {
    const words = String(text || '').trim().match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
    this.setData({
      wordCount: words.length,
      wordCountPercent: Math.min(100, Math.round(words.length / this.data.targetWordCount * 100))
    });
  }
});

function isQuotaExhaustedError(error) {
  const code = String((error && error.code) || '').trim();
  return code === 'TRIAL_LIMIT_REACHED' || code === 'TRIAL_DAILY_LIMIT_REACHED';
}
