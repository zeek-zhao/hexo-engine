Feature: SEO 收录
  作为搜索引擎
  我希望每个页面提供规范地址与结构化数据
  以便正确建立索引与富摘要

  Scenario: 全站 sitemap 与 robots
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问首页
    Then sitemap 与 robots 存在且 robots 指向 sitemap

  Scenario: 文章结构化数据
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问模板文章页
    Then canonical 与 Open Graph 与 Twitter Card 齐全
    And 文章含 BlogPosting 与 BreadcrumbList 结构化数据
