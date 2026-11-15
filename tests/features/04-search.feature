Feature: 站内搜索
  作为博客访客
  我希望用 Ctrl+K 检索全部文章
  以便按标题直达目标内容

  Scenario: 搜索数据完整
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问首页
    Then search.json 条目数至少 1146 且分组去重为 8

  Scenario: 搜索 UI 就绪
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问首页
    Then 页面包含 "cmdk"
    And 页面包含 "search.json"
