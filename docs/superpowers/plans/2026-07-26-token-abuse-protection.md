# AI Token 防刷加固实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为微信小程序的 AI 与 OCR 请求增加跨重启、可并发、可审计的账号、设备和 IP 组合防刷保护。

**Architecture:** PostgreSQL 保存账号总额度与账号日额度；统一的 `AbuseProtectionStore` 用 Redis 保存分钟限流、设备/IP 日额度和一次性 Challenge，开发测试可使用内存实现。前端为受保护请求发送持久匿名设备 ID；release 环境缺少 Redis 或安全配置时拒绝启动。

**Tech Stack:** Java 17、Spring Boot 2.7、Spring Data Redis、Redis 7、PostgreSQL、Docker Compose、微信小程序原生 JavaScript、JUnit 5、Node.js test。

## Global Constraints

- release 环境 Redis 不可用时不得调用 AI 或 OCR 上游。
- 免费额度为账号总计 5 次、账号每日 2 次、设备每日 4 次、IP 每日 20 次。
- 模型调用开始后发生失败不得退还额度。
- Redis 中不得保存原始 openid、设备 ID 或完整 IP。
- 保留现有用户代码修改，不重置工作区。

---

### Task 1: 修复可重复的额度时间测试

**Files:**
- Modify: `backend/src/main/java/com/gaokao/essay/backend/service/MembershipService.java`
- Modify: `backend/src/test/java/com/gaokao/essay/backend/service/MembershipServiceTrialLimitTest.java`
- Modify: `backend/src/main/resources/application.yml`

**Interfaces:**
- Produces: `MembershipService(..., Clock clock)` 测试构造入口。
- Produces: `membership.trial-daily-limit=2` 默认配置绑定。

- [ ] 写测试，固定 `2026-07-10T10:00:00Z` 并验证同日额度及跨日重置。
- [ ] 运行 `./mvnw -Dtest=MembershipServiceTrialLimitTest test`，确认旧实现失败。
- [ ] 注入 `Clock`，所有额度日期使用同一时钟；补齐 `trial-daily-limit`。
- [ ] 重跑定向测试并确认通过。

### Task 2: 统一防刷存储与 Redis 实现

**Files:**
- Create: `backend/src/main/java/com/gaokao/essay/backend/security/AbuseProtectionStore.java`
- Create: `backend/src/main/java/com/gaokao/essay/backend/security/InMemoryAbuseProtectionStore.java`
- Create: `backend/src/main/java/com/gaokao/essay/backend/security/RedisAbuseProtectionStore.java`
- Create: `backend/src/test/java/com/gaokao/essay/backend/security/InMemoryAbuseProtectionStoreTest.java`
- Modify: `backend/pom.xml`

**Interfaces:**
- Produces: `tryConsume(key, limit, ttl)`, `release(key)`, `putChallenge`, `consumeChallenge`。

- [ ] 写并发计数、过期、释放和 Challenge 一次性消费的失败测试。
- [ ] 实现内存存储使单元测试通过。
- [ ] 增加 Spring Data Redis，并用 Redis 原子脚本实现相同接口。
- [ ] 运行安全存储测试。

### Task 3: 账号、设备、IP 组合保护

**Files:**
- Modify: `backend/src/main/java/com/gaokao/essay/backend/config/GaokaoProperties.java`
- Modify: `backend/src/main/java/com/gaokao/essay/backend/service/RequestSecurityService.java`
- Modify: `backend/src/main/java/com/gaokao/essay/backend/service/ChallengeService.java`
- Modify: `backend/src/main/java/com/gaokao/essay/backend/service/MembershipService.java`
- Modify: `backend/src/main/java/com/gaokao/essay/backend/controller/EssayController.java`
- Modify: `backend/src/main/java/com/gaokao/essay/backend/controller/OcrController.java`
- Test: `backend/src/test/java/com/gaokao/essay/backend/service/RequestSecurityServiceTest.java`
- Test: `backend/src/test/java/com/gaokao/essay/backend/service/ChallengeServiceTest.java`

**Interfaces:**
- Consumes: 合法 `X-Device-ID`。
- Produces: 账号/设备/IP 分钟限流、设备/IP 日额度和稳定错误码。

- [ ] 写三个维度独立限流、设备 ID 校验、日额度和 Challenge 测试。
- [ ] 把 `RequestSecurityService` 与 `ChallengeService` 改为使用统一存储。
- [ ] 控制器解析并传递设备 ID 与可信 IP。
- [ ] 运行相关测试。

### Task 4: 模型调用后的额度不回滚

**Files:**
- Modify: `backend/src/main/java/com/gaokao/essay/backend/service/EssayService.java`
- Test: `backend/src/test/java/com/gaokao/essay/backend/service/EssayServiceIdempotencyTest.java`

**Interfaces:**
- Produces: 只有 AI 上游调用开始前的异常才执行 `releaseReservation`。

- [ ] 写“调用前失败退还、调用后失败保留”测试。
- [ ] 增加 `upstreamCallStarted` 状态并收窄回滚条件。
- [ ] 运行作文服务测试。

### Task 5: 小程序设备 ID

**Files:**
- Create: `frontend/utils/device-id.js`
- Modify: `frontend/utils/request.js`
- Test: `frontend/tests/device-id.test.js`

**Interfaces:**
- Produces: `getDeviceId()`，返回持久 128 位随机匿名 ID。
- Consumes: 所有 Challenge、作文、陪练和 OCR 请求发送 `X-Device-ID`。

- [ ] 写生成、持久复用、格式和请求头测试。
- [ ] 实现设备 ID 并接入网络请求。
- [ ] 运行前端全部测试与语法检查。

### Task 6: release 部署与启动审计

**Files:**
- Modify: `backend/deploy/lighthouse/docker-compose.yml`
- Modify: `backend/deploy/lighthouse/nginx/default.conf.template`
- Modify: `backend/deploy/lighthouse/.env.example`
- Modify: `backend/src/main/java/com/gaokao/essay/backend/service/StartupAuditService.java`
- Modify: `backend/src/test/java/com/gaokao/essay/backend/service/StartupAuditServiceTest.java`

**Interfaces:**
- Produces: 内网 Redis、AOF 卷、健康检查、可信代理头和 release fail-closed 审计。

- [ ] 写缺 Redis、每日额度或安全开关时审计失败的测试。
- [ ] 增加 Redis Compose 服务和环境配置。
- [ ] 让 Nginx 覆盖客户端来源头。
- [ ] 运行启动审计测试并检查 Compose 配置。

### Task 7: 全量验证

**Files:**
- Verify: all modified frontend and backend files

- [ ] 运行 `node --test tests/*.test.js`、所有前端语法检查和 `git diff --check`。
- [ ] 运行 `./mvnw test` 和后端 `git diff --check`。
- [ ] 检查 release 配置、Redis 健康依赖和未暴露端口。
- [ ] 输出部署命令与真机验证清单，不擅自发布生产。
