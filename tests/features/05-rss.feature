Feature: RSS 订阅
  作为订阅者
  我希望通过 atom feed 获取最新文章摘要
  以便在阅读器中跟踪更新

  Scenario: atom feed 可订阅
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问首页
    Then atom.xml 至多 20 个 entry 且为摘要模式
    And 页面包含 "application/atom+xml"

  Scenario: 页脚订阅入口
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问首页
    Then 页面包含 "atom.xml"
