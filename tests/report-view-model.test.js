const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  buildReportViewModel,
  normalizeScoreDimensions
} = require('../utils/report-view-model');
const { normalizeGradeAnalysis } = require('../utils/storage');

function loadReportHelpers() {
  const source = fs.readFileSync(path.join(__dirname, '../pages/report/index.js'), 'utf8');
  const pageDirectory = path.join(__dirname, '../pages/report');
  const sandbox = {
    require: (modulePath) => require(path.resolve(pageDirectory, modulePath)),
    module: { exports: {} },
    Page: () => {}
  };

  vm.runInNewContext(`${source}\nmodule.exports = { buildCoachBlocks, buildSubmissionContext };`, sandbox);
  return sandbox.module.exports;
}

function loadNormalizeRequestGradeAnalysis() {
  const source = fs.readFileSync(path.join(__dirname, '../utils/request.js'), 'utf8');
  const requestDirectory = path.join(__dirname, '../utils');
  const sandbox = {
    require: (modulePath) => require(path.resolve(requestDirectory, modulePath)),
    module: { exports: {} }
  };

  vm.runInNewContext(`${source}\nmodule.exports = { normalizeGradeAnalysis };`, sandbox);
  return sandbox.module.exports.normalizeGradeAnalysis;
}

test('陪练结果不显示评分卡', () => {
  const viewModel = buildReportViewModel({
    mode: 'coach',
    content: '先补充一个具体例子。'
  });

  assert.equal(viewModel.scoreVisible, false);
  assert.equal(viewModel.pageTitle, '陪练结果');
  assert.equal(viewModel.scoreValue, '');
});

test('没有真实分项时不从总分推算', () => {
  const viewModel = buildReportViewModel({
    mode: 'grade',
    scoreText: '9分 / 15',
    analysis: {}
  });

  assert.deepEqual(viewModel.dims, []);
  assert.equal(viewModel.deltaText, '');
});

test('只保留完整且总分一致的四项评分', () => {
  const dimensions = normalizeScoreDimensions([
    { code: 'content', label: '内容', score: 3, maxScore: 5 },
    { code: 'language', label: '语言', score: 3, maxScore: 5 },
    { code: 'structure', label: '结构', score: 2, maxScore: 3 },
    { code: 'vocabulary', label: '词汇', score: 1, maxScore: 2 }
  ], 9);

  assert.equal(dimensions.length, 4);
  assert.equal(dimensions[0].scoreText, '3/5');
  assert.equal(dimensions[0].width, 60);
  assert.deepEqual(normalizeScoreDimensions(dimensions, 10), []);
});

test('无真实亮点时返回空数组', () => {
  const viewModel = buildReportViewModel({
    mode: 'grade',
    scoreText: '9分 / 15',
    analysis: {}
  });

  assert.deepEqual(viewModel.highlights, []);
});

test('报告按后端结构化 kind 区分必须修改和表达升级', () => {
  const viewModel = buildReportViewModel({
    mode: 'grade',
    analysis: {
      improvedEssay: 'Dear Peter,\nI am writing to invite you.',
      sentenceDiagnostics: [
        {
          kind: 'ERROR_CORRECTION',
          errorType: 'GRAMMAR',
          original: 'She go to school every day.',
          diagnosis: '主谓一致错误。',
          revision: 'She goes to school every day.'
        },
        {
          kind: 'EXPRESSION_UPGRADE',
          errorType: 'NONE',
          original: 'I am very happy.',
          diagnosis: '换成更自然的表达。',
          revision: 'I am delighted.'
        }
      ]
    }
  });

  assert.equal(viewModel.corrections.length, 1);
  assert.equal(viewModel.upgrades.length, 1);
  assert.equal(viewModel.upgrades[0].isRealError, false);
  assert.match(viewModel.improvedEssay, /Dear Peter/);
  assert.equal(viewModel.legacyNotice, false);
});

test('报告显示时态和冠词的准确错误类型', () => {
  const viewModel = buildReportViewModel({
    mode: 'grade',
    analysis: {
      sentenceDiagnostics: [
        {
          kind: 'ERROR_CORRECTION',
          errorType: 'TENSE',
          original: 'She hug her mother.',
          diagnosis: '故事叙述应使用一般过去时。',
          revision: 'She hugged her mother.'
        },
        {
          kind: 'ERROR_CORRECTION',
          errorType: 'ARTICLE',
          original: 'They are happy family.',
          diagnosis: 'family 前缺少不定冠词。',
          revision: 'They are a happy family.'
        }
      ]
    }
  });

  assert.equal(viewModel.corrections[0].tag, '时态');
  assert.equal(viewModel.corrections[1].tag, '冠词');
});

test('缺少英文原句或英文修改句的错误移入整体内容建议', () => {
  const viewModel = buildReportViewModel({
    mode: 'grade',
    analysis: {
      contentDiagnosis: '文章基本切题。',
      sentenceDiagnostics: [
        {
          kind: 'ERROR_CORRECTION',
          errorType: 'CONTENT',
          original: '',
          diagnosis: '补充活动中的具体任务和收获。',
          revision: '增加团队合作和所学技能。'
        },
        {
          kind: 'ERROR_CORRECTION',
          errorType: 'GRAMMAR',
          original: 'I joined a robotics workshop.',
          diagnosis: '需要提供可核对的英文修改句。',
          revision: ''
        }
      ]
    }
  });

  assert.equal(viewModel.corrections.length, 0);
  assert.match(viewModel.contentAdvice, /文章基本切题/);
  assert.match(viewModel.contentAdvice, /补充活动中的具体任务和收获/);
  assert.match(viewModel.contentAdvice, /需要提供可核对的英文修改句/);
});

test('历史逐句建议没有 kind 时才按关键词兜底并提示自动分类', () => {
  const viewModel = buildReportViewModel({
    mode: 'grade',
    analysis: {
      sentenceDiagnostics: [
        {
          original: 'He go home.',
          diagnosis: '主谓一致错误。',
          revision: 'He goes home.'
        }
      ]
    }
  });

  assert.equal(viewModel.corrections.length, 1);
  assert.equal(viewModel.corrections[0].legacyInferred, true);
  assert.equal(viewModel.legacyNotice, true);
});

test('未知的新 kind 不会被关键词误判为必须修改的错误', () => {
  const viewModel = buildReportViewModel({
    mode: 'grade',
    analysis: {
      sentenceDiagnostics: [
        {
          kind: 'FUTURE_CLASSIFICATION',
          errorType: 'GRAMMAR',
          original: 'He go home.',
          diagnosis: '主谓一致错误。',
          revision: 'He goes home.'
        }
      ]
    }
  });

  assert.equal(viewModel.corrections.length, 0);
  assert.equal(viewModel.upgrades.length, 0);
  assert.equal(viewModel.legacyNotice, false);
});

test('表达升级不会因总数上限遮蔽后面的真实错误', () => {
  const upgrades = Array.from({ length: 8 }, (_, index) => ({
    kind: 'EXPRESSION_UPGRADE',
    errorType: 'NONE',
    original: `I am happy ${index}.`,
    diagnosis: '可以更自然。',
    revision: `I am delighted ${index}.`
  }));
  const viewModel = buildReportViewModel({
    mode: 'grade',
    analysis: {
      sentenceDiagnostics: upgrades.concat({
        kind: 'ERROR_CORRECTION',
        errorType: 'GRAMMAR',
        original: 'She go home.',
        diagnosis: '主谓一致错误。',
        revision: 'She goes home.'
      })
    }
  });

  assert.equal(viewModel.upgrades.length, 8);
  assert.equal(viewModel.corrections.length, 1);
  assert.equal(viewModel.corrections[0].from, 'She go home.');
});

test('本地记录标准化保留后端逐句诊断的分类字段', () => {
  const analysis = normalizeGradeAnalysis({
    improvedEssay: 'Dear Peter,\nWelcome to our school.',
    sentenceDiagnostics: [
      {
        kind: 'EXPRESSION_UPGRADE',
        errorType: 'NONE',
        legacyInferred: false,
        original: 'Nice to see you.',
        diagnosis: '更正式。',
        revision: 'It is a pleasure to meet you.'
      }
    ]
  });

  assert.equal(analysis.improvedEssay, 'Dear Peter,\nWelcome to our school.');
  assert.equal(analysis.sentenceDiagnostics[0].kind, 'EXPRESSION_UPGRADE');
  assert.equal(analysis.sentenceDiagnostics[0].errorType, 'NONE');
  assert.equal(analysis.sentenceDiagnostics[0].legacyInferred, false);
});

test('远端响应标准化保留逐句诊断的分类字段', () => {
  const normalizeRequestGradeAnalysis = loadNormalizeRequestGradeAnalysis();
  const analysis = normalizeRequestGradeAnalysis({
    sentenceDiagnostics: [
      {
        kind: 'ERROR_CORRECTION',
        errorType: 'WORD_CHOICE',
        legacyInferred: false,
        original: 'I make a decision.',
        diagnosis: '此处用词不够准确。',
        revision: 'I reached a decision.'
      }
    ]
  });

  assert.equal(analysis.sentenceDiagnostics[0].kind, 'ERROR_CORRECTION');
  assert.equal(analysis.sentenceDiagnostics[0].errorType, 'WORD_CHOICE');
  assert.equal(analysis.sentenceDiagnostics[0].legacyInferred, false);
});

test('句子纠错报告将 sentence_correction 展示为检查错误', () => {
  const { buildCoachBlocks } = loadReportHelpers();

  const blocks = buildCoachBlocks({
    mode: 'coach',
    coachMode: 'sentence_correction'
  });

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].label, '训练方式');
  assert.equal(blocks[0].text, '检查错误');
});

test('批改报告保留题目与可展开查看的原文', () => {
  const { buildSubmissionContext } = loadReportHelpers();
  const originalText = 'Dear Peter,\nI joined a robotics workshop and learned how to work with my classmates.\nIt was meaningful and exciting.';

  const submission = buildSubmissionContext({
    mode: 'grade',
    essayType: 'application',
    essayTypeLabel: '应用文',
    wordCount: 21,
    promptSnapshot: {
      taskContent: '请写信介绍你参加过的一项科技创新活动。',
      draftText: originalText
    }
  });

  assert.equal(submission.typeLabel, '应用文');
  assert.equal(submission.question, '请写信介绍你参加过的一项科技创新活动。');
  assert.equal(submission.originalText, originalText);
  assert.match(submission.originalPreview, /Dear Peter/);
  assert.equal(submission.wordCountText, '21 词');
});
