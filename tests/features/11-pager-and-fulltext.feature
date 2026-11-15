Feature: 上一篇/下一篇定序与全文搜索
  作为博客访客与作者
  我希望上下篇跳转顺序稳定可预期、搜索能命中正文内容
  以便连续阅读与快速定位资料

  Scenario: 文章页上一篇下一篇定序
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问任意一篇文章
    Then 文章页上一篇与下一篇链接齐全

  Scenario: search.json 携带正文片段
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    Then search.json 至少 1146 条且每条含非空 text 字段

  Scenario: 搜索前端支持内容级匹配与片段展示
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    Then main.js 搜索逻辑覆盖 text 字段并展示命中片段
