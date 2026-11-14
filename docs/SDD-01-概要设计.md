---
title: 概要设计说明书（SDD-01）
doc_id: HEXO-ENG-SDD-01
version: v1.0
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
| 版本 | v1.0 |
| 编制 | AI（依据 2026-11-14 UI 定稿与公开仓决议） |
| 审核 / 批准 | 人（Zeek） |
| 生效条件 | 人批准后置 `status: published` |
| 上位规范 | ai-obsidian OB-ENG-SOP-05（05 规范）；需求依据 docs/URD-01-需求规格.md |
| 关联文件 | docs/URD-01 · docs/UI-01 · AI.md |

### 0.1 修订记录

| 版本 | 日期 | 修订内容 | 批准 |
|---|---|---|---|
| v1.0 | 2026-11-14 | 首版：架构数据流、主题结构、门禁与部署链、暴露面设计、回滚预案、ADR×4 | 待人批准 |

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
| `layout/index.ejs` | 首页（/）：hero + 精选 + 热门（MOCK_VIEWS，带「示例数据」标注）+ 最近更新 + 分类卡片；取代 collect.js 停用的动态主页（URD-01 FR-4） |
| `layout/archive.ejs` | 归档（/archives/）：按年分组（`<details>` 折叠）、分类 chips、客户端真过滤、分组方式切换（按分类/按年份） |
| `layout/tag.ejs` / 标签页 | 标签聚合（/tags/）：标签云 + 计数；collect.js 的 tags/categories 统计页职责并入标签视图呈现 |
| `layout/post.ejs` | 文章页（/posts/:abbrlink.html）：面包屑、meta（日期 + 更新于 + 系列进度）、TOC scrollspy、¶ 锚点、代码复制、作者卡、上一篇/下一篇 |
| `layout/page.ejs` | 独立页（关于 /about/ 等）：PROFILE 数据驱动（Projects 网格 + Find me on 行式） |
| `layout/404.ejs` | 404 页：错误码 + 回首页/搜索/归档三出口 |
| partials（head/topbar/sidebar/toc/footer） | 顶栏（搜索框 + 主题按钮 + 移动端菜单）、分类树侧栏、TOC、页脚；head 内落 SEO title/description/OG 标签 |
| `source/`（主题内） | stylus 样式（tokens 见 UI-01 §4）、少量 JS（⌘K、scrollspy、复制、主题三态、移动端抽屉） |

状态说明：截至本文档 v1.0，`themes/zeek` 模板尚未入库（移植进行中），上表为目标结构；`_config.yml` 的 `theme:` 仍是 `butterfly`，切换随移植完成落地。Butterfly（npm 包 hexo-theme-butterfly + `_config.butterfly.yml` 注入）在主题切换完成后从依赖与配置中移除。

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

## 8 引用文件

- 05 规范（OB-ENG-SOP-05）§3 门禁模型 · §4.1 SOP · §5.2 提交身份基线 · §5.4 公开仓暴露面红线 · §6 触发与时效
- docs/URD-01-需求规格.md（FR/NFR/AC）· docs/UI-01-原型说明.md（视图映射与 tokens）
- 仓库事实：`bin/collect.js`（放行条件、双链解析顺序、附属产物）、`.github/workflows/deploy.yml`、`package.json`、`_config.yml`
