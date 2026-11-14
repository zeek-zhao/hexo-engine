---
title: 需求规格说明书（URD-01）
doc_id: HEXO-ENG-URD-01
version: v1.3
date: 2026-11-14
updated: 2026-11-14
status: draft
tags: [hexo-engine, 需求规格, 发布流]
description: hexo-engine 工程库的需求规格：内容采集与双链转换、三级门禁、发布触发链、自研主题 zeek 五视图与公开仓暴露面约束；对照 ISO 9001 §7.5 文件控制要求编制。
---

# 需求规格说明书（URD-01）

## 0 文档控制（ISO 9001 §7.5 对齐）

| 项 | 值 |
|---|---|
| 文件编号 | HEXO-ENG-URD-01（下称 URD-01） |
| 版本 | v1.2（语法模板 + 体检门禁 + 图标 + 装饰层） |
| 编制 | AI（依据 2026-11-14 UI 定稿与公开仓决议） |
| 审核 / 批准 | 人（Zeek） |
| 生效条件 | 人批准后置 `status: published`；批准前不得作为实施验收依据 |
| 评审周期 | 每月随 ai-obsidian「体检」复核；触发式评审：门禁变更、主题重构、仓库可见性变更时立即评审 |
| 上位规范 | ai-obsidian `90-OB工程管理/方案/05-发布流与AI使用规范.md`（OB-ENG-SOP-05，冲突时以 05 规范为准） |
| 关联文件 | docs/SDD-01-概要设计.md · docs/UI-01-原型说明.md · AI.md |

### 0.1 修订记录

| 版本 | 日期 | 修订内容 | 批准 |
|---|---|---|---|
| v1.0 | 2026-11-14 | 首版：范围、功能需求 FR、非功能需求 NFR、验收标准 | 待人批准 |
| v1.1 | 2026-11-14 | 主题 zeek 已上线验收（FR-9~14 状态由「移植中」改为「已上线」）；新增 FR-16 两级分类体系（OB-ENG-SOP-06）与 AC-16 | 待人批准 |
| v1.3 | 2026-11-14 | 第六轮：新增 FR-21 评论 giscus / FR-22 RSS / FR-23 SEO 三件套 / FR-24 分页 / FR-25 lightbox+复制链接 / FR-26 手机端补强；AC-19；FR-15 约束范围改「主题层」（流水线新增 hexo-generator-feed/sitemap 见 FR-22/23） | 待人批准 |
| v1.2 | 2026-11-14 | 第五轮：新增 FR-17 Obsidian 方言转换 / FR-18 分类图标 / FR-19 装饰层 / FR-20 发布前体检门禁与 AC-17/AC-18；引用 06 映射 v1.1.0 | 待人批准 |

## 1 背景与目标

hexo-engine 是三仓发布链路中的**构建仓**（私有 → 2026-11-14 决议改为 public）：从私有内容库 ai-obsidian（Obsidian vault）采集已发布文档，经元数据门禁过滤与 Obsidian 语法转换后，由 Hexo 构建为静态站点，CI 孤儿强推至公开产物仓 zeek-zhao.github.io 的 gh-pages 分支。

本轮需求的两个驱动：

1. **仓库公开化**：hexo-engine 改为 public 后，暴露面约束从"事实上的私有"变为"显式红线"，必须在需求层固化（见 NFR-SEC）。
2. **UI 定稿**：站点外观原型 `D:\zeek\AiData\code\blog-ui-prototype\index.html` 已由人于 2026-11-14 确认定稿，正在移植为自研 Hexo 主题 `themes/zeek`（替代 Butterfly 注入），需求层需覆盖主题带来的全部视图与交互要求。

目标：内容从 vault 到线上的全程**可触发、可拦截、可追溯、可回滚**，且站点呈现与原型一致、公开仓零敏感信息泄露。

## 2 范围

### 2.1 In scope

- `bin/collect.js` 内容采集、元数据过滤、双链（wikilink）转换与附属产物生成；
- 三级门禁（G1 元数据门 / G2 脚本门 / G3 人工门）在本仓的落点；
- `.github/workflows/deploy.yml` 发布触发链与凭据约定；
- 自研主题 `themes/zeek`（EJS + Stylus）的 5 个视图、⌘K 搜索、主题三态、移动端与无障碍；
- 404 页面与站点级 SEO 基础（title / description / OG 标签）。

### 2.2 Out of scope（明确不做）

| 项 | 说明 |
|---|---|
| 评论系统 | 本轮不加，记 TODO（决策 ④） |
| 访问统计 | 本轮不加；热门排行暂用 MOCK_VIEWS 并带可见「示例数据」标注，接真实统计记 TODO |
| fine-grained PAT 替换 | 需人网页手动创建/替换 secret（05 规范 §5.1），AI 不参与；记入遗留清单 |
| P1-4 quality-gate 完整脚本化 | 属 ai-obsidian 侧 check-tags.py 扩展，跟踪于 05 规范 §7 |
| 私有内容库内容与流程 | vault 内文档流转、选题成稿属 ai-obsidian 侧需求 |
| 原型「改造对照」视图 | 原型专属演示页，不进线上（见 UI-01 §5） |

## 3 功能需求（FR）

| # | 需求 | 描述 | 现状 |
|---|---|---|---|
| FR-1 | 内容采集 | 全库扫描 ai-obsidian（`content/`）所有 md，按放行条件过滤：目录在黑名单（`99-Archive`/`90-OB工程管理`/`00-Inbox`/`10-灵感`）外 **且** `published === true` **且** `status === 'published'` **且** tags 2~3 个 **且** description 非空；资源目录 `60-资源` 非md 文件复制到 `source/assets/` | collect.js v5 已生效 |
| FR-2 | 双链转换 | `[[目标]]`/`[[目标|别名]]` 解析为已发布文档真实站内链接（解析顺序：完整路径 > 同目录 basename > 全局唯一 basename > 唯一 title）；解析失败退化为纯文本，绝不生成错误链接；basename 歧义不猜 | collect.js 已生效 |
| FR-3 | 防御守卫 | 代码块外含 `{{ }}` / `{% %}` 标签语法 / `TODO:` 的文档跳过；残留中文键 frontmatter 块清理；未转换 Obsidian 嵌入图降级为可见 warning 引用块；标题查重（abbrlink = crc32(title)，重名会短链冲突） | collect.js 已生效 |
| FR-4 | 附属产物 | 生成并保留：① `post-map.md` 短链映射页（sticky 置顶）② `source/search.json`（唯一站内搜索数据源：标题/URL/日期/描述/标签/分类）③ `source/tags/index.md`、`source/categories/index.md` 统计页；**停用** `source/index.html` 动态主页生成（改由主题提供） | ①②③已生效；主页停用属本轮变更 |
| FR-5 | 三级门禁 G1 | 元数据门 = FR-1 过滤条件，机器判定，无自由裁量 | 已生效（collect.js） |
| FR-6 | 三级门禁 G2 | 脚本门 = `check-tags.py` strict（目录黑名单 + wikilink 一致性 + 重复标题），0 问题放行；完整脚本化（CI fail）属 P1-4，本轮不做 | 部分 |
| FR-7 | 三级门禁 G3 | 人工门：人读稿明确批准后 AI 才翻转 published；未过 G1~G3 的内容**不得出现在任何公开产物**（公开仓红线 ③） | 靠 05 规范 §4.2 边界约束 |
| FR-8 | 发布触发链 | 内容库 push[main] → notify-publish.yml 发 repository_dispatch(content-updated) → deploy.yml 拉内容、`node bin/collect.js`、`npx hexo generate`、孤儿强推 gh-pages；每日 UTC 2:00 cron 兜底；hexo-engine push 与手动 workflow_dispatch 可用；并发组 pages-publish 不取消 | deploy.yml 已生效 |
| FR-9 | 主题五视图 | 自研主题 zeek 提供 5 个真实页面：首页（/）、归档（/archives/）、标签（/tags/）、文章（/posts/:abbrlink.html）、关于（/about/）；视图映射与交互见 docs/UI-01-原型说明.md | 已上线 |
| FR-10 | ⌘K 搜索 | 全站 ⌘K（mac）/ Ctrl+K（其他）与 `/` 键唤起命令面板，数据源 `/search.json`，键盘 ↑↓ 选择、↵ 打开、Esc 关闭 | 已上线 |
| FR-11 | 主题三态 | system / light / dark 三态循环切换，system 跟随 `prefers-color-scheme`，选择持久化 localStorage | 已上线 |
| FR-12 | 移动端适配 | 断点 860px（顶栏导航切换移动抽屉、触摸目标 ≥44px）、560px（排版紧凑化）；详见 UI-01 §4 | 已上线 |
| FR-13 | 无障碍 | skip-link 跳转主内容、`:focus-visible` 焦点样式、语义化地标、返回顶部 aria-label | 已上线 |
| FR-14 | 404 | 主题 404 页：错误码 + 回首页 / 搜索 / 归档三出口 | 已上线 |
| FR-15 | 主题零新增依赖 | 主题层不新增 npm 依赖：渲染器用既有 `hexo-renderer-ejs` + `hexo-renderer-stylus` | 约束生效 |
| FR-16 | 两级分类 | 侧栏/归档/统计页/面包屑按「领域 → 细分分类 → 文章」两级展示，8 个领域由 ai-obsidian `90-OB工程管理/方案/06-分类映射.json` 定义；collect.js 构建期注入嵌套 `categories: [[领域, 细分]]`；vault frontmatter 仍只写单一细分分类（写作习惯不变）；分类页与文章页侧栏只渲染当前领域一组；映射缺失告警 + fallback「其他」 | 已上线（OB-ENG-SOP-06） |
| FR-17 | Obsidian 方言转换 | 模板渲染层（themes/zeek/scripts/obsidian.js）在构建期转换 Obsidian 语法：`==高亮==`→`<mark>`、`%%注释%%` 不输出、脚注 `[^id]` → 文末脚注区、`[!type]` callout（12 类型 + 别名）→ 结构化卡片（`[-]`/`[+]` 可折叠）、```mermaid 围栏 → `<div class="mermaid">`（客户端 CDN 渲染，失败回退代码块）；双链由 collect.js 转站内链接，行内代码中的 `[[` 不误吞 | 已上线 |
| FR-18 | 分类图标 | 每个领域与细分分类配专属图标（emoji），数据存 06-分类映射.json `icons`/`groupIcons` 表（v1.1.0），icons.js `catIcon()` helper 全站消费，缺省 📁；改图标只改映射 JSON | 已上线 |
| FR-19 | 装饰层 | `_config.yml zeek:` 段开关控制：KaTeX 数学公式（正文含 `$` 才加载）、mermaid 客户端渲染、右下角 live2d 形象（窄屏/减少动效自动关闭）、背景音乐（bgm 为空不渲染）；全部 CDN 加载、失败静默降级，不阻塞正文阅读 | 已上线（bgm 默认关闭） |
| FR-20 | 发布前体检门禁 | scripts/check-pages.js 对 public/ 全站按页面类型断言（chrome 完整性/分类
| FR-21 | 评论（giscus） | 文章页底部 GitHub Discussions 评论（giscus，配置在 `_config.yml zeek.giscus`），400px 懒加载，主题切换同步换肤，Announcements 分类仅维护者开帖 | 已上线 |
| FR-22 | RSS | `atom.xml` 摘要模式（limit 20，不含全文）；footer 链接 + head 发现 | 已上线 |
| FR-23 | SEO 三件套 | canonical（剥 `index.html`）/ Open Graph（article 与 website 分型）/ Twitter Card / `sitemap.xml` / `robots.txt` | 已上线 |
| FR-24 | 分页导航 | 首页与归档末尾翻页链接（hexo paginator），分类/标签页不分页 | 已上线 |
| FR-25 | 图片放大与分享 | 图片点击放大（自研 lightbox 零依赖）；文章 meta「复制本文链接」（clipboard API + fallback） | 已上线 |
| FR-26 | 手机端补强 | 宽表格/对比表块级横向滚动、命令面板 92vw、article-meta 换行；与 FR-12 断点体系叠加 | 已上线 |树/文章特征/无 Obsidian 语法残留），与 search.json、source/_posts 交叉核对；`npm run build` 末尾与 deploy.yml 发布前各跑一次，fail 即阻断发布 | 已上线 |

> UI 需求的完整交互清单、设计 tokens、原型↔线上差异**引用** docs/UI-01-原型说明.md，本文件不重复。

## 4 非功能需求（NFR）

| # | 类别 | 需求 |
|---|---|---|
| NFR-PERF | 性能 | 纯静态输出（无运行时服务端）；构建时长以当前流水线基线为参照，不因主题移植显著回退；列表分页 per_page=10；collect.js 全量重扫可接受（CI 兜底 cron 存在） |
| NFR-SEC-1 | 安全·日志卫生 | Actions 日志不得 verbose：不 echo 内容/文件清单以外的敏感信息（token、私有库文件内容等）；日志只允许出现引擎侧命令输出与报告摘要 |
| NFR-SEC-2 | 安全·artifact | **永不上传 artifact**（upload-artifact 禁用；P1-5 的 report.json 落地时也以非 artifact 形式实现） |
| NFR-SEC-3 | 安全·门禁前置 | 未发布内容门禁（G1~G3）必须在内容公开前生效：任何进入 public/ 的页面都来自过门禁的内容 |
| NFR-SEC-4 | 安全·凭据 | secrets 仅 NOTIFY_TOKEN（ai-obsidian）/ DEPLOY_TOKEN（hexo-engine）；HTTPS 认证用 basic extraheader（`$B64 = base64("x-access-token:$env:GH_TOKEN")`），不用 bearer；token 值不落盘不入文档；提交身份铁律见 05 规范 §5.2（引用不复制） |
| NFR-MAINT | 可维护 | 文档引用不复述流水线细节（P2-8）；受控文档修订走修订记录；主题零新增依赖（FR-15）；构建产物（source/_posts、search.json 等）不得手工编辑（05 规范 §4.2 边界 6） |
| NFR-ISO | ISO 合规 | 全链路受控于 OB-ENG-SOP-05：三级门禁、AI 使用边界、记录控制（log/YYYY-MM.md 留痕）、月度内审抽查提交身份唯一性 |

## 5 验收标准

| # | 断言 | 对应 |
|---|---|---|
| AC-1 | 对 vault 中 `published:false` / `status:draft` / tags 越界 / 缺 description / 黑名单目录的文档，collect.js report.skipped 均有对应跳过记录 | FR-1/G1 |
| AC-2 | 双链指向未发布或歧义目标时，输出为纯文本而非错误链接 | FR-2 |
| AC-3 | 全站 HTML 中 grep 不到 `[[`、`{%`、`{{` 残留（围栏代码块与 raw 段除外） | FR-3 |
| AC-4 | collect.js 不再生成 `source/index.html`；`/` 由主题渲染且内容完整；search.json / post-map / tags / categories 统计页仍生成 | FR-4 |
| AC-5 | 构造一篇未过 G3 的草稿发布触发重建，其不出现在 public/ 任何页面 | FR-7/NFR-SEC-3 |
| AC-6 | push ai-obsidian main 后 ≤3 分钟线上更新；Actions run 日志中无 token、无私库文件内容 | FR-8/NFR-SEC-1 |
| AC-7 | 5 个视图页面 URL 均可直达且与原型交互一致（对照 UI-01 §3 清单逐项核验） | FR-9 |
| AC-8 | ⌘K、/、Esc、↑↓、↵ 行为符合 FR-10；搜索结果来自 /search.json | FR-10 |
| AC-9 | 三态切换与刷新持久化正确；system 态跟随系统深浅色 | FR-11 |
| AC-10 | 560/860px 断点下布局符合 UI-01 §4；交互目标 ≥44px | FR-12 |
| AC-11 | 键盘 Tab 可见 skip-link 与焦点环；返回顶部有 aria-label | FR-13 |
| AC-12 | 访问不存在路径返回 404 页且三个出口可用 | FR-14 |
| AC-13 | `npm ls` 依赖树与移植前一致（无新增包）；`package-lock.json` 在库且 `npm ci` 可复现 | FR-15 |
| AC-14 | 仓库无 artifact 产物；`git log --all` 提交身份仅 `zeek.zhao <zeek.zhao@foxmail.com>` 一行 | NFR-SEC/05 §5.2 |
| AC-15 | 首页渲染 8 张领域卡、无扁平分类卡；侧栏 `<div class="sidegroup">` 在首页为 8 组、分类页与文章页均为 1 组；`/categories/<领域>/<细分>/` 可访问且面包屑含领域链；`search.json` 每条含 `group` 字段且 group 去重为 8 | FR-16 |
| AC-16 | 删除 `06-分类映射.json` 后构建输出告警且文章归入「其他」，构建不失败 | FR-16 |
| AC-17 | 模板文章（`32-工具/obsidian/Obsidian 语法模板与转换体检.md`）转换后：callout/mark/脚注/任务列表/mermaid 各特征数与源文一致；正文无 `==`/`%%`/`[!type]`/未转换双链残留；mermaid 输出 `<div class="mermaid">` 且数学公式页含 KaTeX 资源；check-pages.js 全站 PASS | FR-17/FR-20 |
| AC-18 | 首页与侧栏分类均带各自图标（无默认 📁 残留于已配图分类）；06 映射 v1.1.0 图标表全量覆盖 8 领域 + 46 细分 |
| AC-19 | 文章页含 giscus 容器与 copy-link 按钮（data-url 为规范地址）；`atom.xml`/`sitemap.xml`/`robots.txt` 存在且 atom 无全文；首页第 2 页与 `/archives/page/2/` 可经分页链接到达；canonical 剥 `index.html`；og:type 按 article/website 区分 | FR-21~26 | FR-18 |

## 6 引用文件

- ai-obsidian `90-OB工程管理/方案/05-发布流与AI使用规范.md`（OB-ENG-SOP-05 v1.4）：三级门禁模型 §3、AI 使用边界 §4.2、凭据与提交身份 §5.2、公开仓暴露面红线 §5.4
- ai-obsidian `90-OB工程管理/方案/06-分类与目录映射.md`（OB-ENG-SOP-06 v1.1）与同目录 `06-分类映射.json`（v1.1.0）：两级分类领域定义、细分归属与分类图标表（FR-16/FR-18 数据源）
- docs/SDD-01-概要设计.md：架构、门禁与部署链设计、ADR
- docs/UI-01-原型说明.md：原型定稿状态、视图映射、交互清单、设计 tokens
- 仓库事实：`package.json`（Hexo 7.3.0 与依赖清单）、`_config.yml`（permalink `posts/:abbrlink.html`、per_page 10）、`bin/collect.js`（352 行）、`.github/workflows/deploy.yml`
