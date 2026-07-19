const { uid } = require('../../utils/format');
const { submitTaskAndOpenReport, resolveTaskRequestError, shouldReuseClientRequestId } = require('../../utils/task-flow');
const { extractOcrText } = require('../../utils/request');

const ESSAY_TYPE_PRESETS = {
  application: {
    taskTag: '议论文 · 100-120 词',
    promptText: '假定你是李华，英国朋友 Peter 来信询问你校的科技创新活动。请回信介绍一项你参与过的活动。',
    requirements: ['字数 100-120', '含 3 个要点'],
    targetWordCount: 120
  },
  continuation: {
    taskTag: '读后续写 · 120-150 词',
    promptText: '请根据所给材料和两段段首句，续写短文，使之构成一篇完整的故事。',
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
    requirements: ['字数 100-120', '含 3 个要点'],
    draftText: "Dear Peter,\nI'm glad to hear from you. Our school holds a science innovation week every year, and I joined a robotics workshop.",
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
      requirements: preset.requirements,
      targetWordCount: preset.targetWordCount
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

  async submitForReview() {
    if (this.data.loading || this.data.ocrLoading) {
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

    const payload = {
      clientRequestId: this.data.submitRequestId || uid('req'),
      mode: 'grade',
      essayType: this.data.essayType,
      band: '',
      bandValue: '',
      taskContent: String(this.data.promptText || '').trim(),
      sourceMaterial: '',
      draftText,
      requirements: this.data.requirements.join('；')
    };

    this.setData({
      loading: true,
      submitRequestId: payload.clientRequestId,
      submitStatus: '正在提交批改...'
    });

    try {
      await submitTaskAndOpenReport(payload, {
        onStatus: (text) => {
          this.setData({
            submitStatus: text || '正在批改...'
          });
        }
      });
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
      const message = resolveTaskRequestError(error);
      this.setData({
        submitStatus: `提交失败：${message}`
      });
      wx.showToast({
        title: message,
        icon: 'none'
      });
    } finally {
      this.setData({
        loading: false
      });
    }
  },

  refreshWordCount(text) {
    const words = String(text || '').trim().match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
    this.setData({
      wordCount: words.length,
      wordCountPercent: Math.min(100, Math.round(words.length / this.data.targetWordCount * 100))
    });
  }
});
