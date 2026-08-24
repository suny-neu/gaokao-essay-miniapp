const TUTOR_CONFIG = {
  topic: {
    label: '观点与素材',
    placeholder: '输入作文话题或你的一句观点…',
    inputGuide: '作文话题、中文想法或一句英文观点',
    outputGuide: '理由、具体例子和可直接使用的英文表达',
    quickActions: ['换话题', '给示例', '帮我展开'],
    welcome: '输入一个作文话题或一句观点，我帮你补充理由、例子和地道表达。'
  },
  grammar: {
    label: '句子纠错',
    placeholder: '粘贴需要检查的英文句子…',
    inputGuide: '一到三句需要检查的英文',
    outputGuide: '错误判断或可选的表达升级建议',
    quickActions: ['检查错误', '升级表达'],
    welcome: '粘贴一句英文，我会区分真正的语法错误和普通的表达升级。'
  },
  mock: {
    label: '草稿诊断',
    placeholder: '粘贴作文题目和当前草稿…',
    inputGuide: '作文题目＋当前英文草稿',
    outputGuide: '内容、结构、语言诊断和最优先修改项',
    quickActions: ['给思路', '诊断草稿', '下一步怎么写'],
    welcome: '粘贴作文题目和当前草稿，我帮你判断内容是否完整，以及下一步怎么修改。'
  }
};
const { uid } = require('../../utils/format');
const { submitTaskAndOpenReport, resolveTaskRequestError, shouldReuseClientRequestId } = require('../../utils/task-flow');
const { fetchAccountEntitlement } = require('../../utils/request');
const { offerAdRewardDialog, isAdRewardAvailable } = require('../../utils/ad-reward');

Page({
  data: {
    tabs: [
      { id: 'topic', label: '观点与素材' },
      { id: 'grammar', label: '句子纠错' },
      { id: 'mock', label: '草稿诊断' }
    ],
    activeTab: 'topic',
    essayType: 'application',
    quickActions: TUTOR_CONFIG.topic.quickActions,
    inputPlaceholder: TUTOR_CONFIG.topic.placeholder,
    inputGuide: TUTOR_CONFIG.topic.inputGuide,
    outputGuide: TUTOR_CONFIG.topic.outputGuide,
    grammarMode: 'correction',
    grammarModes: [
      {
        id: 'correction',
        label: '检查错误',
        description: '判断句子有没有必须修改的语法、拼写或用词错误'
      },
      {
        id: 'upgrade',
        label: '升级表达',
        description: '原句正确时，让表达更自然、更正式'
      }
    ],
    inputText: '',
    inputGhost: false,
    loading: false,
    submitRequestId: '',
    messages: [
      {
        id: 'welcome-topic',
        role: 'ai',
        text: TUTOR_CONFIG.topic.welcome
      }
    ]
  },

  onLoad(query) {
    if (query && query.type === 'continuation') {
      this.setData({ essayType: 'continuation' });
    }
  },

  chooseTab(event) {
    const activeTab = event.currentTarget.dataset.tab || 'topic';
    const config = TUTOR_CONFIG[activeTab] || TUTOR_CONFIG.topic;

    this.setData({
      activeTab,
      quickActions: config.quickActions,
      inputPlaceholder: config.placeholder,
      inputGuide: config.inputGuide,
      outputGuide: config.outputGuide,
      grammarMode: activeTab === 'grammar' ? this.data.grammarMode : 'correction',
      inputText: '',
      inputGhost: false,
      messages: [
        {
          id: `welcome-${activeTab}-${Date.now()}`,
          role: 'ai',
          text: config.welcome
        }
      ]
    });
  },

  chooseEssayType(event) {
    const essayType = event.currentTarget.dataset.type === 'continuation' ? 'continuation' : 'application';
    if (essayType === this.data.essayType) {
      return;
    }
    this.setData({ essayType });
  },

  chooseGrammarMode(event) {
    const grammarMode = event.currentTarget.dataset.mode === 'upgrade' ? 'upgrade' : 'correction';
    this.setData({ grammarMode });
  },

  chooseQuickAction(event) {
    const label = event.currentTarget.dataset.label || '';
    if (!label) {
      return;
    }
    const templates = {
      '换话题': '请给我一个高考英语作文常见话题。',
      '给示例': '请围绕这个观点给我一个具体例子：',
      '帮我展开': '请帮我把这个观点展开成“观点＋理由＋例子”：',

      '检查错误': '请检查这句话是否有必须修改的错误：',
      '升级表达': '这句话语法正确时，请帮我做表达升级：',

      '给思路': '请根据下面的作文题目给我写作思路：',
      '诊断草稿': '请诊断下面这篇草稿的问题：',
      '下一步怎么写': '请告诉我这篇草稿下一步最应该补充什么：'
    };
    const grammarMode = label === '升级表达'
      ? 'upgrade'
      : label === '检查错误'
        ? 'correction'
        : this.data.grammarMode;
    this.setData({
      inputText: templates[label] || label,
      inputGhost: true,
      grammarMode
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

    const tutorMode = this.data.activeTab === 'grammar' ? this.data.grammarMode : this.data.activeTab;
    const payload = buildTutorPayload(tutorMode, this.data.essayType, text, this.data.submitRequestId || uid('req'));
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
      .catch(async (error) => {
        if (!shouldReuseClientRequestId(error)) {
          this.setData({
            submitRequestId: ''
          });
        }
        const code = String((error && error.code) || '').trim();
        if (code === 'TRIAL_LIMIT_REACHED' || code === 'TRIAL_DAILY_LIMIT_REACHED') {
          const entitlement = await fetchAccountEntitlement().catch(() => null);
          if (isAdRewardAvailable(entitlement)) {
            this.setData({ loading: false });
            offerAdRewardDialog()
              .then(() => {
                wx.showToast({ title: '已获得批改次数', icon: 'success' });
              })
              .catch(() => {});
            return;
          }
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

function buildTutorPayload(tutorMode, essayType, text, clientRequestId) {
  if (tutorMode === 'correction' || tutorMode === 'upgrade') {
    const isCorrection = tutorMode === 'correction';
    return {
      clientRequestId,
      mode: 'coach',
      essayType,
      coachStage: 'drafting',
      coachMode: isCorrection ? 'sentence_correction' : 'sentence_upgrade',
      band: 'band2',
      bandValue: '学霸版',
      taskContent: isCorrection
        ? '请按高考英语作文标准检查下面句子是否存在必须修改的错误。'
        : '请按高考英语作文标准为下面正确的句子提供可选的表达升级。',
      sourceMaterial: '',
      draftText: text,
      requirements: isCorrection
        ? '只判断必须修改的语法、拼写或用词错误；如无真实错误，明确说“未发现真实错误”，不得把可选升级说成错误。'
        : '原句正确时，给出更自然、更正式的可选表达升级；所有改动都要说明为可选改进，而非错误。'
    };
  }

  if (tutorMode === 'mock') {
    return {
      clientRequestId,
      mode: 'coach',
      essayType,
      coachStage: 'postwrite',
      coachMode: 'routing',
      band: 'band2',
      bandValue: '学霸版',
      taskContent: '用户将作文题目和当前草稿粘贴在输入内容中，请进行草稿诊断。',
      requirements: '先区分题目和草稿，再检查要点、内容、结构和语言，最后告诉用户下一步最值得修改什么。',
      sourceMaterial: '',
      draftText: text
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
    taskContent: `用户希望练习下面的话题或观点：${text}`,
    sourceMaterial: '',
    draftText: '',
    requirements: '请先判断观点是否清楚，再给出理由、具体例子和一句可直接使用的英文表达。'
  };
}
