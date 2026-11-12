# Fork 改造记录（cpa-usage-keeper）

本文件只存在于本 fork（`ZT-xzwk/cpa-usage-keeper`），上游 `Willxup/cpa-usage-keeper` 没有这个文件，
因此新增/修改它本身永远不会产生合并冲突。

用途：记录每条 fork 内部改造落在哪些文件、与上游同文件的耦合程度，以及合并上游 main 时需要复核什么。
**每次新增改造，请在「改造清单」追加一行，并在「变更记录」写一条日期条目。**

> ⚠️ **合并上游 main 前必须先读本文件，且要读源码而不是只读冲突标记。**
> 真正危险的是「没有文本冲突、类型检查与测试全绿、逻辑却已经被上游改写」——
> 见第 4 节的四类静默逻辑冲突与核对清单。

相关文件：根目录 `AGENTS.md` 是给 AI/自动化代理的入口约定（分支、命令、改造原则、合并前必做）。
注意它被 `.gitignore` 排除（上游把 `AGENTS.md` 与 `.agents/`、`.claude/`、`.codex/` 一并当作 internal docs，不入库），
属于**本机文件**，换克隆或换机器不会自动存在；因此可对外的规则一律以本文件为准，两者冲突时也以本文件为准。

---

## 1. 分支模型

| 分支 | 角色 | 说明 |
| --- | --- | --- |
| `main` | 跟随上游 | 只接受上游合并，不承载改造；本地 `main` 应与 `upstream/main` 一致 |
| `dev/personal` | 长期改造分支 | 所有 fork 改造只提交到这里；CI 也只在这个分支触发 |

远程：

- `origin` → `https://wget.la/https://github.com/ZT-xzwk/cpa-usage-keeper.git`（镜像，**只读**，push 会因无凭据失败）
- `github` → `https://github.com/ZT-xzwk/cpa-usage-keeper.git`（真实仓库，push 走这里）
- `upstream` → 上游 `Willxup/cpa-usage-keeper`

推送命令（本机 git global 有 `insteadof` 把 https 改写为 SSH，必须压掉）：

```bash
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null \
GH_CONFIG_DIR="C:/Users/zt/AppData/Roaming/GitHub CLI" \
git -c credential.helper='!gh auth git-credential' push github dev/personal
```

---

## 2. 改造清单

| # | 改造 | 提交 | 涉及文件 | 上游同文件是否改动 | 合并复核要点 |
| --- | --- | --- | --- | --- | --- |
| 1 | 请求事件 Result 徽章内联展示 CPA HTTP 状态码（`成功 200` / `失败 429`） | `a4fe77da` | `web/src/components/usage/RequestEventResultBadge.tsx`<br>`web/src/components/usage/RequestEventResultBadge.module.scss`<br>`web/src/components/usage/RequestEventsDetailsCard.tsx`（+2 行）<br>`web/src/components/usage/credentials/CredentialRequestEventsList.tsx`（+2 行）<br>`web/src/components/usage/test/RequestEventResultBadge.test.tsx`（新增） | 仅 `RequestEventsDetailsCard.tsx` 有改动（截至基线 `9db74cfc` 之后的 73 个提交里为 +231/-125）；徽章组件与新增测试文件上游均未创建，无同名冲突 | 上游未触碰 result 列渲染块与徽章调用点（其最新版仍是 `id: 'result'` + `failed={row.failed}`），`statusCode={row.event.status_code}` 会直接并排合入；上游改过 `RequestEventsDetailsCard.test.tsx`，但 `aria-label="Success. View request log"` 断言仍在（合并后确认测试通过即可） |
| 2 | fork 镜像构建改为在 `dev/personal` 触发（`main` 不构建，避免未验证上游代码被部署） | `ab975490` | `.github/workflows/build-fork-image.yml` | 否（该文件是 fork 新增） | 若上游新增同名 workflow 需合并；`paths-ignore` 含 `**/*.md`，纯文档提交不会触发构建 |

> 说明：#2 曾以相同内容提交在 `main` 上（`8e2e7c04`），随后 `main` 被 reset 回 `upstream/main`，该提交已丢弃，
> 等价改动保留在 `dev/personal` 的 `ab975490`。

---

## 3. 改造 1 的设计约束（合并时最容易踩的点）

1. **数据来源单一**：状态码只取 `UsageEvent.status_code`（`web/src/lib/types.ts`），
   它由 CPA usage payload 的 `fail.status_code` 落库（`internal/service/redis_usage.go`），
   接口 `internal/api/usage_events.go` 以 `omitempty` 输出。
   **不要**为了补值去关联 `error_events` 表：那张表来自 CPA errors channel、失败专用、缺省写 500，
   且实体没有 `request_id`，无法与 usage 行一对一匹配。
2. **归一化只发生一次**：范围/整数校验集中在 `RequestEventResultBadge.formatStatusCodeLabel`（仅接受 100–599 的整数）。
   调用点直接透传 `event.status_code`，**不要**在行模型里再抄一份 `statusCode` 字段（会形成双重真相并扩大与上游热文件的冲突面）。
3. **零 i18n 变更**：状态码是 HTTP 公共语义，直接与结果词并排，不新增 `i18n/index.ts` 键。
4. **NULL 降级**：2026-09-19（迁移 `20260919_usage_event_stream_status_code`）之前的历史数据、
   以及 CPA 未上报 `fail` 对象时的记录，`status_code` 为 NULL；前端降级为只显示结果词，不做占位符。
   **不做全量历史回填**——唯一权威来源是 CPA request log（`FetchRequestLogByID` 逐条 HTTP + 文本解析，且已轮转），
   成本远高于收益。
5. **不做事后一致性纠正**：`failed` 与 `status_code` 在 CPA payload 中是两个独立字段，
   可能出现「成功 500」这类组合，按「如实呈现上游事实」处理，不视为 bug。

---

## 4. 合并上游的操作步骤

> **本文件是合并前的必读件。** 合并可能「没有文本冲突、tsc/eslint/测试全绿」，但逻辑上已经被上游改写
> ——上游重构了同一段语义、换了等价实现、改了默认值或数据流，三方差分看不出来，只能靠读源码判断。
> 所以第 2 步和第 5 步不能省，第 6 步的检查清单必须逐条勾。

```bash
# 1) 更新上游引用（注意 origin 是镜像，upstream 才是真源）
git fetch upstream --prune

# 2) 【必做】逐个读提交意图，不能只看 --stat
git log --oneline HEAD..upstream/main
# 对每个触及改造文件的提交，读完整 patch（不是只看冲突标记）：
git log -p HEAD..upstream/main -- web/src/components/usage/RequestEventResultBadge.tsx \
  web/src/components/usage/RequestEventResultBadge.module.scss \
  web/src/components/usage/RequestEventsDetailsCard.tsx \
  web/src/components/usage/credentials/CredentialRequestEventsList.tsx

# 3) 合并（在 dev/personal 上做，冲突优先保留本 fork 的改造语义）
git merge upstream/main

# 4) 合并后先看「上游到底带进来什么」，重点看同一功能是否有第二种实现
git diff HEAD@{1}..HEAD --stat | tail -20
git log --oneline HEAD@{1}..upstream/main

# 5) 验证（通过 ≠ 逻辑正确，只是兜底）
cd web && npx tsc --noEmit && npx vitest run && npx eslint . && npx vite build
# Go 侧有改动时：make verify-backend
```

**第 2 步要重点识别的四类「静默逻辑冲突」**（针对改造 1）：

| 类型 | 上游可能怎么改 | 后果 | 怎么发现 |
| --- | --- | --- | --- |
| 数据源被换掉 | 实时 SSE 推送的 event 对象不再携带 `status_code`，或改用新的字段名/嵌套 | 状态码静默变 NULL，界面只剩结果词，测试仍全绿（因为没有断言「必须有值」） | 读 `internal/api/usage_events_live.go`、`useRequestEventsFeed.ts` 里 event 的构造；真实环境抽查一行有值数据 |
| 归一化被重复实现 | 上游在 event 映射层又加了一次状态码格式化/裁剪 | 两处规则不一致，越界值表现分裂 | `grep -rn "status_code" web/src --include=*.ts --include=*.tsx`，确认仍只有徽章一处归一化 |
| 徽章被替换或内联 | 上游把 result 列改成新组件、或把徽章改成纯文本 | 我们的 `statusCode` prop 变成死代码（类型不报错） | 确认 `RequestEventResultBadge` 仍被 `RequestEventsDetailsCard` 与 `CredentialRequestEventsList` 引用 |
| 语义被"修正" | 上游给 `failed` 与 `status_code` 加了强制一致性校验 | 「如实呈现上游事实」的设计被推翻 | 读 diff 里 result 列附近与 event 映射 |

合并后逐条核对：
- [ ] `RequestEventResultBadge` 仍接收并使用 `statusCode`
- [ ] 两个调用点仍是 `statusCode={row.event.status_code}`
- [ ] `data-request-result-status-code` 仍存在（测试会兜底）
- [ ] 徽章宽度仍是 `width:auto + min-width`，没有被上游改回固定宽度
- [ ] 实时/分页两条数据路径产出的 event 都仍带 `status_code`（新增的数据通道最容易漏字段）
- [ ] 归一化仍只有一处（徽章内），行模型里没有被重新塞入副本字段
- [ ] `.github/workflows/build-fork-image.yml` 的触发分支仍是 `dev/personal`

---

## 5. 上游基线跟踪

| 记录时间 | 本地 `upstream/main` | 上游实际 HEAD | 差距 |
| --- | --- | --- | --- |
| 2026-11-12 | `9db74cfc`（本地 ref 陈旧，未 fetch） | `ab827c45`（2026-11-11） | 73 commits / 120 files |

上游这段时间的主线变化（供判断冲突来源）：

- **usage-events 实时推送（SSE）**：新增 `internal/api/usage_events_live.go`、`internal/repository/usage_events_live.go`
  与前端 hook `web/src/components/usage/useRequestEventsFeed.ts`，实现增量刷新、latest/reading 双模式、心跳刷新总量、暂停等；
  `RequestEventsDetailsCard.tsx` 被大幅改写（+231/-125），但**未触碰 result 列渲染块**，与改造 1 不冲突。
- **models 模型目录 + 独立定价 tab**：新增 `internal/api/models.go`，前端新页面/新 tab。
- **credentials 卡片紧凑化改版**：健康度元数据、最近使用时间、卡片尺寸与 tooltip 位置等。
- **quota**：支持 Antigravity Argon 配额组（`internal/quota/antigravity.go` 等）。
- **login**：新增动态品牌背景与半透明面板。

---

## 变更记录

### 2026-10-31
- 新建长期分支 `dev/personal`，确立「main 跟随上游 / dev 承载改造」模型。
- 完成改造 1（状态码徽章，`a4fe77da`），并通过子 agent 审核（PASS-with-nitpicks，无 blocker）；
  按审核意见删除行模型副本字段、修正 span 分支文本、收紧断言、compact 状态码字号 8px→9px。
- 新增 `github` remote（origin 镜像无法 push）。

### 2026-11-12
- 建立本文件，补齐改造清单、设计约束与合并 SOP。
- 盘点上游：`9db74cfc` → `ab827c45` 共 73 个提交、120 个文件；唯一与改造 1 重叠的文件是
  `RequestEventsDetailsCard.tsx`，且上游改动未触及 result 列与徽章调用点（见第 5 节）。
- 按用户要求补充「合并前必读 + 逻辑冲突审查」：第 4 节新增四类静默逻辑冲突（数据源被换、归一化重复、
  徽章被替换、语义被修正）的识别方法与来源文件，核对清单扩充数据通道路径与归一化唯一性两项。
  规则同时写入 `.workbuddy/memory/MEMORY.md`（本地记忆，仅本机可见）。
- 新增根目录 `AGENTS.md`：给 AI/自动化代理的入口约定（分支与远程、改造原则、合并前必做、常用命令、环境坑）。
  该文件被 `.gitignore` 排除（上游视 `AGENTS.md` 为 internal docs），**仅本机存在、不入库**，故规则以本文件为准。
