# SEO / RSS / 评论详解

> 受控文档 OB-ENG-WEB-SRC v1.0（2026-11-15）。本文解释三块的**工作原理、当前实现、验证方法与常见问题**。实现细节见 SDD-01 §2.3。

---

## 1. SEO（搜索引擎优化）

### 1.1 原理：搜索引擎如何收录你的博客
搜索引擎（Google / Bing / 百度）收录分三步：
1. **发现**：顺着外链、sitemap.xml 或手动提交找到页面；
2. **抓取**：按 robots.txt 的规则下载页面 HTML；
3. **索引与排名**：解析 HTML 的标题、meta、结构化数据、正文，建立索引并排序。

GitHub Pages 允许搜索引擎抓取（我们的 robots.txt 全放行），所以收录完全可行，关键在于把「页面想表达什么」用机器可读的方式写清楚——这就是 head 里那些标签的作用。

### 1.2 当前实现（每篇文章自动生成，无需人工干预）

| 标签 | 作用 | 示例（模板文章） |
|------|------|----------------|
| `<title>` | 浏览器标签页与搜索结果标题 | `文章标题 | zeek 的博客` |
| `<meta name="description">` | 搜索结果摘要 | frontmatter 的 description |
| `<link rel="canonical">` | 声明唯一规范地址，避免 `/a.html` 与 `/a` 被判重复内容 | `https://zeek-zhao.github.io/posts/2674584049.html` |
| `og:title / og:description / og:type / og:url / og:site_name` | 分享到社交平台时的卡片信息；文章页 type=article，其余 website | — |
| `<meta name="twitter:card" content="summary">` | Twitter/X 分享卡片 | — |
| `<meta name="robots" content="noindex">` | 翻页页（/page/2）不进索引，避免稀释权重 | — |
| JSON-LD `WebSite`（全站）/ `BlogPosting` + `BreadcrumbList`（文章页） | 结构化数据，让 Google 展示富摘要（作者、日期、面包屑） | — |
| `sitemap.xml` | 全站 1146 个页面清单，搜索引擎抓取入口 | — |
| `robots.txt` | 抓取规则 + 指向 sitemap | — |
| `<link rel="alternate" type="application/atom+xml">` | 让阅读器/搜索引擎发现 RSS | — |

### 1.3 验证方法
- 检查单页标签：浏览器右键「查看网页源代码」看 `<head>`。
- 结构化数据：Google 官方校验器 https://search.google.com/test/rich-results 贴文章 URL。
- sitemap/robots：直接打开 `https://zeek-zhao.github.io/sitemap.xml` 与 `/robots.txt`。
- 收录进度：Google 搜索 `site:zeek-zhao.github.io`；想加速可在 Google Search Console 提交 sitemap（**人工可选**，见 §4）。

### 1.4 常见问题
- **Q：为什么我的站搜不到？** 新站收录需数天至数周。主动加速：Google Search Console（免费）验证站点后提交 sitemap。
- **Q：分享到微信/QQ 没有卡片？** og 标签已配齐，但微信部分场景不抓外站 og；可用 og image（当前未配 og:image，如需卡片配图可加）。
- **Q：改了标题会不会影响 SEO？** 会。abbrlink 基于 title 的 crc32，改标题=换 URL=旧地址 404。正式发布后不要改标题（SOP-07 已约束）。

---

## 2. RSS 订阅

### 2.1 原理
RSS（本站用 Atom 格式）是一个**机器可读的文章清单**：站点把最新文章的标题、摘要、发布时间、链接按固定 XML 格式发布到一个固定地址（`atom.xml`）；读者的 RSS 阅读器**定时轮询**这个地址，发现新条目就推送。它是去中心化的订阅方式——不依赖平台算法，读者自己掌握订阅列表。

### 2.2 当前实现
- 生成器：`hexo-generator-feed ^4.0.0`（流水线依赖，构建期生成静态 `atom.xml`）。
- 配置（`_config.yml`）：
  ```yaml
  feed:
    type: atom
    path: atom.xml
    limit: 20        # 最多 20 个 entry
    content: false   # 摘要模式：只带 description，不带全文
  ```
- 摘要来源 = frontmatter 的 `description`（所以 SOP-07 要求 description 必填且写好——它同时是搜索摘要、SEO 摘要、RSS 摘要）。
- 页脚有 RSS 链接；`<head>` 有 alternate 声明（阅读器自动发现）。

### 2.3 验证方法
浏览器打开 `https://zeek-zhao.github.io/atom.xml`，应看到 XML 清单（≤20 个 `<entry>`、每个含 `title/link/updated/summary`）。

### 2.4 常见问题
- **Q：想输出全文订阅？** 把 `content: true`（文章全文进 entry），代价是订阅器抓取量大、正文长文被截断成 feed 更重。当前摘要模式是主流做法。
- **Q：RSS 会暴露未发布文章吗？** 不会。feed 由 hexo 从**已通过门禁的文章**生成，黑名单目录与 draft 不会出现（BDD 场景 10 覆盖）。

---

## 3. 评论（giscus）

### 3.1 原理
giscus 把 GitHub **Discussions** 当评论存储：页面嵌入一个 iframe，加载 giscus 的脚本；读者评论时 giscus 以读者自己的 GitHub 账号 OAuth 授权，在指定仓库的 Discussions 里开一个「讨论」或回复。评论数据全部存在 GitHub，**无需自建服务器、无数据库、无维护成本**；天然具备 GitHub 的反垃圾与账号体系。

工作链路：
```
文章页 iframe → giscus.app 脚本 →（读者 GitHub 授权）→ zeek-zhao.github.io 仓库 Discussions
     ↑ 主题切换时 postMessage 同步换肤        ← 400px 懒加载（滚到评论区才加载）
```

### 3.2 当前实现
- 配置（`_config.yml`）：
  ```yaml
  zeek:
    giscus:
      repo: zeek-zhao/zeek-zhao.github.io
      repoId: R_kgDOOQtDmA
      category: Announcements
      categoryId: DIC_kwDOOQtDmM4DLIB1
      lang: zh-CN
  ```
- `Announcements` 分类：只有仓库维护者能开帖，评论都是回复——防止 Discussions 区被路人灌水开新帖。
- 主题联动：博客切深色/浅色，评论区同步换肤（`postMessage`）。
- 未登录/未安装时优雅降级：显示 noscript 提示。

### 3.3 ⚠️ 报错 "giscus is not installed on this repository" 的原因与解法
giscus 分两层：**配置**（repoId/categoryId，站点里已配好、已验证正确）和 **giscus App 授权**（GitHub App 层面，必须安装到仓库，否则 giscus.io 拒绝为该仓库服务）。你看到这个报错 = App 还没装。**一次性修复（只能网页操作）**：
1. 打开 https://github.com/apps/giscus ；
2. 点 **Install** → 选择个人账号 `zeek-zhao`；
3. 仓库选择：**Only select repositories** → 选 `zeek-zhao.github.io`（不要选 All，最小授权）；
4. 安装完成后**刷新文章页**，评论区即出现（浏览器缓存强就 Ctrl+F5）。

### 3.4 验证方法
任一文章页滚到底部 → 评论区出现「Sign in with GitHub / 用 GitHub 登录」按钮 → 登录后发一条测试评论 → 到 https://github.com/zeek-zhao/zeek-zhao.github.io/discussions 应能看到对应讨论。

### 3.5 常见问题
- **Q：评论者能看到我的私有库吗？** 不能。giscus 只写入 zeek-zhao.github.io（公开产物仓）的 Discussions；评论者也接触不到 ai-obsidian / hexo-engine。
- **Q：想删某条评论？** 直接在仓库 Discussions 里删，站内即时消失。
- **Q：想换分类？** 在仓库 Settings→Discussions 改分类后，同步改 `_config.yml` 的 categoryId（id 可在 giscus.app/zh-CN 查询页输入仓库获取）。

---

## 4. 需要人工做的事汇总

| # | 事项 | 位置 | 必要性 |
|---|------|------|--------|
| 1 | **安装 giscus App**（§3.3 四步） | https://github.com/apps/giscus | 想要评论就必须做，一次即可 |
| 2 | （可选）Google Search Console 提交 sitemap 加速收录 | https://search.google.com/search-console | 推荐做，免费 |
| 3 | （可选）替换 PAT | 见 `docs/PAT替换指南.md` | 安全加固，建议尽快 |
| 4 | （可选）访问统计选型 | `_config.yml` `zeek.analytics` | 配置槽已留好，填一行即启用 |
