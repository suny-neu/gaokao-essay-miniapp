# 高考英语小程序可信上线版实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让写作、陪练、报告和首页统计可以直接上线，并保证评分、趋势和诊断均来自真实数据。

**Architecture:** 后端为正式批改返回结构化分项评分并校验其合法性；前端用纯函数建立报告和首页视图模型，只展示有效数据。正式批改与 AI 陪练使用不同报告布局，历史趋势只读取成功的正式批改记录。

**Tech Stack:** 微信小程序原生 JavaScript/WXML/WXSS、Node.js 内置测试运行器、Java 17、Spring Boot、Maven/JUnit 5。

## Global Constraints

- 不展示固定、推算或占位评分。
- 读后续写必须包含原文、两段段首句和续写正文。
- 陪练三种模式必须说明输入和输出，并支持多行内容。
- 趋势只统计成功的正式批改记录。
- 保留现有用户修改，不重置工作区。

---

### Task 1: 报告与首页真实数据规则

**Files:**
- Create: `utils/report-view-model.js`
- Create: `utils/dashboard-metrics.js`
- Create: `tests/report-view-model.test.js`
- Create: `tests/dashboard-metrics.test.js`
- Modify: `pages/report/index.js`
- Modify: `pages/report/index.wxml`
- Modify: `pages/report/index.wxss`
- Modify: `pages/home/index.js`
- Modify: `pages/home/index.wxml`

**Interfaces:**
- Produces: `buildReportViewModel(result)`，返回正式批改或陪练布局需要的可见数据。
- Produces: `buildFormalGradeMetrics(history)`，只用正式批改生成平均分、差值和七日趋势。

- [ ] **Step 1: 写失败测试**

```js
test('陪练不显示评分卡', () => {
  assert.equal(buildReportViewModel({ sessionType: 'coach' }).scoreVisible, false)
})

test('没有真实分项时不生成分项', () => {
  assert.deepEqual(buildReportViewModel({ scoreText: '9分 / 15' }).dimensions, [])
})

test('趋势排除陪练记录', () => {
  const result = buildFormalGradeMetrics([
    { sessionType: 'coach', scoreText: '15分 / 15' },
    { sessionType: 'grade', status: 'success', scoreText: '9分 / 15' }
  ])
  assert.equal(result.averageScore, 9)
})
```

- [ ] **Step 2: 运行测试并确认因模块尚不存在而失败**

Run: `node --test tests/report-view-model.test.js tests/dashboard-metrics.test.js`

Expected: FAIL，提示找不到视图模型模块。

- [ ] **Step 3: 实现最小纯函数并接入页面**

报告视图模型只接受后端有效 `scoreDimensions`；首页视图模型过滤 `sessionType === 'grade' && status === 'success'`，没有数据返回 `null` 和空趋势。报告 WXML 用 `scoreVisible` 控制评分卡，陪练展示独立结果块；首页卡片增加可点击入口。

- [ ] **Step 4: 运行测试和语法检查**

Run: `node --test tests/report-view-model.test.js tests/dashboard-metrics.test.js`

Run: `node --check utils/report-view-model.js && node --check utils/dashboard-metrics.js && node --check pages/report/index.js && node --check pages/home/index.js`

Expected: 全部通过。

### Task 2: 后端正式批改分项契约

**Files:**
- Modify: `src/main/java/com/gaokao/essay/service/EssayService.java`
- Modify: `src/main/java/com/gaokao/essay/state/AppState.java`
- Test: `src/test/java/com/gaokao/essay/service/EssayServiceGradeAnalysisTest.java`

**Interfaces:**
- Produces: `analysis.scoreDimensions`，包含 `code`、`label`、`score`、`maxScore`。
- Consumes: AI JSON 中内容 5 分、语言 5 分、结构 3 分、词汇 2 分，合计必须与总分一致。

- [ ] **Step 1: 写失败测试**

测试合法四项分数被保留，越界、缺项或合计与总分不一致时返回空列表，避免前端展示不可信数据。

- [ ] **Step 2: 运行定向测试并确认失败**

Run: `./mvnw -Dtest=EssayServiceGradeAnalysisTest test`

Expected: FAIL，当前分析对象尚无 `scoreDimensions`。

- [ ] **Step 3: 添加数据类型、提示词和服务端校验**

定义 `ScoreDimension(code, label, score, maxScore)`；提示模型按 5/5/3/2 输出；解析后只在四项齐全、数值合法且合计等于总分时保留。

- [ ] **Step 4: 运行后端测试**

Run: `./mvnw test`

Expected: 全部通过。

### Task 3: 前端保存后端分项数据

**Files:**
- Modify: `utils/request.js`
- Modify: `utils/storage.js`
- Test: `tests/grade-normalization.test.js`

**Interfaces:**
- Consumes: 后端 `analysis.scoreDimensions`。
- Produces: 网络响应和历史存储中不丢失已校验分项数据。

- [ ] **Step 1: 写失败测试**

测试四个合法分项经过请求规范化和本地存储规范化后保持 `code/label/score/maxScore` 不变，无效项被过滤。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/grade-normalization.test.js`

Expected: FAIL，当前规范化函数未导出或丢失分项。

- [ ] **Step 3: 实现分项规范化并接入现有分析对象**

共享一个 `normalizeScoreDimensions(value)`，只接受有限数值、正最大值和已知 code。

- [ ] **Step 4: 运行所有前端测试**

Run: `node --test tests/*.test.js`

Expected: 全部通过。

### Task 4: 陪练输入与文案上线化

**Files:**
- Modify: `pages/tutor/index.js`
- Modify: `pages/tutor/index.wxml`
- Modify: `pages/tutor/index.wxss`

**Interfaces:**
- Consumes: `TUTOR_CONFIG` 当前模式说明、占位文字和快捷操作。
- Produces: 多行输入、清晰说明、模式匹配的提交内容。

- [ ] **Step 1: 写静态失败测试**

检查 WXML 使用 `textarea`，且三个模式均有用途说明和明确输入提示。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/tutor-ui.test.js`

Expected: FAIL，当前仍使用单行 `input`。

- [ ] **Step 3: 改成多行输入并展示模式说明**

使用 `textarea`，显示“输入什么/得到什么”，保持快捷操作随模式切换。

- [ ] **Step 4: 运行测试和语法检查**

Run: `node --test tests/tutor-ui.test.js && node --check pages/tutor/index.js`

Expected: 全部通过。

### Task 5: 全链路验证

**Files:**
- Verify: all modified frontend and backend files

**Interfaces:**
- Consumes: Tasks 1–4 的全部成果。
- Produces: 可部署候选版本和人工验收清单。

- [ ] **Step 1: 运行前端测试、语法和差异检查**

Run: `node --test tests/*.test.js`

Run: `node --check pages/write/index.js && node --check pages/tutor/index.js && node --check pages/report/index.js && node --check pages/home/index.js`

Run: `git diff --check`

- [ ] **Step 2: 运行后端完整测试**

Run: `./mvnw test`

- [ ] **Step 3: 核对关键场景**

确认应用文与续写必填校验、三种陪练、正式报告、陪练报告、无历史首页、单点趋势和多点趋势均符合设计。

- [ ] **Step 4: 输出部署与微信开发者工具验收步骤**

列出需要重新构建后端镜像、上传小程序体验版及真机验证的操作，不擅自执行生产发布。
