const { uid } = require('../../utils/format');
const { submitTaskAndOpenReport, resolveTaskRequestError, shouldReuseClientRequestId } = require('../../utils/task-flow');

Page({
  data: {
    tabs: [
      { id: 'topic', label: '话题练习' },
      { id: 'grammar', label: '语法专练' },
      { id: 'mock', label: '模拟写作' }
    ],
    activeTab: 'topic',
    essayType: 'application',
    quickActions: ['换话题', '给提示', '批改这句'],
    inputText: '',
    inputGhost: false,
    loading: false,
    submitRequestId: '',
    messages: [
      { id: 'm1', role: 'ai', text: '来练「科技与生活」。先写一句你的观点，我帮你润色。' },
      { id: 'm2', role: 'me', text: 'Technology makes our life more convenient.' },
      { id: 'm3', role: 'ai', text: '方向不错！哪方面 convenient？加个具体例子更有说服力。' },
      { id: 'm4', role: 'me', text: '...like online learning during the pandemic.' },
      { id: 'm5', role: 'ai', text: '很好，可升级为： “Online learning, for instance, has made education far more accessible.”' }
    ]
  },

  onLoad(query) {
    if (query && query.type === 'continuation') {
      this.setData({ essayType: 'continuation' });
    }
  },

  chooseTab(event) {
    const activeTab = event.currentTarget.dataset.tab || 'topic';
    this.setData({ activeTab });
  },

  chooseEssayType(event) {
    const essayType = event.currentTarget.dataset.type === 'continuation' ? 'continuation' : 'application';
    if (essayType === this.data.essayType) {
      return;
    }
    this.setData({ essayType });
  },

  chooseQuickAction(event) {
    const label = event.currentTarget.dataset.label || '';
    if (!label) {
      return;
    }
    const templates = {
      '换话题': '换个话题练习，例如：环保、人工智能',
      '给提示': '给我一个写作提示或例句',
      '批改这句': '请批改这句英文：'
    };
    this.setData({
      inputText: templates[label] || label,
      inputGhost: true
    });
  },

  onInputFocus() {
    if (this.data.inputGhost) {
      this.setData({ inputText: '', inputGhost: false });
    }
  },

  updateInput(event) {
    this.setData({
      inputText: event.detail.value || '',
      inputGhost: false
    });
  },

  submitInput() {
    const text = String(this.data.inputText || '').trim();
    if (!text || this.data.loading) {
      return;
    }

    const userMessage = { id: `u-${Date.now()}`, role: 'me', text };
    this.setData({
      messages: this.data.messages.concat(userMessage),
      inputText: '',
      inputGhost: false,
      loading: true
    });

    const payload = buildTutorPayload(this.data.activeTab, this.data.essayType, text, this.data.submitRequestId || uid('req'));
    this.setData({
      submitRequestId: payload.clientRequestId
    });

    submitTaskAndOpenReport(payload)
      .then((session) => {
        this.setData({
          submitRequestId: '',
          messages: this.data.messages.concat({
            id: `a-${Date.now()}`,
            role: 'ai',
            text: String(session.content || '我已经根据你的输入给出一版陪练建议。').trim()
          })
        });
      })
      .catch((error) => {
        if (!shouldReuseClientRequestId(error)) {
          this.setData({
            submitRequestId: ''
          });
        }
        const message = resolveTaskRequestError(error);
        this.setData({
          messages: this.data.messages.concat({
            id: `e-${Date.now()}`,
            role: 'ai',
            text: `这次没成功连上后端：${message}`
          })
        });
      })
      .finally(() => {
        this.setData({
          loading: false
        });
      });
  }
});

function buildTutorPayload(activeTab, essayType, text, clientRequestId) {
  if (activeTab === 'grammar') {
    return {
      clientRequestId,
      mode: 'coach',
      essayType,
      coachStage: 'drafting',
      coachMode: 'sentence_upgrade',
      band: 'band2',
      bandValue: '学霸版',
      taskContent: '请按高考英语作文标准，帮我升级下面这句话。',
      sourceMaterial: '',
      draftText: text,
      requirements: '重点关注语法准确性和表达自然度。'
    };
  }

  if (activeTab === 'mock') {
    return {
      clientRequestId,
      mode: 'coach',
      essayType,
      coachStage: 'postwrite',
      coachMode: 'routing',
      band: 'band2',
      bandValue: '学霸版',
      taskContent: '请按高考英语作文模拟写作标准给出下一步建议。',
      sourceMaterial: '',
      draftText: text,
      requirements: '判断我该继续写还是转批改。'
    };
  }

  return {
    clientRequestId,
    mode: 'coach',
    essayType,
    coachStage: 'prewrite',
    coachMode: 'outline',
    band: 'band2',
    bandValue: '学霸版',
    taskContent: `话题练习：科技与生活。用户当前表达：${text}`,
    sourceMaterial: '',
    draftText: '',
    requirements: '请先鼓励，再给一句更地道的高考英语表达。'
  };
}
