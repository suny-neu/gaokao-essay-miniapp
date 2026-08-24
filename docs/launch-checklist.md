# 高考作文批改小程序 · 上线清单

> 最后更新：2026-07-19
> 状态说明：✅ 已就绪（我已完成）/ 🔴 阻塞（你不做真机就走不通）/ 🟠 必做 / 🟡 确认项

---

## 一、后端 / 运维侧（已由我完成，你不用管）

- ✅ Java 后端已部署在腾讯云 `api.gaokaoessay.cn`（Docker Compose，3 容器：backend / nginx / umi-ocr）
- ✅ 微信登录接口 `/api/auth/wx-login` 已在线可用（CVM 实测，code2Session 配置齐全）
- ✅ OCR 致命隐患已修复：地址改为 Docker 内网 `http://umi-ocr:1224`，端口锁内网不再暴露公网，容器 `--restart unless-stopped`
- ✅ AI 模型已切到阿里云百炼 `qwen-plus`（公共地址，key 已验证可用，成本约 ¥36/万次批改）
- ✅ HTTPS 证书有效至 2026-09-29，certbot 自动续期已开
- ✅ 健康检查 `/health` 公网全绿（`reviewReady=true / issuesCount=0 / storageMode=postgres`）
- ✅ 回滚镜像 `backup-20260719-194023` 仍在，出问题可秒回滚

## 二、小程序前端代码（已写好，待你上传）

- ✅ `utils/config.js` 默认走线上 `https://api.gaokaoessay.cn`（开发者工具/真机/体验版/正式版统一）
- ✅ 微信一键登录 UI 已加（首页登录状态条 + `pages/login` 独立页）
- ✅ `pages/tutor` 的 `essayType` 未定义报错已修
- 🟠 你需在微信开发者工具里 **「上传」** 这些前端改动（见第四节）

---

## 三、你必须手动做的（微信公众平台 + 真机）

### A. 服务器域名白名单 🔴 阻塞
路径：微信公众平台 (mp.weixin.qq.com) → 开发 → 开发管理 → 开发设置 → 服务器域名 → 修改

- [ ] **request 合法域名**：`https://api.gaokaoessay.cn`
- [ ] **uploadFile 合法域名**：`https://api.gaokaoessay.cn`（OCR 拍照上传用）
- [ ] **downloadFile 合法域名**：`https://api.gaokaoessay.cn`（建议顺手加）
- [ ] socket 合法域名：留空（本小程序未用 WebSocket）

> 注意：域名必须带 `https://` 前缀，已备案+HTTPS，一行一个，不带路径/端口。
> 保存后需用**管理员微信扫码确认**，立即对体验版/正式版/真机生效，无需重新上传代码。
> ⚠️ **务必先加白名单，再上传前端**——否则上传后的版本在真机上照样连不上后端。

### B. 用户隐私保护指引 🟠 必做
路径：微信公众平台 → 开发管理 → 用户隐私保护 → 填写指引

- [ ] 声明「拍照」用途（OCR 拍作文）
- [ ] 声明「相册」用途（从相册选作文图）
- [ ] 声明「上传图片」用途
- [ ] 声明「AI 批改由阿里云百炼大模型提供」（合规建议）
- [ ] 保存并提交

### C. 上传与发布流程 🟠 必做
1. [ ] 微信开发者工具打开 `gaokao-essay-miniapp` 项目
2. [ ] 右上角 **「上传」** → 版本号（如 `1.0.0`）+ 项目备注
3. [ ] 公众平台 → 版本管理 → 把开发版本设为 **「体验版」**
4. [ ] 自己真机扫码，走一遍下方「真机自测清单」
5. [ ] 自测通过 → 点 **「提交审核」**
6. [ ] 审核通过（几小时~1~2 天）→ 点 **「发布」**

### D. 真机自测清单 🟠 必做（真机/体验版走，别只在模拟器看）
- [ ] 首页正常加载，显示倒计时/学习数据
- [ ] 点「微信登录」→ 成功拿到 token，状态条变「已登录」
- [ ] 进 `pages/login` 能看到 OpenID / 用户 ID / 有效期
- [ ] 陪练对话能正常返回（验证 AI 真通，别只看健康检查）
- [ ] 作文批改能正常返回详细批改（关键！验证 `qwen-plus` 真生成）
- [ ] 历史记录能读写
- [ ] 试用次数限制提示正常（超限有提示）
- [ ] OCR 拍照/选图能识别文字
- [ ] 隐私授权弹窗正常
- [ ] 异常时（断网/接口错）有友好提示，不白屏

### E. 类目 / 资质 🟡 确认
- [ ] 核对微信类目：教育类「高考/学习」可能需单独**类目资质**，提审前在公众平台「设置 → 服务类目」确认
- [ ] ICP 备案（你说已备案）与小程序主体一致

---

## 四、安全与成本提醒 ⚠️

- ⚠️ **阿里云百炼 API Key 已通过截图+聊天明文暴露过**，建议去阿里云控制台**禁用旧 key、生成新 key**，并用「复制粘贴」而非截图发我。
- 💡 健康检查 `generationAvailable:true` 只校验配置非空、**不真发 AI 请求**，不能当作 AI 可用证明——以真机批改返回为准。
- 💡 成本：当前 `qwen-plus` 约 ¥36/万次批改；如量很大可继续降档 `qwen-turbo`（¥12/万次，质量偏弱）。
- 💡 关注阿里云百炼余额，建议开用量告警，避免上线后突然断服务。

### 发布版激励视频广告位 🟠 必做

发布包静态读取仓库跟踪的 `utils/release-ad-config.js`，因此能在微信运行时直接加载。该文件的默认值为空；发布生成器会临时把它改为广告位 ID，`--dev` 会恢复为空值。广告位 ID 属于公开的客户端配置，不是密钥；它会产生工作区修改，只有在确实希望将该发布包输入提交到版本库时才提交。

1. [ ] 在微信公众平台创建并取得**激励视频**广告单元 ID（格式为 `adunit-...`）。
2. [ ] 在前端项目根目录执行：

```bash
GAOKAO_RELEASE_AD_UNIT_ID='adunit-你的真实广告位ID' node scripts/generate-release-ad-config.js
GAOKAO_RELEASE_AD_UNIT_ID='adunit-你的真实广告位ID' node scripts/generate-release-ad-config.js --validate
node --test tests/*.test.js
```

缺少、占位符或格式不合法的 ID 会使生成/校验失败；校验也会在生成文件与环境变量不一致时失败。日常本地开发或测试可执行 `node scripts/generate-release-ad-config.js --dev`，它将被跟踪的打包输入复位为明确不可用的空配置，因此应用会保持在本地配置而不会误启用发布广告奖励。打包完成后，如不准备提交该广告位 ID，请再次执行 `--dev` 再提交其他代码。

---

## 五、回滚预案（万一上线翻车）

```bash
# 在 CVM 上把后端回滚到改动前镜像
sudo docker tag backup-20260719-194023 gaokao-essay-backend:latest
cd /opt/gaokao-essay-backend && sudo docker compose -f deploy/lighthouse/docker-compose.yml up -d
```
