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
- 完整构建：`npm run build` = collect → `hexo clean` → `hexo generate` → `node scripts/check-pages.js`（体检不过即 exit 1，deploy.yml 在发布前也跑同一门禁）。**坑**：hexo generate 不清理 `public/` 旧产物，重建必须先 clean。
- **两级分类（OB-ENG-SOP-06，2026-11-14）**：内容库每篇文章 frontmatter 只有单一细分分类；`bin/collect.js`（v7）构建期读取 `content/90-OB工程管理/方案/06-分类映射.json` 把 46 个细分分类归入 8 个领域，注入嵌套 `categories: [[领域, 细分]]`。主题侧（layout.ejs 侧栏 / archive.ejs / category.ejs / index.ejs）按 hexo 分类树两级渲染。**改分类归属只改映射 JSON，不动 collect.js**；映射文件缺失时构建告警并 fallback 到「其他」。
- **Obsidian 方言转换（themes/zeek/scripts/obsidian.js）**：before_post_render 优先级 **1**（必须先于 hexo 内置 `backtick_code_block`，否则 ```mermaid 围栏已被降级成 highlight 代码块）：`==高亮==`→`<mark>`、`%%注释%%` 删除、脚注 `[^id]`、`[!type]` callout（12 类型 + 别名表）→ 结构化 div、```mermaid → `<div class="mermaid">`。客户端增强（main.js）按 `window.ZEEK_CFG`（_config.yml `zeek:` 段）加载 KaTeX / mermaid / live2d / 背景音乐，CDN 失败一律静默降级。
- **分类图标（themes/zeek/scripts/icons.js）**：`catIcon()` helper 读 06-分类映射.json 的 `icons` / `groupIcons` 表（v1.1.0），缺省 📁；**改图标只改映射 JSON**。
- **全站体检（scripts/check-pages.js）**：对 `public/` 按页面类型断言（chrome/分类树/文章特征/无 Obsidian 语法残留），`source/_posts/` 与 search.json 交叉核对；fail 输出明细并 exit 1。

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
2. **docs/README.md** — 文档归类总索引 + 命名规范（先看这个再按类取文档）
3. **docs/URD-01-需求规格.md** — 需求 FR/NFR/验收标准（A 规范层）
4. **docs/SDD-01-概要设计.md** — 架构数据流、主题结构、门禁/部署/暴露面设计、ADR（A 规范层）
5. **docs/UI-01-原型说明.md** — 视图映射、交互清单、设计 tokens、定稿后追加项（A 规范层）
6. **docs/guides/G-01-功能原理解析.md** — 每个 feature 的原理/技术/架构图/参考（B 原理层，第九轮）
7. **docs/guides/G-02-OB转换与命名指南.md** — OB → 站点转换规则、命名规范、语法要求、现状体检清单（B+C，第九轮）
8. **docs/guides/G-03-功能说明与使用指南.md** — 全部功能列表 + 使用方法 + 人工配置项（C 操作层）
9. **docs/guides/G-04-SEO-RSS-评论详解.md** — SEO/RSS/giscus 评论原理、验证方法、常见问题（含 giscus App 安装步骤）
10. **docs/guides/G-05-PAT替换指南.md** — classic PAT → fine-grained PAT 替换全步骤
11. **ai-obsidian `90-OB工程管理/rules/`**（01-目录 · 02-元数据 · 03-md格式 · 06-自动检查 · 07-发布全流程 · 08-仓库）与 `90-OB工程管理/skills/`
12. **05 规范**（`90-OB工程管理/方案/05-发布流与AI使用规范.md`）— 顶层受控规范：§3 门禁模型、§4.2 AI 使用边界、§5 凭据与身份、§5.4 公开仓红线、§7 整改台账

## 8 公开仓暴露面红线（hexo-engine 已 public）

1. **Actions 日志不 verbose**：不 echo 内容/文件清单以外的敏感信息（token、私库文件内容等）。
2. **永不上传 artifact**（upload-artifact 禁用）。
3. **未发布内容门禁（G1~G3）必须在公开前生效**：未过门禁的内容不得出现在任何公开产物。
4. fork 本仓者拿不到 secrets（GitHub secrets 不随 fork 传递），无法拉取私有内容库——内容机密性由 ai-obsidian 的 private 设置承担。

## 9 遗留清单（2026-11-15 同步）

| # | 项 | 状态 | 负责人 |
|---|---|---|---|
| 1 | fine-grained PAT 替换（替换 NOTIFY_TOKEN / DEPLOY_TOKEN，权限矩阵见 05 规范 §5.1；GitHub 无创建 API，须网页手动） | 待执行 | 人（Zeek） |
| 2 | 05 规范 draft → 正式签发（置 `status: published`） | 待人评审 | 人（Zeek） |
| 3 | ai-obsidian vault 6 个本地提交未推送 | 待推送（认证见 §6） | 人定时机 |
| 4 | P1-4 quality-gate 完整脚本化（check-tags.py strict + CI fail） | 待执行（跟踪于 05 规范 §7） | AI |
| 5 | 评论系统 / 访问统计 | giscus 容器已上线但**需人网页安装 giscus App**；访问统计已配置 `goatcounter-zeek-zhao`（需人在 goatcounter.com 注册同名站点才计数） | 人（Zeek） |
| 6 | 首页分页链接 | **已落地**（第六轮 more-posts + paginator /page/N/） | 已完成 |

已落地（2026-11-14）：自研主题 zeek 上线并部署验收；hexo-engine 改 public（红线 §8）；P1-5 门禁收紧；P1-6 package-lock.json 入库；docs/ 四份文档；模板修复三连——①侧栏分组默认折叠且修复 sg-head 内联 onclick 与 JS 监听**双触发抵消**导致的"不能折叠"②分类归档页侧栏只渲染当前分类（layout.ejs `activeCat` 过滤）③搜索修复（main.js 引用 `cmdkInput`/`drawerBtn` 与实际 DOM id `cmdkQ`/`menuBtn` 不匹配，已对齐）；`_config.yml` 孤儿 `search:`（search.xml）配置已清理。同日追加：**两级分类体系**（OB-ENG-SOP-06 映射 JSON + collect.js v7 注入嵌套 categories + 主题两级渲染，见 §4）；**第五轮**：OB 语法模板文章（`32-工具/obsidian/Obsidian 语法模板与转换体检.md`）+ obsidian.js 方言滤镜（callout/高亮/脚注/mermaid，collect.js 双链正则修复排除行内码嵌套）+ check-pages.js 全站体检门禁（deploy.yml 发布前 step）+ 分类图标表（06 映射 v1.1.0 `icons`/`groupIcons` + icons.js `catIcon`）+ 装饰层（KaTeX/mermaid/live2d/背景音乐/滚动显现，`_config.yml zeek:` 段开关，CDN 失败静默）。

**第六轮（2026-11-14）已落地**：评论 giscus（文章页懒加载 + 主题切换同步换肤，Discussions 已开启，Announcements 分类）；RSS tom.xml 摘要模式（footer 链接 + head 发现）；SEO 三件套（canonical 剥 index.html / OG / Twitter Card / sitemap.xml / robots.txt）；首页与归档分页导航；图片点击放大（自研 lightbox 零依赖）；复制本文链接；手机端补强（宽表格与 cmp-table 横向滚动、cmdk 92vw、article-meta 换行）。新增流水线依赖 hexo-generator-feed / hexo-generator-sitemap（主题仍零依赖）。写作指南见 §7 第 7 条。


### 第八轮（2026-11-15）：上下篇定序 + 全文搜索 + 三份运维文档

- **上一篇/下一篇乱序修复**：hexo 内置 `page.prev/next` 在同日期文章间顺序不稳定（本库大量同日文章），且方向与首页列表阅读流相反。新增 helpers.js `sortedPosts(site)`（date 降序 + 同日期按 path 字母序稳定排序，结果缓存 site._zeekSorted），post.ejs 改用它定序：← 上一篇 = 更新一篇，下一篇 → = 更早一篇，与首页滚动方向一致。
- **全文搜索**：collect.js pass 1 逐篇生成 `text` 字段（正文剥图片/raw 后限 1200 字符）进 search.json；main.js `matchEntry` 覆盖 text、新增 `snippet()` 展示命中片段（关键词上下文 ±30/70 字符）、标题命中结果排前。
- **文档三份**：docs/guides/G-03-功能说明与使用指南.md（16 项功能 + 使用方法 + 人工配置表）、docs/guides/G-04-SEO-RSS-评论详解.md（三块原理/实现/验证/FAQ，含 giscus App 安装四步）、docs/guides/G-05-PAT替换指南.md（fine-grained PAT 最小权限设计 + 创建/替换/验证/撤销步骤）。
- **教训**：collect.js 全局段引用 pass 1 局部变量 `body` → ReferenceError exit 1（generate 只出 17 文件）；`text` 计算必须在 `handleFile` 内。
### 第九轮（2026-11-15）：电台播放器 / pjax / 高亮 / 横排 / 统计 / 文档体系

- `analytics: "goatcounter-zeek-zhao"` 写入 `_config.yml zeek` 段；main.js 在 pjax 切页成功后手动 `goatcounter.count({path,title})` 上报（count.js 默认只整页 load 上报一次）。
- 背景音乐升级为**网易云电台 971200264**：构建期抓 543 集节目单（`source/bgm/playlist.json`，API 需 Referer + `os=pc` Cookie，浏览器 CORS 不可直连）；`CFG.bgm` 以 `.json` 结尾走电台模式（顺序 / 单曲循环 / 选歌 / 进度条 / localStorage 续播），其他值仍兼容旧单文件模式。
- **站内切换不中断播放**：main.js 重写为「全局一次绑定 + initPage() 每次导航重跑」，新增 pjax（同源 fetch → DOMParser → 局部替换 #view/#sideTree/#toc → pushState → initPage），失败回落整页跳转；`spyCleanups` 统一释放监听器。
- 分页竖排根因：hexo paginator 输出扁平 `<a class="page-number">`（无 .pagination 包裹），`.index-pager` 的 `flex-direction:column` 让每页码独占一行 → 改 `text-align:center`。
- ⌘K 搜索命中词 `<mark class="hl">` 高亮（标题 + 正文片段，先转义再单条交替正则包裹）。
- 文档体系：`docs/guides/G-02-OB转换与命名指南.md`（引擎视角：命名规则/转换规则/语法要求/1155 篇现状体检 7 篇待规范）、`docs/guides/G-01-功能原理解析.md`（每 feature 原理/技术/架构图/参考）、`docs/README.md`（8 份文档 A/B/C/D 归类 + 命名规范 + 现状对照 + 单一数据源约定）；§7 索引重排 12 条。
- BDD 新增 `tests/features/12-round9.feature` 6 场景；旧「live2d 与 BGM 按配置正确装配」步骤断言「不应渲染 bgmBtn」随配置变更同步改为「应渲染且初始 hidden」。

### 第十轮（2026-11-16）：BGM 加固 / 文档重命名 / 统计提示

- **BGM 不换源、只加固**：`mode` 默认改为 `loop1`（单曲循环）；面板按钮初始文案同步；`error` 事件先尝试把浏览器解析出的 `http://mN.music.126.net/...` 改 https 直连重试一次（`httpsTried` 防重入），仍失败则标灰并自动跳到下一集可播的，全失效则停机提示「音源暂不可用」，避免死循环。网易云外链 302 到 http CDN 的 mixed-content 根因未消除，属已知边界。
- **5 份文档物理重命名**：`git mv` 到 `docs/guides/` 并改 `G-01~G-05` 规范名；Node 脚本一次性同步全仓引用（`AI.md §7`、URD/SDD/UI、指南互链）；`tests/bdd-runner.js` 文档存在性断言改 `guides/G-0N-…`，feature 步骤文本不写死文件名；`docs/README.md` 升 v1.1 并记录执行过程，8/8 文档现均合规。
- **GoatCounter 静默边界写进文档**：`goatcounter-zeek-zhao` 必须在 goatcounter.com 注册同名站点才计数；未注册时脚本正常加载、页面无报错但无数据。`docs/README.md §5` 与 `docs/guides/G-03-功能说明与使用指南.md §2.7/§3` 均加可见提示。

## 10 已知坑与教训

1. **bearer 不被接受**：`AUTHORIZATION: bearer <PAT>` 会回落交互式用户名（`fatal: could not read Username`），必须 `basic` + `x-access-token:<PAT>` 形式（05 规范 §5.1 实测教训）。
2. **mirror push 不能带 refspec**：`git push --mirror` 无法限定分支；推 gh-pages 用显式 refspec（`git push -f origin gh-pages:gh-pages`）。
3. **rebase 不改作者身份**：rebase 保留原 author，若历史身份错误需用 `filter-branch --env-filter` 类**二次改写**，且改写后旧 SHA 全部失效——文档不固化 SHA，核对以 `git log` 为准（05 规范 §5.3）。
4. **Windows 中文编码**：md 一律 UTF-8（无 BOM）；PowerShell 读写文件显式 `-Encoding utf8`，避免 GBK 混入导致 frontmatter 解析失败。
5. **改标题 = 换短链**：abbrlink = crc32(title)，正式发布后改标题会断链；改前查 post-map 映射页（05 规范 §4.2 习惯 5）。
6. **before_post_render 优先级**：hexo 内置 `backtick_code_block` 与自定义滤镜同为 before_post_render；obsidian.js 注册优先级 1 先行，晚注册/低优先级会拿到被降级的 highlight 代码块，```mermaid 围栏转换失效（第五轮实测）。
7. **regex 计数类断言要先剥代码**：check-pages.js 的 no-raw / mermaid / callout 计数先剥 `<head>`、subtitle、pre/figure、行内 `<code>` 与教学围栏内容，再对剩余正文断言，否则模板篇与教程篇必误报（第五轮实测）。

8. **配置变更要同步查 BDD 断言口径**：把 `zeek.bgm` 从空改成节目单后，layout.ejs 会渲染 `bgmBtn`，旧 BDD 断言「不应渲染」立即失败；`escHl` 逐词替换会把已插入的 `<mark>` 再包一层，必须用单条交替正则。
9. **pjax 的分层初始化**：整页刷新只跑一次全局绑定；局部替换 #view 后，TOC spy / 代码复制按钮 / 折叠默认 / 归档筛选 / KaTeX / mermaid / reveal / 复制链接 / giscus 全部要重跑 `initPage()`，且 scroll 监听要用 cleanup 数组释放，否则重复叠加。
10. **write 工具会把个别英文词当占位符脱敏**（如 "Jenkins" → `{{PASSWORD_...}}`）：写文档后务必回读验证关键字符串，必要时用字符串拼接绕过占位符填充。
11. **批量改名要防二次前缀**：`G-01-功能原理解析.md` 里再全局替换 `功能原理解析` 会变成 `G-01-G-01-…`；用 `(^|[^\w-])旧名` 正则排除已带 `G-0N-` 前缀处，并单独核对 markdown 标题（曾出现 `# zeek 站点G-01-功能原理解析`）。

## 11 AI 使用边界（引自 05 规范 §4.2，摘要）

AI 在本工程内**一律禁止**：未经人批准翻转 `published`/`status`（G3 是人的独占权）；改动受控文件（`.github/`、rules/、方案/ 等）不走修订记录；未经人明确批准 force push / 改写历史 / 直接向产物仓推送；把 token/私钥**值**写入任何文件；绕过 AI.md 路由直接改内容；把构建产物当手工编辑对象。

AI 必须遵守：每任务先读 AI.md 与路由；质检以脚本结论为准（LLM 补充项标注「脚本外」）；文档与实现冲突时以流水线实际行为为准并提整改；每操作在 `90-OB工程管理/log/YYYY-MM.md` 留一行；提交按 §6 身份铁律执行。


