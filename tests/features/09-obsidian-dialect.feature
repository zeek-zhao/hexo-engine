Feature: Obsidian 方言转换
  作为用 Obsidian 写作的作者
  我希望 ==高亮==、callout、脚注、mermaid、任务列表等语法在网页正常呈现
  以便笔记原文可直接发布

  Scenario: 模板文章全语法体检
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问模板文章页
    Then 模板文章的方言语法全部转换
    And 页面不包含 "[!"

  Scenario: 普通文章无方言残留
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问任意一篇文章
    Then 页面不包含 "=="
    And 页面不包含 "[["
