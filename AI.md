# AI.md — AI 接手本项目的入口

> AI 每次任务先读本文件；与上位规范冲突时，以 ai-obsidian `90-OB工程管理/方案/05-发布流与AI使用规范.md`（OB-ENG-SOP-05）为准。
> 本仓库 2026-11-14 起为 **public** 仓库，暴露面红线见 §8 与 05 规范 §5.4。

## 1 项目快照（三仓各一句话）

| 仓库 | 可见性 | 职责 |
|---|---|---|
| **ai-obsidian**（私有） | private | Obsidian 内容库：vault 正式内容；G1~G3 门禁后翻转 published，push 触发发布 |
| **hexo-engine**（本仓，D:\zeek\AiData\code\hexo-engine） | **public** | 构建仓：CI 克隆内容库 → `bin/collect.js` 过滤/转换 → `hexo generate` → 孤儿强推产物 |
| **zeek-zhao.github.io**（公开产物） | public | 只被流水线写入 gh-pages 分支，由 GitHub Pages 服务为 https://zeek-zhao.github.io |

## 2 仓库拓扑与 URL

- `https://github.com/zeek-zhao/ai-obsidian` — 内容库；workflow：`.github/workflows/notify-publish.yml`（push[main] → repository_dispatch）
- `https://github.com/zeek-zhao/hexo-engine` — 本仓；workflow：`.github/workflows/deploy.yml`（构建 + 发布，唯一事实源）
- `https://github.com/zeek-zhao/zeek-zhao.github.io` — 产物仓（gh-pages 分支）

## 3 环境与工具

- OS：Windows PowerShell（主）+ WSL Ubuntu-24.04-Zeek（脚本/本地构建）
- Node 20（hexo 7.3.0，见 package.json）、git 2.x
- 本地认证用环境变量 `GH_TOKEN`（临时注入，不落盘，见 §5）

## 4 本地构建三步

```powershell
git clone https://github.com/zeek-zhao/ai-obsidian.git content   # 1. 内容库（私有，需 GH_TOKEN 认证，见 §5）
node bin/collect.js content                                      # 2. 采集转换：content/ → source/_posts 等
npx hexo generate ; npx hexo server                              # 3. 构建并本地预览 http://localhost:4000
```

- `content/` 已 gitignore；collect.js 输出的 `source/_posts/`、`search.json`、`post-map`、tags/categories 统计页全部是**构建产物，禁止手工编辑**。
- 主页 `/` 由主题提供；`source/index.html` 动态主页生成已停用（URD-01 FR-4）。

## 5 部署机制

- **触发链**：ai-obsidian push[main] → notify-publish.yml（`secrets.NOTIFY_TOKEN`）发 repository_dispatch → deploy.yml：checkout → 克隆 ai-obsidian 到 `content/`（`secrets.DEPLOY_TOKEN`）→ `npm install && npm run build` → `public/` 内孤儿 `git init -b gh-pages` → `git push -f`。
- **兜底**：每日 UTC 2:00 cron；hexo-engine push[main] 或手动 workflow_dispatch 亦可触发。上线时效约 2-3 分钟；回调失败最长延迟 24h，急需上线用手动触发。
- **查 run**：GitHub Actions 页，或 `gh run list -R zeek-zhao/hexo-engine` / `gh run view <id> --log`。
- **回滚**：文章改回 `published: false` 重建即下线；整站异常 revert 触发提交后重跑（详见 docs/SDD-01 §6）。

## 6 身份 / 凭据铁律

**提交身份（05 规范 §5.2，引用不复制）**：所有 git 提交（人工与 CI）author 与 committer 必须精确等于 `zeek.zhao <zeek.zhao@foxmail.com>`，无例外。每次提交前**显式导出 4 个环境变量**（`GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` / `GIT_COMMITTER_NAME` / `GIT_COMMITTER_EMAIL`）覆盖外部注入值——它们优先级高于 `git config`，仅配置 config 挡不住。提交后 `git log -1 --format='%an <%ae> | %cn <%ce>'` 抽查。

**HTTPS 认证**：用 **basic extraheader，不用 bearer**（实测 GitHub smart HTTP 拒绝 bearer PAT）：

```powershell
$B64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("x-access-token:$env:GH_TOKEN"))
git -c "http.extraheader=AUTHORIZATION: basic $B64" push origin main
```

**凭据**：仓库仅两个 secret——`NOTIFY_TOKEN`（ai-obsidian）、`DEPLOY_TOKEN`（hexo-engine，当前为同一把临时 classic PAT）。token 值不写入任何文件、不写入 `.git/config`、不进文档；AI 不得创建或写入 PAT（替换计划见 §9）。

## 7 文档索引（阅读顺序）

1. **AI.md**（本文件）— 接手入口
2. **docs/URD-01-需求规格.md** — 需求 FR/NFR/验收标准
3. **docs/SDD-01-概要设计.md** — 架构数据流、主题结构、门禁/部署/暴露面设计、ADR
4. **docs/UI-01-原型说明.md** — 视图映射、交互清单、设计 tokens（原型 `D:\zeek\AiData\code\blog-ui-prototype\index.html` 已定稿）
5. **ai-obsidian `90-OB工程管理/rules/`**（01-目录 · 02-元数据 · 03-md格式 · 06-自动检查 · 07-发布全流程 · 08-仓库）与 `90-OB工程管理/skills/`
6. **05 规范**（`90-OB工程管理/方案/05-发布流与AI使用规范.md`）— 顶层受控规范：§3 门禁模型、§4.2 AI 使用边界、§5 凭据与身份、§5.4 公开仓红线、§7 整改台账

## 8 公开仓暴露面红线（hexo-engine 已 public）

1. **Actions 日志不 verbose**：不 echo 内容/文件清单以外的敏感信息（token、私库文件内容等）。
2. **永不上传 artifact**（upload-artifact 禁用）。
3. **未发布内容门禁（G1~G3）必须在公开前生效**：未过门禁的内容不得出现在任何公开产物。
4. fork 本仓者拿不到 secrets（GitHub secrets 不随 fork 传递），无法拉取私有内容库——内容机密性由 ai-obsidian 的 private 设置承担。

## 9 遗留清单（2026-11-14 同步）

| # | 项 | 状态 | 负责人 |
|---|---|---|---|
| 1 | fine-grained PAT 替换（替换 NOTIFY_TOKEN / DEPLOY_TOKEN，权限矩阵见 05 规范 §5.1；GitHub 无创建 API，须网页手动） | 待执行 | 人（Zeek） |
| 2 | 05 规范 draft → 正式签发（置 `status: published`） | 待人评审 | 人（Zeek） |
| 3 | ai-obsidian vault 6 个本地提交未推送 | 待推送（认证见 §6） | 人定时机 |
| 4 | P1-4 quality-gate 完整脚本化（check-tags.py strict + CI fail） | 待执行（跟踪于 05 规范 §7） | AI |
| 5 | 评论系统 / 访问统计 | 本轮不加，记 TODO | 人拍板后立项 |
| 6 | 首页为精选落地页（最近 6 篇 + 热门 + 分类卡），无翻页链接；generator-index 仍生成 /page/N/ 但未被链接引用 | 可选优化 | AI |

已落地（2026-11-14）：自研主题 zeek 上线并部署验收；hexo-engine 改 public（红线 §8）；P1-5 门禁收紧；P1-6 package-lock.json 入库；docs/ 四份文档；模板修复三连——①侧栏分组默认折叠且修复 sg-head 内联 onclick 与 JS 监听**双触发抵消**导致的"不能折叠"②分类归档页侧栏只渲染当前分类（layout.ejs `activeCat` 过滤）③搜索修复（main.js 引用 `cmdkInput`/`drawerBtn` 与实际 DOM id `cmdkQ`/`menuBtn` 不匹配，已对齐）；`_config.yml` 孤儿 `search:`（search.xml）配置已清理。

## 10 已知坑与教训

1. **bearer 不被接受**：`AUTHORIZATION: bearer <PAT>` 会回落交互式用户名（`fatal: could not read Username`），必须 `basic` + `x-access-token:<PAT>` 形式（05 规范 §5.1 实测教训）。
2. **mirror push 不能带 refspec**：`git push --mirror` 无法限定分支；推 gh-pages 用显式 refspec（`git push -f origin gh-pages:gh-pages`）。
3. **rebase 不改作者身份**：rebase 保留原 author，若历史身份错误需用 `filter-branch --env-filter` 类**二次改写**，且改写后旧 SHA 全部失效——文档不固化 SHA，核对以 `git log` 为准（05 规范 §5.3）。
4. **Windows 中文编码**：md 一律 UTF-8（无 BOM）；PowerShell 读写文件显式 `-Encoding utf8`，避免 GBK 混入导致 frontmatter 解析失败。
5. **改标题 = 换短链**：abbrlink = crc32(title)，正式发布后改标题会断链；改前查 post-map 映射页（05 规范 §4.2 习惯 5）。

## 11 AI 使用边界（引自 05 规范 §4.2，摘要）

AI 在本工程内**一律禁止**：未经人批准翻转 `published`/`status`（G3 是人的独占权）；改动受控文件（`.github/`、rules/、方案/ 等）不走修订记录；未经人明确批准 force push / 改写历史 / 直接向产物仓推送；把 token/私钥**值**写入任何文件；绕过 AI.md 路由直接改内容；把构建产物当手工编辑对象。

AI 必须遵守：每任务先读 AI.md 与路由；质检以脚本结论为准（LLM 补充项标注「脚本外」）；文档与实现冲突时以流水线实际行为为准并提整改；每操作在 `90-OB工程管理/log/YYYY-MM.md` 留一行；提交按 §6 身份铁律执行。
