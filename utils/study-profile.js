const { formatTime } = require('./format');

const weaknessRules = [
  createRule('task_completion', '内容要点', '要点|遗漏|任务|信息不全|偏题|跑题|覆盖不全'),
  createRule('structure_flow', '结构推进', '结构|衔接|过渡|段落|逻辑|推进|段首句|呼应'),
  createRule('language_naturalness', '语言自然度', '模板|机器|AI腔|学术腔|生硬|不自然|套话'),
  createRule('grammar_accuracy', '语法准确度', '语法|时态|主谓一致|拼写|冠词|搭配'),
  createRule('show_not_tell', '细节外显', 'show|tell|动作|细节|外显|空泛|情绪词'),
  createRule('word_count', '字数控制', '字数|词数|超标|不足|降档'),
  createRule('tone_identity', '语气与身份', '语气|身份|称呼|格式|礼貌'),
  createRule('continuation_alignment', '续写协同', '协同|线索|回收|首句|前文|闭环')
];

function buildStudyProfile(history = []) {
  const gradeHistory = history.filter((item) => item && item.mode === 'grade' && item.taskStatus !== 'FAILED');
  const analysisHistory = gradeHistory.filter((item) => item.analysis);
  const latestGradeSession = gradeHistory[0] || null;

  if (!analysisHistory.length) {
    return {
      ready: false,
      title: latestGradeSession ? '提分档案正在建立' : '你的提分档案还没开始',
      headline: latestGradeSession
        ? '已经检测到批改记录，再积累 1 到 2 篇，首页就会形成更稳定的弱项画像。'
        : '先做 1 到 2 次严格批改，系统才看得出你总是在哪里丢分。',
      nextFocus: '先用“严格批改”喂进应用文或续写原文，系统才有素材判断你的稳定弱项。',
      tags: [],
      sampleSize: 0,
      badgeText: '待建立',
      applicationCount: 0,
      continuationCount: 0,
      latestScoreText: latestGradeSession ? latestGradeSession.scoreText || '' : '',
      latestGradeSession,
      lastUpdatedText: latestGradeSession ? formatTime(latestGradeSession.createdAt) : '',
      primaryActionLabel: latestGradeSession ? '继续做严格批改' : '先批应用文',
      secondaryActionLabel: latestGradeSession ? '查看最近批改' : '先批续写',
      primaryActionKind: latestGradeSession ? 'continue_grade' : 'grade_application',
      secondaryActionKind: latestGradeSession ? 'view_latest_grade' : 'grade_continuation',
      suggestedEssayType: latestGradeSession ? latestGradeSession.essayType : 'application'
    };
  }

  const counters = {};
  weaknessRules.forEach((rule) => {
    counters[rule.code] = {
      code: rule.code,
      label: rule.label,
      hitCount: 0
    };
  });

  let applicationCount = 0;
  let continuationCount = 0;

  analysisHistory.forEach((item) => {
    if (item.essayType === 'application') {
      applicationCount += 1;
    }
    if (item.essayType === 'continuation') {
      continuationCount += 1;
    }

    const analysis = item.analysis || {};
    const evidence = [
      analysis.contentDiagnosis,
      analysis.structureDiagnosis,
      analysis.languageDiagnosis,
      analysis.lossPointDiagnosis,
      analysis.secondDraftGuidance
    ]
      .filter(Boolean)
      .join('\n');

    weaknessRules.forEach((rule) => {
      if (rule.pattern.test(evidence)) {
        counters[rule.code].hitCount += 1;
      }
    });
  });

  const tags = Object.values(counters)
    .filter((item) => item.hitCount > 0)
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, 3);

  const sampleSize = analysisHistory.length;
  const dominantEssayType = applicationCount >= continuationCount ? 'application' : 'continuation';

  return {
    ready: tags.length > 0,
    title: `最近 ${sampleSize} 篇批改`,
    headline: tags.length
      ? `你最常丢分在${tags.map((item) => item.label).join('、')}。`
      : '目前还没识别出稳定重复的问题。',
    nextFocus: buildNextFocus(tags),
    tags,
    sampleSize,
    badgeText: `${sampleSize} 篇样本`,
    applicationCount,
    continuationCount,
    latestScoreText: latestGradeSession ? latestGradeSession.scoreText || '' : '',
    latestGradeSession,
    lastUpdatedText: latestGradeSession ? formatTime(latestGradeSession.createdAt) : '',
    primaryActionLabel: '继续提分',
    secondaryActionLabel: latestGradeSession ? '查看最近批改' : '去严格批改',
    primaryActionKind: 'continue_grade',
    secondaryActionKind: latestGradeSession ? 'view_latest_grade' : 'continue_grade',
    suggestedEssayType: dominantEssayType
  };
}

function buildNextFocus(tags) {
  if (!tags.length) {
    return '继续做 1 到 2 篇同题型批改，画像会更稳定。';
  }
  if (tags.length === 1) {
    return `下一篇先只盯住“${tags[0].label}”，把这一个点改稳，再追求句子更花。`;
  }
  return `下一篇优先按“${tags[0].label} -> ${tags[1].label}”的顺序改，不要一上来整篇重写。`;
}

function createRule(code, label, expression) {
  return {
    code,
    label,
    pattern: new RegExp(expression, 'i')
  };
}

module.exports = {
  buildStudyProfile
};
