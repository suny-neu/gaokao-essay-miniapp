const modeOptions = [
  {
    id: 'coach',
    label: '作文陪练',
    title: '先拆题，再下笔',
    desc: '审题、列提纲、做薄弱点特训。',
    tone: 'tone-coach'
  },
  // {
  //   id: 'generate',
  //   label: '范文生成',
  //   title: '应用文与续写出稿',
  //   desc: '支持进阶 / 学霸 / 满分三档。',
  //   tone: 'tone-generate'
  // },
  {
    id: 'grade',
    label: '严格批改',
    title: '估分、诊断、洗稿',
    desc: '按阅卷思路抓失分点，给整篇提分稿。',
    tone: 'tone-grade'
  }
];

const typeOptions = [
  { id: 'application', label: '应用文' },
  { id: 'continuation', label: '读后续写' }
];

const coachStageOptions = [
  { id: 'prewrite', label: '写前', hint: '审题拆解' },
  { id: 'drafting', label: '写中', hint: '提纲微调 / 句子升级' },
  { id: 'postwrite', label: '写后', hint: '轻诊断 / 下一步' }
];

const coachModeOptions = [
  { id: 'prompt_analysis', label: '审题拆解', hint: '先看题目真正在问什么' },
  { id: 'outline', label: '构思提纲', hint: '先把写作路径搭出来' },
  { id: 'sentence_upgrade', label: '句子升级', hint: '去模板感，调语气和节奏' },
  { id: 'weakness_drill', label: '弱点特训', hint: '只练一个薄弱点' },
  { id: 'routing', label: '分流建议', hint: '判断该继续练还是去批改' }
];

const bandOptions = [
  { id: 'band1', label: '进阶', alias: '进阶版', value: '进阶版', hint: '稳、准、顺' },
  { id: 'band2', label: '学霸', alias: '学霸版', value: '学霸版', hint: '细节更强' },
  { id: 'band3', label: '满分', alias: '满分压轴版', value: '满分压轴版', hint: '压轴质感' }
];

const modeLabelMap = {
  coach: '作文陪练',
  generate: '范文生成',
  grade: '严格批改'
};

const typeLabelMap = {
  application: '应用文',
  continuation: '读后续写'
};

const bandLabelMap = {
  band1: '进阶',
  band2: '学霸',
  band3: '满分'
};

function resolveBandValue(inputBandId) {
  const hit = bandOptions.find((item) => item.id === inputBandId);
  return hit ? hit.value : '学霸版';
}

module.exports = {
  modeOptions,
  typeOptions,
  coachStageOptions,
  coachModeOptions,
  bandOptions,
  modeLabelMap,
  typeLabelMap,
  bandLabelMap,
  resolveBandValue
};
