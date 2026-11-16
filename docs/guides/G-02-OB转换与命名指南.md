# OB → 站点：转换与命名规范（引擎侧权威文档）

> 版本 v1.0 · 2026-11-15 · 适用于 hexo-engine 构建流水线
> 姊妹文档：内容库侧写作指南见 ai-obsidian `90-OB工程管理/方案/07-OB写作与发布指南.md`（OB-ENG-SOP-07，已签发）。本文站在**引擎视角**回答：OB 文档要满足什么条件、会被怎样转换、产物 URL 如何生成。

## 1. 总览：一篇文档从 vault 到网页

```
D:\zeek\WorkBuddy\obsidian（vault，git push）
        │  git@github.com:zeek-zhao/ai-obsidian.git（私有内容库）
        ▼
hexo-engine CI（GitHub Actions）
        │ ① git clone ai-obsidian → content/
        │ ② node bin/collect.js     —— 收集/门禁/方言预处理（§3）
        │ ③ npx hexo clean && npx hexo generate —— 渲染 2500+ 静态页
        │ ④ node scripts/check-pages.js —— 全站体检门禁（§6）
        │ ⑤ node tests/bdd-runner.js —— BDD 功能测试
        ▼ ⑥ orphan push → zeek-zhao.github.io:gh-pages（公开产物）
https://zeek-zhao.github.io/
```

## 2. 命名规则（Naming Convention）

### 2.1 目录命名

| 规则 | 说明 | 示例 |
|---|---|---|
| 顶层目录 = 细分分类 | 两位数字前缀 + 中文名，**即文章的 categories 值** | `32-工具/hexo/` → categories: [hexo] |
| 二级目录仅作分组 | 不进 URL、不进分类，纯 vault 整理用 | `32-工具/docker/compose/` |
| 领域由映射表注入 | 细分 → 8 领域的映射在 `90-OB工程管理/方案/06-分类映射.json`，构建期注入成两级分类 | hexo → 知识工具 |
| 黑名单目录不发布 | `99-Archive` `90-OB工程管理` `00-Inbox` `10-灵感` `60-资源` | — |

### 2.2 文件命名

| 规则 | 说明 |
|---|---|
| `NN-标题.md` | **两位数字序号前缀 + 中文标题**。序号是同目录内的阅读顺序，发布时被剥掉，不进 title |
| 不用下划线/日期前缀 | 日期已在 frontmatter `date`；文件名里的日期是冗余（现状仅 1 例违规） |
| 英文词保留自然空格 | `06-Docker Compose.md` 合规（56 例均为此类，无需改） |
| 同名冲突自动加目录前缀 | collect.js 遇到同名 title 会加父目录名消歧，但**应主动避免重名** |

### 2.3 现状体检（2026-11-15 扫描，1155 篇已发布）

| 指标 | 数量 | 结论 |
|---|---|---|
| 无编号前缀 | 7 | ⚠ 见 §2.4 清单，建议补序号 |
| 下划线命名 | 2 | ⚠ 建议改空格或连字符 |
| 日期前缀 | 1 | ⚠ `30-永久笔记/2026-10-24-ai-obsidian-engineering.md` |
| 缺 description/tags | 0 | ✅ 门禁有效 |

### 2.4 待规范清单（重命名不改变 URL：abbrlink 由 title 生成，与文件名无关）

```
30-永久笔记/2026-10-24-ai-obsidian-engineering.md   → 01-ai-obsidian-engineering.md
32-工具/obsidian/Obsidian 语法模板与转换体检.md      → 13-Obsidian 语法模板与转换体检.md
33-技能/AI/MCP/Atlassian MCP 接入过程记录.md         → 01-Atlassian MCP 接入过程记录.md
33-技能/AI/MCP/Atlassian MCP 连接与使用配置指南.md    → 02-Atlassian MCP 连接与使用配置指南.md
33-技能/AI/MCP/Jenkins MCP 接入过程记录.md           → 03-Jenkins MCP 接入过程记录.md
33-技能/AI/MCP/Jenkins MCP 连接与使用配置指南.md      → 04-Jenkins MCP 连接与使用配置指南.md
49-健身/对比报告.md                                  → 04-对比报告.md（按目录内现有序号顺延）
```

> 重命名在 vault 里做，正常 push 即可；URL、评论串（giscus 按 pathname 映射）均不受影响。

## 3. 收集与门禁（bin/collect.js，v7）

放行条件（全部满足才发布）：

1. 目录不在黑名单（§2.1）；
2. `published: true` 且 `status: published`（双开关）；
3. `tags` 2~3 个；
4. `description` 非空。

被跳过的文章只记录在 report（`_posts/report.md`），**不会出现在公开站**。6 类跳过原因：黑名单目录 / published≠true / status≠published / tags 数量不符 / description 空 / frontmatter 解析失败。

## 4. 转换规则（引擎在构建期做的事）

### 4.1 frontmatter 转换（collect.js）

| vault 字段 | 产物 | 说明 |
|---|---|---|
| `title` | title | 原样 |
| — | abbrlink | `crc32(title) >>> 0` → **URL：/posts/<abbrlink>.html**，标题不变则 URL 永不变 |
| `categories: [细分]` | `categories: [[领域, 细分]]` | 由 06-分类映射.json 注入领域层；映射缺失时回退「其他」并告警 |
| `date/updated` | 原样 | ISO 时间 |
| 图片路径 `60-资源/...` | `/assets/...` | 只拷贝被引用的图片，外部路径 404（见 SOP-07 §5） |

### 4.2 Obsidian 方言（themes/zeek/scripts/obsidian.js，构建期滤镜）

| 语法 | 转换结果 | 备注 |
|---|---|---|
| `[[双链]]` `[[别名\|显示]]` | 站内 `<a>`（resolveLink 四级解析）或纯文本 | 在 collect.js，歧义退化为纯文本 |
| `==高亮==` | `<mark>` | 正则排除嵌套 `[]`，行内代码里不误伤 |
| `%%注释%%` | 删除 | |
| `[^脚注]` | `<sup class="fnref">` + 文末 footnotes 区 | |
| `> [!type]` 提示框 | `<div class="callout" data-callout>` 12 类型 + 别名表 | `[-]` 折叠 → details/summary |
| ``` ```mermaid ``` | `<div class="mermaid">` | **before_post_render 优先级 1**（必须先于 hexo 代码块滤镜，否则被降级为 plaintext）|
| 数学 `$...$` `$$...$$` | 原样保留 | 客户端 KaTeX 懒加载（正文含 $ 才加载）|

### 4.3 全站体检门禁（scripts/check-pages.js）

构建后逐页断言 11500+ 项：页面 chrome 完整性、每篇文章的 callout/mark/脚注/checkbox/表格/代码块/mermaid 计数与源文件一致、无双链残留、无 `[!`/`==`/`%%` 残留、search.json 完整性。**FAIL 即 CI 失败，不会发布**。

## 5. 语法要求速查（写给 vault 里的你）

✅ 支持：标准 Markdown（GFM）、==高亮==、%%注释%%、脚注、12 类 callout（含折叠）、mermaid、KaTeX 数学、双链、任务列表、表格、图片（60-资源）、data-URI SVG。
❌ 不支持/会被剥离：HTML 复杂布局（iframe/脚本）、OB 白板/excalidraw 嵌入、`![[图片嵌入]]` 之外的嵌入语法、dataview 查询块。
🧪 验证：写完看「Obsidian 语法模板与转换体检」这篇（32-工具/obsidian/），它是全语法的活样例。

## 6. 变更矩阵

| 你想改什么 | 动哪里 | 影响 URL？ |
|---|---|---|
| 文章标题 | 改 title | **是**（abbrlink 变）→ 旧链 404，谨慎 |
| 文件名/目录 | 重命名 | 否 |
| 细分分类 | 挪目录 + 改 categories | 否（URL 不含分类） |
| 领域归属 | 只改 06-分类映射.json | 否 |
| 下线文章 | published:false 或 status 改回 draft | — |
| 图片 | 60-资源 + 正文引用 | — |
