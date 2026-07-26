# AI Token 防刷加固设计

## 目标

在不明显影响正常学生使用的前提下，限制恶意多账号注册、频繁提交、重复请求和故意制造后处理失败造成的模型 Token 消耗。生产环境的防刷状态必须跨容器重启并支持多后端实例。

## 安全边界

- 微信登录是账号身份来源；release 环境只接受微信 `code2session` 返回的真实 `openid`。
- 设备 ID 由小程序本地生成并持久保存，可被高级攻击者伪造，因此只作为账号和 IP 之外的辅助维度。
- IP 可能被学校、家庭或运营商共享，因此 IP 日额度高于账号和设备额度。
- Redis 是 release 环境的强制安全依赖。Redis 不可用时拒绝消耗 AI 资源的请求，不退化为无保护模式。
- 本设计降低滥用成本与规模，不声称能够阻止拥有大量真实微信账号、设备和代理 IP 的专业攻击者。

## 免费额度

未订阅用户必须同时满足以下限制：

| 维度 | 限制 | 存储 |
|---|---:|---|
| 微信账号总额度 | 5 次 | PostgreSQL `user_usage_quota` |
| 微信账号日额度 | 2 次/自然日 | PostgreSQL `user_usage_quota` |
| 设备日额度 | 4 次/自然日 | Redis |
| IP 日额度 | 20 次/自然日 | Redis |

自然日按 `Asia/Shanghai` 计算。会员用户不消耗免费额度，但仍受分钟级防攻击限流和一次性 Challenge 约束。

额度预留必须具备回滚能力：如果模型调用前失败，释放本次已预留的账号、设备和 IP 额度；只要已向模型上游发起请求，本次额度即视为已消耗，后续解析、内容安全检查、数据库保存或响应中断均不退还。

## 分钟级限流

Redis 使用原子递增与过期时间实现固定窗口限流：

- 微信登录：每 IP 每分钟 12 次。
- Challenge 签发：每 IP 每分钟 10 次。
- 作文或陪练提交：每账号、设备、IP 各每分钟 5 次。
- OCR：每账号、设备、IP 各每分钟 5 次。
- 历史查询：每账号、IP 各每分钟 60 次。

超过限制返回 HTTP 429 和稳定错误码 `RATE_LIMITED`，不得调用模型或 OCR 上游。

## 设备标识

小程序首次需要调用受保护接口时生成 128 位随机设备 ID，存入微信本地存储，后续请求通过 `X-Device-ID` 发送。后端只接受 16–128 个 ASCII 字母、数字、下划线和连字符；缺失或非法时拒绝作文和 OCR 请求。

设备 ID 不包含手机号、微信号或其他个人信息，不用于跨产品跟踪。

## IP 可信链

腾讯云部署中后端端口只绑定 `127.0.0.1`，公网请求必须经过同机 Nginx。Nginx 使用 `$remote_addr` 覆盖 `X-Forwarded-For` 和 `X-Real-IP`，不拼接客户端传入值。后端读取 Nginx 写入的单一地址，并对地址做长度和格式归一化。

## Redis 架构

Docker Compose 增加 `redis:7-alpine`：

- 不映射宿主机端口，只在 Compose 内部网络暴露 `6379`。
- 启用 AOF，使用命名卷保存数据。
- 配置健康检查，后端等待 Redis 健康。
- release 环境设置 `GAOKAO_REDIS_REQUIRED=true`。

Redis 键只保存哈希后的账号、设备和 IP 标识，避免直接存储识别信息。Challenge 使用随机 nonce、用户绑定、短 TTL 和原子一次性消费。分钟和日额度使用 Lua 或等价 Redis 原子操作，确保并发请求不能越过限制。

开发和单元测试允许 `GAOKAO_REDIS_REQUIRED=false`，使用内存实现相同接口；release 配置禁止该降级。

## 后端组件

### `AbuseProtectionStore`

提供限流、日额度、Challenge 创建和一次性消费的抽象接口。实现包括：

- `RedisAbuseProtectionStore`：生产实现。
- `InMemoryAbuseProtectionStore`：开发与单元测试实现。

### `RequestSecurityService`

负责按账号、设备和 IP 组合执行分钟级限制，统一生成稳定错误响应。

### `ChallengeService`

不再自行保存 `ConcurrentHashMap`，通过 `AbuseProtectionStore` 保存和原子消费 Challenge。

### `MembershipService`

继续用数据库维护账号总额度与账号日额度，并新增设备/IP 日额度预留。服务接收注入的 `Clock`，所有日期计算使用同一个时钟，测试可固定时间。

### `EssayService`

记录模型调用是否已开始。异常处理只在调用开始前释放预留；调用开始后保留所有已消耗额度。

## 配置

新增或补齐以下配置：

```env
GAOKAO_TRIAL_TOTAL_LIMIT=5
GAOKAO_TRIAL_DAILY_LIMIT=2
GAOKAO_DEVICE_DAILY_LIMIT=4
GAOKAO_IP_DAILY_LIMIT=20
GAOKAO_REDIS_REQUIRED=true
SPRING_REDIS_HOST=redis
SPRING_REDIS_PORT=6379
```

release 启动检查必须确认：

- 数据库存储已开启；
- Redis 已连接且为强制模式；
- `trial-daily-limit`、设备日额度和 IP 日额度均大于 0；
- 微信严格登录、Challenge、消息安全和分钟限流均已开启；
- 本地登录与请求 `openid` 降级均已关闭。

任一条件不满足时拒绝启动，避免误配置上线。

## 测试

1. `MembershipService` 使用固定 `Clock`，验证账号总额度、账号日额度、跨日重置和失败回滚。
2. 验证模型调用前失败退还额度，模型调用开始后失败不退还。
3. 验证设备和 IP 日额度达到上限后拒绝请求。
4. 验证账号、设备、IP 分钟限流独立生效。
5. 验证 Challenge 只能使用一次、过期失效、用户不匹配时拒绝。
6. 验证 Redis 原子并发计数不会超限。
7. 验证 release 配置缺少 Redis 或任一安全开关关闭时启动审计失败。
8. 前端测试验证所有作文、陪练、OCR 和 Challenge 请求均携带合法 `X-Device-ID`。

## 部署与观测

- 日志记录被触发的限制类型、哈希主体、请求路径和时间窗口，不记录原始 openid、设备 ID、作文内容或完整 IP。
- 为 `RATE_LIMITED`、`TRIAL_DAILY_LIMIT_REACHED`、`DEVICE_DAILY_LIMIT_REACHED`、`IP_DAILY_LIMIT_REACHED` 和 Redis 故障分别计数。
- 部署顺序为：启动 Redis并确认健康、构建并启动后端、检查启动审计、发布小程序体验版、真机验证后再上传正式版。
- Redis 故障期间给用户返回“服务保护中，请稍后重试”，不得绕过保护调用模型。
