---
title: 概要设计说明书（SDD-01）
doc_id: HEXO-ENG-SDD-01
version: v1.2
date: 2026-11-14
updated: 2026-11-14
status: draft
tags: [hexo-engine, 概要设计, 发布流]
description: hexo-engine 的架构与数据流、自研主题 zeek 结构、三级门禁落点、部署链与公开仓暴露面设计、回滚预案，以及自研主题/EJS/search.json 等关键技术决策记录（ADR）。
---

# 概要设计说明书（SDD-01）

## 0 文档控制（ISO 9001 §7.5 对齐）

| 项 | 值 |
|---|---|
| 文件编号 | HEXO-ENG-SDD-01（下称 SDD-01） |
| 版本 | v1.2（方言转换 + 图标 + 装饰层 + 体检门禁） |
| 编制 | AI（依据 2026-11-14 UI 定稿与公开仓决议） |
| 审核 / 批准 | 人（Zeek） |
| 生效条件 | 人批准后置 `status: published` |
| 上位规范 | ai-obsidian OB-ENG-SOP-05（05 规范）；需求依据 docs/URD-01-需求规格.md |
| 关联文件 | docs/URD-01 · docs/UI-01 · AI.md |

### 0.1 修订记录

| 版本 | 日期 | 修订内容 | 批准 |
|---|---|---|---|
| v1.0 | 2026-11-14 | 首版：架构数据流、主题结构、门禁与部署链、暴露面设计、回滚预案、ADR×4 | 待人批准 |
| v1.1 | 2026-11-14 | 主题 zeek 已上线并验收；§2 模板表按实际落地状态校正；新增 §2.1 两级分类体系（OB-ENG-SOP-06：映射 JSON → collect.js v7 注入嵌套 categories → catTree helper → 主题两级渲染）；ADR-3 补注 search.json 增加 group 字段 | 待人批准 |
| v1.2 | 2026-11-14 | 第五轮：新增 §2.2 Obsidian 方言转换与装饰层（obsidian.js 优先级 1 抢跑 / mermaid 构建期 div / 图标表 / zeek 配置段 / check-pages 体检门禁）；ADR-5 | 待人批准 |

## 1 架构与数据流

三仓各一句话：**ai-obsidian**（私有 Obsidian 内容库，门禁后发布）→ **hexo-engine**（私有 → public 构建仓，采集/转换/装配）→ **zeek-zhao.github.io**（公开产物仓，gh-pages 分支由 GitHub Pages 服务）。

```
ai-obsidian (私有 vault)                hexo-engine (构建仓, public)            zeek-zhao.github.io (公开产物)
─────────────────────────              ─────────────────────────────           ─────────────────────────────
人批准发布(G3) → 翻转 published         1 checkout engine                        接收孤儿强推
       │                               2 clone ai-obsidian → content/  ──┐      gh-pages 分支
       ▼ push main                     3 node bin/collect.js            │      = 线上站点
notify-publish.yml                     │   过滤(G1) → 双链转换 → _posts  │
  ↓ NOTIFY_TOKEN                       │   → post-map / search.json     │
repository_dispatch                    │   → tags/categories 统计页      │
(content-updated) ───────────────────▶ 4 npx hexo generate             │
  另有：每日 UTC 2:00 cron 兜底         │   EJS+Stylus → public/ ────────┼──▶ 5 public/ 内 git init -b gh-pages
  （回调失败最长延迟 24h，              6 孤儿强推 ──────────────────────────────┘    git push -f origin gh-pages
  急需上线用 workflow_dispatch）        （身份 zeek.zhao，§4）                          → GitHub Pages
```

要点：

- **触发唯一事实源**是两个 workflow：`ai-obsidian/.github/workflows/notify-publish.yml` 与 `hexo-engine/.github/workflows/deploy.yml`，本文件不复述其参数细节。
- **collect.js 的位置**：在 Hexo 生成**之前**，做 Hexo 做不了的事（vault 元数据过滤、wikilink 解析、短链映射）；它输出的 `source/_posts/`、`search.json` 等全部是构建产物，禁止手工编辑。
- **主题的位置**：`themes/zeek` 只消费 collect.js + Hexo 的输出（文章列表、search.json、标签/分类统计），不反向依赖 vault 结构。

## 2 主题 zeek 结构（移植中）

自研主题落位 `themes/zeek/`，渲染器 `hexo-renderer-ejs` + `hexo-renderer-stylus`，**零新增 npm 依赖**（package.json 依赖树不变）。模板清单与职责：

| 模板/目录 | 职责 |
|---|---|
| `layout/index.ejs` | 首页（/）：hero + 精选 + 热门（MOCK_VIEWS，带「示例数据」标注）+ 最近更新 + **8 张领域卡**（两级分类后，见 §2.1）；取代 collect.js 停用的动态主页（URD-01 FR-4） |
| `layout/archive.ejs` | 归档（/archives/）：按年分组（`<details>` 折叠）、**按领域分组的分类 chips**、客户端真过滤、分组方式切换（按分类/按年份）；两级分类下再按 `archdomain → archgroup`（领域 → 细分）折叠 |
| `layout/tag.ejs` / 标签页 | 标签聚合（/tags/）：标签云 + 计数；collect.js 的 tags/categories 统计页职责并入标签视图呈现 |
| `layout/post.ejs` | 文章页（/posts/:abbrlink.html）：**首页/归档/领域/细分/标题 面包屑全链**、meta（日期 + 更新于 + 系列进度）、TOC scrollspy、¶ 锚点、代码复制、作者卡、上一篇/下一篇 |
| `layout/page.ejs` | 独立页（关于 /about/ 等）：PROFILE 数据驱动（Projects 网格 + Find me on 行式） |
| `layout/404.ejs` | 404 页：错误码 + 回首页/搜索/归档三出口 |
| partials（head/topbar/sidebar/toc/footer） | 顶栏（搜索框 + 主题按钮 + 移动端菜单）、**两级分类树侧栏**（`sidegroup → sg-sub → sg-items2`，默认折叠，分类/文章页只渲染当前领域）、TOC、页脚；head 内落 title / description / robots（**canonical 与 OG 尚未加，记 AI.md §9 后续轮**） |
| `scripts/helpers.js` | `heads()` 编译期 h2/h3 id + ¶ 锚点；`catTree(site)` 两级分类树（roots / childrenOf / byLeaf / rootOf），供侧栏、面包屑、归档共用 |
| `source/`（主题内） | stylus 样式（tokens 见 UI-01 §4）、少量 JS（⌘K、scrollspy、复制、主题三态、移动端抽屉） |

状态说明（v1.1 校正）：`themes/zeek` 已入库并上线验收通过；`_config.yml` 的 `theme: zeek` 已生效，`hexo-theme-butterfly` 与 `hexo-generator-search` 依赖及 `_config.butterfly.yml` 均已移除，改为 `hexo-generator-index`。下方 §2.1 为定稿后追加的两级分类体系。

### 2.1 两级分类体系（OB-ENG-SOP-06）

人反馈原型侧栏 46 个扁平分类组过长、缺二级分级。设计要点：

| 决策 | 结论 | 理由 |
|---|---|---|
| 领域划分 | 8 个领域：工程规范 / DevOps 与 CI / 自托管服务 / 知识工具 / 技能专项 / 操作系统与机器人 / 编程语言 / 健身 | 按 vault 顶层编号目录的语义归并（46 个细分分类与顶层目录一一对应） |
| 映射存放 | ai-obsidian `90-OB工程管理/方案/06-分类映射.json`（机器读）+ `06-分类与目录映射.md`（OB-ENG-SOP-06 受控说明） | 单一数据源放在内容库受控文档，避免双源漂移；hexo-engine 只登记引用 |
| 注入时机 | `bin/collect.js` v7 **构建期**读取映射，把 `categories: [细分]` 改写为 `categories: [[领域, 细分]]` | vault 里 frontmatter 仍只写单一细分分类，**写作/目录维护习惯零改动**；映射缺失时告警 + fallback「其他」 |
| 主题消费 | `catTree(site)` helper 用 hexo 分类的 `parent` 关系构造树；侧栏 / 归档 / 统计页 / 面包屑两级渲染 | 分类/文章页只渲染当前领域一组，侧栏长度从 46 组降到 8 组（默认全折叠） |
| URL | `/categories/<领域>/<细分>/` | 细分分类名不变，旧扁平 URL 不再生成（全站重建） |

维护约束：改领域归属只改映射 JSON，collect.js 与主题模板都不动；`search.json` 每条增加 `group` 字段供搜索面板按领域展示。**hexo 分类页 `page.category` 是名称字符串**，主题内一律先 `site.categories.findOne({name})` 回查对象再沿 `parent` 上溯。

### 2.2 Obsidian 方言转换与装饰层（v1.2 追加）

人需求：Obsidian 全语法在转换后正常显示、全站体检、分类图标、页面装饰。设计要点：

| 决策 | 结论 | 理由 |
|---|---|---|
| 转换落点 | `themes/zeek/scripts/obsidian.js` 注册 **before_post_render 优先级 1**：`==高亮==`→`<mark>`、`%%注释%%` 删除、脚注、callout（12 类型+别名表）→ 结构化 div、```mermaid → `<div class="mermaid">` | hexo 内置 `backtick_code_block` 是同名滤镜（优先级 10、先注册先跑），不抢优先级则 mermaid 围栏永远拿不到原文 |
| mermaid 渲染 | 构建期出 `<div class="mermaid">`，客户端 CDN mermaid@10 渲染，失败回退代码块（mermaid-err 显示源码） | 渲染失败不阻断阅读；构建期不做图形渲染，保持纯静态输出 |
| 数学公式 | KaTeX CSS 进 `<head>`，正文含 `$` 才动态加载 JS + auto-render（ignoredTags pre/code） | 全站只有少数篇目有公式，按需加载省带宽 |
| 图标数据 | 06-分类映射.json v1.1.0 `icons`（46 细分）+ `groupIcons`（8 领域+其他）表；icons.js `catIcon()` helper，读不到缺省 📁、读文件失败 warn 不 fail | 与两级分类同一数据源，改图标只改映射 JSON |
| 装饰开关 | `_config.yml zeek:` 段（katex/mermaid/mascot: true, bgm: ""）；main.js 按 `window.ZEEK_CFG` 启用；全部 CDN 失败静默、reduce-motion 与窄屏自动关 live2d | 公开仓红线：第三方 CDN 内容失败不影响正文；BGM 默认关 |
| 体检门禁 | `scripts/check-pages.js`：public/ 按页面类型断言 + 文章特征数比对（源文计数 vs HTML 计数），先剥 head/subtitle/pre/figure/行内 code 再断言防误报；`npm run build` 与 deploy.yml 发布前各跑一次，fail exit 1 | 语法转换正确性从「人工抽查」变「流水线门禁」（URD-01 FR-20） |

## 3 门禁设计（三级，前一级不 PASS 后一级禁止执行）

| 级 | 落点 | 通过条件 | 设计说明 |
|---|---|---|---|
| G1 元数据门 | collect.js Pass 1 过滤 | 黑名单外目录 + `published===true` + `status==='published'` + tags 2~3 + description 非空 | 机器判定无裁量；跳过原因全部进 report.skipped 可追溯 |
| G2 脚本门 | ai-obsidian `check-tags.py`（strict） | 输出 0 问题 | 完整脚本化 + CI fail 属 P1-4（本轮范围外）；当前部分生效 |
| G3 人工门 | 05 规范 §4.1 步 4 | 人明确批准后 AI 才翻转 published | G3 是人的独占权；公开仓下红线 ③ 使其从「靠自觉」升级为「公开前置条件」（§5） |

门禁与公开的关系：collect.js 的输出是唯一进入 Hexo 的内容通道，因此 G1 在**构建时**天然前置于公开；G2 在**成稿后**预检；G3 在**翻转时**把关。三条门全过的内容才可能出现在 `public/`，继而进入 gh-pages。

## 4 部署链设计

- **谁触发谁**：ai-obsidian push[main] → notify-publish.yml 用 `secrets.NOTIFY_TOKEN` 发 repository_dispatch(content-updated) → deploy.yml 执行构建并推送。兜底：每日 UTC 2:00 cron；手动 workflow_dispatch；hexo-engine push[main] 亦触发（云端验证用）。
- **并发控制**：concurrency group `pages-publish`、cancel-in-progress false，保证产物仓历史线性。
- **凭据**：deploy.yml 仅用 `secrets.DEPLOY_TOKEN`（读 ai-obsidian + 写 zeek-zhao.github.io）；CI 内以 URL 内嵌 `https://x-access-token:${DEPLOY_TOKEN}@github.com/...` 认证。workflow `permissions: contents: read` 最小化。
- **身份基线**：CI 提交（含 gh-pages 孤儿提交）必须 `zeek.zhao <zeek.zhao@foxmail.com>`；人工提交必须显式导出 4 个 `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env。规则、命令模板与根因见 **05 规范 §5.2（引用，不复制）**。
- **查 run**：GitHub 仓库页 Actions 标签，或 `gh run list -R zeek-zhao/hexo-engine` / `gh run view <id> --log`。

## 5 公开仓暴露面设计（hexo-engine 改 public）

**背景**：2026-11-14 决议将 hexo-engine 改为 public。公开后任何人可浏览源码、workflow 文件与 Actions 运行日志。

**三条红线**（规范登记于 05 规范 §5.4，本节为落点设计）：

1. **日志卫生**：Actions 日志不得 verbose——不 echo 内容/文件清单以外的敏感信息；secrets 在 CI 中只经 env 传递，任何步骤不得打印其值或以 `set -x` 类方式泄露；collect.js 的 report 只含已放行内容清单，属允许输出。
2. **永不上传 artifact**：不用 upload-artifact（含未来 P1-5 的 report.json，以 commit/日志摘要形式落地）；artifact 会把构建期产物（含私有库克隆 `content/` 的潜在残留）固化成可下载对象。
3. **门禁前置**：G1~G3 必须在公开前生效——设计保证是「collect.js 唯一入口 + 三门串联」（§3），未发布内容物理上进不了 `public/`。

**fork 无 secrets 原理**：GitHub 的 Actions secrets 不随 fork 传递，fork 者的 Actions 运行中 `secrets.DEPLOY_TOKEN` 为空，因此 fork 仓既无法克隆私有内容库 ai-obsidian（clone 步失败），也无法向 zeek-zhao.github.io 推送。私有性由 ai-obsidian 仓库自身的 private 设置承担，hexo-engine 公开不构成内容泄露通道。

**残留风险与对策**：engine 源码本身可公开（无敏感值）；`_config.butterfly.yml` 等历史配置不含凭据；本地 `content/` 已 gitignore。

## 6 回滚预案

| 场景 | 动作 |
|---|---|
| 单篇文章下线 | 文章 frontmatter 改回 `published: false` → push → 流水线重建自动消失（05 规范 §6） |
| 构建产物异常（整站） | `git revert` 引起回归的 hexo-engine 提交 → push[main] 触发重建；或 Actions 页 `workflow_dispatch` 手动重跑上一个正常提交 |
| workflow 变更引入故障 | revert `.github/` 提交后重跑；若 gh-pages 已被污染，用产物仓上一个正常提交的 SHA 重建/回推 |
| 主题切换回退 | `_config.yml` `theme:` 切回 `butterfly`（依赖未删期间）→ 重建 |

前提习惯：改动合入 main 前确认上一正常 run 存在，产物仓 gh-pages 提交历史线性（concurrency 已保证）。

## 7 关键技术决策记录（ADR）

| # | 决策 | 理由 | 备选与放弃原因 |
|---|---|---|---|
| ADR-1 | **自研主题 zeek**，而非在 Butterfly 上继续注入定制 | ① 视觉 1:1：原型已定稿（2026-11-14），技术文档风（VitePress/MDN 风）与 Butterfly 的卡片社区风差异大，注入式定制无法完全收敛；② 可控性：模板/样式/交互全部自有，无上游版本升级的覆写维护成本；③ 公开仓友好：去掉对社区主题内部结构的隐式依赖 | 继续注入 Butterfly：改动面已接近全量覆写，升级即碎 |
| ADR-2 | **EJS 而非 pug**（或引入其他模板引擎） | 零新增依赖：`hexo-renderer-ejs`/`hexo-renderer-stylus` 已在依赖树；Hexo 默认模板语言即 EJS，生态与 hexo 内置变量直接可用 | pug（需新增渲染器依赖，违背 FR-15）；原生 JS 拼字符串（collect.js 动态主页的老路，维护性差，正是 FR-4 停用它的原因） |
| ADR-3 | **search.json 作唯一搜索数据源** | collect.js 编译期从已放行文档生成，字段即查询所需（title/url/date/description/tags/categories），与 ⌘K 面板一一对应；json 比 xml 更易前端消费 | hexo-generator-search 的 search.xml（`_config.yml` 仍遗留该配置）：字段与主题需求不匹配，主题只消费 /search.json；该配置清理记 TODO |
| ADR-4 | **热门排行用 MOCK_VIEWS + 可见「示例数据」标注** | 本轮不加访问统计（Out of scope）；先占位 UI 结构，接真实统计时只换数据源；mock 数据在页面上以「示例数据」标签明示，不冒充真实排行 | 上线前隐藏热门模块：原型已定稿含该模块，隐藏=偏离定稿 |
| ADR-5 | **语法转换在主题 scripts 层（obsidian.js）而非 collect.js** | ① 职责分离：collect.js 管「哪些文章进站 + 元数据规范化 + 双链」，主题脚本管「语法到 HTML 的呈现转换」，两边独立演进；② before_post_render 优先级 1 可抢在内置 backtick_code_block 之前，collect.js 里做没有这个钩子位置；③ 转换结果随 hexo 缓存，重跑 generate 无需重 collect | 全放 collect.js：mermaid 围栏拿不到原文（内置滤镜先跑），且主题与转换耦合 |
| ADR-6 | **发布前体检门禁 check-pages.js 构建期断言**（非 CI 单独 step 起源） | 断言随构建跑，本地与 CI 同一入口（npm run build 末尾），deploy.yml 再显式跑一次防绕过；fail 即 exit 1 阻断发布，语法坏页不可能上线 | 只在 CI 跑：本地构建无反馈，坏页要到推送后才发现；人工抽查：1150+ 页覆盖不住 |

## 8 引用文件

- 05 规范（OB-ENG-SOP-05）§3 门禁模型 · §4.1 SOP · §5.2 提交身份基线 · §5.4 公开仓暴露面红线 · §6 触发与时效
- docs/URD-01-需求规格.md（FR/NFR/AC）· docs/UI-01-原型说明.md（视图映射与 tokens）
- 仓库事实：`bin/collect.js`（放行条件、双链解析顺序、附属产物）、`.github/workflows/deploy.yml`、`package.json`、`_config.yml`
