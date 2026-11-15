Feature: 阅读文章
  作为博客访客
  我希望在文章页获得完整阅读体验
  包括元信息、目录锚点、作者卡与上下篇

  Scenario: 文章页结构完整
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问模板文章页
    Then 页面包含 "crumb"
    And 页面包含 "author-card"
    And 页面包含 "meta-author"
    And 页面匹配正则 <h2 id="

  Scenario: 字数统计
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问模板文章页
    Then 文章 meta 显示字数与阅读时长
    And 页脚显示全站总字数

  Scenario: 任意文章抽样的字数统计
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问任意一篇文章
    Then 文章 meta 显示字数与阅读时长

  Scenario: 复制链接与评论入口
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问模板文章页
    Then 页面包含 "copy-link"
    And 文章页含 giscus 评论容器与配置注入
