Feature: 两级分类导航
  作为博客访客
  我希望通过 领域 → 细分分类 → 文章 的两级导航定位内容
  以便在 46 个分类中不迷失

  Scenario: 侧栏两级结构
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问模板文章页
    Then 侧栏渲染领域组与细分折叠组
    And 当前页侧栏只渲染当前领域组

  Scenario: 领域页列出细分 chips
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问领域分类页
    Then 页面包含 "cat-chips"
    And 当前页侧栏只渲染当前领域组

  Scenario: 细分页列出文章
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问细分分类页
    Then 页面包含 "archlist"

  Scenario: 归档按领域分组
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问首页
    Then 归档第 2 页可经分页链接到达
